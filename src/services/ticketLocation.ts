import { prisma } from '../database/prisma';
import { isManager, type Actor } from '../auth/actor';

export interface LocationInput {
  flatId?: string;
  flatNumber?: string;
  commonAreaId?: string;
  assetId?: string;
}

export interface Location {
  flatId: string | null;
  commonAreaId: string | null;
  assetId: string | null;
  /** What the ticket shows as its place: "B-402", or "Lift B2, Tower B Lobby". */
  flatNumber: string;
  /** The vendor on the asset's maintenance contract, who should get the job first. */
  amcVendorId: string | null;
}

export type ResolvedLocation = Location | { error: string };

const flatAt = (flat: { id: string; number: string }): Location => ({
  flatId: flat.id,
  commonAreaId: null,
  assetId: null,
  flatNumber: flat.number,
  amcVendorId: null,
});

async function assetAt(where: object): Promise<Location | null> {
  const asset = await prisma.asset.findFirst({
    where: { deletedAt: null, ...where },
    include: { commonArea: { select: { name: true, deletedAt: true } } },
  });
  if (!asset) return null;
  const area = asset.commonArea && !asset.commonArea.deletedAt ? asset.commonArea.name : null;
  return {
    flatId: null,
    commonAreaId: area ? asset.commonAreaId : null,
    assetId: asset.id,
    flatNumber: area ? `${asset.name}, ${area}` : asset.name,
    amcVendorId: asset.amcVendorId,
  };
}

async function commonAreaAt(where: object): Promise<Location | null> {
  const area = await prisma.commonArea.findFirst({ where: { deletedAt: null, ...where } });
  if (!area) return null;
  return { flatId: null, commonAreaId: area.id, assetId: null, flatNumber: area.name, amcVendorId: null };
}

/**
 * Where a new ticket is, decided from who is filing it. Every ticket points at
 * a flat, a common area, or an asset; free-text places ("near the gate") used
 * to be kept as typed, so nothing could tell two reports of the same lift apart.
 *
 * Anyone in the society may report a common area or asset. A resident files
 * for a flat they occupy (the one they name, or their first), never someone
 * else's. A manager may file for any flat, and may name the place in words:
 * a flat number, or a common area's or asset's name.
 */
export async function resolveTicketLocation(actor: Actor, input: LocationInput): Promise<ResolvedLocation> {
  if (input.assetId) {
    return (await assetAt({ id: input.assetId })) ?? { error: 'That asset does not exist in this society' };
  }
  if (input.commonAreaId) {
    return (
      (await commonAreaAt({ id: input.commonAreaId })) ?? { error: 'That common area does not exist in this society' }
    );
  }

  if (!isManager(actor)) {
    const flat = actor.flats.find((f) => f.id === input.flatId) ?? actor.flats[0];
    if (!flat) return { error: 'You need an approved flat in this society to report an issue in a flat' };
    return flatAt(flat);
  }

  if (input.flatId) {
    const flat = await prisma.flat.findFirst({ where: { id: input.flatId, deletedAt: null } });
    if (!flat) return { error: 'That flat does not exist in this society' };
    return flatAt(flat);
  }

  const name = input.flatNumber?.trim();
  if (!name) {
    if (actor.flats[0]) return flatAt(actor.flats[0]);
    return { error: 'Say which flat, common area or asset this is about' };
  }

  const named = { equals: name, mode: 'insensitive' as const };
  const flat = await prisma.flat.findFirst({ where: { number: named, deletedAt: null } });
  if (flat) return flatAt(flat);
  return (
    (await commonAreaAt({ name: named })) ??
    (await assetAt({ name: named })) ?? { error: `There is no flat, common area or asset called "${name}"` }
  );
}
