import crypto from 'crypto';
import { unscopedPrisma } from '../database/prisma';
import { placeholderEmail } from '../auth/auth';
import { upsertMembership } from './joining';

/**
 * Every vendor has a login: the person with the vendor's phone number, who
 * signs in with an OTP to that phone and sees the vendor's jobs. The account
 * is made when a manager adds the vendor, so nobody has to invite them.
 *
 * One phone is one person, even when they work for vendors in several
 * societies; each society gives them a 'worker' membership of its own.
 */

/** The user for a phone, made (unverified, no password) when there is none. */
async function userForPhone(phone: string, name: string) {
  const existing = await unscopedPrisma.user.findUnique({ where: { phoneNumber: phone } });
  if (existing) return existing;
  return unscopedPrisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name,
      email: placeholderEmail(phone),
      emailVerified: false,
      phoneNumber: phone,
      phoneNumberVerified: false,
    },
  });
}

/**
 * Keeps a person's worker membership in a society in step with whether they
 * still work for any of its vendors.
 */
async function syncWorkerMembership(societyId: string, userId: string) {
  const vendors = await unscopedPrisma.vendor.count({ where: { societyId, userId, deletedAt: null } });
  if (vendors) {
    await upsertMembership(societyId, userId, 'worker', 'active');
  } else {
    await unscopedPrisma.membership.updateMany({
      where: { societyId, userId, role: 'worker', status: 'active' },
      data: { status: 'removed' },
    });
  }
}

/**
 * Links a vendor to the account for its phone, after it is added or its phone
 * changes. Whoever had the old number loses access to its jobs.
 */
export async function linkVendorAccount(vendor: { id: string; societyId: string; name: string; phone: string }) {
  const current = await unscopedPrisma.vendor.findUniqueOrThrow({ where: { id: vendor.id }, select: { userId: true } });
  const user = await userForPhone(vendor.phone, vendor.name);
  if (current.userId !== user.id) {
    await unscopedPrisma.vendor.update({ where: { id: vendor.id }, data: { userId: user.id } });
  }
  await syncWorkerMembership(vendor.societyId, user.id);
  if (current.userId && current.userId !== user.id) await syncWorkerMembership(vendor.societyId, current.userId);
  return user;
}

/** After a vendor is removed: their person stops seeing the society's jobs. */
export async function unlinkVendorAccount(vendor: { societyId: string; userId: string | null }) {
  if (vendor.userId) await syncWorkerMembership(vendor.societyId, vendor.userId);
}
