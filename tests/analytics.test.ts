import { describe, it, expect } from 'vitest';
import { buildDailyReport } from '../src/services/analytics';

const ticket = (status: string, issueCategory = 'Plumbing', urgency = 'Medium') => ({
  status,
  issueCategory,
  urgency,
});

describe('buildDailyReport', () => {
  it('counts an empty set without inventing tickets', () => {
    const report = buildDailyReport([]);
    expect(report.totalTickets).toBe(0);
    expect(report.openTickets).toBe(0);
    expect(report.escalatedCount).toBe(0);
    expect(report.slaAtRiskCount).toBe(0);
  });

  it('treats Open, Vendor Assigned and In Progress as open', () => {
    const report = buildDailyReport([
      ticket('Open'),
      ticket('Vendor Assigned'),
      ticket('In Progress'),
      ticket('Closed'),
      ticket('Escalated'),
    ]);
    expect(report.openTickets).toBe(3);
    expect(report.inProgressTickets).toBe(2);
    expect(report.escalatedCount).toBe(1);
    expect(report.totalTickets).toBe(5);
  });

  it('counts Resolved and Closed as finished', () => {
    const report = buildDailyReport([ticket('Resolved'), ticket('Closed'), ticket('Open')]);
    expect(report.resolvedToday).toBe(2);
  });

  it('reports the most frequent category', () => {
    const report = buildDailyReport([
      ticket('Open', 'Electrical'),
      ticket('Open', 'Electrical'),
      ticket('Open', 'Plumbing'),
    ]);
    expect(report.frequentCategory).toBe('Electrical');
  });

  it('counts only unstarted high-urgency tickets as SLA at risk', () => {
    const report = buildDailyReport([
      ticket('Open', 'Plumbing', 'High'),
      ticket('Vendor Assigned', 'Plumbing', 'High'),
      ticket('In Progress', 'Plumbing', 'High'),
      ticket('Closed', 'Plumbing', 'High'),
      ticket('Open', 'Plumbing', 'Low'),
    ]);
    expect(report.slaAtRiskCount).toBe(2);
  });
});
