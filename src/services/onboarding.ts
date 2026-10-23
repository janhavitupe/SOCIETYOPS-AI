import { prisma, unscopedPrisma } from '../database/prisma';
import { requireSocietyId } from '../requestContext';

/**
 * The setup wizard a new society goes through. Whether each step is done is
 * worked out from the society's data (a step is done when there are flats,
 * vendors...), never ticked by hand, so the checklist cannot drift from what
 * is really there. A step can be skipped for now and done later.
 */

export const ONBOARDING_STEPS = ['details', 'buildings', 'common_areas', 'staff', 'vendors', 'residents'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const isStep = (s: string | null | undefined): s is OnboardingStep => ONBOARDING_STEPS.includes(s as OnboardingStep);

export async function onboardingState() {
  const societyId = requireSocietyId();
  const society = await unscopedPrisma.society.findUniqueOrThrow({ where: { id: societyId } });

  const [flats, commonAreas, staff, staffInvites, vendors, residents, residentInvites] = await Promise.all([
    prisma.flat.count({ where: { deletedAt: null } }),
    prisma.commonArea.count({ where: { deletedAt: null } }),
    unscopedPrisma.membership.count({ where: { societyId, role: { in: ['manager', 'committee'] }, status: 'active' } }),
    prisma.invite.count({ where: { role: { in: ['manager', 'committee'] }, revokedAt: null } }),
    prisma.vendor.count({ where: { deletedAt: null } }),
    prisma.flatOccupant.count({ where: { status: 'active' } }),
    prisma.invite.count({ where: { role: 'resident', revokedAt: null } }),
  ]);

  const done: Record<OnboardingStep, boolean> = {
    details: !!(society.address.trim() && society.city.trim() && society.pinCode.trim()),
    buildings: flats > 0,
    common_areas: commonAreas > 0,
    staff: staff + staffInvites > 0,
    vendors: vendors > 0,
    residents: residents + residentInvites > 0,
  };
  const counts = { flats, commonAreas, staff, staffInvites, vendors, residents, residentInvites };

  const steps = ONBOARDING_STEPS.map((id) => ({
    id,
    done: done[id],
    skipped: !done[id] && society.onboardingSkipped.includes(id),
  }));
  const firstOpen = steps.find((s) => !s.done && !s.skipped)?.id ?? null;

  return {
    finished: society.status !== 'onboarding',
    /** Where to pick up: the step the admin was last on, unless it is now done. */
    current: isStep(society.onboardingStep) && !done[society.onboardingStep] ? society.onboardingStep : firstOpen,
    steps,
    completed: steps.filter((s) => s.done).length,
    counts,
    joinCode: society.joinCode,
  };
}

/** Remembers which step the admin is on, so they come back to it. */
export async function rememberStep(step: OnboardingStep) {
  await unscopedPrisma.society.update({ where: { id: requireSocietyId() }, data: { onboardingStep: step } });
}

export async function setSkipped(step: OnboardingStep, skipped: boolean) {
  const society = await unscopedPrisma.society.findUniqueOrThrow({ where: { id: requireSocietyId() } });
  const rest = society.onboardingSkipped.filter((s) => s !== step);
  await unscopedPrisma.society.update({
    where: { id: society.id },
    data: { onboardingSkipped: skipped ? [...rest, step] : rest },
  });
}

/** Ends the wizard; the society is live. Steps not done can still be done from their own pages. */
export async function finishOnboarding() {
  await unscopedPrisma.society.update({
    where: { id: requireSocietyId() },
    data: { status: 'active', onboardingStep: null },
  });
}
