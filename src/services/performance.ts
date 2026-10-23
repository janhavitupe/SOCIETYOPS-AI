import { prisma } from '../database/prisma';
import { OPEN_WORK_STATUSES } from './dispatch';

/**
 * How each vendor is doing over a period: the numbers a committee looks at
 * when renewing a contract. Everything comes from the tickets and their
 * timelines; nothing is entered by hand.
 */

const RESPONSES = ['worker_accepted', 'worker_on_the_way', 'worker_started', 'worker_parts'];
const FINISHED = ['Resolved', 'Closed'];

const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;
const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

export interface VendorScore {
  vendorId: string;
  name: string;
  category: string;
  /** The vendor's rating now, after every resident rating so far. */
  rating: number;
  removed: boolean;
  jobs: number;
  done: number;
  open: number;
  /** Assignment to first response (accept, on my way, start), in minutes. */
  avgAcceptMinutes: number | null;
  /** Assignment to starting work. */
  avgStartMinutes: number | null;
  /** Assignment to marked done. */
  avgFixMinutes: number | null;
  /** Finished after their deadline, or still open past it. */
  slaMissed: number;
  /** Share of finished jobs the resident sent back, 0 to 1. */
  reopenRate: number | null;
  /** Average of residents' ratings in the period. */
  avgRating: number | null;
  ratings: number;
  declined: number;
  timedOut: number;
}

export async function vendorPerformance(from: Date, to: Date, now = new Date()): Promise<VendorScore[]> {
  const [vendors, tickets] = await Promise.all([
    prisma.vendor.findMany({ orderBy: { name: 'asc' } }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: from, lt: to }, deletedAt: null },
      include: {
        timeline: {
          where: { type: { in: ['assigned', 'accept_timeout', ...RESPONSES] } },
          orderBy: { timestamp: 'asc' },
        },
      },
    }),
  ]);

  const scores = vendors.map(
    (v): VendorScore & { accept: number[]; start: number[]; fix: number[]; stars: number[]; reopened: number } => ({
      vendorId: v.id,
      name: v.name,
      category: v.category,
      rating: v.rating,
      removed: !!v.deletedAt,
      jobs: 0,
      done: 0,
      open: 0,
      avgAcceptMinutes: null,
      avgStartMinutes: null,
      avgFixMinutes: null,
      slaMissed: 0,
      reopenRate: null,
      avgRating: null,
      ratings: 0,
      declined: 0,
      timedOut: 0,
      accept: [],
      start: [],
      fix: [],
      stars: [],
      reopened: 0,
    }),
  );
  const byId = new Map(scores.map((s) => [s.vendorId, s]));

  for (const t of tickets) {
    for (const id of t.declinedVendorIds) {
      const s = byId.get(id);
      if (s) s.declined += 1;
    }
    for (const e of t.timeline.filter((e) => e.type === 'accept_timeout')) {
      const s = scores.find((x) => e.description.startsWith(`${x.name} did not accept`));
      if (s) s.timedOut += 1;
    }

    const s = t.assignedVendorId ? byId.get(t.assignedVendorId) : undefined;
    if (!s) continue;
    s.jobs += 1;

    // Measured from when it was last given to this vendor.
    const assigned = [...t.timeline].reverse().find((e) => e.type === 'assigned')?.timestamp ?? t.createdAt;
    const after = t.timeline.filter((e) => e.timestamp >= assigned);
    const response = after.find((e) => RESPONSES.includes(e.type));
    const started = after.find((e) => e.type === 'worker_started');
    if (response) s.accept.push(minutesBetween(assigned, response.timestamp));
    if (started) s.start.push(minutesBetween(assigned, started.timestamp));

    if (FINISHED.includes(t.status)) {
      s.done += 1;
      if (t.resolvedAt) s.fix.push(minutesBetween(assigned, t.resolvedAt));
      if (t.reopenCount > 0) s.reopened += 1;
    } else if (OPEN_WORK_STATUSES.includes(t.status)) {
      s.open += 1;
    }
    if (t.slaDueAt && (t.resolvedAt ?? now) > t.slaDueAt) s.slaMissed += 1;
    if (t.residentRating) s.stars.push(t.residentRating);
  }

  return scores
    .filter((s) => !s.removed || s.jobs || s.declined || s.timedOut)
    .map(({ accept, start, fix, stars, reopened, ...s }) => ({
      ...s,
      avgAcceptMinutes: average(accept),
      avgStartMinutes: average(start),
      avgFixMinutes: average(fix),
      reopenRate: s.done ? Math.round((reopened / s.done) * 100) / 100 : null,
      avgRating: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null,
      ratings: stars.length,
    }))
    .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));
}
