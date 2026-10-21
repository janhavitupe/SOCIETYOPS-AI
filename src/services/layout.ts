import { prisma } from '../database/prisma';

/**
 * The society's layout as the agent sees it: towers, common areas and the
 * assets in them, so "the lift in my wing" or "lift B2 stuck" can be pinned to
 * the right place.
 */

export interface Layout {
  towers: { id: string; name: string }[];
  commonAreas: { id: string; name: string; kind: string; towerId: string | null }[];
  assets: { id: string; name: string; kind: string; commonAreaId: string | null; towerId: string | null }[];
}

/** Bounds the prompt for a very large society; the rest can still be named by a manager. */
const MAX_PLACES = 80;

export async function societyLayout(): Promise<Layout> {
  const [towers, commonAreas, assets] = await Promise.all([
    prisma.tower.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.commonArea.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, kind: true, towerId: true },
      take: MAX_PLACES,
    }),
    prisma.asset.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, kind: true, commonAreaId: true, towerId: true },
      take: MAX_PLACES,
    }),
  ]);
  return { towers, commonAreas, assets };
}

/** The layout as prompt lines, with ids the model passes to create_ticket. */
export function describeLayout(layout: Layout): string[] {
  const tower = (id: string | null) => layout.towers.find((t) => t.id === id)?.name;
  const area = (id: string | null) => layout.commonAreas.find((a) => a.id === id)?.name;

  const lines = [`  towers: ${layout.towers.map((t) => t.name).join(', ') || 'none'}`];
  lines.push('  common areas (id: name):');
  for (const a of layout.commonAreas) {
    lines.push(`    ${a.id}: ${a.name} [${a.kind}${a.towerId ? `, tower ${tower(a.towerId)}` : ''}]`);
  }
  if (!layout.commonAreas.length) lines.push('    none');
  lines.push('  assets (id: name):');
  for (const a of layout.assets) {
    const where = [a.commonAreaId && `in ${area(a.commonAreaId)}`, a.towerId && `tower ${tower(a.towerId)}`].filter(
      Boolean,
    );
    lines.push(`    ${a.id}: ${a.name} [${a.kind}${where.length ? `, ${where.join(', ')}` : ''}]`);
  }
  if (!layout.assets.length) lines.push('    none');
  return lines;
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The asset or common area a message names, by its name appearing in the
 * text ("Lift B2 is stuck" names "Lift B2"). Longer names win, so "Tower B
 * Lobby" beats "Lobby". Used when the model is unavailable.
 */
export function placeInText(text: string, layout: Layout): { assetId?: string; commonAreaId?: string; kind?: string } {
  const haystack = ` ${squash(text)} `;
  const mentions = (name: string) => haystack.includes(` ${squash(name)} `);
  const byLength = <T extends { name: string }>(xs: T[]) => [...xs].sort((a, b) => b.name.length - a.name.length);

  const asset = byLength(layout.assets).find((a) => mentions(a.name));
  if (asset) return { assetId: asset.id, kind: asset.kind };
  const area = byLength(layout.commonAreas).find((a) => mentions(a.name));
  if (area) return { commonAreaId: area.id, kind: area.kind };
  return {};
}

/** The trade an asset's problems belong to, when the words alone do not say. */
export const CATEGORY_FOR_ASSET: Record<string, string> = {
  lift: 'Lift & Elevator',
  water_pump: 'Plumbing',
  dg_set: 'Electrical',
  fire_panel: 'Electrical',
  cctv: 'Security & Intercom',
};
