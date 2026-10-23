import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, signUp, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * Owners looking after their own flat. Vikram owns B-402 and Ananya owns
 * A-101 in the seed.
 */

const PHONES = { relative: '+919811800001', tenant: '+919811800002', stranger: '+919811800003' };

let api: Agent;
let vikram: string;
let ananya: string;
let manager: string;
let b402: string;

const myFlat = async (token: string) => (await api.get('/api/my-flat').set(bearer(token))).body;

async function ask(phone: string, name: string, type: 'family' | 'tenant') {
  const token = await signUp(phone, name);
  const res = await api.post('/api/join/SHREERAM').set(bearer(token)).send({ flatId: b402, type });
  expect(res.body.status).toBe('pending');
  const row = await unscopedPrisma.flatOccupant.findFirstOrThrow({
    where: { flatId: b402, status: 'pending', user: { phoneNumber: phone } },
  });
  return { token, occupantId: row.id };
}

async function cleanup() {
  await unscopedPrisma.notificationLog.deleteMany({ where: { phone: { in: Object.values(PHONES) } } });
  await unscopedPrisma.notificationLog.deleteMany({ where: { message: { contains: 'Household Test' } } });
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: { in: Object.values(PHONES) } } });
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  vikram = await login(ACCOUNTS.resident);
  ananya = await login(ACCOUNTS.otherResident);
  manager = await login(ACCOUNTS.maintenance);
  b402 = (await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, number: 'B-402' } })).id;
});

afterAll(async () => {
  await cleanup();
  await unscopedPrisma.$disconnect();
});

describe('family asking to join', () => {
  let relative: { token: string; occupantId: string };

  it('tells the flat’s owner, who sees the request', async () => {
    relative = await ask(PHONES.relative, 'Household Test Relative', 'family');

    const vikramUser = await unscopedPrisma.user.findFirstOrThrow({ where: { name: 'Vikram Mehta' } });
    const told = await unscopedPrisma.notificationLog.findFirst({
      where: {
        recipientUserId: vikramUser.id,
        message: { contains: 'Household Test Relative has asked to join flat B-402' },
      },
    });
    expect(told).not.toBeNull();

    const mine = await myFlat(vikram);
    const flat = mine.flats.find((f: any) => f.number === 'B-402');
    expect(flat.requests).toEqual([
      expect.objectContaining({ occupantId: relative.occupantId, name: 'Household Test Relative' }),
    ]);
    expect(flat.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Vikram Mehta', type: 'owner', isMe: true })]),
    );
  });

  it('another flat’s owner cannot see or decide it', async () => {
    const theirs = await myFlat(ananya);
    expect(JSON.stringify(theirs)).not.toContain(relative.occupantId);
    expect((await api.post(`/api/my-flat/requests/${relative.occupantId}/approve`).set(bearer(ananya))).status).toBe(
      404,
    );
  });

  it('the owner approves: the relative is in, and is told', async () => {
    const res = await api.post(`/api/my-flat/requests/${relative.occupantId}/approve`).set(bearer(vikram));
    expect(res.status).toBe(200);

    const me = await api.get('/api/me').set(bearer(relative.token));
    expect(me.body.user).toMatchObject({ role: 'resident', flatNumber: 'B-402' });
    const told = await unscopedPrisma.notificationLog.findFirst({
      where: { phone: PHONES.relative, message: { contains: 'has been approved' } },
    });
    expect(told).not.toBeNull();

    const flat = (await myFlat(vikram)).flats.find((f: any) => f.number === 'B-402');
    expect(flat.requests).toEqual([]);
    expect(flat.members.some((m: any) => m.name === 'Household Test Relative' && m.type === 'family')).toBe(true);
  });

  it('the owner can remove a family member, which ends their access', async () => {
    const flat = (await myFlat(vikram)).flats.find((f: any) => f.number === 'B-402');
    const member = flat.members.find((m: any) => m.name === 'Household Test Relative');
    expect((await api.post(`/api/my-flat/members/${member.occupantId}/remove`).set(bearer(vikram))).status).toBe(200);
    expect((await api.get('/api/tickets').set(bearer(relative.token))).status).toBe(403);
  });

  it('owners cannot remove themselves or other owners and tenants', async () => {
    const flat = (await myFlat(vikram)).flats.find((f: any) => f.number === 'B-402');
    const me = flat.members.find((m: any) => m.isMe);
    expect((await api.post(`/api/my-flat/members/${me.occupantId}/remove`).set(bearer(vikram))).status).toBe(400);
  });

  it('the owner can reject, and the person is told and stays out', async () => {
    const stranger = await ask(PHONES.stranger, 'Household Test Stranger', 'family');
    expect((await api.post(`/api/my-flat/requests/${stranger.occupantId}/reject`).set(bearer(vikram))).status).toBe(
      200,
    );
    const me = await api.get('/api/me').set(bearer(stranger.token));
    expect(me.body.activeSocietyId).toBeNull();
    const told = await unscopedPrisma.notificationLog.findFirst({
      where: { phone: PHONES.stranger, message: { contains: 'was not approved' } },
    });
    expect(told).not.toBeNull();
  });
});

describe('what stays with the society office', () => {
  it('a tenant asking to join waits for a manager; the owner does not decide it', async () => {
    const tenant = await ask(PHONES.tenant, 'Household Test Tenant', 'tenant');
    const flat = (await myFlat(vikram)).flats.find((f: any) => f.number === 'B-402');
    expect(flat.requests).toEqual([]);
    expect((await api.post(`/api/my-flat/requests/${tenant.occupantId}/approve`).set(bearer(vikram))).status).toBe(404);

    // The manager still sees it, and can still decide family requests too.
    const list = await api.get('/api/join-requests').set(bearer(manager));
    expect(list.body.requests.some((r: any) => r.id === tenant.occupantId)).toBe(true);
    expect((await api.post(`/api/join-requests/${tenant.occupantId}/reject`).set(bearer(manager))).status).toBe(200);
  });

  it('someone who owns no flat has nothing here', async () => {
    const green = await login(ACCOUNTS.greenManager);
    expect((await myFlat(green)).flats).toEqual([]);
  });
});
