import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, signUp, verifyPhone, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { maskPhone } from '../src/services/joining';

/**
 * Getting into a society: residents asking with the join code, managers
 * deciding, and personal invites. Shree Ram's join code is SHREERAM.
 */

const PHONES = {
  asker: '+919811300001',
  rejected: '+919811300002',
  invited: '+919811300003',
  stranger: '+919811300004',
  committee: '+919811300005',
  preInvited: '+919811300006',
  nameless: '+919811300007',
};

let api: Agent;
let manager: string;
let admin: string;
let greenManager: string;

const flatId = async (number: string) =>
  (await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, number } })).id;

async function cleanup() {
  const users = await unscopedPrisma.user.findMany({
    where: { phoneNumber: { in: Object.values(PHONES) } },
    select: { id: true },
  });
  await unscopedPrisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await unscopedPrisma.invite.deleteMany({ where: { phone: { in: Object.values(PHONES) } } });
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  manager = await login(ACCOUNTS.maintenance);
  admin = await login(ACCOUNTS.admin);
  greenManager = await login(ACCOUNTS.greenManager);
});

afterAll(async () => {
  await cleanup();
  await unscopedPrisma.$disconnect();
});

describe('the join page', () => {
  it('shows the society and its flats to anyone with the code, but not who lives there', async () => {
    const res = await api.get('/api/join/shreeram');
    expect(res.status).toBe(200);
    expect(res.body.society.name).toBe('Shree Ram Enclave RWA, Powai');
    expect(res.body.towers.map((t: any) => t.name)).toEqual(['A', 'B']);
    expect(res.body.flats.map((f: any) => f.number)).toContain('B-402');
    expect(JSON.stringify(res.body)).not.toMatch(/Vikram|98210|phone|occupant/i);
  });

  it('answers 404 for a code that does not exist', async () => {
    expect((await api.get('/api/join/NOSUCH99')).status).toBe(404);
  });
});

describe('asking to join', () => {
  let asker: string;
  let requestId: string;

  it('a new person asks for a flat and waits for a manager', async () => {
    asker = await signUp(PHONES.asker, 'Deepa Iyer');
    const res = await api
      .post('/api/join/SHREERAM')
      .set(bearer(asker))
      .send({ flatId: await flatId('A-102'), type: 'tenant' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'pending', flatNumber: 'A-102' });

    const me = await api.get('/api/me').set(bearer(asker));
    expect(me.body.activeSocietyId).toBeNull();
    expect(me.body.pendingRequests).toEqual([
      expect.objectContaining({
        flatNumber: 'A-102',
        society: expect.objectContaining({ name: 'Shree Ram Enclave RWA, Powai' }),
      }),
    ]);
    // Not in yet.
    expect((await api.get('/api/tickets').set(bearer(asker))).status).toBe(403);
  });

  it('refuses asking twice for the same flat', async () => {
    const res = await api
      .post('/api/join/SHREERAM')
      .set(bearer(asker))
      .send({ flatId: await flatId('A-102'), type: 'tenant' });
    expect(res.status).toBe(409);
  });

  it('refuses a flat from another society', async () => {
    const greenFlat = await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.greenValley } });
    const res = await api.post('/api/join/SHREERAM').set(bearer(asker)).send({ flatId: greenFlat.id, type: 'owner' });
    expect(res.status).toBe(400);
  });

  it('shows on the manager’s list, and only in their society', async () => {
    const list = await api.get('/api/join-requests').set(bearer(manager));
    const request = list.body.requests.find((r: any) => r.user.name === 'Deepa Iyer');
    expect(request).toMatchObject({ type: 'tenant', flat: { number: 'A-102' } });
    requestId = request.id;

    const green = await api.get('/api/join-requests').set(bearer(greenManager));
    expect(green.body.requests.find((r: any) => r.id === requestId)).toBeUndefined();
    expect((await api.post(`/api/join-requests/${requestId}/approve`).set(bearer(greenManager))).status).toBe(404);
  });

  it('approval lets them in, to their flat', async () => {
    expect((await api.post(`/api/join-requests/${requestId}/approve`).set(bearer(manager))).status).toBe(200);

    const me = await api.get('/api/me').set(bearer(asker));
    expect(me.body.activeSocietyId).toBe(SOCIETIES.shreeRam);
    expect(me.body.user).toMatchObject({ role: 'resident', flatNumber: 'A-102' });
    expect(me.body.pendingRequests).toEqual([]);
    expect((await api.get('/api/tickets').set(bearer(asker))).status).toBe(200);
  });

  it('rejection leaves them out', async () => {
    const token = await signUp(PHONES.rejected, 'Not A Resident');
    await api
      .post('/api/join/SHREERAM')
      .set(bearer(token))
      .send({ flatId: await flatId('A-201'), type: 'owner' });
    const list = await api.get('/api/join-requests').set(bearer(manager));
    const request = list.body.requests.find((r: any) => r.user.name === 'Not A Resident');

    expect((await api.post(`/api/join-requests/${request.id}/reject`).set(bearer(manager))).status).toBe(200);
    const me = await api.get('/api/me').set(bearer(token));
    expect(me.body.activeSocietyId).toBeNull();
    expect(me.body.pendingRequests).toEqual([]);
  });

  it('takes a name from someone who signed up on the join page itself', async () => {
    const token = await verifyPhone(PHONES.nameless);
    const without = await api
      .post('/api/join/SHREERAM')
      .set(bearer(token))
      .send({ flatId: await flatId('A-202'), type: 'owner' });
    expect(without.status).toBe(400);

    const withName = await api
      .post('/api/join/SHREERAM')
      .set(bearer(token))
      .send({ flatId: await flatId('A-202'), type: 'owner', name: 'Farah Khan' });
    expect(withName.status).toBe(201);
    expect((await api.get('/api/me').set(bearer(token))).body.user.name).toBe('Farah Khan');
  });

  it('is for residents only to decide on: residents cannot see or approve requests', async () => {
    const resident = await login(ACCOUNTS.resident);
    expect((await api.get('/api/join-requests').set(bearer(resident))).status).toBe(403);
  });
});

describe('invites', () => {
  let residentToken: string;

  it('a manager invites a resident to a flat; the link shows the society and flat, not the full number', async () => {
    const res = await api
      .post('/api/invites')
      .set(bearer(manager))
      .send({
        phone: '98113 00003',
        name: 'Gaurav Joshi',
        role: 'resident',
        flatId: await flatId('A-103'),
        occupantType: 'tenant',
      });
    expect(res.status).toBe(201);
    residentToken = res.body.token;
    expect(residentToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const link = await api.get(`/api/invite-links/${residentToken}`);
    expect(link.status).toBe(200);
    expect(link.body).toMatchObject({ role: 'resident', flatNumber: 'A-103', name: 'Gaurav Joshi' });
    expect(link.body.phoneHint).toBe(maskPhone(PHONES.invited));
    expect(JSON.stringify(link.body)).not.toContain('9811300003');
  });

  it('only the invited phone can accept it', async () => {
    const stranger = await signUp(PHONES.stranger, 'Someone Else');
    const res = await api.post(`/api/invite-links/${residentToken}/accept`).set(bearer(stranger));
    expect(res.status).toBe(403);
  });

  it('the invited person accepts and is in, in that flat', async () => {
    const token = await verifyPhone(PHONES.invited); // a brand-new account: no name yet
    const res = await api.post(`/api/invite-links/${residentToken}/accept`).set(bearer(token));
    expect(res.status).toBe(200);

    const me = await api.get('/api/me').set(bearer(token));
    expect(me.body.user).toMatchObject({ name: 'Gaurav Joshi', role: 'resident', flatNumber: 'A-103' });
    expect(me.body.activeSocietyId).toBe(SOCIETIES.shreeRam);
  });

  it('cannot be used twice', async () => {
    expect((await api.get(`/api/invite-links/${residentToken}`)).status).toBe(404);
  });

  it('managers may invite residents only; the admin may invite staff', async () => {
    const byManager = await api
      .post('/api/invites')
      .set(bearer(manager))
      .send({ phone: '98113 00005', role: 'committee' });
    expect(byManager.status).toBe(403);

    const byAdmin = await api
      .post('/api/invites')
      .set(bearer(admin))
      .send({ phone: '98113 00005', name: 'Hema Rao', role: 'committee' });
    expect(byAdmin.status).toBe(201);

    const token = await verifyPhone(PHONES.committee);
    expect((await api.post(`/api/invite-links/${byAdmin.body.token}/accept`).set(bearer(token))).status).toBe(200);
    const me = await api.get('/api/me').set(bearer(token));
    expect(me.body.user.roles).toContain('committee');
  });

  it('a resident invite needs a flat, and no one can be invited as society admin', async () => {
    expect(
      (await api.post('/api/invites').set(bearer(admin)).send({ phone: '98113 00009', role: 'resident' })).status,
    ).toBe(400);
    expect(
      (await api.post('/api/invites').set(bearer(admin)).send({ phone: '98113 00009', role: 'society_admin' })).status,
    ).toBe(400);
  });

  it('a join request for a flat the phone was invited to is approved at once', async () => {
    await api
      .post('/api/invites')
      .set(bearer(manager))
      .send({ phone: '98113 00006', role: 'resident', flatId: await flatId('A-104'), occupantType: 'owner' });

    const token = await signUp(PHONES.preInvited, 'Ishaan Verma');
    const res = await api
      .post('/api/join/SHREERAM')
      .set(bearer(token))
      .send({ flatId: await flatId('A-104'), type: 'tenant' });
    expect(res.body.status).toBe('approved');
    const me = await api.get('/api/me').set(bearer(token));
    expect(me.body.user.flatNumber).toBe('A-104');
  });

  it('a revoked invite stops working', async () => {
    const res = await api
      .post('/api/invites')
      .set(bearer(manager))
      .send({ phone: '98113 00008', role: 'resident', flatId: await flatId('A-301') });
    expect((await api.delete(`/api/invites/${res.body.id}`).set(bearer(manager))).status).toBe(204);
    expect((await api.get(`/api/invite-links/${res.body.token}`)).status).toBe(404);
  });

  it('another society’s manager cannot see, revoke or create invites here', async () => {
    const res = await api
      .post('/api/invites')
      .set(bearer(manager))
      .send({ phone: '98113 00010', role: 'resident', flatId: await flatId('A-302') });
    const greenList = await api.get('/api/invites').set(bearer(greenManager));
    expect(greenList.body.invites.find((i: any) => i.id === res.body.id)).toBeUndefined();
    expect((await api.delete(`/api/invites/${res.body.id}`).set(bearer(greenManager))).status).toBe(404);

    // An invite to a Shree Ram flat from Green Valley is refused.
    const cross = await api
      .post('/api/invites')
      .set(bearer(greenManager))
      .send({ phone: '98113 00011', role: 'resident', flatId: await flatId('A-303') });
    expect(cross.status).toBe(400);
  });
});
