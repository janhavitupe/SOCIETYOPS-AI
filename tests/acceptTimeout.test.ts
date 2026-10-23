import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, deleteTickets, ACCOUNTS, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * Jobs a vendor does not accept in time. In Shree Ram, new plumbing jobs go to
 * Ramesh (VND-01); a spare plumber, off duty, is the next in line. Green Valley
 * has only one plumber, so there is nobody to pass to.
 */

const RAMESH = { phone: '+91 98201 44321', password: 'ramesh123' };
const SPARE = '+919811950001';

let api: Agent;
let vikram: string;
let manager: string;
let ramesh: string;
let spareId: string;
const created: string[] = [];

async function report(token: string, description: string, urgency: 'High' | 'Medium' | 'Low') {
  const res = await api
    .post('/api/tickets')
    .set(bearer(token))
    .send({ issueCategory: 'Plumbing', description, urgency });
  expect(res.status).toBe(201);
  created.push(res.body.id);
  return res.body;
}

/** Pretends the job was assigned this many minutes ago. */
async function assignedMinutesAgo(ticketId: string, minutes: number) {
  const when = new Date(Date.now() - minutes * 60 * 1000);
  await unscopedPrisma.timelineEvent.updateMany({ where: { ticketId, type: 'assigned' }, data: { timestamp: when } });
  await unscopedPrisma.ticket.update({ where: { id: ticketId }, data: { createdAt: when } });
}

const followup = (token: string) => api.post('/api/followup/run').set(bearer(token));
const inbox = async (token: string) => (await api.get('/api/me/notifications').set(bearer(token))).body.notifications;

beforeAll(async () => {
  api = await agent();
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: SPARE } });
  vikram = await login(ACCOUNTS.resident);
  manager = await login(ACCOUNTS.maintenance);
  ramesh = await login(RAMESH);
  const res = await api
    .post('/api/vendors')
    .set(bearer(manager))
    .send({ name: 'Timeout Spare Plumber', category: 'Plumbing', phone: '98119 50001', availability: 'Offline' });
  spareId = res.body.id;
});

afterAll(async () => {
  await deleteTickets(created);
  await unscopedPrisma.ticket.updateMany({ where: { vendorId: spareId }, data: { vendorId: null } });
  await unscopedPrisma.vendor.deleteMany({ where: { id: spareId } });
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: SPARE } });
  await unscopedPrisma.$disconnect();
});

describe('a vendor who does not accept in time', () => {
  it('sees how long they have to accept', async () => {
    const job = await report(vikram, 'Timeout test: deadline shown', 'High');
    const mine = await api.get(`/api/worker/jobs/${job.id}`).set(bearer(ramesh));
    const left = new Date(mine.body.acceptBy).getTime() - Date.now();
    expect(left).toBeGreaterThan(14 * 60 * 1000);
    expect(left).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('loses an urgent job after 15 minutes to the next vendor; everyone is told', async () => {
    const job = await report(vikram, 'Timeout test: urgent leak', 'High');
    expect(job.assignedVendorId).toBe('VND-01');
    await assignedMinutesAgo(job.id, 16);

    expect((await followup(manager)).status).toBe(200);
    const row = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id }, include: { timeline: true } });
    expect(row.assignedVendorId).toBe(spareId);
    expect(row.timeline.some((e) => e.type === 'accept_timeout')).toBe(true);

    const his = (await inbox(ramesh)).filter((n: any) => n.ticketId === job.id);
    expect(his.some((n: any) => /has been given to Timeout Spare Plumber/.test(n.message))).toBe(true);
    const office = (await inbox(manager)).filter((n: any) => n.ticketId === job.id);
    expect(office.some((n: any) => /did not accept job .* within 15 minutes/.test(n.message))).toBe(true);
    const resident = (await inbox(vikram)).filter((n: any) => n.ticketId === job.id);
    expect(resident.some((n: any) => /Timeout Spare Plumber will now attend instead of Ramesh/.test(n.message))).toBe(
      true,
    );

    // On the new vendor's screen, the clock starts again.
    const newJobs = await unscopedPrisma.notificationLog.count({
      where: { ticketId: job.id, message: { startsWith: 'New job' } },
    });
    expect(newJobs).toBe(2);
  });

  it('keeps a job the vendor has accepted, however old', async () => {
    const job = await report(vikram, 'Timeout test: accepted', 'High');
    await api.post(`/api/worker/jobs/${job.id}/status`).set(bearer(ramesh)).send({ action: 'accept' });
    await assignedMinutesAgo(job.id, 120);
    await followup(manager);
    expect((await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id } })).assignedVendorId).toBe('VND-01');
  });

  it('gives less urgent jobs longer', async () => {
    const job = await report(vikram, 'Timeout test: medium', 'Medium');
    await assignedMinutesAgo(job.id, 30);
    await followup(manager);
    expect((await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id } })).assignedVendorId).toBe('VND-01');

    await assignedMinutesAgo(job.id, 61);
    await followup(manager);
    expect((await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id } })).assignedVendorId).toBe(spareId);
  });
});

describe('with nobody else to give it to', () => {
  it('reminds the vendor and tells the managers, once', async () => {
    const resident = await login(ACCOUNTS.greenResident);
    const greenManager = await login(ACCOUNTS.greenManager);
    const job = await report(resident, 'Timeout test: only plumber', 'High');
    expect(job.assignedVendorId).toBe('VND-G1');
    await assignedMinutesAgo(job.id, 20);

    await followup(greenManager);
    await followup(greenManager);

    const row = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id }, include: { timeline: true } });
    expect(row.assignedVendorId).toBe('VND-G1');
    expect(row.timeline.filter((e) => e.type === 'accept_timeout')).toHaveLength(1);
    const flagged = await unscopedPrisma.notificationLog.count({
      where: { ticketId: job.id, recipientType: 'manager', message: { contains: 'Please follow up' } },
    });
    expect(flagged).toBe(1);
  });
});
