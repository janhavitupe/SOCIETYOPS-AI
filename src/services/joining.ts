import crypto from 'crypto';
import { prisma, unscopedPrisma } from '../database/prisma';
import { requireSocietyId } from '../requestContext';
import type { SocietyRole } from '../auth/actor';
import { sendNotification } from './notifications';

/**
 * How people get into a society other than being added by a manager:
 * a resident asks to join with the society's join code, or someone opens a
 * personal invite sent to their phone.
 */

export const INVITE_DAYS = 14;

export type OccupantType = 'owner' | 'tenant' | 'family';

export class JoinError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'JoinError';
  }
}

/** An invite that can still be used: not accepted, revoked or expired. */
const usable = (now = new Date()) => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: now } });

/** Makes a membership active (or pending), reviving one ended earlier. */
export async function upsertMembership(
  societyId: string,
  userId: string,
  role: SocietyRole,
  status: 'active' | 'pending',
) {
  const existing = await unscopedPrisma.membership.findUnique({
    where: { societyId_userId_role: { societyId, userId, role } },
  });
  // Never demote an active membership to pending.
  if (existing?.status === 'active') return existing;
  return unscopedPrisma.membership.upsert({
    where: { societyId_userId_role: { societyId, userId, role } },
    create: { societyId, userId, role, status },
    update: { status },
  });
}

// --- Joining with the society's code ---

/** What someone with the join code may see: the society and its flats, never who lives in them. */
export async function societyForJoinCode(code: string) {
  const society = await unscopedPrisma.society.findUnique({
    where: { joinCode: code.toUpperCase() },
    select: { id: true, name: true, city: true, status: true },
  });
  if (!society || society.status === 'suspended') return null;

  const [towers, flats] = await Promise.all([
    unscopedPrisma.tower.findMany({
      where: { societyId: society.id, deletedAt: null },
      select: { id: true, name: true, kind: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    unscopedPrisma.flat.findMany({
      where: { societyId: society.id, deletedAt: null },
      select: { id: true, number: true, towerId: true },
    }),
  ]);
  flats.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));

  return { society: { id: society.id, name: society.name, city: society.city }, towers, flats };
}

/**
 * A request to live in a flat. It is approved at once when a manager has
 * already invited this phone to this flat; otherwise it waits for a manager.
 */
export async function requestToJoin(
  code: string,
  person: { userId: string; phone: string | null },
  input: { flatId: string; type: OccupantType },
) {
  const society = await unscopedPrisma.society.findUnique({ where: { joinCode: code.toUpperCase() } });
  if (!society || society.status === 'suspended') throw new JoinError(404, 'That join link is not valid');

  const flat = await unscopedPrisma.flat.findFirst({
    where: { id: input.flatId, societyId: society.id, deletedAt: null },
  });
  if (!flat) throw new JoinError(400, 'Choose a flat in this society');

  const existing = await unscopedPrisma.flatOccupant.findFirst({
    where: { flatId: flat.id, userId: person.userId, status: { in: ['active', 'pending'] } },
  });
  if (existing?.status === 'active') throw new JoinError(409, `You are already registered in ${flat.number}`);
  if (existing?.status === 'pending')
    throw new JoinError(409, `Your request for ${flat.number} is already waiting for approval`);

  const invite = person.phone
    ? await unscopedPrisma.invite.findFirst({
        where: { societyId: society.id, phone: person.phone, role: 'resident', flatId: flat.id, ...usable() },
      })
    : null;
  const status = invite ? 'active' : 'pending';

  const occupant = await unscopedPrisma.flatOccupant.create({
    data: {
      societyId: society.id,
      flatId: flat.id,
      userId: person.userId,
      type: invite?.occupantType ?? input.type,
      status,
      moveInDate: invite ? new Date() : null,
      approvedById: invite?.invitedById ?? null,
    },
  });
  await upsertMembership(society.id, person.userId, 'resident', status);
  if (invite) await unscopedPrisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

  return { occupant, society, flat, approved: !!invite };
}

/** The signed-in person's requests still waiting for a manager, in any society. */
export async function pendingRequestsFor(userId: string) {
  const rows = await unscopedPrisma.flatOccupant.findMany({
    where: { userId, status: 'pending' },
    include: { flat: { select: { number: true } }, society: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    society: r.society,
    flatNumber: r.flat.number,
    type: r.type,
    requestedAt: r.createdAt,
  }));
}

// --- Managers deciding on requests (inside the request's society) ---

export async function listJoinRequests() {
  return prisma.flatOccupant.findMany({
    where: { status: 'pending' },
    include: {
      flat: { select: { id: true, number: true } },
      user: { select: { id: true, name: true, phoneNumber: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Lets the person who asked know how it went. */
async function tellRequester(occupantId: string, approved: boolean) {
  const row = await prisma.flatOccupant.findFirst({
    where: { id: occupantId },
    include: { user: true, flat: { select: { number: true } } },
  });
  if (!row?.user.phoneNumber) return;
  const society = await unscopedPrisma.society.findUnique({ where: { id: row.societyId }, select: { name: true } });
  await sendNotification({
    ticketId: null,
    recipientType: 'resident',
    recipientName: row.user.name,
    phone: row.user.phoneNumber,
    recipientUserId: row.userId,
    message: approved
      ? `Your request to join flat ${row.flat.number} at ${society?.name ?? 'your society'} has been approved. Sign in to SocietyOps to report maintenance issues.`
      : `Your request to join flat ${row.flat.number} at ${society?.name ?? 'your society'} was not approved. Contact the society office if this is a mistake.`,
  });
}

export async function approveJoinRequest(occupantId: string, approvedById: string) {
  const request = await prisma.flatOccupant.findFirst({ where: { id: occupantId, status: 'pending' } });
  if (!request) throw new JoinError(404, 'Join request not found');

  const occupant = await prisma.flatOccupant.update({
    where: { id: request.id },
    data: { status: 'active', moveInDate: request.moveInDate ?? new Date(), approvedById },
  });
  await upsertMembership(requireSocietyId(), request.userId, 'resident', 'active');
  await tellRequester(occupant.id, true);
  return occupant;
}

export async function rejectJoinRequest(occupantId: string, decidedById: string) {
  const societyId = requireSocietyId();
  const request = await prisma.flatOccupant.findFirst({ where: { id: occupantId, status: 'pending' } });
  if (!request) throw new JoinError(404, 'Join request not found');

  const occupant = await prisma.flatOccupant.update({
    where: { id: request.id },
    data: { status: 'rejected', approvedById: decidedById },
  });

  // A membership that only existed for this request goes with it.
  const otherFlats = await prisma.flatOccupant.count({
    where: { userId: request.userId, status: { in: ['active', 'pending'] } },
  });
  if (!otherFlats) {
    await unscopedPrisma.membership.updateMany({
      where: { societyId, userId: request.userId, role: 'resident', status: 'pending' },
      data: { status: 'removed' },
    });
  }
  await tellRequester(occupant.id, false);
  return occupant;
}

// --- Invites ---

export interface NewInvite {
  phone: string;
  name?: string;
  role: SocietyRole;
  flatId?: string;
  occupantType?: OccupantType;
}

/** Society admins may invite anyone; managers may invite residents only. */
export function inviteRefusal(inviterRoles: SocietyRole[], role: SocietyRole): string | null {
  if (role === 'society_admin') return 'Society admins cannot be invited; make a member an admin instead';
  if (inviterRoles.includes('society_admin')) return null;
  if (role === 'resident' && inviterRoles.includes('manager')) return null;
  return 'Only the society admin can invite managers and committee members';
}

export async function createInvite(input: NewInvite, invitedById: string) {
  const societyId = requireSocietyId();

  if (input.role === 'resident') {
    if (!input.flatId) throw new JoinError(400, 'A resident invite needs a flat');
    const flat = await prisma.flat.findFirst({ where: { id: input.flatId, deletedAt: null } });
    if (!flat) throw new JoinError(400, 'That flat does not exist in this society');
  }

  // A fresh invite to the same person for the same thing replaces the old one.
  await prisma.invite.updateMany({
    where: { phone: input.phone, role: input.role, flatId: input.flatId ?? null, ...usable() },
    data: { revokedAt: new Date() },
  });

  return prisma.invite.create({
    data: {
      societyId,
      phone: input.phone,
      name: input.name ?? null,
      role: input.role,
      flatId: input.role === 'resident' ? input.flatId! : null,
      occupantType: input.role === 'resident' ? (input.occupantType ?? 'owner') : null,
      token: crypto.randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      invitedById,
    },
    include: { flat: { select: { number: true } } },
  });
}

export async function listInvites() {
  return prisma.invite.findMany({
    where: usable(),
    include: { flat: { select: { number: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeInvite(id: string) {
  const result = await prisma.invite.updateMany({ where: { id, ...usable() }, data: { revokedAt: new Date() } });
  if (!result.count) throw new JoinError(404, 'Invite not found');
}

/** "+91 98••• ••321": enough for the person to recognise their number. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  const last = digits.slice(-3);
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)}••• ••${last}`;
}

/** What an invite link shows before anyone signs in. Wrong, used and expired links all look the same. */
export async function describeInvite(token: string) {
  const invite = await unscopedPrisma.invite.findFirst({
    where: { token, ...usable() },
    include: { society: { select: { name: true, city: true } }, flat: { select: { number: true } } },
  });
  if (!invite) return null;
  return {
    society: invite.society,
    role: invite.role,
    flatNumber: invite.flat?.number ?? null,
    name: invite.name,
    phoneHint: maskPhone(invite.phone),
    expiresAt: invite.expiresAt,
  };
}

/**
 * Accepting an invite: only by the person whose phone it was sent to, which
 * they proved by signing in with that number.
 */
export async function acceptInvite(token: string, person: { userId: string; phone: string | null; name: string }) {
  const invite = await unscopedPrisma.invite.findFirst({ where: { token, ...usable() } });
  if (!invite) throw new JoinError(404, 'This invite link is not valid any more');
  if (person.phone !== invite.phone) {
    throw new JoinError(
      403,
      'This invite was sent to a different mobile number. Sign in with that number to accept it.',
    );
  }

  if (!person.name && invite.name) {
    await unscopedPrisma.user.update({ where: { id: person.userId }, data: { name: invite.name } });
  }

  await upsertMembership(invite.societyId, person.userId, invite.role as SocietyRole, 'active');

  if (invite.role === 'resident' && invite.flatId) {
    const already = await unscopedPrisma.flatOccupant.findFirst({
      where: { flatId: invite.flatId, userId: person.userId, status: { in: ['active', 'pending'] } },
    });
    if (already) {
      await unscopedPrisma.flatOccupant.update({
        where: { id: already.id },
        data: { status: 'active', moveInDate: already.moveInDate ?? new Date(), approvedById: invite.invitedById },
      });
    } else {
      await unscopedPrisma.flatOccupant.create({
        data: {
          societyId: invite.societyId,
          flatId: invite.flatId,
          userId: person.userId,
          type: invite.occupantType ?? 'owner',
          status: 'active',
          moveInDate: new Date(),
          approvedById: invite.invitedById,
        },
      });
    }
  }

  await unscopedPrisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  return { societyId: invite.societyId, role: invite.role };
}
