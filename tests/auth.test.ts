import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, ACCOUNTS, type Agent } from './helpers';
import { prisma } from '../src/database/prisma';

let api: Agent;
let residentToken: string;
let maintenanceToken: string;
let adminToken: string;

beforeAll(async () => {
  api = await agent();
  residentToken = await login(ACCOUNTS.resident);
  maintenanceToken = await login(ACCOUNTS.maintenance);
  adminToken = await login(ACCOUNTS.admin);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('login', () => {
  it('issues a token for correct credentials', async () => {
    const res = await api.post('/api/auth/login').send(ACCOUNTS.resident);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.resident.role).toBe('resident');
  });

  it('rejects a wrong password without revealing which field was wrong', async () => {
    const res = await api.post('/api/auth/login').send({ ...ACCOUNTS.resident, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects an unknown flat with the same message', async () => {
    const res = await api.post('/api/auth/login').send({ ...ACCOUNTS.resident, flatNumber: 'Z-999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('requires all three fields', async () => {
    const res = await api.post('/api/auth/login').send({ flatNumber: 'B-402' });
    expect(res.status).toBe(400);
  });

  it('stores the maintenance role as the middleware expects it', async () => {
    const res = await api.post('/api/auth/login').send(ACCOUNTS.maintenance);
    expect(res.body.resident.role).toBe('maintenance');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the caller profile', async () => {
    const res = await api.get('/api/auth/me').set(bearer(residentToken));
    expect(res.status).toBe(200);
    expect(res.body.user.flatNumber).toBe('B-402');
  });

  it('never returns the standing accessToken', async () => {
    const res = await api.get('/api/auth/me').set(bearer(residentToken));
    expect(res.body.user).not.toHaveProperty('accessToken');
  });

  it('rejects a request with no token', async () => {
    expect((await api.get('/api/auth/me')).status).toBe(401);
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
    const res = await api.get(path).set(bearer('not.a.real.token'));
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

  it.each(managerRoutes)('allows maintenance staff %s', async (path) => {
    const res = await api.get(path).set(bearer(maintenanceToken));
    expect(res.status).toBe(200);
  });

  it('denies maintenance staff the admin-only token issuance', async () => {
    const res = await api.post('/api/resident-profiles/RES-001/token').set(bearer(maintenanceToken));
    expect(res.status).toBe(403);
  });

  it('allows an admin to issue a token', async () => {
    const res = await api.post('/api/resident-profiles/RES-001/token').set(bearer(adminToken));
    expect(res.status).toBe(200);
  });

  it('withholds the accessToken from the resident-profiles list', async () => {
    const res = await api.get('/api/resident-profiles').set(bearer(maintenanceToken));
    expect(res.status).toBe(200);
    expect(res.body.residents.length).toBeGreaterThan(0);
    for (const resident of res.body.residents) {
      expect(resident).not.toHaveProperty('accessToken');
    }
  });
});

describe('registration', () => {
  const flatNumber = 'T-900';
  const cleanup = () => prisma.residentProfile.deleteMany({ where: { flatNumber } });

  beforeAll(cleanup);
  afterAll(cleanup);

  it('registers a resident and stores the phone in canonical form', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: 'Test Person', flatNumber, phone: '98111 22333', password: 'longenough' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();

    const row = await prisma.residentProfile.findFirst({ where: { flatNumber } });
    expect(row?.phone).toBe('+919811122333');
  });

  it('treats a differently formatted number as the same person', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: 'Test Person', flatNumber, phone: '+91-98111-22333', password: 'longenough' });
    expect(res.status).toBe(409);
  });

  it('logs in with the number in any format', async () => {
    const res = await api
      .post('/api/auth/login')
      .send({ flatNumber: 't-900', phone: '098111 22333', password: 'longenough' });
    expect(res.status).toBe(200);
  });

  it('rejects a short password', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: 'Short', flatNumber, phone: '98111 44444', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects something that is not a phone number', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: 'Bad Phone', flatNumber, phone: '123', password: 'longenough' });
    expect(res.status).toBe(400);
  });
});

describe('society profile', () => {
  it('saves whitelisted fields and ignores the rest', async () => {
    const before = await prisma.societyProfile.findFirst();
    const res = await api
      .post('/api/society-profile')
      .set(bearer(maintenanceToken))
      .send({ tagline: 'Updated by test', id: 'hijacked', updatedAt: '1999-01-01', lastUpdatedBy: 'Mallory' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(before!.id);
    expect(res.body.tagline).toBe('Updated by test');
    expect(res.body.lastUpdatedBy).not.toBe('Mallory');

    await prisma.societyProfile.update({ where: { id: before!.id }, data: { tagline: before!.tagline } });
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
    const res = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"flatNumber": ');
    expect(res.status).toBe(400);
  });
});
