import { prisma } from '../database/prisma';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { assignVendor, notifyManagers } from './assignment';

/**
 * Planned upkeep. Each schedule raises a ticket a few days before its visit
 * is due, for the asset's AMC vendor, with the checklist the technician must
 * tick. Licences and AMC contracts that are running out remind the managers.
 */

export type Unit = 'days' | 'weeks' | 'months';

export class MaintenanceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MaintenanceError';
  }
}

const DAY = 24 * 60 * 60 * 1000;
const FINISHED = ['Resolved', 'Closed'];

/** The date `every` units after `from`; a month after 31 January is the end of February. */
export function addInterval(from: Date, every: number, unit: string): Date {
  const next = new Date(from);
  if (unit === 'days') next.setUTCDate(next.getUTCDate() + every);
  else if (unit === 'weeks') next.setUTCDate(next.getUTCDate() + every * 7);
  else {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + every);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

const dateText = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

type Schedule = NonNullable<Awaited<ReturnType<typeof loadSchedule>>>;

function loadSchedule(id: string) {
  return prisma.maintenanceSchedule.findFirst({
    where: { id, deletedAt: null },
    include: {
      asset: { select: { name: true, amcVendorId: true, commonArea: { select: { name: true } } } },
      commonArea: { select: { name: true } },
    },
  });
}

/** Where the visit is, as a ticket shows it. */
function placeOf(s: Schedule) {
  if (s.asset) return s.asset.commonArea ? `${s.asset.name}, ${s.asset.commonArea.name}` : s.asset.name;
  return s.commonArea?.name ?? 'Society';
}

/** The schedule's vendor, else the asset's AMC vendor, else whoever is free in the trade. */
async function vendorFor(s: Schedule) {
  for (const id of [s.vendorId, s.asset?.amcVendorId]) {
    if (!id) continue;
    const vendor = await vendorRepo.findById(id);
    if (vendor) return vendor;
  }
  return vendorRepo.findBestForCategory(s.category);
}

/** Raises the ticket for a schedule's next visit and moves the schedule on. */
export async function raiseVisit(scheduleId: string, now = new Date()) {
  const s = await loadSchedule(scheduleId);
  if (!s) throw new MaintenanceError(404, 'Schedule not found');

  const due = s.nextDueOn;
  const created = await ticketRepo.create({
    flatNumber: placeOf(s),
    residentName: 'Society office',
    residentPhone: '',
    issueCategory: s.category,
    description: `${s.title}: planned visit due ${dateText(due)}.`,
    urgency: 'Medium',
    assetId: s.assetId,
    commonAreaId: s.asset ? null : s.commonAreaId,
  });
  await prisma.ticket.update({
    where: { id: created.id },
    data: {
      scheduleId: s.id,
      checklist: s.checklist,
      // The deadline is the visit's due date, not the usual complaint SLA.
      slaDueAt: new Date(due.getTime() + DAY - 1),
      timeline: {
        create: {
          title: 'Planned Maintenance',
          description: `Raised from the schedule "${s.title}" for the visit due ${dateText(due)}.`,
          actor: 'Maintenance Planner',
          type: 'planned',
        },
      },
    },
  });

  const vendor = await vendorFor(s);
  if (vendor) await assignVendor(created.id, vendor.id);

  // The next visit; a schedule long overdue skips to the next date still ahead.
  let next = addInterval(due, s.every, s.unit);
  while (next.getTime() < now.getTime()) next = addInterval(next, s.every, s.unit);
  await prisma.maintenanceSchedule.update({ where: { id: s.id }, data: { nextDueOn: next } });

  return (await ticketRepo.findById(created.id))!;
}

/**
 * Raises the visits that are coming up. A schedule whose last visit is still
 * open is not raised again; the calendar shows it as overdue instead.
 */
export async function raiseDueVisits(now = new Date()) {
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: { active: true, deletedAt: null },
    include: { tickets: { where: { status: { notIn: FINISHED }, deletedAt: null }, select: { id: true } } },
  });
  const raised: string[] = [];
  for (const s of schedules) {
    if (s.nextDueOn.getTime() - s.leadDays * DAY > now.getTime()) continue;
    if (s.tickets.length) continue;
    raised.push((await raiseVisit(s.id, now)).id);
  }
  return raised;
}

/** The reminder due for something expiring in `daysLeft` days, if any: 30, 7, then on the day. */
function stageFor(daysLeft: number): '30' | '7' | '0' | null {
  if (daysLeft <= 0) return '0';
  if (daysLeft <= 7) return '7';
  if (daysLeft <= 30) return '30';
  return null;
}

const expiryMessage = (what: string, on: Date, daysLeft: number) =>
  daysLeft <= 0
    ? `${what} expired on ${dateText(on)}. Please renew it.`
    : `${what} expires on ${dateText(on)}, in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Please arrange the renewal.`;

/** Reminds managers of licences and AMC contracts running out, each reminder once. */
export async function remindExpiries(now = new Date()) {
  let sent = 0;
  const daysLeft = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);

  const licences = await prisma.licence.findMany({
    where: { deletedAt: null, expiresOn: { lte: new Date(now.getTime() + 30 * DAY) } },
  });
  for (const l of licences) {
    const left = daysLeft(l.expiresOn);
    const stage = stageFor(left);
    if (!stage || l.reminded.includes(stage)) continue;
    await prisma.licence.update({ where: { id: l.id }, data: { reminded: [...l.reminded, stage] } });
    await notifyManagers(null, expiryMessage(l.name, l.expiresOn, left));
    sent += 1;
  }

  const assets = await prisma.asset.findMany({
    where: { deletedAt: null, amcExpiresOn: { lte: new Date(now.getTime() + 30 * DAY) } },
    include: { amcVendor: { select: { name: true } } },
  });
  for (const a of assets) {
    const left = daysLeft(a.amcExpiresOn!);
    const stage = stageFor(left);
    if (!stage || a.amcReminded.includes(stage)) continue;
    await prisma.asset.update({ where: { id: a.id }, data: { amcReminded: [...a.amcReminded, stage] } });
    const what = `The AMC for ${a.name}${a.amcVendor ? ` with ${a.amcVendor.name}` : ''}`;
    await notifyManagers(null, expiryMessage(what, a.amcExpiresOn!, left));
    sent += 1;
  }
  return sent;
}

export interface UpcomingItem {
  date: Date;
  kind: 'visit' | 'licence' | 'amc';
  title: string;
  detail: string;
  /** A visit still not done after its date, or something already expired. */
  overdue: boolean;
  scheduleId?: string;
  ticketId?: string;
}

/**
 * What is coming up in the next `days` days, oldest first: planned visits
 * (each repeat, projected forward), licence and AMC expiries, and visits that
 * are overdue.
 */
export async function upcoming(days = 90, now = new Date()): Promise<UpcomingItem[]> {
  const horizon = new Date(now.getTime() + days * DAY);
  const items: UpcomingItem[] = [];

  const schedules = await prisma.maintenanceSchedule.findMany({
    where: { active: true, deletedAt: null },
    include: {
      vendor: { select: { name: true } },
      asset: { select: { name: true, amcVendor: { select: { name: true } } } },
    },
  });
  for (const s of schedules) {
    const who = s.vendor?.name ?? s.asset?.amcVendor?.name ?? s.category;
    for (let d = s.nextDueOn, i = 0; d <= horizon && i < 60; d = addInterval(d, s.every, s.unit), i++) {
      items.push({ date: d, kind: 'visit', title: s.title, detail: who, overdue: false, scheduleId: s.id });
    }
  }

  // Planned visits raised but not finished.
  const open = await prisma.ticket.findMany({
    where: { scheduleId: { not: null }, status: { notIn: FINISHED }, deletedAt: null },
    include: { schedule: { select: { title: true } } },
  });
  for (const t of open) {
    const due = t.slaDueAt ?? t.createdAt;
    items.push({
      date: due,
      kind: 'visit',
      title: t.schedule?.title ?? t.description,
      detail: `#${t.id} · ${t.status}${t.assignedVendorName ? ` · ${t.assignedVendorName}` : ''}`,
      overdue: due < now,
      ticketId: t.id,
    });
  }

  for (const l of await prisma.licence.findMany({ where: { deletedAt: null, expiresOn: { lte: horizon } } })) {
    items.push({
      date: l.expiresOn,
      kind: 'licence',
      title: `${l.name} expires`,
      detail: l.notes ?? '',
      overdue: l.expiresOn < now,
    });
  }
  const assets = await prisma.asset.findMany({
    where: { deletedAt: null, amcExpiresOn: { lte: horizon } },
    include: { amcVendor: { select: { name: true } } },
  });
  for (const a of assets) {
    items.push({
      date: a.amcExpiresOn!,
      kind: 'amc',
      title: `AMC for ${a.name} ends`,
      detail: a.amcVendor?.name ?? '',
      overdue: a.amcExpiresOn! < now,
    });
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}
