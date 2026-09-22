/**
 * Response-time commitments per urgency band, in hours.
 *
 * These were previously implicit: "SLA at risk" was derived from status and
 * urgency alone, with no clock, so a High ticket opened a minute ago counted
 * exactly the same as one opened yesterday.
 */
export const SLA_HOURS: Record<string, number> = {
  High: 2,
  Medium: 8,
  Low: 24,
};

const DEFAULT_SLA_HOURS = 8;

export function slaHoursFor(urgency: string): number {
  return SLA_HOURS[urgency] ?? DEFAULT_SLA_HOURS;
}

/** The moment a ticket of this urgency, raised now, becomes overdue. */
export function slaDueAt(urgency: string, from: Date = new Date()): Date {
  return new Date(from.getTime() + slaHoursFor(urgency) * 60 * 60 * 1000);
}

const FINISHED = ['Resolved', 'Closed'];

interface SlaTicket {
  status: string;
  slaDueAt?: Date | string | null;
}

/** True when an unfinished ticket is already past its deadline. */
export function isOverdue(ticket: SlaTicket, now: Date = new Date()): boolean {
  if (!ticket.slaDueAt || FINISHED.includes(ticket.status)) return false;
  return new Date(ticket.slaDueAt).getTime() < now.getTime();
}

/**
 * True when an unfinished ticket is overdue, or close enough that it needs
 * attention now. "Close enough" is a quarter of the band it was given.
 */
export function isAtRisk(ticket: SlaTicket & { urgency?: string }, now: Date = new Date()): boolean {
  if (!ticket.slaDueAt || FINISHED.includes(ticket.status)) return false;

  const due = new Date(ticket.slaDueAt).getTime();
  const warningWindow = slaHoursFor(ticket.urgency || '') * 0.25 * 60 * 60 * 1000;
  return due - now.getTime() <= warningWindow;
}
