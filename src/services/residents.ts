import { prisma, unscopedPrisma } from '../database/prisma';
import { requireSocietyId } from '../requestContext';
import { APP_ORIGIN } from '../auth/auth';
import { sendNotification } from './notifications';

/**
 * The resident directory: everyone living in the society's flats, whether
 * they have started using the app, and asking those who have not.
 *
 * Someone a manager added or imported has an account but has never signed in;
 * signing in with the one-time code is what verifies their phone, so an
 * unverified phone means "not on the app yet".
 */

export type ResidentStatus = 'on_app' | 'not_joined' | 'moved_out';

export interface ResidentFilter {
  towerId?: string;
  status?: ResidentStatus | 'current' | 'all';
  query?: string;
}

/** Nobody is texted an invite more than once in this long. */
export const INVITE_COOLDOWN_HOURS = 24;

const naturally = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

export async function listResidents(filter: ResidentFilter) {
  const societyId = requireSocietyId();
  const occupants = await prisma.flatOccupant.findMany({
    // Join requests are not residents until a manager approves them.
    where: {
      status: { in: ['active', 'ended'] },
      flat: { deletedAt: null, ...(filter.towerId ? { towerId: filter.towerId } : {}) },
    },
    include: {
      flat: { select: { id: true, number: true, tower: { select: { id: true, name: true } } } },
      user: { select: { id: true, name: true, phoneNumber: true, phoneNumberVerified: true } },
    },
  });

  const userIds = [...new Set(occupants.map((o) => o.userId))];
  const [memberships, sessions] = await Promise.all([
    unscopedPrisma.membership.findMany({
      where: { societyId, role: 'resident', userId: { in: userIds } },
      select: { userId: true, lastInvitedAt: true },
    }),
    unscopedPrisma.session.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _max: { updatedAt: true } }),
  ]);
  const invitedAt = new Map(memberships.map((m) => [m.userId, m.lastInvitedAt]));
  const lastActive = new Map(sessions.map((s) => [s.userId, s._max.updatedAt]));

  const all = occupants.map((o) => {
    const status: ResidentStatus =
      o.status === 'ended' ? 'moved_out' : o.user.phoneNumberVerified ? 'on_app' : 'not_joined';
    return {
      occupantId: o.id,
      userId: o.userId,
      name: o.user.name,
      phone: o.user.phoneNumber,
      flat: { id: o.flat.id, number: o.flat.number },
      tower: o.flat.tower,
      type: o.type,
      status,
      moveInDate: o.moveInDate,
      moveOutDate: o.moveOutDate,
      lastInvitedAt: invitedAt.get(o.userId) ?? null,
      lastActiveAt: status === 'on_app' ? (lastActive.get(o.userId) ?? null) : null,
    };
  });

  const counts = {
    on_app: all.filter((r) => r.status === 'on_app').length,
    not_joined: all.filter((r) => r.status === 'not_joined').length,
    moved_out: all.filter((r) => r.status === 'moved_out').length,
  };

  const wanted = filter.status ?? 'current';
  const q = filter.query?.trim().toLowerCase();
  const digits = q?.replace(/[^0-9]/g, '');
  const residents = all
    .filter((r) => (wanted === 'all' ? true : wanted === 'current' ? r.status !== 'moved_out' : r.status === wanted))
    .filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.flat.number.toLowerCase().includes(q) ||
        (!!digits && digits.length >= 3 && !!r.phone?.includes(digits)),
    )
    .sort((a, b) => naturally(a.flat.number, b.flat.number) || a.name.localeCompare(b.name));

  return { counts, residents };
}

/**
 * Texts residents who are not on the app yet a link to sign in. Anyone already
 * on it, moved out, not a resident here, or texted in the last day is skipped,
 * with the reason.
 */
export async function inviteResidents(userIds: string[]) {
  const societyId = requireSocietyId();
  const society = await unscopedPrisma.society.findUniqueOrThrow({ where: { id: societyId }, select: { name: true } });
  const since = new Date(Date.now() - INVITE_COOLDOWN_HOURS * 60 * 60 * 1000);

  const sent: { userId: string; name: string }[] = [];
  const skipped: { userId: string; name: string; reason: string }[] = [];

  for (const userId of [...new Set(userIds)]) {
    const living = await prisma.flatOccupant.findFirst({
      where: { userId, status: 'active', flat: { deletedAt: null } },
      include: { user: true, flat: { select: { number: true } } },
    });
    const membership = await unscopedPrisma.membership.findUnique({
      where: { societyId_userId_role: { societyId, userId, role: 'resident' } },
    });
    if (!living || membership?.status !== 'active') {
      skipped.push({ userId, name: living?.user.name ?? 'Unknown', reason: 'Not a current resident' });
      continue;
    }
    const { user } = living;
    if (user.phoneNumberVerified) {
      skipped.push({ userId, name: user.name, reason: 'Already on the app' });
      continue;
    }
    if (!user.phoneNumber) {
      skipped.push({ userId, name: user.name, reason: 'No mobile number' });
      continue;
    }
    if (membership.lastInvitedAt && membership.lastInvitedAt > since) {
      skipped.push({ userId, name: user.name, reason: 'Invited in the last 24 hours' });
      continue;
    }

    const first = user.name.trim().split(/\s+/)[0] || 'there';
    await sendNotification({
      ticketId: null,
      recipientType: 'resident',
      recipientName: user.name,
      phone: user.phoneNumber,
      recipientUserId: user.id,
      message:
        `Namaste ${first}! ${society.name} now uses SocietyOps for maintenance complaints for flat ${living.flat.number}. ` +
        `Sign in with this mobile number, no password needed, we send a code: ${APP_ORIGIN}/login`,
    });
    await unscopedPrisma.membership.update({ where: { id: membership.id }, data: { lastInvitedAt: new Date() } });
    sent.push({ userId, name: user.name });
  }

  return { sent, skipped };
}
