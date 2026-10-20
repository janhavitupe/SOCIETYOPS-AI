import { describe, it, expect } from 'vitest';
import { followupCron } from '../src/services/jobs';

describe('follow-up schedule', () => {
  it('defaults to every five minutes', () => {
    expect(followupCron(undefined)).toBe('*/5 * * * *');
    expect(followupCron('')).toBe('*/5 * * * *');
  });

  it('turns off at zero or nonsense', () => {
    expect(followupCron('0')).toBeNull();
    expect(followupCron('-3')).toBeNull();
    expect(followupCron('soon')).toBeNull();
    expect(followupCron('2.5')).toBeNull();
  });

  it('builds a cron for whole minutes, capping at hourly', () => {
    expect(followupCron('1')).toBe('* * * * *');
    expect(followupCron('15')).toBe('*/15 * * * *');
    expect(followupCron('90')).toBe('0 * * * *');
  });
});
