import { describe, it, expect } from 'vitest';
import { buildDailyReport } from '../src/services/analytics';
import { slaDueAt, isAtRisk, isOverdue, slaHoursFor } from '../src/services/sla';

const NOW = new Date('2026-09-22T12:00:00.000Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3600_000);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const ticket = (over: Partial<any> = {}) => ({
  status: 'Open',
  issueCategory: 'Plumbing',
  urgency: 'Medium',
  ...over,
});

describe('buildDailyReport', () => {
  it('counts an empty set without inventing tickets', () => {
    const report = buildDailyReport([], NOW);
    expect(report.totalTickets).toBe(0);
    expect(report.openTickets).toBe(0);
    expect(report.escalatedCount).toBe(0);
    expect(report.slaAtRiskCount).toBe(0);
    expect(report.avgResponseTimeMinutes).toBe(0);
  });

  it('treats Open, Vendor Assigned and In Progress as open', () => {
    const report = buildDailyReport(
      [
        ticket({ status: 'Open' }),
        ticket({ status: 'Vendor Assigned' }),
        ticket({ status: 'In Progress' }),
        ticket({ status: 'Closed' }),
        ticket({ status: 'Escalated' }),
      ],
      NOW
    );
    expect(report.openTickets).toBe(3);
    expect(report.inProgressTickets).toBe(2);
    expect(report.escalatedCount).toBe(1);
    expect(report.totalTickets).toBe(5);
  });

  it('reports the most frequent category', () => {
    const report = buildDailyReport(
      [
        ticket({ issueCategory: 'Electrical' }),
        ticket({ issueCategory: 'Electrical' }),
        ticket({ issueCategory: 'Plumbing' }),
      ],
      NOW
    );
    expect(report.frequentCategory).toBe('Electrical');
  });
});

describe('resolvedToday', () => {
  it('counts only tickets actually resolved today', () => {
    const report = buildDailyReport(
      [
        ticket({ status: 'Closed', resolvedAt: minutesAgo(30) }),
        ticket({ status: 'Resolved', resolvedAt: minutesAgo(90) }),
        // Finished, but weeks ago: previously this still counted as "today".
        ticket({ status: 'Closed', resolvedAt: new Date('2026-09-01T09:00:00.000Z') }),
      ],
      NOW
    );
    expect(report.resolvedToday).toBe(2);
  });

  it('does not count a finished ticket that has no resolvedAt stamp', () => {
    const report = buildDailyReport([ticket({ status: 'Closed' })], NOW);
    expect(report.resolvedToday).toBe(0);
  });
});

describe('average response time', () => {
  it('measures creation to first vendor assignment', () => {
    const report = buildDailyReport(
      [
        ticket({
          createdAt: minutesAgo(50),
          timeline: [
            { type: 'created', timestamp: minutesAgo(50).toISOString() },
            { type: 'assigned', timestamp: minutesAgo(30).toISOString() },
          ],
        }),
        ticket({
          createdAt: minutesAgo(40),
          timeline: [{ type: 'assigned', timestamp: minutesAgo(30).toISOString() }],
        }),
      ],
      NOW
    );
    // 20 minutes and 10 minutes.
    expect(report.avgResponseTimeMinutes).toBe(15);
  });

  it('ignores tickets that were never dispatched rather than scoring them zero', () => {
    const report = buildDailyReport(
      [
        ticket({
          createdAt: minutesAgo(50),
          timeline: [{ type: 'assigned', timestamp: minutesAgo(30).toISOString() }],
        }),
        ticket({ createdAt: minutesAgo(200), timeline: [{ type: 'created', timestamp: minutesAgo(200).toISOString() }] }),
      ],
      NOW
    );
    expect(report.avgResponseTimeMinutes).toBe(20);
  });
});

describe('top performing vendor', () => {
  it('names the vendor who closed the most tickets', () => {
    const report = buildDailyReport(
      [
        ticket({ status: 'Closed', assignedVendorName: 'Ramesh Kumar Plumber' }),
        ticket({ status: 'Resolved', assignedVendorName: 'Ramesh Kumar Plumber' }),
        ticket({ status: 'Closed', assignedVendorName: 'Satish Electrician' }),
        ticket({ status: 'Open', assignedVendorName: 'Satish Electrician' }),
      ],
      NOW
    );
    expect(report.topPerformingVendor).toBe('Ramesh Kumar Plumber');
  });

  it('says so plainly when nothing has been completed', () => {
    const report = buildDailyReport([ticket({ status: 'Open' })], NOW);
    expect(report.topPerformingVendor).toBe('No completed jobs yet');
  });
});

describe('SLA risk', () => {
  it('counts a ticket already past its deadline', () => {
    const report = buildDailyReport(
      [ticket({ urgency: 'High', slaDueAt: hoursFromNow(-1) })],
      NOW
    );
    expect(report.slaAtRiskCount).toBe(1);
  });

  it('ignores a ticket with plenty of time left', () => {
    const report = buildDailyReport(
      [ticket({ urgency: 'Low', slaDueAt: hoursFromNow(20) })],
      NOW
    );
    expect(report.slaAtRiskCount).toBe(0);
  });

  it('ignores a finished ticket even if its deadline passed', () => {
    const report = buildDailyReport(
      [ticket({ status: 'Closed', urgency: 'High', slaDueAt: hoursFromNow(-5) })],
      NOW
    );
    expect(report.slaAtRiskCount).toBe(0);
  });

  it('surfaces overdue work in the recommendations', () => {
    const report = buildDailyReport(
      [ticket({ urgency: 'High', slaDueAt: hoursFromNow(-3) })],
      NOW
    );
    expect(report.recommendations.join(' ')).toMatch(/past the response deadline/i);
  });
});

describe('sla helpers', () => {
  it('gives a tighter deadline to higher urgency', () => {
    expect(slaHoursFor('High')).toBeLessThan(slaHoursFor('Medium'));
    expect(slaHoursFor('Medium')).toBeLessThan(slaHoursFor('Low'));
  });

  it('falls back to the medium band for an unknown urgency', () => {
    expect(slaHoursFor('Whenever')).toBe(slaHoursFor('Medium'));
  });

  it('sets the deadline ahead of the raising time', () => {
    const due = slaDueAt('High', NOW);
    expect(due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(due.getTime()).toBe(NOW.getTime() + slaHoursFor('High') * 3600_000);
  });

  it('marks an unfinished ticket overdue only after its deadline', () => {
    expect(isOverdue({ status: 'Open', slaDueAt: hoursFromNow(-1) }, NOW)).toBe(true);
    expect(isOverdue({ status: 'Open', slaDueAt: hoursFromNow(1) }, NOW)).toBe(false);
    expect(isOverdue({ status: 'Closed', slaDueAt: hoursFromNow(-1) }, NOW)).toBe(false);
  });

  it('warns before the deadline, within a quarter of the band', () => {
    // High is a 2 hour band, so the warning window is the final 30 minutes.
    expect(isAtRisk({ status: 'Open', urgency: 'High', slaDueAt: hoursFromNow(0.4) }, NOW)).toBe(true);
    expect(isAtRisk({ status: 'Open', urgency: 'High', slaDueAt: hoursFromNow(1.5) }, NOW)).toBe(false);
  });

  it('never flags a ticket that has no deadline recorded', () => {
    expect(isAtRisk({ status: 'Open', urgency: 'High' }, NOW)).toBe(false);
  });
});
