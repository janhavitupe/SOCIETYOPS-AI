import { prisma } from '../database/prisma';
import { isManager, type Actor } from '../auth/actor';

export interface LocationInput {
  flatId?: string;
  flatNumber?: string;
}

export type ResolvedLocation = { flatId: string | null; flatNumber: string } | { error: string };

/**
 * Where a new ticket is, decided from who is filing it.
 *
 * A resident files for a flat they occupy (the one they name, or their first),
 * never for someone else's. A manager may file for any flat in the society,
 * by id or number; a number that matches no flat is kept as a free-text
 * location ("Tower B lobby") until common areas are modelled.
 */
export async function resolveTicketLocation(actor: Actor, input: LocationInput): Promise<ResolvedLocation> {
  if (!isManager(actor)) {
    const flat = actor.flats.find((f) => f.id === input.flatId) ?? actor.flats[0];
    if (!flat) return { error: 'You need an approved flat in this society to report an issue' };
    return { flatId: flat.id, flatNumber: flat.number };
  }

  if (input.flatId) {
    const flat = await prisma.flat.findFirst({ where: { id: input.flatId, deletedAt: null } });
    if (!flat) return { error: 'That flat does not exist in this society' };
    return { flatId: flat.id, flatNumber: flat.number };
  }

  const number = input.flatNumber?.trim();
  if (!number) return { flatId: null, flatNumber: 'Not specified' };

  const flat = await prisma.flat.findFirst({
    where: { number: { equals: number, mode: 'insensitive' }, deletedAt: null },
  });
  return flat ? { flatId: flat.id, flatNumber: flat.number } : { flatId: null, flatNumber: number };
}
