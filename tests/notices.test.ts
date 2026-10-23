import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * Notices from the society office. In Shree Ram, Vikram lives in B-402
 * (tower B) and Ananya in A-101 (tower A).
 */

let api: Agent;
let manager: string;
let vikram: string;
let ananya: string;
let greenManager: string;
let towerA: string;
let b402: string;

const post = (body: object, token = manager) => api.post('/api/notices').set(bearer(token)).send(body);
const mine = async (token: string) => (await api.get('/api/notices').set(bearer(token))).body;
const told = (title: string, phone: string) =>
  unscopedPrisma.notificationLog.count({ where: { phone, message: { contains: title } } });

const VIKRAM_PHONE = '+919821099887';
const ANANYA_PHONE = '+919987011223';

async function cleanup() {
  await unscopedPrisma.notice.deleteMany({ where: { title: { startsWith: 'Notice test' } } });
  await unscopedPrisma.notificationLog.deleteMany({ where: { message: { contains: 'Notice test' } } });
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  manager = await login(ACCOUNTS.maintenance);
  vikram = await login(ACCOUNTS.resident);
  ananya = await login(ACCOUNTS.otherResident);
  greenManager = await login(ACCOUNTS.greenManager);
  towerA = (await unscopedPrisma.tower.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, name: 'A' } })).id;
  b402 = (await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, number: 'B-402' } })).id;
});

afterAll(async () => {
  await cleanup();
  await unscopedPrisma.$disconnect();
});

describe('posting notices', () => {
  it('a notice to everyone reaches every resident, who are told', async () => {
    const res = await post({ title: 'Notice test: water cut', body: 'No water 10am to 2pm on Sunday.', urgent: true });
    expect(res.status).toBe(201);

    expect(await told('Notice test: water cut', VIKRAM_PHONE)).toBe(1);
    expect(await told('Notice test: water cut', ANANYA_PHONE)).toBe(1);
    const v = await mine(vikram);
    expect(v.notices.find((n: any) => n.title === 'Notice test: water cut')).toMatchObject({
      urgent: true,
      read: false,
    });
    expect(v.unread).toBeGreaterThan(0);
  });

  it('a notice to a tower reaches only that tower', async () => {
    const res = await post({
      title: 'Notice test: lift A servicing',
      body: 'Lift A1 off on Monday.',
      audience: 'towers',
      towerIds: [towerA],
    });
    expect(res.status).toBe(201);
    expect((await mine(ananya)).notices.some((n: any) => n.id === res.body.id)).toBe(true);
    expect((await mine(vikram)).notices.some((n: any) => n.id === res.body.id)).toBe(false);
    expect(await told('Notice test: lift A servicing', VIKRAM_PHONE)).toBe(0);
    // Not reachable by id either.
    expect((await api.post(`/api/notices/${res.body.id}/read`).set(bearer(vikram))).status).toBe(404);
  });

  it('a notice to chosen flats reaches only them', async () => {
    const res = await post({
      title: 'Notice test: B-402 pipe work',
      body: 'Plumber visiting.',
      audience: 'flats',
      flatIds: [b402],
    });
    expect((await mine(vikram)).notices.some((n: any) => n.id === res.body.id)).toBe(true);
    expect((await mine(ananya)).notices.some((n: any) => n.id === res.body.id)).toBe(false);
  });

  it('refuses an empty or foreign audience, and a poll with one choice', async () => {
    expect((await post({ title: 'Notice test: x', body: 'x', audience: 'towers', towerIds: [] })).status).toBe(400);
    expect(
      (await post({ title: 'Notice test: x', body: 'x', audience: 'towers', towerIds: [towerA] }, greenManager)).status,
    ).toBe(400);
    expect((await post({ title: 'Notice test: x', body: 'x', pollOptions: ['Only'] })).status).toBe(400);
  });

  it('pinned notices come first', async () => {
    await post({ title: 'Notice test: society rules', body: 'Read these.', pinned: true });
    expect((await mine(vikram)).notices[0].title).toBe('Notice test: society rules');
  });
});

describe('reading and chasing', () => {
  let id: string;

  it('reading is recorded, and the office sees who has not read it', async () => {
    id = (await mine(vikram)).notices.find((n: any) => n.title === 'Notice test: water cut').id;
    expect((await api.post(`/api/notices/${id}/read`).set(bearer(vikram))).status).toBe(204);
    expect((await mine(vikram)).notices.find((n: any) => n.id === id).read).toBe(true);

    const report = (await api.get(`/api/notices/${id}/reads`).set(bearer(manager))).body;
    expect(report.read).toBeGreaterThanOrEqual(1);
    expect(report.unread.some((p: any) => p.flats.includes('A-101'))).toBe(true);
    expect(report.unread.some((p: any) => p.flats.includes('B-402'))).toBe(false);

    const list = (await api.get('/api/notices/manage').set(bearer(manager))).body.notices;
    expect(list.find((n: any) => n.id === id)).toMatchObject({
      state: 'live',
      readCount: report.read,
      audienceCount: report.total,
    });
  });

  it('a reminder goes only to those who have not read it', async () => {
    const res = await api.post(`/api/notices/${id}/remind`).set(bearer(manager));
    expect(res.status).toBe(200);
    expect(await told('Notice test: water cut', VIKRAM_PHONE)).toBe(1);
    expect(await told('Notice test: water cut', ANANYA_PHONE)).toBe(2);
  });
});

describe('scheduling and expiry', () => {
  it('a scheduled notice waits, then goes out on the follow-up cycle', async () => {
    const res = await post({
      title: 'Notice test: AGM',
      body: 'AGM on the 30th.',
      publishAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    expect((await mine(vikram)).notices.some((n: any) => n.id === res.body.id)).toBe(false);
    expect(await told('Notice test: AGM', VIKRAM_PHONE)).toBe(0);
    const scheduled = (await api.get('/api/notices/manage').set(bearer(manager))).body.notices;
    expect(scheduled.find((n: any) => n.id === res.body.id).state).toBe('scheduled');

    await unscopedPrisma.notice.update({
      where: { id: res.body.id },
      data: { publishAt: new Date(Date.now() - 1000) },
    });
    await api.post('/api/followup/run').set(bearer(manager));
    expect((await mine(vikram)).notices.some((n: any) => n.id === res.body.id)).toBe(true);
    expect(await told('Notice test: AGM', VIKRAM_PHONE)).toBe(1);

    await api.post('/api/followup/run').set(bearer(manager));
    expect(await told('Notice test: AGM', VIKRAM_PHONE)).toBe(1);
  });

  it('an expired notice is no longer shown', async () => {
    const res = await post({
      title: 'Notice test: old',
      body: 'Gone.',
      publishAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(res.status).toBe(201);
    expect((await mine(vikram)).notices.some((n: any) => n.id === res.body.id)).toBe(false);
    expect((await post({ title: 'Notice test: bad', body: 'x', expiresAt: '2020-01-01' })).status).toBe(400);
  });
});

describe('polls', () => {
  it('residents vote once, can change it, and see results only after voting', async () => {
    const res = await post({ title: 'Notice test: paint colour', body: 'Choose.', pollOptions: ['Cream', 'Grey'] });
    const id = res.body.id;
    expect((await mine(ananya)).notices.find((n: any) => n.id === id).results).toBeNull();

    const voted = await api.post(`/api/notices/${id}/vote`).set(bearer(vikram)).send({ option: 1 });
    expect(voted.body.results).toEqual([0, 1]);
    const changed = await api.post(`/api/notices/${id}/vote`).set(bearer(vikram)).send({ option: 0 });
    expect(changed.body.results).toEqual([1, 0]);
    expect((await mine(vikram)).notices.find((n: any) => n.id === id)).toMatchObject({ myVote: 0, read: true });

    expect((await api.post(`/api/notices/${id}/vote`).set(bearer(vikram)).send({ option: 5 })).status).toBe(400);
  });
});

describe('who may do what', () => {
  it('residents cannot post or manage; another society cannot touch them', async () => {
    expect((await post({ title: 'Notice test: mine', body: 'x' }, vikram)).status).toBe(403);
    expect((await api.get('/api/notices/manage').set(bearer(vikram))).status).toBe(403);

    const id = (await mine(vikram)).notices[0].id;
    expect((await api.patch(`/api/notices/${id}`).set(bearer(greenManager)).send({ title: 'x' })).status).toBe(404);
    expect((await api.delete(`/api/notices/${id}`).set(bearer(greenManager))).status).toBe(404);
    expect((await api.get(`/api/notices/${id}/reads`).set(bearer(greenManager))).status).toBe(404);
    const green = (await api.get('/api/notices').set(bearer(greenManager))).body.notices;
    expect(green.some((n: any) => n.title.startsWith('Notice test'))).toBe(false);
  });

  it('a manager can edit and remove a notice', async () => {
    const res = await post({ title: 'Notice test: draft', body: 'x' });
    const edited = await api
      .patch(`/api/notices/${res.body.id}`)
      .set(bearer(manager))
      .send({ title: 'Notice test: final' });
    expect(edited.body.title).toBe('Notice test: final');
    expect((await api.delete(`/api/notices/${res.body.id}`).set(bearer(manager))).status).toBe(204);
    expect((await mine(vikram)).notices.some((n: any) => n.id === res.body.id)).toBe(false);
  });
});
