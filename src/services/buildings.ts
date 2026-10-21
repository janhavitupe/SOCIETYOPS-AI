import { prisma } from '../database/prisma';
import { requireSocietyId } from '../requestContext';

/** The most flats one generate request may create; a 30-storey, 8-a-floor tower is 240. */
export const MAX_GENERATED_FLATS = 2000;

export interface FlatPattern {
  /** Written before the floor and unit: "A" gives A-101. Defaults to the tower's name. */
  prefix: string;
  fromFloor: number;
  toFloor: number;
  perFloor: number;
  /** Between prefix and number; "" gives A101. */
  separator: string;
}

/**
 * Flat numbers for a pattern: floor, then a two-digit unit. Floor 0 is the
 * ground floor, written G (A-G01).
 */
export function flatNumbersFor(p: FlatPattern): { number: string; floor: number }[] {
  const out: { number: string; floor: number }[] = [];
  for (let floor = p.fromFloor; floor <= p.toFloor; floor++) {
    for (let unit = 1; unit <= p.perFloor; unit++) {
      const floorPart = floor === 0 ? 'G' : String(floor);
      const number = `${p.prefix}${p.prefix ? p.separator : ''}${floorPart}${String(unit).padStart(2, '0')}`;
      out.push({ number, floor });
    }
  }
  return out;
}

export interface GenerateResult {
  created: string[];
  /** Numbers that already existed in the society and were left alone. */
  skipped: string[];
}

/**
 * Creates the flats a pattern describes in one tower, skipping numbers the
 * society already has, so running it twice, or after adding a few flats by
 * hand, is safe. With dryRun nothing is written: it is the preview.
 */
export async function generateFlats(
  towerId: string,
  pattern: FlatPattern,
  defaults: { type?: string; parkingSlots?: number },
  dryRun: boolean,
): Promise<GenerateResult> {
  const wanted = flatNumbersFor(pattern);
  const existing = await prisma.flat.findMany({
    where: { number: { in: wanted.map((f) => f.number) }, deletedAt: null },
    select: { number: true },
  });
  const taken = new Set(existing.map((f) => f.number));
  const fresh = wanted.filter((f) => !taken.has(f.number));

  if (!dryRun && fresh.length) {
    await prisma.flat.createMany({
      data: fresh.map((f) => ({
        societyId: requireSocietyId(),
        towerId,
        number: f.number,
        floor: f.floor,
        type: defaults.type ?? null,
        parkingSlots: defaults.parkingSlots ?? 0,
      })),
      // A concurrent request may have created some of the same numbers.
      skipDuplicates: true,
    });
  }

  return { created: fresh.map((f) => f.number), skipped: [...taken] };
}
