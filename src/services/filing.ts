import { prisma } from '../database/prisma';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { isManager, type Actor } from '../auth/actor';
import { resolveTicketLocation, type Location, type LocationInput } from './ticketLocation';
import { OPEN_WORK_STATUSES } from './dispatch';
import { assignVendor } from './assignment';

/**
 * Filing a ticket, for the REST route and the agent alike: where it is, whether
 * it is already reported, and who goes.
 */

export interface FilingInput extends LocationInput {
  issueCategory: string;
  description: string;
  urgency: string;
  images?: string[];
  /** Honoured for managers filing on someone's behalf; residents are who they are. */
  residentName?: string;
  residentPhone?: string;
}

export type FilingResult =
  | {
      ticket: any;
      /** True when this joined a ticket already open for the same place. */
      duplicate: boolean;
      assignedVendor: any | null;
    }
  | { error: string };

const STILL_OPEN = ['Open', ...OPEN_WORK_STATUSES];

/**
 * An open ticket for the same common-area problem: the same asset, or the
 * same area and trade when no asset was named. Flats never match, since two
 * reports from one flat are usually two problems.
 */
async function openTicketFor(location: Location, issueCategory: string) {
  if (location.assetId) {
    return prisma.ticket.findFirst({
      where: { assetId: location.assetId, status: { in: STILL_OPEN }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
  if (location.commonAreaId) {
    return prisma.ticket.findFirst({
      where: {
        commonAreaId: location.commonAreaId,
        assetId: null,
        issueCategory,
        status: { in: STILL_OPEN },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  return null;
}

/** Adds the person to an open ticket, once, with a note on its timeline. */
async function joinOpenTicket(
  existing: { id: string; residentId: string | null; alsoReportedBy: string[] },
  actor: Actor,
  description: string,
) {
  const already = existing.residentId === actor.id || existing.alsoReportedBy.includes(actor.id);
  if (!already) {
    const who = actor.flatNumber ? `${actor.name} (${actor.flatNumber})` : actor.name;
    await prisma.ticket.update({
      where: { id: existing.id },
      data: {
        alsoReportedBy: { push: actor.id },
        updatedAt: new Date(),
        timeline: {
          create: {
            title: 'Reported Again',
            description: `${who} reported the same problem: "${description.slice(0, 120)}"`,
            actor: 'Intake Agent',
            type: 'duplicate',
          },
        },
      },
    });
  }
  return ticketRepo.findById(existing.id);
}

/** The asset's contract vendor when it has one, otherwise the trade's shortest queue. */
async function vendorFor(location: Location, issueCategory: string) {
  if (location.amcVendorId) {
    const amc = await vendorRepo.findById(location.amcVendorId);
    if (amc) return amc;
  }
  return vendorRepo.findBestForCategory(issueCategory);
}

export async function fileTicket(actor: Actor, input: FilingInput): Promise<FilingResult> {
  const location = await resolveTicketLocation(actor, input);
  if ('error' in location) return location;

  const existing = await openTicketFor(location, input.issueCategory);
  if (existing) {
    return { ticket: await joinOpenTicket(existing, actor, input.description), duplicate: true, assignedVendor: null };
  }

  const manager = isManager(actor);
  const created = await ticketRepo.create({
    flatId: location.flatId,
    commonAreaId: location.commonAreaId,
    assetId: location.assetId,
    flatNumber: location.flatNumber,
    residentName: manager ? input.residentName || actor.name : actor.name,
    residentPhone: manager ? input.residentPhone : (actor.phone ?? undefined),
    issueCategory: input.issueCategory,
    description: input.description,
    urgency: input.urgency,
    images: input.images,
    residentId: manager ? undefined : actor.id,
  });

  const vendor = await vendorFor(location, created.issueCategory);
  if (vendor) await assignVendor(created.id, vendor.id);

  return {
    ticket: (await ticketRepo.findById(created.id)) ?? created,
    duplicate: false,
    assignedVendor: vendor ?? null,
  };
}
