import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, deleteTickets, ACCOUNTS, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * Vendor scorecards. Green Valley's only plumber, Sunil (VND-G1), works two
 * jobs: one finished and rated, one still open.
 */

const SUNIL = { phone: '+91 99000 33333', password: 'sunil123' };
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let api: Agent;
let resident: string;
let manager: string;
let sunil: string;
let since: string;
const created: string[] = [];

const scorecard = async (token: string, query = `?from=${encodeURIComponent(since)}`) =>
  api.get(`/api/vendors/performance${query}`).set(bearer(token));

beforeAll(async () => {
  api = await agent();
  since = new Date(Date.now() - 1000).toISOString();
  resident = await login(ACCOUNTS.greenResident);
  manager = await login(ACCOUNTS.greenManager);
  sunil = await login(SUNIL);

  const report = async (description: string) => {
    const res = await api.post('/api/tickets').set(bearer(resident)).send({ issueCategory: 'Plumbing', description });
    created.push(res.body.id);
    return res.body;
  };
  const done = await report('Performance test: finished');
  await report('Performance test: still open');

  const step = (body: object) => api.post(`/api/worker/jobs/${done.id}/status`).set(bearer(sunil)).send(body);
  await step({ action: 'accept' });
  await step({ action: 'start' });
  const up = await api.post('/api/uploads').set(bearer(sunil)).send({ contentType: 'image/png', size: PNG.length });
  await api.put(up.body.upload.url).set(up.body.upload.headers).send(PNG);
  await step({ action: 'complete', note: 'Cleared the drain', images: [up.body.key] });
  await api.post(`/api/tickets/${done.id}/close`).set(bearer(resident)).send({ rating: 4 });
});

afterAll(async () => {
  await deleteTickets(created);
  await unscopedPrisma.$disconnect();
});

describe('the vendor scorecard', () => {
  it('counts jobs, response and fix times, and ratings for the period', async () => {
    const res = await scorecard(manager);
    expect(res.status).toBe(200);
    const sunilCard = res.body.vendors.find((v: any) => v.vendorId === 'VND-G1');
    expect(sunilCard).toMatchObject({
      jobs: 2,
      done: 1,
      open: 1,
      ratings: 1,
      avgRating: 4,
      reopenRate: 0,
      slaMissed: 0,
      declined: 0,
      timedOut: 0,
    });
    expect(sunilCard.avgAcceptMinutes).not.toBeNull();
    expect(sunilCard.avgStartMinutes).not.toBeNull();
    expect(sunilCard.avgFixMinutes).not.toBeNull();
  });

  it('counts nothing outside the period', async () => {
    const lastYear = `?from=2025-01-01&to=2025-02-01`;
    const res = await scorecard(manager, lastYear);
    expect(res.body.vendors.find((v: any) => v.vendorId === 'VND-G1')?.jobs ?? 0).toBe(0);
    expect((await scorecard(manager, '?from=2025-02-01&to=2025-01-01')).status).toBe(400);
  });

  it('shows only the society’s own vendors, and not to residents', async () => {
    const res = await scorecard(manager);
    expect(res.body.vendors.every((v: any) => !v.vendorId.startsWith('VND-0'))).toBe(true);
    expect((await scorecard(resident)).status).toBe(403);

    const shreeRam = await scorecard(await login(ACCOUNTS.maintenance));
    expect(shreeRam.body.vendors.some((v: any) => v.vendorId === 'VND-G1')).toBe(false);
  });
});
