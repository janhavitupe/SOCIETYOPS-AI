import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, signUp, deleteUsersAndTheirSocieties, ACCOUNTS, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * The setup wizard, walked by a new society's admin. Each step counts as done
 * when the society has the thing it is about.
 */

const ADMIN_PHONE = '+919811900001';

let api: Agent;
let admin: string;

const state = async (token = admin) => (await api.get('/api/onboarding').set(bearer(token))).body;
const step = (s: any, id: string) => s.steps.find((x: any) => x.id === id);

beforeAll(async () => {
  api = await agent();
  await deleteUsersAndTheirSocieties([ADMIN_PHONE]);
  admin = await signUp(ADMIN_PHONE, 'Onboarding Admin');
  const res = await api
    .post('/api/societies')
    .set(bearer(admin))
    .send({ name: 'Wizard Heights', address: '1 Test Road', city: 'Pune', pinCode: '411001' });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  await deleteUsersAndTheirSocieties([ADMIN_PHONE]);
  await unscopedPrisma.$disconnect();
});

describe('the setup wizard', () => {
  it('a new society starts at the first step that is not done', async () => {
    const s = await state();
    expect(s.finished).toBe(false);
    expect(s.steps.map((x: any) => x.id)).toEqual([
      'details',
      'buildings',
      'common_areas',
      'staff',
      'vendors',
      'residents',
    ]);
    // Creating a society asks for its address, so details are done already.
    expect(step(s, 'details').done).toBe(true);
    expect(step(s, 'buildings')).toMatchObject({ done: false, skipped: false });
    expect(step(s, 'vendors').done).toBe(false);
    expect(s.current).toBe('buildings');
    expect(s.joinCode).toMatch(/^[A-Z2-9]{8}$/);
  });

  it('a step is done when the society has what it is about', async () => {
    const tower = await api.post('/api/towers').set(bearer(admin)).send({ name: 'A', kind: 'tower' });
    await api
      .post(`/api/towers/${tower.body.id}/flats/generate`)
      .set(bearer(admin))
      .send({ fromFloor: 1, toFloor: 2, perFloor: 2 });
    await api.post('/api/common-areas').set(bearer(admin)).send({ name: 'Lobby', kind: 'lobby' });

    const s = await state();
    expect(step(s, 'buildings').done).toBe(true);
    expect(step(s, 'common_areas').done).toBe(true);
    expect(s.counts.flats).toBe(4);
    expect(s.current).toBe('staff');
    expect(s.completed).toBe(3);
  });

  it('a step can be skipped for now, and un-skipped', async () => {
    let s = (await api.post('/api/onboarding/steps/staff/skip').set(bearer(admin)).send({})).body;
    expect(step(s, 'staff')).toMatchObject({ done: false, skipped: true });
    expect(s.current).toBe('vendors');

    s = (await api.post('/api/onboarding/steps/staff/skip').set(bearer(admin)).send({ skipped: false })).body;
    expect(step(s, 'staff').skipped).toBe(false);
  });

  it('remembers the step the admin was on', async () => {
    await api.post('/api/onboarding/steps/residents/visit').set(bearer(admin));
    expect((await state()).current).toBe('residents');
  });

  it('adding a vendor completes that step', async () => {
    await api
      .post('/api/vendors')
      .set(bearer(admin))
      .send({ name: 'Wizard Plumber', category: 'Plumbing', phone: '98119 00002' });
    expect(step(await state(), 'vendors').done).toBe(true);
  });

  it('finishing makes the society live', async () => {
    const s = (await api.post('/api/onboarding/finish').set(bearer(admin))).body;
    expect(s.finished).toBe(true);
    const society = await api.get('/api/society').set(bearer(admin));
    expect(society.body.status).toBe('active');
  });

  it('refuses unknown steps, and residents', async () => {
    expect((await api.post('/api/onboarding/steps/nonsense/skip').set(bearer(admin)).send({})).status).toBe(400);
    const resident = await login(ACCOUNTS.resident);
    expect((await api.get('/api/onboarding').set(bearer(resident))).status).toBe(403);
  });

  it('only the society admin moves the wizard; managers can look', async () => {
    const manager = await login(ACCOUNTS.maintenance);
    expect((await api.get('/api/onboarding').set(bearer(manager))).status).toBe(200);
    expect((await api.post('/api/onboarding/finish').set(bearer(manager))).status).toBe(403);
  });
});
