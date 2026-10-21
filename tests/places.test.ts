import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, deleteTickets, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * Common areas, assets, and tickets about them. Shree Ram's seed has lifts
 * A1, A2, B1 and B2 (Otis, VND-03, on contract) in the tower lobbies.
 */

let api: Agent;
let manager: string;
let resident: string;
let otherResident: string;
let greenManager: string;
const created: string[] = [];
const createdAreas: string[] = [];
const createdAssets: string[] = [];

const asset = (name: string) =>
  unscopedPrisma.asset.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, name } });

async function report(token: string, body: object) {
  const res = await api.post('/api/tickets').set(bearer(token)).send(body);
  if (res.body?.id && !created.includes(res.body.id)) created.push(res.body.id);
  return res;
}

beforeAll(async () => {
  api = await agent();
  manager = await login(ACCOUNTS.maintenance);
  resident = await login(ACCOUNTS.resident);
  otherResident = await login(ACCOUNTS.otherResident);
  greenManager = await login(ACCOUNTS.greenManager);
});

afterAll(async () => {
  // The chat test joins Vikram to the seeded lift ticket; later suites expect him to see only his flat.
  const seeded = await unscopedPrisma.ticket.findUnique({ where: { id: 'SOC-1040' } });
  if (seeded) {
    await unscopedPrisma.ticket.update({ where: { id: 'SOC-1040' }, data: { alsoReportedBy: [] } });
    await unscopedPrisma.timelineEvent.deleteMany({ where: { ticketId: 'SOC-1040', type: 'duplicate' } });
  }
  await deleteTickets(created);
  await unscopedPrisma.asset.deleteMany({ where: { id: { in: createdAssets } } });
  await unscopedPrisma.commonArea.deleteMany({ where: { id: { in: createdAreas } } });
  await unscopedPrisma.$disconnect();
});

describe('managing common areas and assets', () => {
  it('lists the society’s areas with their assets; residents see names, not contracts', async () => {
    const asManager = await api.get('/api/common-areas').set(bearer(manager));
    const lobby = asManager.body.commonAreas.find((a: any) => a.name === 'Tower B Lobby');
    expect(lobby.assets.map((a: any) => a.name)).toEqual(['Lift B1', 'Lift B2']);
    expect(lobby.assets[0]).toMatchObject({ make: 'Otis', amcVendor: { id: 'VND-03' } });

    const asResident = await api.get('/api/common-areas').set(bearer(resident));
    const lift = asResident.body.commonAreas.find((a: any) => a.name === 'Tower B Lobby').assets[0];
    expect(lift).toEqual({
      id: expect.any(String),
      name: 'Lift B1',
      kind: 'lift',
      commonAreaId: lobby.id,
      towerId: expect.any(String),
    });
  });

  it('a manager adds an area and an asset in it; names cannot repeat', async () => {
    const area = await api.post('/api/common-areas').set(bearer(manager)).send({ name: 'Test Gym', kind: 'gym' });
    expect(area.status).toBe(201);
    createdAreas.push(area.body.id);
    expect((await api.post('/api/common-areas').set(bearer(manager)).send({ name: 'test gym' })).status).toBe(409);

    const treadmill = await api.post('/api/assets').set(bearer(manager)).send({
      name: 'Test Treadmill',
      commonAreaId: area.body.id,
      make: 'Cosco',
      amcVendorId: 'VND-05',
      amcExpiresOn: '2027-01-31',
    });
    expect(treadmill.status).toBe(201);
    createdAssets.push(treadmill.body.id);
    expect(treadmill.body).toMatchObject({ kind: 'other', amcVendor: { id: 'VND-05' } });
    expect(treadmill.body.amcExpiresOn).toMatch(/^2027-01-31/);

    // An area with assets cannot be removed until they are.
    expect((await api.delete(`/api/common-areas/${area.body.id}`).set(bearer(manager))).status).toBe(409);
    expect((await api.delete(`/api/assets/${treadmill.body.id}`).set(bearer(manager))).status).toBe(204);
    expect((await api.delete(`/api/common-areas/${area.body.id}`).set(bearer(manager))).status).toBe(204);
  });

  it('residents cannot change them', async () => {
    expect((await api.post('/api/common-areas').set(bearer(resident)).send({ name: 'Mine' })).status).toBe(403);
    const lift = await asset('Lift A1');
    expect((await api.patch(`/api/assets/${lift.id}`).set(bearer(resident)).send({ name: 'x' })).status).toBe(403);
  });

  it('another society cannot see, change or point at them', async () => {
    const lift = await asset('Lift A1');
    const green = await api.get('/api/common-areas').set(bearer(greenManager));
    expect(JSON.stringify(green.body)).not.toContain(lift.id);
    expect((await api.patch(`/api/assets/${lift.id}`).set(bearer(greenManager)).send({ name: 'x' })).status).toBe(404);
    expect((await api.delete(`/api/assets/${lift.id}`).set(bearer(greenManager))).status).toBe(404);
    const area = await unscopedPrisma.commonArea.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam } });
    expect((await api.delete(`/api/common-areas/${area.id}`).set(bearer(greenManager))).status).toBe(404);

    // Green Valley cannot put its asset in a Shree Ram area, or use a Shree Ram vendor.
    expect(
      (await api.post('/api/assets').set(bearer(greenManager)).send({ name: 'X', commonAreaId: area.id })).status,
    ).toBe(400);
    expect(
      (await api.post('/api/assets').set(bearer(greenManager)).send({ name: 'X', amcVendorId: 'VND-03' })).status,
    ).toBe(400);
  });
});

describe('tickets about common areas', () => {
  let liftTicket: any;

  it('a resident reports a lift; the ticket points at it and goes to its AMC vendor', async () => {
    const lift = await asset('Lift A2');
    const res = await report(resident, {
      issueCategory: 'Lift & Elevator',
      description: 'Lift A2 doors not closing',
      urgency: 'High',
      assetId: lift.id,
    });
    expect(res.status).toBe(201);
    liftTicket = res.body;
    expect(res.body).toMatchObject({
      assetId: lift.id,
      commonAreaId: lift.commonAreaId,
      flatId: null,
      flatNumber: 'Lift A2, Tower A Lobby',
      assignedVendorId: 'VND-03',
      duplicate: false,
    });
  });

  it('a second report of the same lift joins the open ticket', async () => {
    const lift = await asset('Lift A2');
    const res = await report(otherResident, {
      issueCategory: 'Lift & Elevator',
      description: 'Lift A2 is stuck again',
      assetId: lift.id,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: liftTicket.id, duplicate: true });
    expect(res.body.timeline.at(-1)).toMatchObject({ title: 'Reported Again', type: 'duplicate' });

    // The second reporter can follow it now.
    expect((await api.get(`/api/tickets/${liftTicket.id}`).set(bearer(otherResident))).status).toBe(200);
    const mine = await api.get('/api/tickets').set(bearer(otherResident));
    expect(mine.body.tickets.map((t: any) => t.id)).toContain(liftTicket.id);

    // Reporting it twice adds nobody twice.
    await report(otherResident, { issueCategory: 'Lift & Elevator', description: 'still stuck', assetId: lift.id });
    const row = await unscopedPrisma.ticket.findUniqueOrThrow({ where: { id: liftTicket.id } });
    expect(row.alsoReportedBy).toHaveLength(1);
  });

  it('once it is fixed, a new report opens a new ticket', async () => {
    await api.patch(`/api/tickets/${liftTicket.id}`).set(bearer(manager)).send({ status: 'Resolved' });
    const lift = await asset('Lift A2');
    const res = await report(otherResident, {
      issueCategory: 'Lift & Elevator',
      description: 'Lift A2 doors again',
      assetId: lift.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(liftTicket.id);
  });

  it('a common area without an asset matches only the same trade', async () => {
    const terrace = await unscopedPrisma.commonArea.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam, name: 'Terrace' },
    });
    const leak = await report(resident, {
      issueCategory: 'Plumbing',
      description: 'Terrace tank overflowing',
      commonAreaId: terrace.id,
    });
    expect(leak.status).toBe(201);
    expect(leak.body.flatNumber).toBe('Terrace');

    const light = await report(otherResident, {
      issueCategory: 'Electrical',
      description: 'Terrace lights off',
      commonAreaId: terrace.id,
    });
    expect(light.status).toBe(201);

    const again = await report(otherResident, {
      issueCategory: 'Plumbing',
      description: 'Water everywhere on the terrace',
      commonAreaId: terrace.id,
    });
    expect(again.body).toMatchObject({ id: leak.body.id, duplicate: true });
  });

  it('flat tickets are never treated as duplicates', async () => {
    const a = await report(resident, { issueCategory: 'Plumbing', description: 'Places test: kitchen tap' });
    const b = await report(resident, { issueCategory: 'Plumbing', description: 'Places test: bathroom tap' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('a manager may name the place in words, but not one that does not exist', async () => {
    const named = await report(manager, {
      issueCategory: 'Electrical',
      description: 'DG set not starting on power cut',
      flatNumber: 'dg set',
    });
    expect(named.status).toBe(201);
    expect(named.body.flatNumber).toBe('DG Set, Basement Parking');

    const unknown = await report(manager, {
      issueCategory: 'General Repairs',
      description: 'Somewhere',
      flatNumber: 'Near the temple',
    });
    expect(unknown.status).toBe(400);
  });
});

describe('the agent', () => {
  it('without the model, finds the asset named in the message and joins an open ticket', async () => {
    // Lift B2 already has the seeded, escalated entrapment ticket open.
    const res = await api
      .post('/api/chat')
      .set(bearer(resident))
      .send({ text: 'Lift B2 stuck hai, koi andar hai kya?' });
    expect(res.status).toBe(200);
    expect(res.body.ticketCreated?.id).toBe('SOC-1040');
    expect(res.body.replyText).toContain('SOC-1040');
  });

  it('opens a ticket on the asset when nothing is open for it', async () => {
    const res = await api
      .post('/api/chat')
      .set(bearer(otherResident))
      .send({ text: 'Water pump is making a loud noise' });
    expect(res.status).toBe(200);
    const ticket = res.body.ticketCreated;
    created.push(ticket.id);
    expect(ticket.flatNumber).toBe('Water Pump, Basement Parking');
    expect(ticket.issueCategory).toBe('Plumbing');
  });
});
