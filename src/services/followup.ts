import { ticketRepo, vendorRepo, agentLogRepo } from '../database/repositories';
import { sendNotification } from './notifications';
import { isOverdue } from './sla';

/** Words in a complaint that mean someone may be in danger. */
const EMERGENCY_KEYWORDS = ['stuck', 'gas', 'sewage', 'fire', 'smoke', 'trapped'];

export interface FollowupResult {
  checkedCount: number;
  escalatedTickets: any[];
  remindersSent: number;
  dispatched: number;
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
 * Extracted from the route handler so it can also run on a timer. It was
 * previously reachable only by a manager pressing a button in the dashboard,
 * which is not what "autonomous" implies.
 */
export async function runFollowupCycle(now: Date = new Date()): Promise<FollowupResult> {
  const allTickets = await ticketRepo.findAll();

  let remindersSent = 0;
  let dispatched = 0;
  const escalatedTickets: any[] = [];

  for (const ticket of allTickets) {
    if (ticket.status === 'Open') {
      const vendor = await vendorRepo.findBestForCategory(ticket.issueCategory);
      if (vendor) {
        await ticketRepo.assignVendor(ticket.id, vendor.id, vendor.avgResolutionTime || '25 mins');
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
      `sent ${remindersSent} vendor pings, auto-escalated ${escalatedTickets.length}.`,
  });

  return { checkedCount: allTickets.length, escalatedTickets, remindersSent, dispatched };
}

/**
 * Starts the timer that runs the cycle unattended.
 *
 * Off by default: set FOLLOWUP_INTERVAL_MINUTES to enable it. Returns a
 * stop function, and nothing when the timer is disabled.
 */
export function startFollowupScheduler(
  onError: (err: Error) => void = () => {}
): (() => void) | null {
  const minutes = Number(process.env.FOLLOWUP_INTERVAL_MINUTES);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  let running = false;

  const timer = setInterval(async () => {
    // A slow cycle must not overlap itself and double-dispatch.
    if (running) return;
    running = true;
    try {
      await runFollowupCycle();
    } catch (err) {
      onError(err as Error);
    } finally {
      running = false;
    }
  }, minutes * 60 * 1000);

  // Do not hold the process open purely for this timer.
  timer.unref?.();

  return () => clearInterval(timer);
}
