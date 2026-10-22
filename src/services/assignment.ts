import { prisma, unscopedPrisma } from '../database/prisma';
import { ticketRepo } from '../database/repositories';
import { MANAGER_ROLES } from '../auth/actor';
import { requireSocietyId } from '../requestContext';
import { sendNotification } from './notifications';
import { OPEN_WORK_STATUSES, ordinal } from './dispatch';

/**
 * Giving a ticket to a vendor, and telling the people who need to know.
 *
 * Every assignment goes through here: dispatch of a new ticket, a manager's
 * choice, rebalancing, and a job passed on after a decline. Vendors used to
 * learn about jobs only by opening the app.
 */

/** The job for the vendor, with what they need to decide whether to go. */
function jobMessage(ticket: any): string {
  const queue = ticket.vendorQueue;
  const place = queue && queue.position > 1 ? ` It is ${ordinal(queue.position)} in your queue.` : '';
  return (
    `New job #${ticket.id}: ${ticket.issueCategory} at ${ticket.flatNumber}, ${ticket.urgency} urgency. ` +
    `"${String(ticket.description).slice(0, 100)}".${place} Open SocietyOps to accept or decline.`
  );
}

export async function assignVendor(
  ticketId: string,
  vendorId: string,
  estimatedEta?: string,
  reason?: string,
  /** False when the previous vendor gave the job up themselves. */
  tellPrevious = true,
) {
  const before = await prisma.ticket.findFirst({
    where: { id: ticketId, deletedAt: null },
    select: { assignedVendorId: true, status: true },
  });
  const ticket = await ticketRepo.assignVendor(ticketId, vendorId, estimatedEta, reason);
  if (!ticket) return ticket;

  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId } });
  if (vendor && before?.assignedVendorId !== vendorId) {
    await sendNotification({
      ticketId,
      recipientType: 'vendor',
      recipientName: vendor.name,
      phone: vendor.phone,
      recipientUserId: vendor.userId,
      message: jobMessage(ticket),
    });
  }

  // Whoever had it is told it moved, so they do not turn up for it.
  if (
    tellPrevious &&
    before?.assignedVendorId &&
    before.assignedVendorId !== vendorId &&
    OPEN_WORK_STATUSES.includes(before.status)
  ) {
    const previous = await prisma.vendor.findFirst({ where: { id: before.assignedVendorId } });
    if (previous) {
      await sendNotification({
        ticketId,
        recipientType: 'vendor',
        recipientName: previous.name,
        phone: previous.phone,
        recipientUserId: previous.userId,
        message: `Job #${ticketId} at ${ticket.flatNumber} has been given to ${vendor?.name ?? 'another vendor'}. You do not need to go.`,
      });
    }
  }
  return ticket;
}

/** Tells the society's managers about something that needs them. */
export async function notifyManagers(ticketId: string, message: string) {
  const managers = await unscopedPrisma.membership.findMany({
    where: { societyId: requireSocietyId(), role: { in: MANAGER_ROLES }, status: 'active' },
    include: { user: { select: { id: true, name: true, phoneNumber: true } } },
  });
  const seen = new Set<string>();
  for (const m of managers) {
    if (seen.has(m.userId) || !m.user.phoneNumber) continue;
    seen.add(m.userId);
    await sendNotification({
      ticketId,
      recipientType: 'manager',
      recipientName: m.user.name,
      phone: m.user.phoneNumber,
      recipientUserId: m.userId,
      message,
    });
  }
}

/** Tells the person who reported a ticket, and anyone whose report joined it. */
export async function notifyResident(
  ticket: {
    id: string;
    residentId?: string | null;
    residentName: string;
    residentPhone?: string | null;
    alsoReportedBy?: string[];
  },
  message: string,
) {
  if (ticket.residentPhone) {
    await sendNotification({
      ticketId: ticket.id,
      recipientType: 'resident',
      recipientName: ticket.residentName,
      phone: ticket.residentPhone,
      recipientUserId: ticket.residentId ?? null,
      message,
    });
  }
  if (ticket.alsoReportedBy?.length) {
    const others = await unscopedPrisma.user.findMany({
      where: { id: { in: ticket.alsoReportedBy } },
      select: { id: true, name: true, phoneNumber: true },
    });
    for (const u of others) {
      if (!u.phoneNumber) continue;
      await sendNotification({
        ticketId: ticket.id,
        recipientType: 'resident',
        recipientName: u.name,
        phone: u.phoneNumber,
        recipientUserId: u.id,
        message,
      });
    }
  }
}
