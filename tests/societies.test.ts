import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  agent,
  login,
  bearer,
  signUp,
  verifyPhone,
  deleteUsersAndTheirSocieties,
  ACCOUNTS,
  SOCIETIES,
  type Agent,
} from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { MAX_SOCIETIES_PER_CREATOR, generateJoinCode } from '../src/services/societies';

const ADMIN_PHONE = '+919811100100';
const NAMELESS_PHONE = '+919811100101';
const SERIAL_PHONE = '+919811100102';
const TEST_PHONES = [ADMIN_PHONE, NAMELESS_PHONE, SERIAL_PHONE];

const newSociety = (name: string) => ({
  name,
  address: '12 MG Road',
  city: 'Nashik',
  pinCode: '422001',
});

let api: Agent;
let adminToken: string;
let societyId: string;

beforeAll(async () => {
  api = await agent();
  await deleteUsersAndTheirSocieties(TEST_PHONES);
  adminToken = await signUp(ADMIN_PHONE, 'Sunita Kulkarni');
});

afterAll(async () => {
  await deleteUsersAndTheirSocieties(TEST_PHONES);
  await unscopedPrisma.$disconnect();
});

describe('creating a society', () => {
  it('needs a name on the account first', async () => {
    const token = await verifyPhone(NAMELESS_PHONE);
    const res = await api.post('/api/societies').set(bearer(token)).send(newSociety('Nameless'));
    expect(res.status).toBe(400);
  });

  it('validates the details', async () => {
    const res = await api
      .post('/api/societies')
      .set(bearer(adminToken))
      .send({ ...newSociety('Bad PIN'), pinCode: '12' });
    expect(res.status).toBe(400);
  });

  it('makes the creator its society admin and switches them into it', async () => {
    const res = await api.post('/api/societies').set(bearer(adminToken)).send(newSociety('Lotus Heights'));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('onboarding');
    expect(res.body.joinCode).toMatch(/^[A-Z2-9]{8}$/);
    societyId = res.body.id;

    const me = await api.get('/api/me').set(bearer(adminToken));
    expect(me.body.activeSocietyId).toBe(societyId);
    expect(me.body.user.role).toBe('society_admin');
    expect(me.body.societies.map((s: any) => s.name)).toEqual(['Lotus Heights']);
  });

  it('starts empty: no tickets, vendors or members from anywhere else', async () => {
    const [tickets, vendors, members] = await Promise.all([
      api.get('/api/tickets').set(bearer(adminToken)),
      api.get('/api/vendors').set(bearer(adminToken)),
      api.get('/api/resident-profiles').set(bearer(adminToken)),
    ]);
    expect(tickets.body.tickets).toEqual([]);
    expect(vendors.body.vendors).toEqual([]);
    expect(members.body.residents.map((r: any) => r.name)).toEqual(['Sunita Kulkarni']);
  });

  it('gives it a profile, so the dashboard has a name to show', async () => {
    const res = await api.get('/api/society-profile').set(bearer(adminToken));
    expect(res.body.societyName).toBe('Lotus Heights');
    expect(res.body.societyId).toBe(societyId);
  });
});

describe('society details', () => {
  it('shows the join code to managers but not to residents', async () => {
    const manager = await api.get('/api/society').set(bearer(await login(ACCOUNTS.maintenance)));
    const resident = await api.get('/api/society').set(bearer(await login(ACCOUNTS.resident)));
    expect(manager.body.joinCode).toBe('SHREERAM');
    expect(resident.body).not.toHaveProperty('joinCode');
    expect(resident.body.name).toBe('Shree Ram Enclave RWA, Powai');
  });

  it('lets the society admin edit them, keeping the profile name in step', async () => {
    const res = await api
      .patch('/api/society')
      .set(bearer(adminToken))
      .send({ name: 'Lotus Heights CHS', registrationNumber: 'NSK/HSG/1234', status: 'active', joinCode: 'HACKED00' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Lotus Heights CHS');
    // Status and join code are not editable here.
    expect(res.body.status).toBe('onboarding');
    expect(res.body.joinCode).not.toBe('HACKED00');

    const profile = await api.get('/api/society-profile').set(bearer(adminToken));
    expect(profile.body.societyName).toBe('Lotus Heights CHS');
  });

  it('does not let a manager edit them', async () => {
    const res = await api
      .patch('/api/society')
      .set(bearer(await login(ACCOUNTS.maintenance)))
      .send({ city: 'Pune' });
    expect(res.status).toBe(403);
  });

  it('refuses a logo that is not the admin’s own upload', async () => {
    const res = await api.patch('/api/society').set(bearer(adminToken)).send({ logoKey: 'uploads/RES-001/x.png' });
    expect(res.status).toBe(400);
  });
});

describe('switching societies', () => {
  it('moves everything the person sees to the society they pick', async () => {
    // Priya (Green Valley) sets up a second society: now she belongs to two.
    const priya = await login(ACCOUNTS.greenManager);
    const created = await api.post('/api/societies').set(bearer(priya)).send(newSociety('Priya Second Society'));
    expect(created.status).toBe(201);

    try {
      let me = await api.get('/api/me').set(bearer(priya));
      expect(me.body.societies).toHaveLength(2);
      expect(me.body.activeSocietyId).toBe(created.body.id);
      expect((await api.get('/api/tickets').set(bearer(priya))).body.tickets).toEqual([]);

      const back = await api
        .post('/api/me/active-society')
        .set(bearer(priya))
        .send({ societyId: SOCIETIES.greenValley });
      expect(back.status).toBe(200);

      me = await api.get('/api/me').set(bearer(priya));
      expect(me.body.activeSocietyId).toBe(SOCIETIES.greenValley);
      expect(me.body.user.role).toBe('manager');
      const tickets = await api.get('/api/tickets').set(bearer(priya));
      expect(tickets.body.tickets.map((t: any) => t.id)).toContain('SOC-2001');
    } finally {
      await unscopedPrisma.society.delete({ where: { id: created.body.id } });
    }
  });

  it('falls back to a society you still belong to when the active one is gone', async () => {
    const priya = await login(ACCOUNTS.greenManager);
    const created = await api.post('/api/societies').set(bearer(priya)).send(newSociety('Short-lived'));
    await unscopedPrisma.society.delete({ where: { id: created.body.id } });

    const me = await api.get('/api/me').set(bearer(priya));
    expect(me.body.activeSocietyId).toBe(SOCIETIES.greenValley);
  });
});

describe('limits', () => {
  it(`stops one person creating more than ${MAX_SOCIETIES_PER_CREATOR} societies`, async () => {
    const token = await signUp(SERIAL_PHONE, 'Serial Creator');
    for (let i = 0; i < MAX_SOCIETIES_PER_CREATOR; i++) {
      const res = await api
        .post('/api/societies')
        .set(bearer(token))
        .send(newSociety(`Spam ${i}`));
      expect(res.status).toBe(201);
    }
    const extra = await api.post('/api/societies').set(bearer(token)).send(newSociety('One too many'));
    expect(extra.status).toBe(409);
  });

  it('generates readable, unambiguous join codes', () => {
    for (let i = 0; i < 200; i++) expect(generateJoinCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });
});
