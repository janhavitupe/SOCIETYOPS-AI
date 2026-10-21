import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, verifyPhone, deleteTickets, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { allowedActions, stageOf } from '../src/services/workerJobs';

/**
 * The vendor's side. Ramesh (VND-01) is Shree Ram's only plumber and signs in
 * with a password; Sunil works Green Valley's plumber, VND-G1.
 */

const RAMESH = { phone: '+91 98201 44321', password: 'ramesh123' };
const SUNIL = { phone: '+91 99000 33333', password: 'sunil123' };
const NEW_PLUMBER_PHONE = '+919811400001';

/** A 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let api: Agent;
let ramesh: string;
let sunil: string;
let resident: string;
let manager: string;
const created: string[] = [];
let newVendorId: string | null = null;

async function reportLeak(description: string) {
  const res = await api
    .post('/api/tickets')
    .set(bearer(resident))
    .send({ issueCategory: 'Plumbing', description, urgency: 'Medium' });
  expect(res.status).toBe(201);
  created.push(res.body.id);
  return res.body;
}

const step = (token: string, id: string, body: object) =>
  api.post(`/api/worker/jobs/${id}/status`).set(bearer(token)).send(body);

async function uploadPhoto(token: string): Promise<string> {
  const res = await api.post('/api/uploads').set(bearer(token)).send({ contentType: 'image/png', size: PNG.length });
  expect(res.status).toBe(201);
  expect((await api.put(res.body.upload.url).set(res.body.upload.headers).send(PNG)).status).toBe(200);
  return res.body.key;
}

async function removeNewPlumber() {
  const vendors = await unscopedPrisma.vendor.findMany({ where: { phone: NEW_PLUMBER_PHONE } });
  for (const v of vendors) {
    if (!v.deletedAt) await api.delete(`/api/vendors/${v.id}`).set(bearer(manager));
  }
  await unscopedPrisma.ticket.updateMany({
    where: { vendorId: { in: vendors.map((v) => v.id) } },
    data: { vendorId: null },
  });
  await unscopedPrisma.vendor.deleteMany({ where: { phone: NEW_PLUMBER_PHONE } });
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: NEW_PLUMBER_PHONE } });
}

beforeAll(async () => {
  api = await agent();
  ramesh = await login(RAMESH);
  sunil = await login(SUNIL);
  resident = await login(ACCOUNTS.resident);
  manager = await login(ACCOUNTS.maintenance);
  await removeNewPlumber();
});

afterAll(async () => {
  await removeNewPlumber();
  await deleteTickets(created);
  await unscopedPrisma.$disconnect();
});

describe('vendor accounts', () => {
  it('a vendor signs in as a worker of their society', async () => {
    const me = await api.get('/api/me').set(bearer(ramesh));
    expect(me.body.activeSocietyId).toBe(SOCIETIES.shreeRam);
    expect(me.body.user.role).toBe('worker');
  });

  it('only workers reach the worker screen', async () => {
    expect((await api.get('/api/worker/jobs').set(bearer(resident))).status).toBe(403);
    expect((await api.get('/api/worker/jobs').set(bearer(manager))).status).toBe(403);
    expect((await api.get('/api/worker/jobs')).status).toBe(401);
  });

  it('adding a vendor gives their phone a login, and removing them takes it away', async () => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(manager))
      .send({ name: 'Imran Plumbing', category: 'Plumbing', phone: '98114 00001' });
    expect(res.status).toBe(201);
    newVendorId = res.body.id;

    const token = await verifyPhone(NEW_PLUMBER_PHONE);
    const me = await api.get('/api/me').set(bearer(token));
    expect(me.body.user).toMatchObject({ role: 'worker', name: 'Imran Plumbing' });
    const jobs = await api.get('/api/worker/jobs').set(bearer(token));
    expect(jobs.status).toBe(200);
    expect(jobs.body.vendor.id).toBe(newVendorId);

    // Off duty for now, so the dispatch tests below stay on Ramesh.
    expect((await api.put('/api/worker/duty').set(bearer(token)).send({ onDuty: false })).status).toBe(200);
    const vendor = await api.get('/api/vendors').set(bearer(manager));
    expect(vendor.body.vendors.find((v: any) => v.id === newVendorId).status).toBe('Offline');
  });
});

describe('working a job', () => {
  let job: any;

  it('a new job shows in the vendor’s list with what they need to find the resident', async () => {
    job = await reportLeak('Worker test: bathroom tap dripping');
    expect(job.assignedVendorId).toBe('VND-01');

    const list = await api.get('/api/worker/jobs').set(bearer(ramesh));
    expect(list.status).toBe(200);
    const mine = list.body.jobs.find((j: any) => j.id === job.id);
    expect(mine).toMatchObject({
      stage: 'new',
      location: 'B-402',
      residentName: 'Vikram',
      category: 'Plumbing',
      actions: ['accept', 'on_my_way', 'start', 'decline'],
    });
    expect(mine.residentPhone).toMatch(/^\+91/);
    // Queue order: the newest job is last.
    expect(mine.queue.position).toBe(list.body.jobs.length);
  });

  it('cannot skip ahead to completed', async () => {
    expect((await step(ramesh, job.id, { action: 'complete', note: 'done' })).status).toBe(409);
  });

  it('accept, on my way, started: each step is on the timeline, and the resident is told they are coming', async () => {
    expect((await step(ramesh, job.id, { action: 'accept' })).body.job.stage).toBe('accepted');
    const onTheWay = await step(ramesh, job.id, { action: 'on_my_way' });
    expect(onTheWay.body.job.stage).toBe('on_the_way');
    expect(onTheWay.body.job.actions).toEqual(['start']);

    const started = await step(ramesh, job.id, { action: 'start' });
    expect(started.body.job).toMatchObject({ stage: 'started', status: 'In Progress' });

    const ticket = await api.get(`/api/tickets/${job.id}`).set(bearer(resident));
    const titles = ticket.body.timeline.map((e: any) => e.title);
    expect(titles).toEqual(expect.arrayContaining(['Vendor Accepted', 'Vendor On The Way', 'Work Started']));

    const told = await unscopedPrisma.notificationLog.findFirst({
      where: { ticketId: job.id, recipientType: 'resident', message: { contains: 'on the way' } },
    });
    expect(told).not.toBeNull();
  });

  it('waiting for parts needs to say which parts', async () => {
    expect((await step(ramesh, job.id, { action: 'need_parts' })).status).toBe(400);
    const res = await step(ramesh, job.id, { action: 'need_parts', note: 'Half-inch washer' });
    expect(res.body.job).toMatchObject({ stage: 'waiting_parts', actions: ['start', 'complete'] });
  });

  it('completing needs a note and an after photo, then the resident is asked to confirm', async () => {
    expect((await step(ramesh, job.id, { action: 'complete', note: 'Replaced washer' })).status).toBe(400);
    expect((await step(ramesh, job.id, { action: 'complete', images: [await uploadPhoto(ramesh)] })).status).toBe(400);
    // Someone else's photo is refused.
    expect(
      (await step(ramesh, job.id, { action: 'complete', note: 'x', images: [await uploadPhoto(resident)] })).status,
    ).toBe(400);

    const before = await unscopedPrisma.vendor.findUniqueOrThrow({ where: { id: 'VND-01' } });
    const photo = await uploadPhoto(ramesh);
    const res = await step(ramesh, job.id, { action: 'complete', note: 'Replaced washer', images: [photo] });
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ status: 'Resolved', stage: null, actions: [], residentPhone: null });

    const row = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: 'Resolved', workNote: 'Replaced washer', workImages: [photo] });
    const after = await unscopedPrisma.vendor.findUniqueOrThrow({ where: { id: 'VND-01' } });
    expect(after.completedJobs).toBe(before.completedJobs + 1);

    // The resident can now close it, as work is done.
    expect((await api.post(`/api/tickets/${job.id}/close`).set(bearer(resident)).send({})).status).toBe(200);

    const list = await api.get('/api/worker/jobs').set(bearer(ramesh));
    expect(list.body.jobs.find((j: any) => j.id === job.id)).toBeUndefined();
    expect(list.body.done.find((j: any) => j.id === job.id)).toMatchObject({ workNote: 'Replaced washer' });
  });

  it('a finished job takes no more steps', async () => {
    expect((await step(ramesh, job.id, { action: 'start' })).status).toBe(409);
  });
});

describe('declining', () => {
  it('needs a reason, and with nobody else on duty the job goes back to the manager', async () => {
    const job = await reportLeak('Worker test: geyser pipe burst');
    expect((await step(ramesh, job.id, { action: 'decline' })).status).toBe(400);

    const res = await step(ramesh, job.id, { action: 'decline', note: 'No geyser parts with me' });
    expect(res.status).toBe(200);

    const row = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id } });
    // Imran is off duty, but the dispatcher falls back to anyone in the trade before giving up.
    expect(row.assignedVendorId).toBe(newVendorId);
    expect(row.declinedVendorIds).toEqual(['VND-01']);
    expect((await api.get(`/api/worker/jobs/${job.id}`).set(bearer(ramesh))).status).toBe(404);

    const imran = await verifyPhone(NEW_PLUMBER_PHONE);
    expect((await step(imran, job.id, { action: 'decline', note: 'Off today' })).status).toBe(200);
    const unassigned = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id } });
    expect(unassigned).toMatchObject({ status: 'Open', assignedVendorId: null });
    expect(unassigned.declinedVendorIds.sort()).toEqual(['VND-01', newVendorId].sort());
  });

  it('a declined job is not moved back to the vendor who declined it', async () => {
    // Three jobs Ramesh turns down queue up at Imran, the last behind two others.
    const jobs: string[] = [];
    for (const n of [1, 2, 3]) {
      const job = await reportLeak(`Worker test: drain ${n}`);
      expect((await step(ramesh, job.id, { action: 'decline', note: 'Too far today' })).status).toBe(200);
      jobs.push(job.id);
    }

    // Ramesh is the shortest queue on duty, but none of them go back to him.
    expect((await api.post('/api/followup/run').set(bearer(manager))).status).toBe(200);
    const rows = await unscopedPrisma.ticket.findMany({ where: { id: { in: jobs } } });
    expect(rows.map((r) => r.assignedVendorId)).toEqual([newVendorId, newVendorId, newVendorId]);
  });
});

describe('isolation', () => {
  it('a vendor cannot see or act on another vendor’s job', async () => {
    const job = await reportLeak('Worker test: someone else’s job');
    expect(job.assignedVendorId).toBe('VND-01');
    const imran = await verifyPhone(NEW_PLUMBER_PHONE);
    expect((await api.get(`/api/worker/jobs/${job.id}`).set(bearer(imran))).status).toBe(404);
    expect((await step(imran, job.id, { action: 'accept' })).status).toBe(404);
  });

  it('another society’s vendor cannot reach this society’s jobs', async () => {
    const job = created[created.length - 1];
    expect((await api.get(`/api/worker/jobs/${job}`).set(bearer(sunil))).status).toBe(404);
    expect((await step(sunil, job, { action: 'accept' })).status).toBe(404);
    const list = await api.get('/api/worker/jobs').set(bearer(sunil));
    expect(list.body.vendor.id).toBe('VND-G1');
    expect(list.body.jobs.every((j: any) => !created.includes(j.id))).toBe(true);
  });

  it('a worker cannot use manager routes', async () => {
    expect((await api.post('/api/vendors').set(bearer(ramesh)).send({})).status).toBe(403);
    expect((await api.get('/api/analytics').set(bearer(ramesh))).status).toBe(403);
  });

  it('removing a vendor ends their access', async () => {
    const imran = await verifyPhone(NEW_PLUMBER_PHONE);
    expect((await api.delete(`/api/vendors/${newVendorId}`).set(bearer(manager))).status).toBe(200);
    expect((await api.get('/api/worker/jobs').set(bearer(imran))).status).toBe(403);
  });
});

describe('stages', () => {
  const at = (m: number) => new Date(2026, 0, 1, 10, m);

  it('start again after a reassignment', () => {
    const ticket = {
      status: 'Vendor Assigned',
      timeline: [
        { type: 'assigned', timestamp: at(0) },
        { type: 'worker_on_the_way', timestamp: at(1) },
        { type: 'assigned', timestamp: at(2) },
      ],
    };
    expect(stageOf(ticket)).toBe('new');
    expect(allowedActions({ ...ticket, status: 'Closed' })).toEqual([]);
  });
});
