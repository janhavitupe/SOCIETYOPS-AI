import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { unscopedPrisma } from '../database/prisma';

/** How many societies one person may create, unless they run the platform. */
export const MAX_SOCIETIES_PER_CREATOR = 5;

/** No 0/O or 1/I/L, so a code read out over the phone survives. */
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join('');
}

export interface NewSociety {
  name: string;
  registrationNumber?: string;
  address: string;
  city: string;
  pinCode: string;
}

export class SocietyLimitError extends Error {
  constructor() {
    super(`You can set up at most ${MAX_SOCIETIES_PER_CREATOR} societies`);
    this.name = 'SocietyLimitError';
  }
}

/**
 * Creates a society with its creator as society admin, in one transaction.
 *
 * The society starts in "onboarding": the admin goes on to describe its
 * buildings and invite people. Its profile row is created too, so the screens
 * that read the profile have something to show from the start.
 */
export async function createSociety(
  creator: { userId: string; name: string; isPlatformAdmin: boolean },
  input: NewSociety,
) {
  // A clash on an 8-character code is vanishingly rare, but cheap to retry.
  // The retry wraps the whole transaction: Postgres aborts a transaction after
  // any failed statement, so retrying inside it cannot succeed.
  for (let attempt = 0; ; attempt++) {
    try {
      return await createSocietyOnce(creator, input);
    } catch (err) {
      const clash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target ?? '').includes('joinCode');
      if (!clash || attempt >= 3) throw err;
    }
  }
}

function createSocietyOnce(creator: { userId: string; name: string; isPlatformAdmin: boolean }, input: NewSociety) {
  return unscopedPrisma.$transaction(async (tx) => {
    if (!creator.isPlatformAdmin) {
      const owned = await tx.membership.count({ where: { userId: creator.userId, role: 'society_admin' } });
      if (owned >= MAX_SOCIETIES_PER_CREATOR) throw new SocietyLimitError();
    }

    return tx.society.create({
      data: {
        name: input.name,
        registrationNumber: input.registrationNumber || null,
        address: input.address,
        city: input.city,
        pinCode: input.pinCode,
        status: 'onboarding',
        onboardingStep: 'details',
        joinCode: generateJoinCode(),
        memberships: { create: { userId: creator.userId, role: 'society_admin', status: 'active' } },
        profile: {
          create: {
            id: crypto.randomUUID(),
            societyName: input.name,
            address: [input.address, input.city].filter(Boolean).join(', '),
            tagline: '',
            introText: '',
            maintenanceContact: creator.name,
            maintenancePhone: '',
            maintenanceEmail: '',
            highlights: [],
            lastUpdatedBy: creator.name,
          },
        },
      },
    });
  });
}
