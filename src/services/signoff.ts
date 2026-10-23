import { prisma } from '../database/prisma';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { canActOnTicket, type Actor } from '../auth/actor';
import { sendNotification } from './notifications';
import { assignVendor, notifyManagers, notifyResident } from './assignment';

/**
 * The resident's word on a finished job. A vendor marking a job done used to
 * be the end of it; now the resident confirms it (with a rating that feeds the
 * vendor's score) or sends it back, and silence closes it after two days.
 */

/** A resident who says nothing for this long after the vendor finishes is taken as satisfied. */
export const AUTO_CLOSE_HOURS = 48;
/** A closed ticket can still be sent back for this long, in case the fix did not last. */
export const REOPEN_DAYS = 7;

export class SignoffError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SignoffError';
  }
}

/**
 * Folds a resident's rating into the vendor's score: the average of every
 * rating their jobs have had, starting from the score they were added with.
 */
export async function recordRating(ticket: {
  id: string;
  assignedVendorId: string | null;
  residentRating: number | null;
}) {
  if (!ticket.assignedVendorId || !ticket.residentRating) return;
  const vendor = await prisma.vendor.findFirst({ where: { id: ticket.assignedVendorId } });
  if (!vendor) return;

  const earlier = await prisma.ticket.count({
    where: { assignedVendorId: vendor.id, residentRating: { not: null }, id: { not: ticket.id } },
  });
  const rating = Math.round(((vendor.rating * (earlier + 1) + ticket.residentRating) / (earlier + 2)) * 10) / 10;
  await prisma.vendor.update({ where: { id: vendor.id }, data: { rating } });

  if (vendor.phone) {
    await sendNotification({
      ticketId: ticket.id,
      recipientType: 'vendor',
      recipientName: vendor.name,
      phone: vendor.phone,
      recipientUserId: vendor.userId,
      message: `The resident rated job #${ticket.id} ${ticket.residentRating} out of 5. Your rating is now ${rating}.`,
    });
  }
}

/** Why this ticket cannot be sent back now, or null when it can. */
export function reopenRefusal(ticket: { status: string; resolvedAt?: Date | string | null }, now = new Date()) {
  if (ticket.status === 'Resolved') return null;
  if (ticket.status === 'Closed') {
    const finished = ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : 0;
    if (now.getTime() - finished <= REOPEN_DAYS * 24 * 60 * 60 * 1000) return null;
    return `This ticket was closed more than ${REOPEN_DAYS} days ago; please report the problem again`;
  }
  return 'Only a ticket the vendor has marked done can be reopened';
}

/**
 * The resident says it is not fixed. It goes back to the vendor who did it,
 * as long as they still work for the society, and counts against them.
 */
export async function reopenTicket(actor: Actor, ticketId: string, reason: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, deletedAt: null } });
  if (!ticket) throw new SignoffError(404, 'Ticket not found');
  if (!canActOnTicket(actor, ticket)) throw new SignoffError(403, 'You do not have access to this ticket');
  const refusal = reopenRefusal(ticket);
  if (refusal) throw new SignoffError(409, refusal);

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      reopenCount: { increment: 1 },
      resolvedAt: null,
      status: 'Open',
      timeline: {
        create: {
          title: 'Reopened',
          description: `${actor.name} says it is not fixed: "${reason}"`,
          actor: actor.name,
          type: 'reopened',
        },
      },
    },
  });

  const previous = ticket.assignedVendorId ? await vendorRepo.findById(ticket.assignedVendorId) : null;
  const vendor = previous ?? (await vendorRepo.findBestForCategory(ticket.issueCategory, ticket.declinedVendorIds));

  if (vendor) {
    await assignVendor(ticket.id, vendor.id, undefined, 'Reopened by the resident.');
    if (previous) {
      // assignVendor does not tell a vendor about a job they already had.
      await sendNotification({
        ticketId: ticket.id,
        recipientType: 'vendor',
        recipientName: previous.name,
        phone: previous.phone,
        recipientUserId: previous.userId,
        message: `Job #${ticket.id} at ${ticket.flatNumber} was reopened by the resident: "${reason}". Please go back and fix it.`,
      });
    }
  }

  const reopened = (await ticketRepo.findById(ticket.id))!;
  await notifyManagers(
    ticket.id,
    `Ticket #${ticket.id} at ${ticket.flatNumber} was reopened by ${actor.name}: "${reason}". ` +
      (vendor ? `It is back with ${vendor.name}.` : 'No vendor is free; please assign one.'),
  );
  return reopened;
}

/**
 * Tickets the vendor finished more than two days ago that the resident never
 * answered: closed as fixed, and the resident told.
 */
export async function autoCloseQuietTickets(now = new Date()) {
  const cutoff = new Date(now.getTime() - AUTO_CLOSE_HOURS * 60 * 60 * 1000);
  const quiet = await prisma.ticket.findMany({
    where: { status: 'Resolved', resolvedAt: { lt: cutoff }, deletedAt: null },
    select: { id: true },
  });

  for (const { id } of quiet) {
    const closed = await ticketRepo.update(id, {
      status: 'Closed',
      timeline: {
        create: {
          title: 'Closed Automatically',
          description: `No reply from the resident within ${AUTO_CLOSE_HOURS} hours of the work being done.`,
          actor: 'Follow-up Agent',
          type: 'auto_closed',
        },
      },
    });
    if (closed) {
      await notifyResident(
        closed,
        `Ticket #${closed.id} has been closed as fixed. If the problem is back, you can reopen it in SocietyOps within ${REOPEN_DAYS} days.`,
      );
    }
  }
  return quiet.length;
}
