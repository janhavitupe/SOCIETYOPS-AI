import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { parseCsv } from '../src/services/flatRegister';

/**
 * The flat register as CSV. Imports here go into a tower "Z" that the seed
 * does not have, and are removed afterwards.
 */

const PHONES = ['+919811500001', '+919811500002', '+919811500003'];

let api: Agent;
let manager: string;
let greenManager: string;
let originalA101Parking: number;

const importCsv = (token: string, csv: string, dryRun: boolean) =>
  api
    .post(`/api/flats/import${dryRun ? '?dryRun=true' : ''}`)
    .set(bearer(token))
    .set('Content-Type', 'text/csv')
    .send(csv);

const FILE = [
  'Tower,Flat,Floor,Type,Carpet area (sqft),Parking slots,Resident name,Mobile,Lives as',
  'Z,Z-101,1,2BHK,850,1,Meera Iyer,98115 00001,owner', // 2
  'Z,Z-101,,,,,Karan Iyer,98115 00002,family', // 3: same flat, second person
  'Z,Z-102,1,3 bhk,"1,150",2,,,', // 4: no one yet; "3 bhk" and "1,150" are read sensibly
  'A,A-101,,,,2,,,', // 5: existing flat, parking changed
  'Z,Z-103,1,penthouse,,,,,', // 6: bad type
  'Z,Z-104,1,2BHK,,,Ravi,12345,owner', // 7: bad phone
  'Z,,1,2BHK,,,,,', // 8: no flat
  'A,B-402,,,,,,,', // 9: B-402 is in tower B
  'Z,Z-101,2,,,,,,', // 10: disagrees with row 2 on floor
  'Z,Z-105,1,1BHK,,,Asha,,owner', // 11: name without mobile
  'Z,Z-101,,,,,Meera Again,98115 00001,owner', // 12: same person twice in Z-101
  'Z,Z-106,1,1BHK,,,"Shah, Nilesh",\'+91 98115 00003,tenant', // 13: quoted comma, Excel apostrophe
].join('\r\n');

async function cleanup() {
  await unscopedPrisma.user.deleteMany({ where: { phoneNumber: { in: PHONES } } });
  for (const societyId of Object.values(SOCIETIES)) {
    const tower = await unscopedPrisma.tower.findFirst({ where: { societyId, name: 'Z' } });
    if (!tower) continue;
    await unscopedPrisma.flatOccupant.deleteMany({ where: { flat: { towerId: tower.id } } });
    await unscopedPrisma.flat.deleteMany({ where: { towerId: tower.id } });
    await unscopedPrisma.tower.delete({ where: { id: tower.id } });
  }
}

beforeAll(async () => {
  api = await agent();
  await cleanup();
  manager = await login(ACCOUNTS.maintenance);
  greenManager = await login(ACCOUNTS.greenManager);
  originalA101Parking = (
    await unscopedPrisma.flat.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, number: 'A-101' } })
  ).parkingSlots;
});

afterAll(async () => {
  await cleanup();
  await unscopedPrisma.flat.updateMany({
    where: { societyId: SOCIETIES.shreeRam, number: 'A-101' },
    data: { parkingSlots: originalA101Parking },
  });
  await unscopedPrisma.$disconnect();
});

describe('the template', () => {
  it('downloads with the headings the import reads, opening cleanly in Excel', async () => {
    const res = await api.get('/api/flats/template.csv').set(bearer(manager));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="flat-register-template.csv"/);
    expect(res.text.startsWith('﻿')).toBe(true);
    expect(parseCsv(res.text)[0]).toEqual([
      'Tower',
      'Flat',
      'Floor',
      'Type',
      'Carpet area (sqft)',
      'Parking slots',
      'Resident name',
      'Mobile',
      'Lives as',
    ]);
    // Mobiles are written so Excel keeps them as text.
    expect(res.text).toContain("'+91 98200 12345");
  });
});

describe('importing', () => {
  it('a dry run reports each row, with the reason for each bad one, and writes nothing', async () => {
    const res = await importCsv(manager, FILE, true);
    expect(res.status).toBe(200);
    const byLine = Object.fromEntries(res.body.rows.map((r: any) => [r.line, r]));

    expect(byLine[2]).toMatchObject({ flatAction: 'create', occupantAction: 'add', errors: [] });
    expect(byLine[3]).toMatchObject({ flatAction: 'unchanged', occupantAction: 'add', errors: [] });
    expect(byLine[4]).toMatchObject({ flatAction: 'create', occupant: null, errors: [] });
    expect(byLine[5]).toMatchObject({ flatAction: 'update', errors: [] });
    expect(byLine[6].errors[0]).toMatch(/Type "penthouse" is not one of/);
    expect(byLine[7].errors[0]).toMatch(/"12345" is not a valid mobile number/);
    expect(byLine[8].errors).toContain('Flat number is missing');
    expect(byLine[9].errors).toContain('B-402 is already in tower B');
    expect(byLine[10].errors[0]).toMatch(/Row 2 gives Z-101 a different floor/);
    expect(byLine[11].errors).toContain('Mobile number is missing for this resident');
    expect(byLine[12].errors[0]).toMatch(/Row 2 already puts \+919811500001 in Z-101/);
    expect(byLine[13]).toMatchObject({
      occupant: { name: 'Shah, Nilesh', phone: '+919811500003', type: 'tenant' },
      errors: [],
    });

    expect(res.body.newTowers).toEqual(['Z']);
    expect(res.body.summary).toEqual({
      rows: 12,
      valid: 5,
      errors: 7,
      flatsCreated: 3,
      flatsUpdated: 1,
      occupantsAdded: 3,
    });
    expect(await unscopedPrisma.tower.findFirst({ where: { societyId: SOCIETIES.shreeRam, name: 'Z' } })).toBeNull();
  });

  it('importing adds the good rows and skips the bad ones', async () => {
    const res = await importCsv(manager, FILE, false);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ valid: 5, errors: 7 });

    const tower = await unscopedPrisma.tower.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam, name: 'Z' } });
    const flats = await unscopedPrisma.flat.findMany({
      where: { towerId: tower.id },
      include: { occupants: { include: { user: true } } },
      orderBy: { number: 'asc' },
    });
    expect(flats.map((f) => f.number)).toEqual(['Z-101', 'Z-102', 'Z-106']);
    expect(flats[0]).toMatchObject({ floor: 1, type: '2BHK', carpetAreaSqft: 850, parkingSlots: 1 });
    expect(flats[0].occupants.map((o) => [o.user.name, o.type]).sort()).toEqual([
      ['Karan Iyer', 'family'],
      ['Meera Iyer', 'owner'],
    ]);
    expect(flats[1]).toMatchObject({ type: '3BHK', carpetAreaSqft: 1150, parkingSlots: 2 });

    const a101 = await unscopedPrisma.flat.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam, number: 'A-101' },
    });
    expect(a101.parkingSlots).toBe(2);

    // The people imported can sign in as residents of their flat.
    const meera = await unscopedPrisma.user.findUniqueOrThrow({
      where: { phoneNumber: '+919811500001' },
      include: { memberships: true },
    });
    expect(meera.memberships).toEqual([
      expect.objectContaining({ societyId: SOCIETIES.shreeRam, role: 'resident', status: 'active' }),
    ]);
  });

  it('importing the same file again changes nothing', async () => {
    const res = await importCsv(manager, FILE, false);
    expect(res.body.summary).toMatchObject({ flatsCreated: 0, flatsUpdated: 0, occupantsAdded: 0 });
    expect(await unscopedPrisma.flatOccupant.count({ where: { user: { phoneNumber: { in: PHONES } } } })).toBe(3);
  });

  it('accepts other common headings and ignores columns it does not know', async () => {
    const res = await importCsv(manager, 'Wing,Flat No,BHK,Notes\nZ,Z-102,3BHK,corner flat\n', true);
    expect(res.body.rows[0]).toMatchObject({ flat: 'Z-102', tower: 'Z', flatAction: 'unchanged', errors: [] });
  });

  it('refuses a file that is not a register', async () => {
    const res = await importCsv(manager, 'Name,Mobile\nMeera,9811500001\n', true);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No "Flat" column/);
    expect((await importCsv(manager, '', true)).status).toBe(400);
  });
});

describe('exporting', () => {
  it('lists every flat, a row per current resident', async () => {
    const res = await api.get('/api/flats/export.csv').set(bearer(manager));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/flat-register-\d{4}-\d{2}-\d{2}\.csv/);
    const rows = parseCsv(res.text);
    const z101 = rows.filter((r) => r[1] === 'Z-101');
    expect(z101.map((r) => r[6]).sort()).toEqual(['Karan Iyer', 'Meera Iyer']);
    expect(rows.find((r) => r[1] === 'Z-106')?.[6]).toBe('Shah, Nilesh');
    expect(rows.find((r) => r[1] === 'Z-102')?.slice(6)).toEqual(['', '', '']);
    expect(rows.find((r) => r[1] === 'B-402')?.[6]).toBe('Vikram Mehta');
  });

  it('an export imports back without changes', async () => {
    const exported = (await api.get('/api/flats/export.csv').set(bearer(manager))).text;
    const res = await importCsv(manager, exported, true);
    expect(res.body.summary).toMatchObject({ errors: 0, flatsCreated: 0, flatsUpdated: 0, occupantsAdded: 0 });
  });
});

describe('isolation', () => {
  it('only managers, and only their own society', async () => {
    const resident = await login(ACCOUNTS.resident);
    expect((await api.get('/api/flats/export.csv').set(bearer(resident))).status).toBe(403);
    expect((await importCsv(resident, FILE, true)).status).toBe(403);

    const green = parseCsv((await api.get('/api/flats/export.csv').set(bearer(greenManager))).text);
    expect(green.some((r) => r[1] === 'B-402' || r[1] === 'Z-101')).toBe(false);

    // Green Valley importing "Z-101" makes its own flat; Shree Ram's is untouched.
    const res = await importCsv(greenManager, 'Tower,Flat\nZ,Z-101\n', false);
    expect(res.body.rows[0]).toMatchObject({ flatAction: 'create', errors: [] });
    expect(await unscopedPrisma.flat.count({ where: { number: 'Z-101' } })).toBe(2);
  });
});
