/**
 * Arrival estimates that account for a vendor's queue.
 *
 * Every assignment used to quote the vendor's usual response time ("25 mins")
 * however many jobs they already had, so the third resident in line was
 * promised the same 25 minutes as the first. A vendor now works their jobs in
 * the order they were given them, and the estimate grows with the queue.
 */

/** Ticket statuses in which the assigned vendor still has the job to do. */
export const OPEN_WORK_STATUSES = ['Vendor Assigned', 'In Progress', 'Escalated'];

/**
 * Open jobs the vendor has not started, which can still go to someone else.
 * Escalated is one of them: it means stuck and urgent, which is exactly when a
 * free vendor should take over. Only In Progress work stays where it is.
 */
export const NOT_STARTED_STATUSES = ['Vendor Assigned', 'Escalated'];

const DEFAULT_JOB_MINUTES = 30;

/** "25 mins", "1 hr", "1 hr 30 mins", "90 min" → minutes. Unreadable text gives the default. */
export function parseMinutes(text: string | null | undefined): number {
  if (!text) return DEFAULT_JOB_MINUTES;
  const hours = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(text);
  const minutes = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/i.exec(text);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  if (total > 0) return Math.round(total);
  const bare = /^\s*(\d+)\s*$/.exec(text);
  return bare ? Number(bare[1]) : DEFAULT_JOB_MINUTES;
}

/** 25 → "25 mins", 75 → "1 hr 15 mins", 120 → "2 hrs". */
export function formatMinutes(total: number): string {
  if (total < 60) return `${total} mins`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const h = `${hours} hr${hours > 1 ? 's' : ''}`;
  return minutes ? `${h} ${minutes} mins` : h;
}

/**
 * When a vendor with `jobsAhead` open jobs could reach a new one: their usual
 * time per job, once for each job ahead and once for this one.
 */
export function queuedEta(avgResolutionTime: string | null | undefined, jobsAhead: number): string {
  return formatMinutes(parseMinutes(avgResolutionTime) * (jobsAhead + 1));
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

export interface VendorQueue {
  /** This ticket's place in the vendor's queue, 1 = next. */
  position: number;
  /** All the vendor's open jobs, this one included. */
  total: number;
}
