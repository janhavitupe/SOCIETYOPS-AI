import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, verifyPhone, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { flatNumbersFor } from '../src/services/buildings';

/**
 * Managing a society's vendors, buildings and residents from the app.
 * Everything is created in Shree Ram under names no seed data uses, and
 * removed again afterwards.
 */

let api: Agent;
let admin: string;
let manager: string;
let resident: string;
let greenManager: string;

const NEW_RESIDENT = '+919811200001';
const SECOND_RESIDENT = '+919811200002';

async function cleanup() {
  const shree = SOCIETIES.shreeRam;
  await unscopedPrisma.flatOccupant.deleteMany({ where: { societyId: shree, flat: { number: { startsWith: 'TT' } } } });
  await unscopedPrisma.flat.deleteMany({ where: { societyId: shree, number: { startsWith: 'TT' } } });
  await unscopedPrisma.tower.deleteMany({ where: { societyId: shree, name: { startsWith: 'TT' } } });
  await unscopedPrisma.vendor.deleteMany({ where: { name: { startsWith: 'Test Vendor' } } });
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: { in: [NEW_RESIDENT, SECOND_RESIDENT] } } });
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  admin = await login(ACCOUNTS.admin);
  manager = await login(ACCOUNTS.maintenance);
  resident = await login(ACCOUNTS.resident);
  greenManager = await login(ACCOUNTS.greenManager);
});

afterAll(async () => {
  await cleanup();
  await unscopedPrisma.$disconnect();
});

describe('vendors', () => {
  let vendorId: string;

  it('a manager adds a vendor, who joins the dispatch pool', async () => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(manager))
      .send({ name: 'Test Vendor Plumbing', category: 'Plumbing', phone: '98200 55555', skills: ['Leaks'] });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^VND-[0-9A-F]{8}$/);
    expect(res.body.phone).toBe('+919820055555');
    expect(res.body.rating).toBe(4);
    expect(res.body.societyId).toBe(SOCIETIES.shreeRam);
    vendorId = res.body.id;

    const list = await api.get('/api/vendors').set(bearer(manager));
    expect(list.body.vendors.map((v: any) => v.id)).toContain(vendorId);
  });

  it('validates category and phone', async () => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(manager))
      .send({ name: 'Test Vendor Bad', category: 'Astrology', phone: '12' });
    expect(res.status).toBe(400);
  });

  it('edits and removes a vendor', async () => {
    const edited = await api.patch(`/api/vendors/${vendorId}`).set(bearer(manager)).send({ availability: 'Offline' });
    expect(edited.body.availability).toBe('Offline');

    expect((await api.delete(`/api/vendors/${vendorId}`).set(bearer(manager))).status).toBe(200);
    const list = await api.get('/api/vendors').set(bearer(manager));
    expect(list.body.vendors.map((v: any) => v.id)).not.toContain(vendorId);
  });

  it('is managers only', async () => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(resident))
      .send({ name: 'Test Vendor Sneaky', category: 'Plumbing', phone: '98200 55556' });
    expect(res.status).toBe(403);
  });

  it('cannot touch another society’s vendor', async () => {
    expect((await api.patch('/api/vendors/VND-01').set(bearer(greenManager)).send({ rating: 1 })).status).toBe(404);
    expect((await api.delete('/api/vendors/VND-01').set(bearer(greenManager))).status).toBe(404);
    const vnd = await unscopedPrisma.vendor.findUniqueOrThrow({ where: { id: 'VND-01' } });
    expect(vnd.rating).toBe(4.9);
    expect(vnd.deletedAt).toBeNull();
  });
});

describe('flat number patterns', () => {
  it('numbers floors and units like Indian societies do', () => {
    const numbers = flatNumbersFor({ prefix: 'A', separator: '-', fromFloor: 1, toFloor: 2, perFloor: 3 });
    expect(numbers.map((f) => f.number)).toEqual(['A-101', 'A-102', 'A-103', 'A-201', 'A-202', 'A-203']);
  });

  it('writes the ground floor as G and handles tall towers', () => {
    expect(flatNumbersFor({ prefix: 'B', separator: '-', fromFloor: 0, toFloor: 0, perFloor: 1 })[0].number).toBe(
      'B-G01',
    );
    expect(flatNumbersFor({ prefix: 'B', separator: '', fromFloor: 14, toFloor: 14, perFloor: 4 })[3].number).toBe(
      'B1404',
    );
  });
});

describe('towers and flats', () => {
  let towerId: string;

  it('adds a tower', async () => {
    const res = await api.post('/api/towers').set(bearer(manager)).send({ name: 'TT', kind: 'wing', liftsCount: 2 });
    expect(res.status).toBe(201);
    expect(res.body.flatCount).toBe(0);
    towerId = res.body.id;
  });

  it('refuses a duplicate tower name', async () => {
    expect((await api.post('/api/towers').set(bearer(manager)).send({ name: 'TT' })).status).toBe(409);
  });

  it('previews a pattern without writing anything', async () => {
    const res = await api
      .post(`/api/towers/${towerId}/flats/generate`)
      .set(bearer(manager))
      .send({ fromFloor: 1, toFloor: 3, perFloor: 4, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(12);
    expect(res.body.created[0]).toBe('TT-101');
    expect(await unscopedPrisma.flat.count({ where: { towerId } })).toBe(0);
  });

  it('generates the flats, and skips ones that already exist when run again', async () => {
    const first = await api
      .post(`/api/towers/${towerId}/flats/generate`)
      .set(bearer(manager))
      .send({ fromFloor: 1, toFloor: 3, perFloor: 4, type: '2BHK', parkingSlots: 1 });
    expect(first.status).toBe(201);
    expect(first.body.created).toHaveLength(12);

    const again = await api
      .post(`/api/towers/${towerId}/flats/generate`)
      .set(bearer(manager))
      .send({ fromFloor: 3, toFloor: 4, perFloor: 4 });
    expect(again.body.created).toEqual(['TT-401', 'TT-402', 'TT-403', 'TT-404']);
    expect(again.body.skipped).toHaveLength(4);

    const tower = await unscopedPrisma.tower.findUniqueOrThrow({ where: { id: towerId } });
    expect(tower.floors).toBe(4);
  });

  it('refuses an enormous pattern', async () => {
    const res = await api
      .post(`/api/towers/${towerId}/flats/generate`)
      .set(bearer(manager))
      .send({ fromFloor: 1, toFloor: 200, perFloor: 50 });
    expect(res.status).toBe(400);
  });

  it('lists flats in reading order, filtered by tower', async () => {
    const res = await api.get(`/api/flats?towerId=${towerId}`).set(bearer(manager));
    const numbers = res.body.flats.map((f: any) => f.number);
    expect(numbers).toHaveLength(16);
    expect(numbers.slice(0, 3)).toEqual(['TT-101', 'TT-102', 'TT-103']);
    expect(res.body.flats[0].type).toBe('2BHK');
  });

  it('adds, edits and removes a single flat', async () => {
    const added = await api
      .post('/api/flats')
      .set(bearer(manager))
      .send({ number: 'TT-SHOP-1', towerId, type: 'shop', carpetAreaSqft: 300 });
    expect(added.status).toBe(201);

    expect((await api.post('/api/flats').set(bearer(manager)).send({ number: 'TT-SHOP-1' })).status).toBe(409);

    const edited = await api.patch(`/api/flats/${added.body.id}`).set(bearer(manager)).send({ parkingSlots: 2 });
    expect(edited.body.parkingSlots).toBe(2);

    expect((await api.delete(`/api/flats/${added.body.id}`).set(bearer(manager))).status).toBe(204);
  });

  it('will not delete a tower that still has flats', async () => {
    expect((await api.delete(`/api/towers/${towerId}`).set(bearer(manager))).status).toBe(409);
  });

  it('is managers only', async () => {
    expect((await api.get('/api/flats').set(bearer(resident))).status).toBe(403);
    expect((await api.post('/api/towers').set(bearer(resident)).send({ name: 'TTX' })).status).toBe(403);
  });
});

describe('occupants', () => {
  let flatId: string;
  let occupantId: string;

  beforeAll(async () => {
    const flat = await unscopedPrisma.flat.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam, number: 'TT-201' },
    });
    flatId = flat.id;
  });

  it('registers a new person, creating their account and membership', async () => {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(admin))
      .send({ name: 'Kavita Rao', phone: '98112 00001', type: 'tenant' });
    expect(res.status).toBe(201);
    expect(res.body.isNewAccount).toBe(true);
    expect(res.body.status).toBe('active');
    occupantId = res.body.id;

    const user = await unscopedPrisma.user.findUniqueOrThrow({ where: { phoneNumber: NEW_RESIDENT } });
    expect(user.name).toBe('Kavita Rao');
    const membership = await unscopedPrisma.membership.findFirstOrThrow({
      where: { userId: user.id, societyId: SOCIETIES.shreeRam },
    });
    expect(membership.role).toBe('resident');
  });

  it('lets that person sign in with a code and see their flat', async () => {
    const token = await verifyPhone(NEW_RESIDENT);
    const me = await api.get('/api/me').set(bearer(token));
    expect(me.body.user.name).toBe('Kavita Rao');
    expect(me.body.user.flatNumber).toBe('TT-201');
    expect(me.body.user.role).toBe('resident');
  });

  it('refuses registering the same person in the same flat twice', async () => {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(admin))
      .send({ name: 'Kavita Rao', phone: '+91 98112 00001', type: 'tenant' });
    expect(res.status).toBe(409);
  });

  it('adds an existing user without changing their name', async () => {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(admin))
      .send({ name: 'Somebody Else', phone: ACCOUNTS.otherResident.phone, type: 'family' });
    expect(res.status).toBe(201);
    expect(res.body.isNewAccount).toBe(false);
    expect(res.body.user.name).toBe('Mrs. Ananya Sharma');

    // Ananya now has two flats; ending this one leaves her other one and access.
    expect((await api.post(`/api/occupants/${res.body.id}/move-out`).set(bearer(admin)).send({})).status).toBe(200);
    const me = await api.get('/api/me').set(bearer(await login(ACCOUNTS.otherResident)));
    expect(me.body.user.flatNumber).toBe('A-101');
  });

  it('shows the flat on the list with its current occupants', async () => {
    const res = await api.get('/api/flats?query=TT-201').set(bearer(manager));
    const occupants = res.body.flats[0].occupants.map((o: any) => o.user.name);
    expect(occupants).toEqual(['Kavita Rao']);
  });

  it('moving out ends access but keeps the history', async () => {
    const token = await verifyPhone(NEW_RESIDENT);
    expect((await api.get('/api/tickets').set(bearer(token))).status).toBe(200);

    const res = await api
      .post(`/api/occupants/${occupantId}/move-out`)
      .set(bearer(admin))
      .send({ moveOutDate: '2026-10-31' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ended');

    // Her only flat is gone, so is her membership, so is her access.
    expect((await api.get('/api/tickets').set(bearer(token))).status).toBe(403);

    const history = await api.get(`/api/flats/${flatId}/occupants`).set(bearer(manager));
    const kavita = history.body.occupants.find((o: any) => o.user.name === 'Kavita Rao');
    expect(kavita.status).toBe('ended');
    expect(kavita.moveOutDate.slice(0, 10)).toBe('2026-10-31');
  });

  it('moving back in restores access', async () => {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(admin))
      .send({ name: 'Kavita Rao', phone: '98112 00001', type: 'owner' });
    expect(res.status).toBe(201);
    const token = await verifyPhone(NEW_RESIDENT);
    expect((await api.get('/api/tickets').set(bearer(token))).status).toBe(200);
  });

  it('a flat with history cannot be deleted', async () => {
    expect((await api.delete(`/api/flats/${flatId}`).set(bearer(manager))).status).toBe(409);
  });

  it('is managers only', async () => {
    const res = await api
      .post(`/api/flats/${flatId}/occupants`)
      .set(bearer(resident))
      .send({ name: 'X', phone: '98112 00002', type: 'tenant' });
    expect(res.status).toBe(403);
  });
});

describe('buildings across societies', () => {
  it('another society’s towers, flats and occupants are not found', async () => {
    const shreeTower = await unscopedPrisma.tower.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam, name: 'A' },
    });
    const shreeFlat = await unscopedPrisma.flat.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam, number: 'B-402' },
    });
    const shreeOccupant = await unscopedPrisma.flatOccupant.findFirstOrThrow({ where: { flatId: shreeFlat.id } });

    const flats = await api.get('/api/flats').set(bearer(greenManager));
    expect(flats.body.flats.every((f: any) => f.societyId === SOCIETIES.greenValley)).toBe(true);
    const towers = await api.get('/api/towers').set(bearer(greenManager));
    expect(towers.body.towers.map((t: any) => t.name)).toEqual(['G']);

    const attempts = await Promise.all([
      api.patch(`/api/towers/${shreeTower.id}`).set(bearer(greenManager)).send({ name: 'Hijacked' }),
      api.delete(`/api/towers/${shreeTower.id}`).set(bearer(greenManager)),
      api
        .post(`/api/towers/${shreeTower.id}/flats/generate`)
        .set(bearer(greenManager))
        .send({ fromFloor: 9, toFloor: 9, perFloor: 1 }),
      api.patch(`/api/flats/${shreeFlat.id}`).set(bearer(greenManager)).send({ type: 'shop' }),
      api.delete(`/api/flats/${shreeFlat.id}`).set(bearer(greenManager)),
      api.get(`/api/flats/${shreeFlat.id}/occupants`).set(bearer(greenManager)),
      api
        .post(`/api/flats/${shreeFlat.id}/occupants`)
        .set(bearer(greenManager))
        .send({ name: 'X', phone: '98112 00002', type: 'tenant' }),
      api.post(`/api/occupants/${shreeOccupant.id}/move-out`).set(bearer(greenManager)).send({}),
    ]);
    expect(attempts.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404]);

    // A Green Valley flat cannot be put in a Shree Ram tower either.
    const greenFlat = await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.greenValley } });
    const moved = await api
      .patch(`/api/flats/${greenFlat.id}`)
      .set(bearer(greenManager))
      .send({ towerId: shreeTower.id });
    expect(moved.status).toBe(400);

    // Nothing changed.
    expect((await unscopedPrisma.tower.findUniqueOrThrow({ where: { id: shreeTower.id } })).name).toBe('A');
    expect((await unscopedPrisma.flatOccupant.findUniqueOrThrow({ where: { id: shreeOccupant.id } })).status).toBe(
      'active',
    );
    expect(await unscopedPrisma.user.count({ where: { phoneNumber: SECOND_RESIDENT } })).toBe(0);
  });
});
