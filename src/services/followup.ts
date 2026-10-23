import { ticketRepo, vendorRepo, agentLogRepo } from '../database/repositories';
import { sendNotification } from './notifications';
import { isOverdue } from './sla';
import { rebalanceCategory } from './rebalance';
import { assignVendor } from './assignment';
import { autoCloseQuietTickets } from './signoff';
import { passOnUnacceptedJobs } from './acceptTimeout';

/** Words in a complaint that mean someone may be in danger. */
const EMERGENCY_KEYWORDS = ['stuck', 'gas', 'sewage', 'fire', 'smoke', 'trapped'];

export interface FollowupResult {
  checkedCount: number;
  escalatedTickets: any[];
  remindersSent: number;
  dispatched: number;
  /** Finished jobs the resident never answered, closed as fixed. */
  autoClosed: number;
  /** Jobs a vendor did not accept in time, passed to someone else (or flagged). */
  passedOn: number;
}

function looksLikeEmergency(description: string): boolean {
  const lower = (description || '').toLowerCase();
  return EMERGENCY_KEYWORDS.some((word) => lower.includes(word));
}

/**
 * One pass of the autonomous follow-up agent: dispatch anything still
 * unassigned, escalate emergencies and overdue work, and chase vendors who
 * have not confirmed.
 *
 * Runs on a schedule from the job queue (services/jobs), and on demand from
 * POST /api/followup/run.
 */
export async function runFollowupCycle(now: Date = new Date()): Promise<FollowupResult> {
  // First move queued jobs to any vendor who has room, so the reminders
  // below go to whoever is actually doing the job.
  const vendors = await vendorRepo.findAll();
  for (const category of new Set(vendors.map((v: { category: string }) => v.category))) {
    await rebalanceCategory(category);
  }

  const autoClosed = await autoCloseQuietTickets(now);
  const passedOn = (await passOnUnacceptedJobs(now)).length;

  const allTickets = await ticketRepo.findAll();

  let remindersSent = 0;
  let dispatched = 0;
  const escalatedTickets: any[] = [];

  for (const ticket of allTickets) {
    if (ticket.status === 'Open') {
      // A job everyone declined waits for the manager rather than going round again.
      const vendor = await vendorRepo.findBestForCategory(ticket.issueCategory, ticket.declinedVendorIds);
      if (vendor) {
        await assignVendor(ticket.id, vendor.id);
        dispatched += 1;
      }
      continue;
    }

    if (ticket.status !== 'Vendor Assigned') continue;

    // Escalate on danger, or when the ticket has blown its own deadline. The
    // deadline check is new: previously only a keyword could trigger this, so
    // a quietly overdue ticket was chased forever and never escalated.
    const emergency = looksLikeEmergency(ticket.description) && ticket.urgency === 'High';
    const overdue = isOverdue(ticket, now);

    if (emergency || overdue) {
      const reason = emergency
        ? 'Urgent life-safety keyword auto-detected during Follow-up Agent cycle'
        : 'Response deadline passed without resolution';

      const updated = await ticketRepo.escalateTicket(ticket.id, reason);
      if (updated) escalatedTickets.push(updated);
      continue;
    }

    if (ticket.assignedVendorId) {
      await sendNotification({
        ticketId: ticket.id,
        recipientType: 'vendor',
        recipientName: ticket.assignedVendorName || 'Vendor',
        phone: ticket.assignedVendorPhone || '',
        message: `REMINDER: Please confirm arrival at ${ticket.flatNumber} for ticket #${ticket.id}. Resident is waiting.`,
        channel: 'WhatsApp',
        language: 'English',
      });
      remindersSent += 1;
    }
  }

  await agentLogRepo.create({
    agentName: 'Follow-up Agent',
    action: 'Autonomous Cycle Completed',
    details:
      `Checked ${allTickets.length} tickets. Dispatched ${dispatched}, ` +
      `sent ${remindersSent} vendor pings, auto-escalated ${escalatedTickets.length}, auto-closed ${autoClosed}, passed on ${passedOn} unaccepted.`,
  });

  return { checkedCount: allTickets.length, escalatedTickets, remindersSent, dispatched, autoClosed, passedOn };
}
