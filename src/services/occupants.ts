import crypto from 'crypto';
import { prisma, unscopedPrisma } from '../database/prisma';
import { requireSocietyId } from '../requestContext';
import { placeholderEmail } from '../auth/auth';

export type OccupantType = 'owner' | 'tenant' | 'family';

export class OccupantError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OccupantError';
  }
}

export interface NewOccupant {
  name: string;
  /** Canonical (+91...), as routes/schemas produces. */
  phone: string;
  type: OccupantType;
  moveInDate?: Date;
}

/**
 * Puts a person in a flat, as a manager does when registering residents.
 *
 * One phone is one person across the whole platform: someone who already has
 * an account (in this society or another) keeps it and their name, and simply
 * gains this flat. Someone new gets an account with no password, which they
 * claim by signing in with a one-time code sent to that phone. Either way they
 * become an active resident member of the society.
 */
export async function addOccupant(flatId: string, input: NewOccupant, approvedById: string) {
  const societyId = requireSocietyId();

  const flat = await prisma.flat.findFirst({ where: { id: flatId, deletedAt: null } });
  if (!flat) throw new OccupantError(404, 'Flat not found');

  let user = await unscopedPrisma.user.findUnique({ where: { phoneNumber: input.phone } });
  const isNewAccount = !user;
  if (!user) {
    user = await unscopedPrisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: input.name,
        email: placeholderEmail(input.phone),
        phoneNumber: input.phone,
        phoneNumberVerified: false,
      },
    });
  }

  const alreadyHere = await prisma.flatOccupant.findFirst({
    where: { flatId, userId: user.id, status: { in: ['active', 'pending'] } },
  });
  if (alreadyHere?.status === 'active')
    throw new OccupantError(409, `${user.name} is already registered in ${flat.number}`);

  // Re-activates a resident membership ended by an earlier move-out.
  await unscopedPrisma.membership.upsert({
    where: { societyId_userId_role: { societyId, userId: user.id, role: 'resident' } },
    create: { societyId, userId: user.id, role: 'resident', status: 'active' },
    update: { status: 'active' },
  });

  // A manager adding someone who had asked to join this flat approves the request.
  const occupant = alreadyHere
    ? await prisma.flatOccupant.update({
        where: { id: alreadyHere.id },
        data: { type: input.type, status: 'active', moveInDate: input.moveInDate ?? new Date(), approvedById },
      })
    : await prisma.flatOccupant.create({
        data: {
          societyId,
          flatId,
          userId: user.id,
          type: input.type,
          status: 'active',
          moveInDate: input.moveInDate ?? new Date(),
          approvedById,
        },
      });

  return { occupant, user, isNewAccount };
}

/**
 * Ends an occupancy. The row stays, so the flat's history survives a change of
 * tenant. A person left with no flat in the society also loses their resident
 * membership, which ends their access immediately: every request re-reads it.
 */
export async function moveOut(occupantId: string, moveOutDate: Date = new Date()) {
  const societyId = requireSocietyId();

  const occupant = await prisma.flatOccupant.findFirst({
    where: { id: occupantId, status: { in: ['active', 'pending'] } },
  });
  if (!occupant) throw new OccupantError(404, 'Occupant not found');

  const ended = await prisma.flatOccupant.update({
    where: { id: occupantId },
    data: { status: 'ended', moveOutDate },
  });

  const elsewhere = await prisma.flatOccupant.count({
    where: { userId: occupant.userId, status: { in: ['active', 'pending'] } },
  });
  if (elsewhere === 0) {
    await unscopedPrisma.membership.updateMany({
      where: { societyId, userId: occupant.userId, role: 'resident' },
      data: { status: 'removed' },
    });
  }

  return ended;
}
