import { prisma } from '../database/prisma';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { assignVendor, notifyResident } from './assignment';
import { NOT_STARTED_STATUSES, OPEN_WORK_STATUSES } from './dispatch';
import { isOnDuty } from '../database/repositories/VendorRepository';

/**
 * Moving queued jobs to a vendor who has room.
 *
 * Without this, a job dispatched while the society's only plumber was busy
 * stayed in his queue even after a second plumber was added, and the
 * resident kept waiting behind other people's jobs.
 */

/** A society will not have more queued jobs than this in one category; it bounds the loop. */
const MAX_MOVES = 200;

export interface Reassignment {
  ticketId: string;
  fromVendorId: string;
  fromVendorName: string;
  toVendorId: string;
  toVendorName: string;
  estimatedEta: string;
}

interface QueuedJob {
  id: string;
  vendorId: string;
  /** How many of the vendor's jobs are ahead of this one. */
  jobsAhead: number;
  status: string;
  assignedAt: number;
  /** The vendor said they are on their way: it stays with them. */
  onTheWay: boolean;
  declinedBy: string[];
}

/**
 * Rebalances one category: repeatedly takes the job waiting behind the most
 * others and moves it to the least-loaded available vendor, as long as that
 * leaves it with fewer jobs ahead than it has now. Each move frees a place in
 * the old queue, whose remaining estimates are then refreshed.
 *
 * Greedy and deliberately conservative: a job only moves when the resident
 * will be reached sooner, so nobody is shuffled for nothing.
 */
export async function rebalanceCategory(category: string): Promise<Reassignment[]> {
  const moves: Reassignment[] = await rehomeOrphans(category);

  for (let i = 0; i < MAX_MOVES; i++) {
    const vendors = await prisma.vendor.findMany({ where: { category, deletedAt: null } });
    const available = vendors.filter(isOnDuty);
    if (available.length < 1 || vendors.length < 2) break;

    const jobs = await prisma.ticket.findMany({
      where: {
        assignedVendorId: { in: vendors.map((v) => v.id) },
        status: { in: OPEN_WORK_STATUSES },
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        assignedVendorId: true,
        createdAt: true,
        declinedVendorIds: true,
        timeline: {
          where: { type: { in: ['assigned', 'worker_on_the_way'] } },
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true, type: true },
        },
      },
    });

    // Each vendor's queue, in the order the jobs were given to them.
    const queues = new Map<string, QueuedJob[]>();
    for (const job of jobs) {
      const queue = queues.get(job.assignedVendorId!) ?? [];
      const assigned = job.timeline.find((e) => e.type === 'assigned');
      queue.push({
        id: job.id,
        vendorId: job.assignedVendorId!,
        jobsAhead: 0,
        status: job.status,
        assignedAt: (assigned?.timestamp ?? job.createdAt).getTime(),
        onTheWay: job.timeline[0]?.type === 'worker_on_the_way',
        declinedBy: job.declinedVendorIds,
      });
      queues.set(job.assignedVendorId!, queue);
    }
    for (const queue of queues.values()) {
      queue.sort((a, b) => a.assignedAt - b.assignedAt);
      queue.forEach((job, index) => (job.jobsAhead = index));
    }
    const load = (vendorId: string) => queues.get(vendorId)?.length ?? 0;

    // Least loaded first; higher rating breaks the tie.
    const targetFor = (job: QueuedJob) =>
      available
        .filter((v) => v.id !== job.vendorId && !job.declinedBy.includes(v.id))
        .sort((a, b) => load(a.id) - load(b.id) || b.rating - a.rating)[0];

    // The job waiting behind the most others that someone can reach sooner;
    // ties go to the one waiting longest.
    const waiting = [...queues.values()]
      .flat()
      .filter((j) => NOT_STARTED_STATUSES.includes(j.status) && j.jobsAhead > 0 && !j.onTheWay)
      .sort((a, b) => b.jobsAhead - a.jobsAhead || a.assignedAt - b.assignedAt);
    const job = waiting.find((j) => {
      const target = targetFor(j);
      return target && load(target.id) < j.jobsAhead;
    });
    if (!job) break;
    const target = targetFor(job)!;

    const from = vendors.find((v) => v.id === job.vendorId)!;
    const moved = await assignVendor(
      job.id,
      target.id,
      undefined,
      `Reassigned from ${from.name}, who had ${job.jobsAhead} job${job.jobsAhead > 1 ? 's' : ''} ahead of it.`,
    );
    if (!moved) break;

    await ticketRepo.refreshQueueEtas(from.id);
    await tellResident(moved, from.name);

    moves.push({
      ticketId: job.id,
      fromVendorId: from.id,
      fromVendorName: from.name,
      toVendorId: target.id,
      toVendorName: target.name,
      estimatedEta: moved.estimatedEta,
    });
  }

  return moves;
}

/**
 * Open jobs whose vendor has been removed would otherwise wait forever for
 * someone who is not coming. They go to the shortest queue in the trade, in
 * the order they were raised.
 */
async function rehomeOrphans(category: string): Promise<Reassignment[]> {
  const vendors = await prisma.vendor.findMany({ where: { category, deletedAt: null } });
  if (!vendors.length) return [];

  const orphans = await prisma.ticket.findMany({
    where: {
      issueCategory: category,
      status: { in: OPEN_WORK_STATUSES },
      deletedAt: null,
      assignedVendorId: { not: null, notIn: vendors.map((v) => v.id) },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, assignedVendorId: true, assignedVendorName: true, declinedVendorIds: true },
  });

  const moves: Reassignment[] = [];
  for (const orphan of orphans) {
    const target = await vendorRepo.findBestForCategory(category, orphan.declinedVendorIds);
    if (!target) break;
    const previous = orphan.assignedVendorName || 'the previous vendor';
    const moved = await assignVendor(
      orphan.id,
      target.id,
      undefined,
      `Reassigned because ${previous} is no longer one of the society's vendors.`,
    );
    if (!moved) continue;
    await tellResident(moved, previous);
    moves.push({
      ticketId: orphan.id,
      fromVendorId: orphan.assignedVendorId!,
      fromVendorName: previous,
      toVendorId: target.id,
      toVendorName: target.name,
      estimatedEta: moved.estimatedEta,
    });
  }
  return moves;
}

export async function tellResident(ticket: any, previousVendor: string): Promise<void> {
  await notifyResident(
    ticket,
    `Update on complaint #${ticket.id}: ${ticket.assignedVendorName} will now attend instead of ` +
      `${previousVendor}. Expected arrival: ${ticket.estimatedEta}.`,
  );
}

/**
 * A finished job frees its vendor, who may now be the shortest queue in the
 * trade: give them a job someone else is waiting on. Safe to call on any
 * ticket update; it does nothing unless the ticket is finished.
 */
export async function afterTicketChange(ticket: { status: string; issueCategory: string } | undefined) {
  if (ticket && ['Resolved', 'Closed'].includes(ticket.status)) {
    return rebalanceCategory(ticket.issueCategory);
  }
  return [];
}
