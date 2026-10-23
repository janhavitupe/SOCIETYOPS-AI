import { prisma } from '../database/prisma';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { resolveImageUrls } from './storage';
import { assignVendor, notifyManagers, notifyResident } from './assignment';
import { OPEN_WORK_STATUSES } from './dispatch';
import { acceptMinutes } from './acceptTimeout';
import { afterTicketChange, rebalanceCategory, tellResident } from './rebalance';

/**
 * The vendor's side of a ticket: their jobs in the order they will reach
 * them, and the steps they report as they work one.
 *
 * Where a vendor has got to is kept as timeline events after the job was
 * assigned to them, so the resident and the manager see every step, and a
 * job handed to someone else starts again from the beginning.
 */

export type WorkerStage = 'new' | 'accepted' | 'on_the_way' | 'started' | 'waiting_parts';
export type WorkerAction = 'accept' | 'on_my_way' | 'start' | 'need_parts' | 'complete' | 'decline';

export class WorkerJobError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'WorkerJobError';
  }
}

const STAGE_EVENTS: Record<string, WorkerStage> = {
  worker_accepted: 'accepted',
  worker_on_the_way: 'on_the_way',
  worker_started: 'started',
  worker_parts: 'waiting_parts',
};

interface TimelineLike {
  type: string;
  timestamp: Date;
}

/** The latest step the vendor reported since the job was (last) given to them. */
export function stageOf(ticket: { status: string; timeline: TimelineLike[] }): WorkerStage {
  const events = [...ticket.timeline].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let stage: WorkerStage = 'new';
  for (const event of events) {
    if (event.type === 'assigned') stage = 'new';
    else if (STAGE_EVENTS[event.type]) stage = STAGE_EVENTS[event.type];
  }
  // A job a manager moved to In Progress by hand counts as started.
  if (ticket.status === 'In Progress' && (stage === 'new' || stage === 'accepted' || stage === 'on_the_way')) {
    return 'started';
  }
  return stage;
}

/** Which actions make sense from here; the job screen shows exactly these. */
export function allowedActions(ticket: { status: string; timeline: TimelineLike[] }): WorkerAction[] {
  if (!OPEN_WORK_STATUSES.includes(ticket.status)) return [];
  switch (stageOf(ticket)) {
    case 'new':
      return ['accept', 'on_my_way', 'start', 'decline'];
    case 'accepted':
      return ['on_my_way', 'start', 'decline'];
    case 'on_the_way':
      return ['start'];
    case 'started':
      return ['need_parts', 'complete'];
    case 'waiting_parts':
      return ['start', 'complete'];
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Resident';

const TIMELINE_IN_ORDER = { timeline: { orderBy: { timestamp: 'asc' as const } } };

type JobRow = Awaited<ReturnType<typeof loadJobs>>[number];

function loadJobs(where: object) {
  return prisma.ticket.findMany({ where: { deletedAt: null, ...where }, include: TIMELINE_IN_ORDER });
}

const assignedAt = (job: JobRow) =>
  ([...job.timeline].reverse().find((e) => e.type === 'assigned')?.timestamp ?? job.createdAt).getTime();

/**
 * What the vendor sees of a job. The resident's number only while the job is
 * open, and only their first name: enough to find them and call ahead.
 */
async function toJob(job: JobRow, queue?: { position: number; total: number }) {
  const open = OPEN_WORK_STATUSES.includes(job.status);
  return {
    id: job.id,
    status: job.status,
    stage: open ? stageOf(job) : null,
    actions: allowedActions(job),
    category: job.issueCategory,
    description: job.description,
    urgency: job.urgency,
    location: job.flatNumber,
    residentName: firstName(job.residentName),
    residentPhone: open ? job.residentPhone : null,
    estimatedEta: open ? job.estimatedEta : null,
    escalated: job.status === 'Escalated',
    /** The resident sent it back as not fixed. */
    reopened: job.reopenCount > 0,
    /** When it goes to someone else if not accepted; only for a job not yet answered. */
    acceptBy:
      open && stageOf(job) === 'new' ? new Date(assignedAt(job) + acceptMinutes(job.urgency) * 60 * 1000) : null,
    images: await resolveImageUrls(job.images),
    workNote: job.workNote,
    workImages: await resolveImageUrls(job.workImages),
    queue: queue ?? null,
    createdAt: job.createdAt,
    resolvedAt: job.resolvedAt,
    timeline: job.timeline.map((e) => ({ title: e.title, description: e.description, timestamp: e.timestamp })),
  };
}

const DONE_WINDOW_DAYS = 7;

/** The vendor's open jobs in the order they will be reached, and what they finished this week. */
export async function listJobs(vendorId: string) {
  const vendor = await vendorRepo.findById(vendorId);
  if (!vendor) throw new WorkerJobError(404, 'Vendor not found');

  const open = await loadJobs({ assignedVendorId: vendorId, status: { in: OPEN_WORK_STATUSES } });
  open.sort((a, b) => assignedAt(a) - assignedAt(b));

  const since = new Date(Date.now() - DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const done = await loadJobs({
    assignedVendorId: vendorId,
    status: { in: ['Resolved', 'Closed'] },
    resolvedAt: { gte: since },
  });
  done.sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));

  return {
    vendor: {
      id: vendor.id,
      name: vendor.name,
      category: vendor.category,
      status: vendor.status,
      onDuty: vendor.status !== 'Offline',
      rating: vendor.rating,
      completedJobs: vendor.completedJobs,
    },
    jobs: await Promise.all(open.map((j, i) => toJob(j, { position: i + 1, total: open.length }))),
    done: await Promise.all(done.map((j) => toJob(j))),
  };
}

/** One of the vendor's jobs. Anyone else's is not found, never forbidden, so ids reveal nothing. */
async function findOwnJob(vendorId: string, ticketId: string) {
  const [job] = await loadJobs({ id: ticketId, assignedVendorId: vendorId });
  if (!job) throw new WorkerJobError(404, 'Job not found');
  return job;
}

export async function getJob(vendorId: string, ticketId: string) {
  const job = await findOwnJob(vendorId, ticketId);
  const queue = await ticketRepo.vendorQueue(job);
  return toJob(job, queue ?? undefined);
}

export interface ActionInput {
  action: WorkerAction;
  note?: string;
  images?: string[];
}

async function addEvent(
  ticketId: string,
  vendorName: string,
  type: string,
  title: string,
  description: string,
  data = {},
) {
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...data,
      updatedAt: new Date(),
      timeline: { create: { title, description, actor: vendorName, type } },
    },
  });
}

const messageResident = (job: JobRow, message: string) => notifyResident(job, message);

/**
 * A step the vendor reports on their job. Refused (409) when it does not fit
 * where the job is, so a double tap or a stale screen cannot skip ahead.
 */
export async function act(vendorId: string, ticketId: string, input: ActionInput) {
  const job = await findOwnJob(vendorId, ticketId);
  const vendor = (await vendorRepo.findById(vendorId))!;

  if (!allowedActions(job).includes(input.action)) {
    throw new WorkerJobError(
      409,
      OPEN_WORK_STATUSES.includes(job.status)
        ? 'That step does not fit where this job is. Refresh to see its latest state.'
        : 'This job is already finished',
    );
  }

  const note = input.note?.trim();
  switch (input.action) {
    case 'accept':
      await addEvent(job.id, vendor.name, 'worker_accepted', 'Vendor Accepted', `${vendor.name} accepted the job.`);
      await messageResident(job, `Update on complaint #${job.id}: ${vendor.name} has accepted the job.`);
      break;

    case 'on_my_way':
      await addEvent(job.id, vendor.name, 'worker_on_the_way', 'Vendor On The Way', `${vendor.name} is on the way.`);
      await messageResident(
        job,
        `Update on complaint #${job.id}: ${vendor.name} is on the way to ${job.flatNumber}. You can reach them on ${vendor.phone}.`,
      );
      break;

    case 'start':
      await addEvent(
        job.id,
        vendor.name,
        'worker_started',
        'Work Started',
        `${vendor.name} started work${stageOf(job) === 'waiting_parts' ? ' again with the parts' : ''}.`,
        { status: 'In Progress' },
      );
      break;

    case 'need_parts':
      if (!note) throw new WorkerJobError(400, 'Say which parts are needed');
      await addEvent(job.id, vendor.name, 'worker_parts', 'Waiting For Parts', `${vendor.name}: ${note}`);
      await messageResident(
        job,
        `Update on complaint #${job.id}: ${vendor.name} needs parts to finish (${note}) and will come back with them.`,
      );
      break;

    case 'complete': {
      if (!note) throw new WorkerJobError(400, 'Describe the work you did');
      if (!input.images?.length) throw new WorkerJobError(400, 'Add a photo of the finished work');
      const finished = await ticketRepo.update(job.id, {
        status: 'Resolved',
        workNote: note,
        workImages: input.images,
        timeline: {
          create: {
            title: 'Work Completed',
            description: `${vendor.name}: ${note}`,
            actor: vendor.name,
            type: 'worker_completed',
          },
        },
      });
      await prisma.vendor.update({ where: { id: vendorId }, data: { completedJobs: { increment: 1 } } });
      await messageResident(
        job,
        `Complaint #${job.id} has been fixed by ${vendor.name}: ${note}. Please confirm it is fixed and rate the work in SocietyOps, ` +
          `or reopen it if it is not right. It closes by itself in 48 hours.`,
      );
      await afterTicketChange(finished);
      break;
    }

    case 'decline':
      if (!note) throw new WorkerJobError(400, 'Say why you cannot take this job');
      await decline(job, vendor, note);
      break;
  }

  return input.action === 'decline' ? null : getJob(vendorId, ticketId);
}

/**
 * The job goes to the next best vendor who has not turned it down, or back to
 * the manager when there is nobody left.
 */
async function decline(job: JobRow, vendor: { id: string; name: string }, reason: string) {
  const declinedVendorIds = [...new Set([...job.declinedVendorIds, vendor.id])];
  await addEvent(job.id, vendor.name, 'worker_declined', 'Vendor Declined', `${vendor.name} declined: ${reason}`, {
    declinedVendorIds,
  });

  const next = await vendorRepo.findBestForCategory(job.issueCategory, declinedVendorIds);
  if (next) {
    const moved = await assignVendor(job.id, next.id, undefined, `${vendor.name} could not take it.`, false);
    if (moved) {
      await tellResident(moved, vendor.name);
      await notifyManagers(
        job.id,
        `${vendor.name} declined job #${job.id} at ${job.flatNumber} ("${reason}"). It has gone to ${next.name}, ETA ${moved.estimatedEta}.`,
      );
    }
  } else {
    await prisma.ticket.update({
      where: { id: job.id },
      data: {
        status: job.status === 'Escalated' ? 'Escalated' : 'Open',
        assignedVendorId: null,
        assignedVendorName: null,
        assignedVendorPhone: null,
        vendorId: null,
        estimatedEta: null,
        timeline: {
          create: {
            title: 'Needs A Vendor',
            description: 'Every vendor for this trade has declined it. The society office will arrange someone.',
            actor: 'Dispatcher Agent',
            type: 'unassigned',
          },
        },
      },
    });
    await prisma.vendor.updateMany({
      where: { id: vendor.id, activeJobsCount: { gt: 0 } },
      data: { activeJobsCount: { decrement: 1 } },
    });
    await messageResident(
      job,
      `Update on complaint #${job.id}: ${vendor.name} could not take it. The society office is arranging another vendor.`,
    );
    await notifyManagers(
      job.id,
      `${vendor.name} declined job #${job.id} at ${job.flatNumber} ("${reason}") and no other ${job.issueCategory} vendor is free. Please assign someone.`,
    );
  }
  await ticketRepo.refreshQueueEtas(vendor.id);
}

/** On or off duty. Coming on duty takes jobs waiting in other queues. */
export async function setDuty(vendorId: string, onDuty: boolean) {
  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: { availability: onDuty ? 'Available' : 'Offline' },
  });
  const reassigned = onDuty ? await rebalanceCategory(vendor.category) : [];
  return { onDuty, reassigned: reassigned.filter((r) => r.toVendorId === vendorId).length };
}
