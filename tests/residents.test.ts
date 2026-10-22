import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, verifyPhone, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * The resident directory. Two people are added to Shree Ram's B-404 by the
 * manager, so they have accounts but have never signed in.
 */

const NEW_PHONES = ['+919811700001', '+919811700002'];

let api: Agent;
let manager: string;
let greenManager: string;
let flatId: string;
const userIds: string[] = [];

const directory = async (token: string, query = '') =>
  (await api.get(`/api/residents${query}`).set(bearer(token))).body;

async function cleanup() {
  await unscopedPrisma.notificationLog.deleteMany({ where: { phone: { in: NEW_PHONES } } });
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: { in: NEW_PHONES } } });
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  manager = await login(ACCOUNTS.maintenance);
  greenManager = await login(ACCOUNTS.greenManager);
  flatId = (await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, number: 'B-404' } }))
    .id;

  for (const [i, phone] of NEW_PHONES.entries()) {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(manager))
      .send({ name: ['Nisha Rao', 'Arjun Rao'][i], phone, type: i ? 'family' : 'owner' });
    expect(res.status).toBe(201);
    userIds.push(res.body.user.id);
  }
});

afterAll(async () => {
  await cleanup();
  await unscopedPrisma.$disconnect();
});

describe('the directory', () => {
  it('lists current residents with their flat, and who is not on the app yet', async () => {
    const body = await directory(manager);
    const vikram = body.residents.find((r: any) => r.name === 'Vikram Mehta');
    expect(vikram).toMatchObject({ status: 'on_app', flat: { number: 'B-402' }, tower: { name: 'B' } });

    const nisha = body.residents.find((r: any) => r.name === 'Nisha Rao');
    expect(nisha).toMatchObject({
      status: 'not_joined',
      type: 'owner',
      flat: { number: 'B-404' },
      lastInvitedAt: null,
    });
    expect(body.counts.not_joined).toBeGreaterThanOrEqual(2);
  });

  it('filters by status, tower and search', async () => {
    const notJoined = await directory(manager, '?status=not_joined');
    expect(notJoined.residents.every((r: any) => r.status === 'not_joined')).toBe(true);
    expect(notJoined.residents.map((r: any) => r.name)).toEqual(expect.arrayContaining(['Nisha Rao', 'Arjun Rao']));

    const towerA = await unscopedPrisma.tower.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, name: 'A' } });
    const inA = await directory(manager, `?towerId=${towerA.id}`);
    expect(inA.residents.length).toBeGreaterThan(0);
    expect(inA.residents.every((r: any) => r.tower?.name === 'A')).toBe(true);

    expect((await directory(manager, '?query=b-404')).residents.map((r: any) => r.name).sort()).toEqual([
      'Arjun Rao',
      'Nisha Rao',
    ]);
    expect((await directory(manager, '?query=11700002')).residents.map((r: any) => r.name)).toEqual(['Arjun Rao']);
  });

  it('shows people who moved out only when asked', async () => {
    const arjun = (await directory(manager)).residents.find((r: any) => r.name === 'Arjun Rao');
    await api.post(`/api/occupants/${arjun.occupantId}/move-out`).set(bearer(manager)).send({});

    expect((await directory(manager)).residents.some((r: any) => r.name === 'Arjun Rao')).toBe(false);
    const moved = await directory(manager, '?status=moved_out');
    expect(moved.residents.find((r: any) => r.name === 'Arjun Rao')).toMatchObject({ status: 'moved_out' });
  });

  it('shows signing in as being on the app', async () => {
    await verifyPhone(NEW_PHONES[0]);
    const nisha = (await directory(manager)).residents.find((r: any) => r.name === 'Nisha Rao');
    expect(nisha.status).toBe('on_app');
    expect(nisha.lastActiveAt).not.toBeNull();
  });
});

describe('inviting residents onto the app', () => {
  let pending: string;

  beforeAll(async () => {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(manager))
      .send({ name: 'Arjun Rao', phone: '98117 00002', type: 'tenant' }); // Arjun moves back in, still not on the app
    pending = res.body.user.id;
  });

  it('texts those not on the app a sign-in link, and skips the rest with the reason', async () => {
    const vikram = (await directory(manager)).residents.find((r: any) => r.name === 'Vikram Mehta');
    const res = await api
      .post('/api/residents/invite')
      .set(bearer(manager))
      .send({ userIds: [pending, userIds[0], vikram.userId] });
    expect(res.status).toBe(200);
    expect(res.body.sent.map((s: any) => s.userId)).toEqual([pending]);
    expect(res.body.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: userIds[0], reason: 'Already on the app' }),
        expect.objectContaining({ userId: vikram.userId, reason: 'Already on the app' }),
      ]),
    );

    const message = await unscopedPrisma.notificationLog.findFirstOrThrow({
      where: { recipientUserId: pending, ticketId: null },
    });
    expect(message.message).toMatch(/Shree Ram Enclave.*flat B-404.*\/login/);

    const row = (await directory(manager)).residents.find((r: any) => r.userId === pending);
    expect(row.lastInvitedAt).not.toBeNull();
  });

  it('does not text the same person twice in a day', async () => {
    const res = await api
      .post('/api/residents/invite')
      .set(bearer(manager))
      .send({ userIds: [pending] });
    expect(res.body.sent).toEqual([]);
    expect(res.body.skipped[0].reason).toBe('Invited in the last 24 hours');
  });

  it('only managers, and only for their own society’s residents', async () => {
    const resident = await login(ACCOUNTS.resident);
    expect((await api.get('/api/residents').set(bearer(resident))).status).toBe(403);
    expect(
      (
        await api
          .post('/api/residents/invite')
          .set(bearer(resident))
          .send({ userIds: [pending] })
      ).status,
    ).toBe(403);

    const green = await directory(greenManager);
    expect(green.residents.some((r: any) => ['Vikram Mehta', 'Nisha Rao', 'Arjun Rao'].includes(r.name))).toBe(false);

    await unscopedPrisma.membership.updateMany({ where: { userId: pending }, data: { lastInvitedAt: null } });
    const cross = await api
      .post('/api/residents/invite')
      .set(bearer(greenManager))
      .send({ userIds: [pending] });
    expect(cross.body.sent).toEqual([]);
    expect(cross.body.skipped[0].reason).toBe('Not a current resident');
  });
});
