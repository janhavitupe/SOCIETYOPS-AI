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
