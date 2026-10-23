import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, deleteTickets, actorFor, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { setTestSociety } from '../src/requestContext';
import { executeToolCall } from '../src/tools/maintenanceTools';

/**
 * The resident's word on a finished job: confirming it with a rating,
 * reopening it, and silence closing it. Ramesh (VND-01) is the plumber.
 */

const RAMESH = { phone: '+91 98201 44321', password: 'ramesh123' };
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let api: Agent;
let vikram: string;
let ananya: string;
let manager: string;
let ramesh: string;
const created: string[] = [];

async function reportLeak(description: string) {
  const res = await api.post('/api/tickets').set(bearer(vikram)).send({ issueCategory: 'Plumbing', description });
  expect(res.status).toBe(201);
  created.push(res.body.id);
  return res.body;
}

async function finishAsRamesh(ticketId: string) {
  const step = (body: object) => api.post(`/api/worker/jobs/${ticketId}/status`).set(bearer(ramesh)).send(body);
  expect((await step({ action: 'start' })).status).toBe(200);
  const up = await api.post('/api/uploads').set(bearer(ramesh)).send({ contentType: 'image/png', size: PNG.length });
  await api.put(up.body.upload.url).set(up.body.upload.headers).send(PNG);
  const done = await step({ action: 'complete', note: 'Changed the washer', images: [up.body.key] });
  expect(done.status).toBe(200);
}

const inbox = async (token: string) => (await api.get('/api/me/notifications').set(bearer(token))).body.notifications;

beforeAll(async () => {
  api = await agent();
  vikram = await login(ACCOUNTS.resident);
  ananya = await login(ACCOUNTS.otherResident);
  manager = await login(ACCOUNTS.maintenance);
  ramesh = await login(RAMESH);
});

afterAll(async () => {
  await deleteTickets(created);
  await unscopedPrisma.$disconnect();
});

describe('reopening', () => {
  let job: any;

  it('a finished job asks the resident to confirm or reopen', async () => {
    job = await reportLeak('Signoff test: kitchen tap');
    expect(job.assignedVendorId).toBe('VND-01');
    await finishAsRamesh(job.id);

    const told = (await inbox(vikram)).find((n: any) => n.ticketId === job.id && /has been fixed/.test(n.message));
    expect(told.message).toMatch(/reopen it if it is not right/);
  });

  it('cannot be reopened without saying what is wrong, or by someone else', async () => {
    expect((await api.post(`/api/tickets/${job.id}/reopen`).set(bearer(vikram)).send({})).status).toBe(400);
    expect((await api.post(`/api/tickets/${job.id}/reopen`).set(bearer(ananya)).send({ reason: 'x' })).status).toBe(
      403,
    );
  });

  it('goes back to the same vendor, who is told, and counts it', async () => {
    const res = await api
      .post(`/api/tickets/${job.id}/reopen`)
      .set(bearer(vikram))
      .send({ reason: 'Still dripping at night' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'Vendor Assigned',
      assignedVendorId: 'VND-01',
      reopenCount: 1,
      resolvedAt: null,
    });
    expect(
      res.body.timeline.some((e: any) => e.type === 'reopened' && /Still dripping at night/.test(e.description)),
    ).toBe(true);

    const his = (await inbox(ramesh)).filter((n: any) => n.ticketId === job.id);
    expect(his.some((n: any) => /was reopened by the resident: "Still dripping at night"/.test(n.message))).toBe(true);
    const office = (await inbox(manager)).filter((n: any) => n.ticketId === job.id);
    expect(office.some((n: any) => /reopened by Vikram/.test(n.message))).toBe(true);

    const onHisScreen = await api.get(`/api/worker/jobs/${job.id}`).set(bearer(ramesh));
    expect(onHisScreen.body).toMatchObject({ reopened: true, stage: 'new' });
  });

  it('an open ticket cannot be reopened', async () => {
    const res = await api.post(`/api/tickets/${job.id}/reopen`).set(bearer(vikram)).send({ reason: 'again' });
    expect(res.status).toBe(409);
  });
});

describe('confirming', () => {
  it('the resident confirms with a rating, which moves the vendor’s score', async () => {
    const job = await reportLeak('Signoff test: bathroom tap');
    await finishAsRamesh(job.id);
    const before = await unscopedPrisma.vendor.findUniqueOrThrow({ where: { id: 'VND-01' } });
    const rated = await unscopedPrisma.ticket.count({
      where: { assignedVendorId: 'VND-01', residentRating: { not: null }, id: { not: job.id } },
    });

    const res = await api
      .post(`/api/tickets/${job.id}/close`)
      .set(bearer(vikram))
      .send({ rating: 2, feedback: 'Came late' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Closed', residentRating: 2, residentFeedback: 'Came late' });

    const after = await unscopedPrisma.vendor.findUniqueOrThrow({ where: { id: 'VND-01' } });
    expect(after.rating).toBe(Math.round(((before.rating * (rated + 1) + 2) / (rated + 2)) * 10) / 10);
    const his = (await inbox(ramesh)).filter((n: any) => n.ticketId === job.id);
    expect(his.some((n: any) => /rated job .* 2 out of 5/.test(n.message))).toBe(true);
  });

  it('a closed ticket can be reopened for a week, not after', async () => {
    const job = await reportLeak('Signoff test: shower mixer');
    await finishAsRamesh(job.id);
    await api.post(`/api/tickets/${job.id}/close`).set(bearer(vikram)).send({});

    await unscopedPrisma.ticket.update({
      where: { id: job.id },
      data: { resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const late = await api.post(`/api/tickets/${job.id}/reopen`).set(bearer(vikram)).send({ reason: 'back again' });
    expect(late.status).toBe(409);
    expect(late.body.error).toMatch(/more than 7 days/);

    await unscopedPrisma.ticket.update({ where: { id: job.id }, data: { resolvedAt: new Date() } });
    expect(
      (await api.post(`/api/tickets/${job.id}/reopen`).set(bearer(vikram)).send({ reason: 'back again' })).status,
    ).toBe(200);
  });
});

describe('silence', () => {
  it('closes a finished job after 48 hours without a reply, and tells the resident', async () => {
    const job = await reportLeak('Signoff test: wash basin');
    await finishAsRamesh(job.id);
    await unscopedPrisma.ticket.update({
      where: { id: job.id },
      data: { resolvedAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });

    const run = await api.post('/api/followup/run').set(bearer(manager));
    expect(run.status).toBe(200);

    const row = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id }, include: { timeline: true } });
    expect(row.status).toBe('Closed');
    expect(row.timeline.some((e) => e.type === 'auto_closed')).toBe(true);
    expect((await inbox(vikram)).some((n: any) => n.ticketId === job.id && /closed as fixed/.test(n.message))).toBe(
      true,
    );
  });
});

describe('the agent', () => {
  it('can reopen a ticket for the resident who says it is not fixed', async () => {
    const job = await reportLeak('Signoff test: flush tank');
    await finishAsRamesh(job.id);

    setTestSociety(SOCIETIES.shreeRam);
    const actor = await actorFor('RES-001');
    const result: any = await executeToolCall('reopen_ticket', { ticketId: job.id, reason: 'Still running' }, actor);
    expect(result).toMatchObject({ success: true });
    expect(result.ticket.reopenCount).toBe(1);

    const other = await actorFor('RES-002');
    const refused: any = await executeToolCall('reopen_ticket', { ticketId: job.id, reason: 'x' }, other);
    expect(refused.success).toBe(false);
    setTestSociety(undefined);
  });
});
