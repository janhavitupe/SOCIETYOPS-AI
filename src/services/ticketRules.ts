import { isOverdue } from './sla';

export const TICKET_STATUSES = ['Open', 'Vendor Assigned', 'In Progress', 'Escalated', 'Resolved', 'Closed'] as const;

/**
 * Which state transitions a caller may make on a ticket. Shared by the REST
 * routes and the agent's tools, which previously let a resident close or
 * escalate a ticket in any state, including one nobody had started on.
 *
 * Each function returns null when the action is allowed, or the reason it is
 * not, worded for the person who asked.
 */

interface RuleTicket {
  status: string;
  slaDueAt?: Date | string | null;
}

/** Statuses in which work has actually been done on the ticket. */
const WORKED_ON = ['In Progress', 'Resolved'];

export function closeRefusal(ticket: RuleTicket, isManager: boolean): string | null {
  if (ticket.status === 'Closed') return 'This ticket is already closed';
  if (isManager) return null;
  if (!WORKED_ON.includes(ticket.status)) {
    return 'A ticket can be closed once work on it has started or been completed';
  }
  return null;
}

export function escalateRefusal(ticket: RuleTicket, isManager: boolean, now: Date = new Date()): string | null {
  if (['Resolved', 'Closed'].includes(ticket.status)) return 'This ticket is already finished';
  if (ticket.status === 'Escalated') return 'This ticket is already escalated';
  if (isManager) return null;
  // An unassigned ticket is the dispatcher's job until it misses its deadline;
  // only then is it the resident's to escalate.
  if (ticket.status === 'Open' && !isOverdue(ticket, now)) {
    return 'This ticket has not been assigned yet; it can be escalated if it passes its response deadline';
  }
  return null;
}
