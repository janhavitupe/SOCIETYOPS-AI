import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { agent, login, bearer, e164, ACCOUNTS, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { setOtpSender, type OtpSender } from '../src/services/otp';

let api: Agent;
let residentToken: string;
let maintenanceToken: string;
let adminToken: string;

/** Captures the codes the OTP sender would have texted. */
class CapturingOtpSender implements OtpSender {
  readonly name = 'capture';
  codes = new Map<string, string>();
  async send(phone: string, code: string) {
    this.codes.set(phone, code);
  }
}

beforeAll(async () => {
  api = await agent();
  residentToken = await login(ACCOUNTS.resident);
  maintenanceToken = await login(ACCOUNTS.maintenance);
  adminToken = await login(ACCOUNTS.admin);
});

afterEach(() => setOtpSender(null));

afterAll(async () => {
  await unscopedPrisma.$disconnect();
});

describe('password sign-in', () => {
  it('issues a session for the right phone and password', async () => {
    const res = await api
      .post('/api/auth/sign-in/phone-number')
      .send({ phoneNumber: e164(ACCOUNTS.resident.phone), password: ACCOUNTS.resident.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    // The browser gets an httpOnly cookie rather than a token in storage.
    expect(String(res.headers['set-cookie'])).toMatch(/session_token=.*HttpOnly/i);
  });

  it('accepts a password carried over from the old login table', async () => {
    // Seeded with bcrypt, as the migrated ResidentPassword hashes were.
    expect(await login(ACCOUNTS.otherResident)).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    const res = await api
      .post('/api/auth/sign-in/phone-number')
      .send({ phoneNumber: e164(ACCOUNTS.resident.phone), password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown phone the same way', async () => {
    const res = await api
      .post('/api/auth/sign-in/phone-number')
      .send({ phoneNumber: '+919999999999', password: 'whatever1' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me', () => {
  it('returns the person, their role and flat in the active society', async () => {
    const res = await api.get('/api/me').set(bearer(residentToken));
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Vikram Mehta');
    expect(res.body.user.role).toBe('resident');
    expect(res.body.user.flatNumber).toBe('B-402');
    expect(res.body.activeSocietyId).toBe('society-main');
    expect(res.body.societies).toHaveLength(1);
  });

  it('reports the manager role for maintenance staff', async () => {
    const res = await api.get('/api/me').set(bearer(maintenanceToken));
    expect(res.body.user.role).toBe('manager');
  });

  it('rejects a request with no session', async () => {
    expect((await api.get('/api/me')).status).toBe(401);
  });
});

describe('signing up with a one-time code', () => {
  const phone = '+919811122333';
  const cleanup = () => unscopedPrisma.user.deleteMany({ where: { phoneNumber: phone } });

  beforeAll(cleanup);
  afterAll(cleanup);

  it('creates the account on verification, then takes a name and password', async () => {
    const sender = new CapturingOtpSender();
    setOtpSender(sender);

    expect((await api.post('/api/auth/phone-number/send-otp').send({ phoneNumber: phone })).status).toBe(200);
    const code = sender.codes.get(phone);
    expect(code).toMatch(/^\d{6}$/);

    const verified = await api.post('/api/auth/phone-number/verify').send({ phoneNumber: phone, code });
    expect(verified.status).toBe(200);
    const token = verified.body.token as string;

    const me = await api.get('/api/me').set(bearer(token));
    expect(me.body.user.hasPassword).toBe(false);
    expect(me.body.societies).toEqual([]);

    const updated = await api
      .patch('/api/me')
      .set(bearer(token))
      .send({ name: 'New Admin', email: 'new.admin@example.com', password: 'longenough1' });
    expect(updated.status).toBe(200);

    expect(await login({ phone, password: 'longenough1' })).toBeTruthy();
  });

  it('keeps someone with no society out of society routes', async () => {
    const token = await login({ phone, password: 'longenough1' });
    expect((await api.get('/api/tickets').set(bearer(token))).status).toBe(403);
  });

  it('refuses a wrong code', async () => {
    const sender = new CapturingOtpSender();
    setOtpSender(sender);
    await api.post('/api/auth/phone-number/send-otp').send({ phoneNumber: phone });
    const res = await api.post('/api/auth/phone-number/verify').send({ phoneNumber: phone, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('refuses a number that is not in canonical form', async () => {
    const res = await api.post('/api/auth/phone-number/send-otp').send({ phoneNumber: '98111 22333' });
    expect(res.status).toBe(400);
  });

  it('will not set a second password through PATCH /api/me', async () => {
    const token = await login({ phone, password: 'longenough1' });
    const res = await api.patch('/api/me').set(bearer(token)).send({ password: 'another-one-1' });
    expect(res.status).toBe(409);
  });
});

describe('sign-out', () => {
  it('ends the session, so the token stops working', async () => {
    const token = await login(ACCOUNTS.otherResident);
    expect((await api.get('/api/me').set(bearer(token))).status).toBe(200);

    expect((await api.post('/api/auth/sign-out').set(bearer(token))).status).toBe(200);
    expect((await api.get('/api/me').set(bearer(token))).status).toBe(401);
  });
});

describe('token handling', () => {
  const protectedRoutes = [
    '/api/tickets',
    '/api/vendors',
    '/api/analytics',
    '/api/logs',
    '/api/notifications',
    '/api/resident-profiles',
    '/api/society-profile',
  ];

  it.each(protectedRoutes)('rejects anonymous access to %s', async (path) => {
    expect((await api.get(path)).status).toBe(401);
  });

  it.each(protectedRoutes)('rejects a forged token on %s', async (path) => {
    const res = await api.get(path).set(bearer('not-a-real-session-token'));
    expect(res.status).toBe(401);
  });

  it('leaves /api/health public', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('ok');
  });
});

describe('role separation', () => {
  const managerRoutes = ['/api/analytics', '/api/logs', '/api/notifications', '/api/resident-profiles'];

  it.each(managerRoutes)('denies a resident %s', async (path) => {
    const res = await api.get(path).set(bearer(residentToken));
    expect(res.status).toBe(403);
  });

  it.each(managerRoutes)('allows a manager %s', async (path) => {
    const res = await api.get(path).set(bearer(maintenanceToken));
    expect(res.status).toBe(200);
  });

  it('lists members with roles and flats, and no credentials', async () => {
    const res = await api.get('/api/resident-profiles').set(bearer(adminToken));
    expect(res.status).toBe(200);
    const vikram = res.body.residents.find((r: any) => r.name === 'Vikram Mehta');
    expect(vikram.role).toBe('resident');
    expect(vikram.flats).toEqual(['B-402']);
    for (const r of res.body.residents) {
      expect(r).not.toHaveProperty('password');
      expect(r).not.toHaveProperty('accessToken');
    }
  });
});

describe('society profile', () => {
  it('saves whitelisted fields and ignores the rest', async () => {
    const before = await unscopedPrisma.societyProfile.findFirstOrThrow({ where: { societyId: 'society-main' } });
    const res = await api
      .post('/api/society-profile')
      .set(bearer(maintenanceToken))
      .send({ tagline: 'Updated by test', id: 'hijacked', societyId: 'society-green', lastUpdatedBy: 'Mallory' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(before.id);
    expect(res.body.societyId).toBe('society-main');
    expect(res.body.tagline).toBe('Updated by test');
    expect(res.body.lastUpdatedBy).not.toBe('Mallory');

    await unscopedPrisma.societyProfile.update({ where: { id: before.id }, data: { tagline: before.tagline } });
  });

  it('rejects a body with nothing to update', async () => {
    const res = await api.post('/api/society-profile').set(bearer(maintenanceToken)).send({ id: 'x' });
    expect(res.status).toBe(400);
  });

  it('denies a resident', async () => {
    const res = await api.post('/api/society-profile').set(bearer(residentToken)).send({ tagline: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('error responses', () => {
  it('answers malformed JSON with 400, not 500', async () => {
    const res = await api
      .patch('/api/me')
      .set(bearer(residentToken))
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
  });
});
