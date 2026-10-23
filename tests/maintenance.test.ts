import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, verifyPhone, deleteTickets, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { addInterval } from '../src/services/maintenance';

/**
 * Preventive maintenance. Shree Ram's Lift A1 is on an AMC with Otis
 * (VND-03), whose technician signs in with the vendor's phone.
 */

const OTIS_PHONE = '+919811288990';
const DAY = 24 * 60 * 60 * 1000;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let api: Agent;
let manager: string;
let greenManager: string;
let liftA1: string;
let originalAmc: { amcExpiresOn: Date | null; amcReminded: string[] };
const created: string[] = [];

const followup = () => api.post('/api/followup/run').set(bearer(manager));
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

async function cleanup() {
  const schedules = await unscopedPrisma.maintenanceSchedule.findMany({
    where: { title: { startsWith: 'Maint test' } },
    select: { id: true },
  });
  const tickets = await unscopedPrisma.ticket.findMany({
    where: { scheduleId: { in: schedules.map((s) => s.id) } },
    select: { id: true },
  });
  await deleteTickets(tickets.map((t) => t.id));
  await unscopedPrisma.maintenanceSchedule.deleteMany({ where: { title: { startsWith: 'Maint test' } } });
  await unscopedPrisma.licence.deleteMany({ where: { name: { startsWith: 'Maint test' } } });
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  manager = await login(ACCOUNTS.maintenance);
  greenManager = await login(ACCOUNTS.greenManager);
  const lift = await unscopedPrisma.asset.findFirstOrThrow({
    where: { societyId: SOCIETIES.shreeRam, name: 'Lift A1' },
  });
  liftA1 = lift.id;
  originalAmc = { amcExpiresOn: lift.amcExpiresOn, amcReminded: lift.amcReminded };
});

afterAll(async () => {
  await unscopedPrisma.asset.update({ where: { id: liftA1 }, data: originalAmc });
  await cleanup();
  await deleteTickets(created);
  await unscopedPrisma.$disconnect();
});

describe('intervals', () => {
  it('adds days, weeks and months, keeping month ends sensible', () => {
    expect(addInterval(new Date('2026-01-31T00:00:00Z'), 1, 'months').toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addInterval(new Date('2026-01-15T00:00:00Z'), 6, 'months').toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(addInterval(new Date('2026-01-01T00:00:00Z'), 2, 'weeks').toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(addInterval(new Date('2026-01-01T00:00:00Z'), 10, 'days').toISOString().slice(0, 10)).toBe('2026-01-11');
  });
});

describe('schedules raise planned visits', () => {
  let scheduleId: string;
  let visit: any;

  it('raises the visit within its lead time, for the AMC vendor, with its checklist', async () => {
    const res = await api
      .post('/api/maintenance/schedules')
      .set(bearer(manager))
      .send({
        title: 'Maint test: Lift A1 monthly service',
        category: 'Lift & Elevator',
        assetId: liftA1,
        every: 1,
        unit: 'months',
        nextDueOn: inDays(2),
        leadDays: 3,
        checklist: ['Brakes', 'Door sensors', 'Alarm bell'],
      });
    expect(res.status).toBe(201);
    scheduleId = res.body.id;

    expect((await followup()).status).toBe(200);
    const tickets = await unscopedPrisma.ticket.findMany({ where: { scheduleId } });
    expect(tickets).toHaveLength(1);
    visit = tickets[0];
    expect(visit).toMatchObject({
      assetId: liftA1,
      flatNumber: 'Lift A1, Tower A Lobby',
      assignedVendorId: 'VND-03',
      residentPhone: '',
      checklist: ['Brakes', 'Door sensors', 'Alarm bell'],
    });

    const schedule = await unscopedPrisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(schedule.nextDueOn.getTime()).toBeGreaterThan(Date.now() + 25 * DAY);
  });

  it('is not raised twice while the visit is open', async () => {
    await unscopedPrisma.maintenanceSchedule.update({
      where: { id: scheduleId },
      data: { nextDueOn: new Date(inDays(1)) },
    });
    await followup();
    expect(await unscopedPrisma.ticket.count({ where: { scheduleId } })).toBe(1);
  });

  it('the technician must tick every check before completing', async () => {
    const otis = await verifyPhone(OTIS_PHONE);
    const step = (body: object) => api.post(`/api/worker/jobs/${visit.id}/status`).set(bearer(otis)).send(body);
    expect((await step({ action: 'start' })).status).toBe(200);

    const job = await api.get(`/api/worker/jobs/${visit.id}`).set(bearer(otis));
    expect(job.body).toMatchObject({ planned: true });
    expect(job.body.checklist).toEqual([
      { item: 'Brakes', done: false },
      { item: 'Door sensors', done: false },
      { item: 'Alarm bell', done: false },
    ]);

    const up = await api.post('/api/uploads').set(bearer(otis)).send({ contentType: 'image/png', size: PNG.length });
    await api.put(up.body.upload.url).set(up.body.upload.headers).send(PNG);
    const early = await step({ action: 'complete', note: 'Serviced', images: [up.body.key] });
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/Tick every check first: Brakes, Door sensors, Alarm bell/);

    for (const item of ['Brakes', 'Door sensors', 'Alarm bell']) {
      const ticked = await api
        .post(`/api/worker/jobs/${visit.id}/checklist`)
        .set(bearer(otis))
        .send({ item, done: true });
      expect(ticked.status).toBe(200);
    }
    expect(
      (
        await api
          .post(`/api/worker/jobs/${visit.id}/checklist`)
          .set(bearer(otis))
          .send({ item: 'Not on it', done: true })
      ).status,
    ).toBe(400);
    expect((await step({ action: 'complete', note: 'Serviced', images: [up.body.key] })).status).toBe(200);
  });

  it('is not raised before its lead time', async () => {
    const res = await api
      .post('/api/maintenance/schedules')
      .set(bearer(manager))
      .send({
        title: 'Maint test: tank cleaning',
        category: 'Cleaning & Pest',
        every: 6,
        nextDueOn: inDays(10),
        leadDays: 3,
      });
    await followup();
    expect(await unscopedPrisma.ticket.count({ where: { scheduleId: res.body.id } })).toBe(0);

    // A manager can raise it early.
    const early = await api.post(`/api/maintenance/schedules/${res.body.id}/raise`).set(bearer(manager));
    expect(early.status).toBe(201);
    expect(early.body.flatNumber).toBe('Society');
  });
});

describe('expiry reminders', () => {
  it('reminds managers of a licence running out, once per stage, again after renewal', async () => {
    const res = await api
      .post('/api/maintenance/licences')
      .set(bearer(manager))
      .send({ name: 'Maint test: Lift licence', expiresOn: inDays(5) });
    expect(res.status).toBe(201);

    await followup();
    await followup();
    const reminders = await unscopedPrisma.notificationLog.count({
      where: {
        recipientType: 'manager',
        phone: '+919876511111',
        message: { contains: 'Maint test: Lift licence expires' },
      },
    });
    expect(reminders).toBe(1);

    const renewed = await api
      .patch(`/api/maintenance/licences/${res.body.id}`)
      .set(bearer(manager))
      .send({ expiresOn: inDays(3) });
    expect(renewed.body.reminded).toEqual([]);
  });

  it('reminds managers of AMCs running out, once', async () => {
    await unscopedPrisma.asset.update({
      where: { id: liftA1 },
      data: { amcExpiresOn: new Date(inDays(6)), amcReminded: [] },
    });
    await followup();
    await followup();
    const count = await unscopedPrisma.notificationLog.count({
      where: { phone: '+919876511111', message: { contains: 'The AMC for Lift A1' } },
    });
    expect(count).toBe(1);
  });
});

describe('the calendar', () => {
  it('lists coming visits, repeats included, and expiries, in date order', async () => {
    const res = await api.get('/api/maintenance/upcoming?days=120').set(bearer(manager));
    expect(res.status).toBe(200);
    const items = res.body.items;
    const lift = items.filter((i: any) => i.title === 'Maint test: Lift A1 monthly service' && i.scheduleId);
    expect(lift.length).toBeGreaterThanOrEqual(3);
    expect(items.some((i: any) => i.kind === 'licence' && i.title.startsWith('Maint test: Lift licence'))).toBe(true);
    expect(items.some((i: any) => i.kind === 'amc' && i.title === 'AMC for Lift A1 ends')).toBe(true);
    const dates = items.map((i: any) => new Date(i.date).getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });
});

describe('who may do what', () => {
  it('residents cannot see or change maintenance; another society cannot touch it', async () => {
    const resident = await login(ACCOUNTS.resident);
    expect((await api.get('/api/maintenance/schedules').set(bearer(resident))).status).toBe(403);

    const schedule = await unscopedPrisma.maintenanceSchedule.findFirstOrThrow({
      where: { title: { startsWith: 'Maint test' } },
    });
    expect(
      (await api.patch(`/api/maintenance/schedules/${schedule.id}`).set(bearer(greenManager)).send({ every: 2 }))
        .status,
    ).toBe(404);
    expect((await api.post(`/api/maintenance/schedules/${schedule.id}/raise`).set(bearer(greenManager))).status).toBe(
      404,
    );
    const green = await api.get('/api/maintenance/schedules').set(bearer(greenManager));
    expect(green.body.schedules.some((s: any) => s.id === schedule.id)).toBe(false);
    const cross = await api
      .post('/api/maintenance/schedules')
      .set(bearer(greenManager))
      .send({ title: 'Maint test: cross', category: 'Plumbing', assetId: liftA1, every: 1, nextDueOn: inDays(30) });
    expect(cross.status).toBe(400);
  });
});
