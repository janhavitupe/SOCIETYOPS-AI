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
