import { DailyReport } from '../types';

/** Statuses that count as "not yet finished" for the open-tickets figure. */
const OPEN_STATUSES = ['Open', 'Vendor Assigned', 'In Progress'];
const IN_PROGRESS_STATUSES = ['Vendor Assigned', 'In Progress'];
const FINISHED_STATUSES = ['Resolved', 'Closed'];

interface TicketLike {
  status: string;
  urgency: string;
  issueCategory: string;
}

/**
 * Builds the daily maintenance summary from a set of tickets.
 *
 * This is deliberately a pure function over the tickets it is given: it was
 * previously duplicated verbatim in the /api/analytics handler and in the
 * generate_daily_report agent tool, which meant the two could drift apart.
 *
 * Several figures below are still placeholders rather than measurements --
 * avgResponseTimeMinutes, topPerformingVendor and recommendations are fixed
 * strings, and resolvedToday counts every finished ticket rather than today's.
 * They are carried over unchanged so this refactor does not alter behaviour.
 */
export function buildDailyReport(tickets: TicketLike[]): DailyReport {
  const openTickets = tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const inProgressTickets = tickets.filter((t) => IN_PROGRESS_STATUSES.includes(t.status)).length;
  const resolvedToday = tickets.filter((t) => FINISHED_STATUSES.includes(t.status)).length;
  const escalatedCount = tickets.filter((t) => t.status === 'Escalated').length;
  const slaAtRiskCount = tickets.filter(
    (t) => t.urgency === 'High' && (t.status === 'Open' || t.status === 'Vendor Assigned')
  ).length;

  const categoryCounts: Record<string, number> = {};
  tickets.forEach((t) => {
    categoryCounts[t.issueCategory] = (categoryCounts[t.issueCategory] || 0) + 1;
  });

  let frequentCategory = 'Plumbing';
  let maxCount = 0;
  Object.entries(categoryCounts).forEach(([category, count]) => {
    if (count > maxCount) {
      maxCount = count;
      frequentCategory = category;
    }
  });

  return {
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    totalTickets: tickets.length,
    openTickets,
    inProgressTickets,
    resolvedToday,
    escalatedCount,
    avgResponseTimeMinutes: 18,
    frequentCategory,
    topPerformingVendor: 'Ramesh Kumar Plumber (4.9 stars)',
    summaryText: `SocietyOps AI managed ${tickets.length} total tickets with an average first-response speed of 18 minutes. ${resolvedToday} tickets successfully closed today. ${frequentCategory} remains the most requested category.`,
    recommendations: [
      'Schedule preventive maintenance check for Tower B Elevator ARD battery',
      'Stock extra master bathroom flush valves in RWA inventory',
      'Add 1 backup Electrician vendor for weekend evening slots',
    ],
    slaAtRiskCount,
  };
}
