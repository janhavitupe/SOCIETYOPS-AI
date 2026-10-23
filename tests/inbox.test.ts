import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, signUp, verifyPhone, deleteTickets, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * Chat history after a reload, people's own notifications, who is told what
 * when a vendor gets or turns down a job, and join requests staying out of
 * sight until approved.
 */

const RAMESH = { phone: '+91 98201 44321', password: 'ramesh123' };
const SPARE_PLUMBER = '+919811600001';
const JOINER = '+919811600002';

let api: Agent;
let resident: string;
let otherResident: string;
let manager: string;
let ramesh: string;
let spareVendorId: string;
const created: string[] = [];

async function reportLeak(description: string) {
  const res = await api
    .post('/api/tickets')
    .set(bearer(resident))
    .send({ issueCategory: 'Plumbing', description, urgency: 'Medium' });
  expect(res.status).toBe(201);
  created.push(res.body.id);
  return res.body;
}

const inbox = async (token: string) => (await api.get('/api/me/notifications').set(bearer(token))).body;

async function cleanup() {
  const vendors = await unscopedPrisma.vendor.findMany({ where: { phone: SPARE_PLUMBER } });
  await unscopedPrisma.ticket.updateMany({
    where: { vendorId: { in: vendors.map((v) => v.id) } },
    data: { vendorId: null },
  });
  await unscopedPrisma.vendor.deleteMany({ where: { phone: SPARE_PLUMBER } });
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: { in: [SPARE_PLUMBER, JOINER] } } });
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  resident = await login(ACCOUNTS.resident);
  otherResident = await login(ACCOUNTS.otherResident);
  manager = await login(ACCOUNTS.maintenance);
  ramesh = await login(RAMESH);

  // A second plumber, off duty, so new jobs go to Ramesh but a declined one has somewhere to go.
  const res = await api
    .post('/api/vendors')
    .set(bearer(manager))
    .send({ name: 'Spare Plumber', category: 'Plumbing', phone: '98116 00001', availability: 'Offline' });
  expect(res.status).toBe(201);
  spareVendorId = res.body.id;
});

afterAll(async () => {
  await deleteTickets(created);
  await cleanup();
  await unscopedPrisma.$disconnect();
});

describe('chat history', () => {
  it('a reload shows the conversation again, with the ticket it filed', async () => {
    const sent = await api.post('/api/chat').set(bearer(resident)).send({ text: 'Inbox test: balcony tap dripping' });
    expect(sent.status).toBe(200);
    const ticketId = sent.body.ticketCreated.id;
    created.push(ticketId);

    const history = await api.get('/api/chat/history').set(bearer(resident));
    expect(history.status).toBe(200);
    const last = history.body.messages.slice(-2);
    expect(last[0]).toMatchObject({ role: 'user', text: 'Inbox test: balcony tap dripping', ticket: null });
    expect(last[1]).toMatchObject({ role: 'model', ticket: { id: ticketId } });
    expect(last[1].ticket.timeline.length).toBeGreaterThan(0);
  });

  it('is each person’s own', async () => {
    const theirs = await api.get('/api/chat/history').set(bearer(otherResident));
    expect(JSON.stringify(theirs.body)).not.toContain('balcony tap dripping');
  });
});

describe('a vendor is told about their jobs', () => {
  let job: any;

  it('gets a notification when a job is assigned to them', async () => {
    job = await reportLeak('Inbox test: washing machine outlet leaking');
    expect(job.assignedVendorId).toBe('VND-01');

    const mine = await inbox(ramesh);
    const note = mine.notifications.find((n: any) => n.ticketId === job.id);
    expect(note.message).toMatch(new RegExp(`New job #${job.id}: Plumbing at B-402`));
    expect(note.readAt).toBeNull();
    expect(mine.unread).toBeGreaterThan(0);
  });

  it('reading them clears the count, and nobody else sees them', async () => {
    expect((await api.post('/api/me/notifications/read').set(bearer(ramesh))).status).toBe(200);
    expect((await inbox(ramesh)).unread).toBe(0);
    const other = await inbox(otherResident);
    expect(other.notifications.some((n: any) => n.ticketId === job.id)).toBe(false);
  });

  it('declining passes it on: the next vendor, the resident and the managers are told', async () => {
    const res = await api
      .post(`/api/worker/jobs/${job.id}/status`)
      .set(bearer(ramesh))
      .send({ action: 'decline', note: 'No outlet pipe in stock' });
    expect(res.status).toBe(200);

    const row = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.assignedVendorId).toBe(spareVendorId);

    const spare = await verifyPhone(SPARE_PLUMBER);
    expect((await inbox(spare)).notifications.find((n: any) => n.ticketId === job.id).message).toMatch(/^New job/);

    const vikram = (await inbox(resident)).notifications.filter((n: any) => n.ticketId === job.id);
    expect(vikram.some((n: any) => /Spare Plumber will now attend instead of Ramesh/.test(n.message))).toBe(true);

    const arvind = (await inbox(manager)).notifications.filter((n: any) => n.ticketId === job.id);
    expect(
      arvind.some((n: any) =>
        /declined job .* \("No outlet pipe in stock"\)\. It has gone to Spare Plumber/.test(n.message),
      ),
    ).toBe(true);

    // Ramesh gave it up himself, so he is not told it was taken away.
    const his = (await inbox(ramesh)).notifications.filter((n: any) => n.ticketId === job.id);
    expect(his.some((n: any) => /given to/.test(n.message))).toBe(false);
  });

  it('with nobody left, the resident and managers are told it needs a vendor', async () => {
    const spare = await verifyPhone(SPARE_PLUMBER);
    await api
      .post(`/api/worker/jobs/${job.id}/status`)
      .set(bearer(spare))
      .send({ action: 'decline', note: 'Out of town' });

    const vikram = (await inbox(resident)).notifications.filter((n: any) => n.ticketId === job.id);
    expect(vikram.some((n: any) => /arranging another vendor/.test(n.message))).toBe(true);
    const arvind = (await inbox(manager)).notifications.filter((n: any) => n.ticketId === job.id);
    expect(arvind.some((n: any) => /Please assign someone/.test(n.message))).toBe(true);
  });

  it('a vendor whose job a manager gives to someone else is told not to go', async () => {
    const other = await reportLeak('Inbox test: geyser valve');
    expect(other.assignedVendorId).toBe('VND-01');
    await api.post(`/api/tickets/${other.id}/assign`).set(bearer(manager)).send({ vendorId: spareVendorId });

    const his = (await inbox(ramesh)).notifications.filter((n: any) => n.ticketId === other.id);
    expect(his.some((n: any) => /has been given to Spare Plumber\. You do not need to go/.test(n.message))).toBe(true);
  });
});

describe('join requests stay out of sight until approved', () => {
  let flatId: string;

  it('someone who asked to join is not listed as a resident or occupant', async () => {
    const token = await signUp(JOINER, 'Pending Person');
    flatId = (await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, number: 'B-403' } }))
      .id;
    const asked = await api.post('/api/join/SHREERAM').set(bearer(token)).send({ flatId, type: 'tenant' });
    expect(asked.body.status).toBe('pending');

    const directory = await api.get('/api/resident-profiles').set(bearer(manager));
    expect(JSON.stringify(directory.body)).not.toContain('Pending Person');

    const flats = await api.get('/api/flats').set(bearer(manager));
    const b403 = flats.body.flats.find((f: any) => f.id === flatId);
    expect(b403.occupants).toEqual([]);

    const occupants = await api.get(`/api/flats/${flatId}/occupants`).set(bearer(manager));
    expect(occupants.body.occupants).toEqual([]);

    // Only the join requests card shows them.
    const requests = await api.get('/api/join-requests').set(bearer(manager));
    expect(requests.body.requests.some((r: any) => r.user.name === 'Pending Person')).toBe(true);
  });

  it('a manager adding the same person by hand approves the request', async () => {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(manager))
      .send({ name: 'Pending Person', phone: '98116 00002', type: 'tenant' });
    expect(res.status).toBe(201);

    const requests = await api.get('/api/join-requests').set(bearer(manager));
    expect(requests.body.requests.some((r: any) => r.user.name === 'Pending Person')).toBe(false);
    const occupants = await api.get(`/api/flats/${flatId}/occupants`).set(bearer(manager));
    expect(occupants.body.occupants).toEqual([expect.objectContaining({ status: 'active' })]);
    expect(await unscopedPrisma.flatOccupant.count({ where: { flatId, user: { phoneNumber: JOINER } } })).toBe(1);
  });
});
