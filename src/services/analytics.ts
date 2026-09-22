import { DailyReport } from '../types';
import { isAtRisk } from './sla';

/** Statuses that count as "not yet finished" for the open-tickets figure. */
const OPEN_STATUSES = ['Open', 'Vendor Assigned', 'In Progress'];
const IN_PROGRESS_STATUSES = ['Vendor Assigned', 'In Progress'];
const FINISHED_STATUSES = ['Resolved', 'Closed'];

interface TimelineLike {
  timestamp: string;
  type: string;
}

interface TicketLike {
  status: string;
  urgency: string;
  issueCategory: string;
  createdAt?: Date | string;
  resolvedAt?: Date | string | null;
  slaDueAt?: Date | string | null;
  assignedVendorName?: string | null;
  timeline?: TimelineLike[];
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Minutes between a ticket being raised and a vendor first being assigned.
 *
 * Returns null when the ticket has not been dispatched yet, so undispatched
 * work does not drag the average down or count as an instant response.
 */
function responseMinutes(ticket: TicketLike): number | null {
  if (!ticket.createdAt || !ticket.timeline) return null;

  const assigned = ticket.timeline
    .filter((e) => e.type === 'assigned')
    .map((e) => new Date(e.timestamp).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)[0];

  if (assigned === undefined) return null;

  const created = new Date(ticket.createdAt).getTime();
  const minutes = (assigned - created) / 60000;
  return minutes >= 0 ? minutes : null;
}

function mostFrequent(values: string[], fallback: string): string {
  const counts: Record<string, number> = {};
  values.forEach((v) => {
    if (v) counts[v] = (counts[v] || 0) + 1;
  });

  let best = fallback;
  let max = 0;
  Object.entries(counts).forEach(([value, count]) => {
    if (count > max) {
      max = count;
      best = value;
    }
  });
  return best;
}

/**
 * Derives a few concrete suggestions from the data.
 *
 * These replace three hardcoded sentences about elevator batteries and flush
 * valves that were returned no matter what the tickets actually said.
 */
function buildRecommendations(
  tickets: TicketLike[],
  frequentCategory: string,
  overdue: number,
  unassigned: number
): string[] {
  const out: string[] = [];

  if (overdue > 0) {
    out.push(`${overdue} ticket${overdue === 1 ? '' : 's'} past the response deadline — reassign or escalate before adding new work.`);
  }
  if (unassigned > 0) {
    out.push(`${unassigned} open ticket${unassigned === 1 ? ' has' : 's have'} no vendor assigned yet.`);
  }
  if (tickets.length > 0) {
    out.push(`${frequentCategory} is the most reported category this period; keep common spares stocked and a backup vendor on call.`);
  }

  const escalated = tickets.filter((t) => t.status === 'Escalated').length;
  if (escalated > 0) {
    out.push(`${escalated} escalation${escalated === 1 ? '' : 's'} still open — review with the RWA committee.`);
  }

  return out.length > 0 ? out : ['No outstanding maintenance risks in this period.'];
}

/**
 * Builds the daily maintenance summary from a set of tickets.
 *
 * Deliberately a pure function over the tickets it is given: it was previously
 * duplicated verbatim in the /api/analytics handler and in the
 * generate_daily_report agent tool, which meant the two could drift apart.
 */
export function buildDailyReport(tickets: TicketLike[], now: Date = new Date()): DailyReport {
  const openTickets = tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const inProgressTickets = tickets.filter((t) => IN_PROGRESS_STATUSES.includes(t.status)).length;
  const escalatedCount = tickets.filter((t) => t.status === 'Escalated').length;

  // Counts tickets actually finished today, using the resolvedAt stamp. This
  // used to count every finished ticket ever and report it as "today".
  const midnight = startOfToday(now).getTime();
  const resolvedToday = tickets.filter(
    (t) => FINISHED_STATUSES.includes(t.status) && t.resolvedAt && new Date(t.resolvedAt).getTime() >= midnight
  ).length;

  // Measured against each ticket's own deadline rather than guessed from
  // urgency and status with no clock.
  const slaAtRiskCount = tickets.filter((t) => isAtRisk(t as any, now)).length;
  const overdue = tickets.filter(
    (t) => !FINISHED_STATUSES.includes(t.status) && t.slaDueAt && new Date(t.slaDueAt).getTime() < now.getTime()
  ).length;
  const unassigned = tickets.filter((t) => t.status === 'Open' && !t.assignedVendorName).length;

  const responseTimes = tickets
    .map(responseMinutes)
    .filter((m): m is number => m !== null);

  const avgResponseTimeMinutes = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;

  const frequentCategory = mostFrequent(tickets.map((t) => t.issueCategory), 'None');

  // The vendor who has actually closed the most tickets in this set, rather
  // than a fixed name.
  const topPerformingVendor = mostFrequent(
    tickets
      .filter((t) => FINISHED_STATUSES.includes(t.status))
      .map((t) => t.assignedVendorName || ''),
    'No completed jobs yet'
  );

  return {
    date: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    totalTickets: tickets.length,
    openTickets,
    inProgressTickets,
    resolvedToday,
    escalatedCount,
    avgResponseTimeMinutes,
    frequentCategory,
    topPerformingVendor,
    summaryText:
      `SocietyOps AI is tracking ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}, ` +
      `${openTickets} still open. ` +
      (responseTimes.length
        ? `Average time to dispatch a vendor is ${avgResponseTimeMinutes} minutes across ${responseTimes.length} assigned ticket${responseTimes.length === 1 ? '' : 's'}. `
        : 'No tickets have been dispatched yet, so there is no response time to report. ') +
      `${resolvedToday} closed today. ${frequentCategory} is the most reported category.`,
    recommendations: buildRecommendations(tickets, frequentCategory, overdue, unassigned),
    slaAtRiskCount,
  };
}
