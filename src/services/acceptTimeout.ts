import { prisma } from '../database/prisma';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { sendNotification } from './notifications';
import { assignVendor, notifyManagers } from './assignment';
import { tellResident } from './rebalance';
import { NOT_STARTED_STATUSES } from './dispatch';

/**
 * A vendor who does not accept a job in time loses it to the next vendor.
 * A job used to sit with an unresponsive vendor until its overall deadline
 * passed, with the resident none the wiser.
 */

/** How long a vendor has to accept, by urgency. */
export const ACCEPT_MINUTES: Record<string, number> = { High: 15, Medium: 60, Low: 240 };
const DEFAULT_ACCEPT_MINUTES = 60;

export const acceptMinutes = (urgency: string) => ACCEPT_MINUTES[urgency] ?? DEFAULT_ACCEPT_MINUTES;

/** Anything the vendor does on the job counts as answering it. */
const RESPONSES = ['worker_accepted', 'worker_on_the_way', 'worker_started', 'worker_parts'];

export interface Timeout {
  ticketId: string;
  fromVendorName: string;
  toVendorName: string | null;
}

/**
 * Passes on every job whose vendor has not answered within its time. With
 * nobody else to give it to, the managers are told once and it stays put.
 */
export async function passOnUnacceptedJobs(now = new Date()): Promise<Timeout[]> {
  const jobs = await prisma.ticket.findMany({
    where: { status: { in: NOT_STARTED_STATUSES }, assignedVendorId: { not: null }, deletedAt: null },
    include: {
      timeline: {
        where: { type: { in: ['assigned', 'accept_timeout', ...RESPONSES] } },
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  const results: Timeout[] = [];
  for (const job of jobs) {
    // Only what happened since it was last given to someone counts.
    const lastAssigned = [...job.timeline].reverse().find((e) => e.type === 'assigned');
    const since = lastAssigned?.timestamp ?? job.createdAt;
    const after = job.timeline.filter((e) => e.timestamp >= since);
    if (after.some((e) => RESPONSES.includes(e.type) || e.type === 'accept_timeout')) continue;

    const limit = acceptMinutes(job.urgency);
    if (now.getTime() - since.getTime() < limit * 60 * 1000) continue;

    const vendor = await prisma.vendor.findFirst({ where: { id: job.assignedVendorId! } });
    const vendorName = vendor?.name ?? job.assignedVendorName ?? 'The vendor';
    const next = await vendorRepo.findBestForCategory(job.issueCategory, [
      ...job.declinedVendorIds,
      job.assignedVendorId!,
    ]);

    await prisma.ticket.update({
      where: { id: job.id },
      data: {
        timeline: {
          create: {
            title: 'Not Accepted In Time',
            description: `${vendorName} did not accept within ${limit} minutes.`,
            actor: 'Follow-up Agent',
            type: 'accept_timeout',
          },
        },
      },
    });

    if (next) {
      // assignVendor tells the new vendor, and tells the old one it moved.
      const moved = await assignVendor(
        job.id,
        next.id,
        undefined,
        `${vendorName} did not accept within ${limit} minutes.`,
      );
      if (vendor) await ticketRepo.refreshQueueEtas(vendor.id);
      if (moved) await tellResident(moved, vendorName);
      await notifyManagers(
        job.id,
        `${vendorName} did not accept job #${job.id} at ${job.flatNumber} within ${limit} minutes. It has gone to ${next.name}.`,
      );
    } else {
      if (vendor?.phone) {
        await sendNotification({
          ticketId: job.id,
          recipientType: 'vendor',
          recipientName: vendor.name,
          phone: vendor.phone,
          recipientUserId: vendor.userId,
          message: `Reminder: please accept or decline job #${job.id} at ${job.flatNumber} in SocietyOps. The resident is waiting.`,
        });
      }
      await notifyManagers(
        job.id,
        `${vendorName} has not accepted job #${job.id} at ${job.flatNumber} after ${limit} minutes, and no other ${job.issueCategory} vendor is free. Please follow up.`,
      );
    }
    results.push({ ticketId: job.id, fromVendorName: vendorName, toVendorName: next?.name ?? null });
  }
  return results;
}
