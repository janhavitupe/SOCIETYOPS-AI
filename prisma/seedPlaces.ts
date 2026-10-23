import 'dotenv/config';
import { unscopedPrisma } from '../src/database/prisma';

/**
 * Demo common areas and assets. Used by the seed, and runnable on its own
 * (`npx tsx prisma/seedPlaces.ts`) to add them to a database seeded before
 * they existed; a society that already has common areas is left alone.
 */

interface AreaSeed {
  name: string;
  kind: string;
  tower?: string;
}

interface AssetSeed {
  name: string;
  kind: string;
  area?: string;
  tower?: string;
  make?: string;
  serialNumber?: string;
  amcVendorId?: string;
  amcExpiresOn?: string;
}

async function seedSociety(societyId: string, areas: AreaSeed[], assets: AssetSeed[]) {
  if (await unscopedPrisma.commonArea.count({ where: { societyId } })) return false;

  const towers = await unscopedPrisma.tower.findMany({ where: { societyId } });
  const towerId = (name?: string) => (name ? (towers.find((t) => t.name === name)?.id ?? null) : null);

  const areaIds = new Map<string, string>();
  for (const a of areas) {
    const area = await unscopedPrisma.commonArea.create({
      data: { societyId, name: a.name, kind: a.kind, towerId: towerId(a.tower) },
    });
    areaIds.set(a.name, area.id);
  }

  const vendors = new Set((await unscopedPrisma.vendor.findMany({ where: { societyId } })).map((v) => v.id));
  for (const a of assets) {
    await unscopedPrisma.asset.create({
      data: {
        societyId,
        name: a.name,
        kind: a.kind,
        commonAreaId: a.area ? (areaIds.get(a.area) ?? null) : null,
        towerId: towerId(a.tower),
        make: a.make ?? null,
        serialNumber: a.serialNumber ?? null,
        amcVendorId: a.amcVendorId && vendors.has(a.amcVendorId) ? a.amcVendorId : null,
        amcExpiresOn: a.amcExpiresOn ? new Date(`${a.amcExpiresOn}T00:00:00Z`) : null,
      },
    });
  }
  return true;
}

const LIFT_CHECKS = [
  'Brakes and brake lining',
  'Door sensors and safety edge',
  'Alarm bell and intercom',
  'Emergency light and fan',
  'Levelling at every floor',
  'Ropes and pulleys',
  'Machine room clean and locked',
];

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

/** Demo schedules and licences; a society that already has schedules is left alone. */
async function seedMaintenance(societyId: string) {
  if (await unscopedPrisma.maintenanceSchedule.count({ where: { societyId } })) return;
  const asset = async (name: string) =>
    (await unscopedPrisma.asset.findFirst({ where: { societyId, name } }))?.id ?? null;
  const area = async (name: string) =>
    (await unscopedPrisma.commonArea.findFirst({ where: { societyId, name } }))?.id ?? null;
  const vendors = new Set((await unscopedPrisma.vendor.findMany({ where: { societyId } })).map((v) => v.id));
  const vendor = (id: string) => (vendors.has(id) ? id : null);

  const schedules = [
    {
      title: 'Lift A1 monthly service',
      category: 'Lift & Elevator',
      assetId: await asset('Lift A1'),
      every: 1,
      unit: 'months',
      due: 12,
      checklist: LIFT_CHECKS,
    },
    {
      title: 'Lift A2 monthly service',
      category: 'Lift & Elevator',
      assetId: await asset('Lift A2'),
      every: 1,
      unit: 'months',
      due: 13,
      checklist: LIFT_CHECKS,
    },
    {
      title: 'Lift B1 monthly service',
      category: 'Lift & Elevator',
      assetId: await asset('Lift B1'),
      every: 1,
      unit: 'months',
      due: 19,
      checklist: LIFT_CHECKS,
    },
    {
      title: 'Lift B2 monthly service',
      category: 'Lift & Elevator',
      assetId: await asset('Lift B2'),
      every: 1,
      unit: 'months',
      due: 20,
      checklist: LIFT_CHECKS,
    },
    {
      title: 'Overhead tank cleaning',
      category: 'Cleaning & Pest',
      commonAreaId: await area('Terrace'),
      vendorId: vendor('VND-06'),
      every: 6,
      unit: 'months',
      due: 40,
      checklist: ['Tank drained', 'Walls scrubbed', 'Disinfected', 'Lid locked'],
    },
    {
      title: 'Pest control (common areas)',
      category: 'Cleaning & Pest',
      vendorId: vendor('VND-06'),
      every: 3,
      unit: 'months',
      due: 25,
      checklist: ['Basement', 'Lobbies', 'Garden', 'Garbage area'],
    },
    {
      title: 'DG set service',
      category: 'Electrical',
      assetId: await asset('DG Set'),
      vendorId: vendor('VND-02'),
      every: 3,
      unit: 'months',
      due: 55,
      checklist: ['Oil level', 'Battery', 'Test run 15 min'],
    },
    {
      title: 'Fire extinguisher refill',
      category: 'General Repairs',
      assetId: await asset('Fire Panel'),
      every: 12,
      unit: 'months',
      due: 70,
      checklist: ['All extinguishers refilled', 'Pressure gauges green', 'Tags dated'],
    },
  ];
  for (const s of schedules) {
    await unscopedPrisma.maintenanceSchedule.create({
      data: {
        societyId,
        title: s.title,
        category: s.category,
        assetId: s.assetId ?? null,
        commonAreaId: s.commonAreaId ?? null,
        vendorId: s.vendorId ?? null,
        every: s.every,
        unit: s.unit,
        nextDueOn: daysFromNow(s.due),
        checklist: s.checklist,
      },
    });
  }

  await unscopedPrisma.licence.createMany({
    data: [
      {
        societyId,
        name: 'Lift licence (all lifts)',
        expiresOn: daysFromNow(24),
        notes: 'Electrical Inspectorate, Mumbai',
      },
      { societyId, name: 'Fire NOC', expiresOn: daysFromNow(150), notes: 'Mumbai Fire Brigade' },
      { societyId, name: 'Pest control contract', expiresOn: daysFromNow(80), notes: 'GreenPest' },
    ],
  });
}

export async function seedPlaces() {
  const shreeRam = await seedSociety(
    'society-main',
    [
      { name: 'Tower A Lobby', kind: 'lobby', tower: 'A' },
      { name: 'Tower B Lobby', kind: 'lobby', tower: 'B' },
      { name: 'Terrace', kind: 'terrace' },
      { name: 'Basement Parking', kind: 'parking' },
      { name: 'Garden', kind: 'garden' },
      { name: 'Clubhouse', kind: 'clubhouse' },
      { name: 'STP', kind: 'stp' },
    ],
    [
      {
        name: 'Lift A1',
        kind: 'lift',
        area: 'Tower A Lobby',
        tower: 'A',
        make: 'Otis',
        serialNumber: 'OT-A1-2019',
        amcVendorId: 'VND-03',
        amcExpiresOn: '2027-03-31',
      },
      {
        name: 'Lift A2',
        kind: 'lift',
        area: 'Tower A Lobby',
        tower: 'A',
        make: 'Otis',
        serialNumber: 'OT-A2-2019',
        amcVendorId: 'VND-03',
        amcExpiresOn: '2027-03-31',
      },
      {
        name: 'Lift B1',
        kind: 'lift',
        area: 'Tower B Lobby',
        tower: 'B',
        make: 'Otis',
        serialNumber: 'OT-B1-2020',
        amcVendorId: 'VND-03',
        amcExpiresOn: '2026-11-15',
      },
      {
        name: 'Lift B2',
        kind: 'lift',
        area: 'Tower B Lobby',
        tower: 'B',
        make: 'Otis',
        serialNumber: 'OT-B2-2020',
        amcVendorId: 'VND-03',
        amcExpiresOn: '2026-11-15',
      },
      { name: 'Water Pump', kind: 'water_pump', area: 'Basement Parking', make: 'Kirloskar' },
      { name: 'DG Set', kind: 'dg_set', area: 'Basement Parking', make: 'Cummins 125 kVA' },
      { name: 'Fire Panel', kind: 'fire_panel', area: 'Tower A Lobby', make: 'Honeywell' },
      { name: 'Main Gate CCTV', kind: 'cctv', make: 'Hikvision', amcVendorId: 'VND-07', amcExpiresOn: '2027-06-30' },
    ],
  );

  // The seeded lift entrapment is now about a lift, not the words "Tower B".
  if (shreeRam) {
    const liftB2 = await unscopedPrisma.asset.findFirst({ where: { societyId: 'society-main', name: 'Lift B2' } });
    if (liftB2) {
      await unscopedPrisma.ticket.updateMany({
        where: { id: 'SOC-1040', societyId: 'society-main', assetId: null },
        data: { assetId: liftB2.id, commonAreaId: liftB2.commonAreaId, flatNumber: 'Lift B2, Tower B Lobby' },
      });
    }
  }

  // Added whether or not the places were just made: it checks for schedules itself.
  await seedMaintenance('society-main');

  await seedSociety(
    'society-green',
    [{ name: 'Lobby', kind: 'lobby', tower: 'G' }],
    [{ name: 'Lift G1', kind: 'lift', area: 'Lobby', tower: 'G' }],
  );
}

// Run directly: add the places to an existing database.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('prisma/seedPlaces.ts')) {
  seedPlaces()
    .then(() => console.log('Common areas and assets seeded'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => unscopedPrisma.$disconnect());
}
