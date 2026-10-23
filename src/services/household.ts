import { prisma } from '../database/prisma';
import type { Actor } from '../auth/actor';
import { sendNotification } from './notifications';
import { approveJoinRequest, JoinError, rejectJoinRequest } from './joining';
import { moveOut } from './occupants';

/**
 * Owners looking after their own flat: approving family members who ask to
 * join it, and seeing and removing the people who live there. Family requests
 * used to wait for the society office like everyone else's.
 */

/** Flats in the current society that this person owns and lives in. */
async function ownedFlatIds(actor: Actor): Promise<string[]> {
  const owned = await prisma.flatOccupant.findMany({
    where: { userId: actor.id, type: 'owner', status: 'active', flat: { deletedAt: null } },
    select: { flatId: true },
  });
  return owned.map((o) => o.flatId);
}

/** The owner's flats, who lives in each, and family waiting to be let in. */
export async function myHousehold(actor: Actor) {
  const flatIds = await ownedFlatIds(actor);
  if (!flatIds.length) return { flats: [] };

  const flats = await prisma.flat.findMany({
    where: { id: { in: flatIds } },
    select: {
      id: true,
      number: true,
      occupants: {
        where: { status: { in: ['active', 'pending'] } },
        include: { user: { select: { id: true, name: true, phoneNumber: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return {
    flats: flats.map((f) => ({
      id: f.id,
      number: f.number,
      members: f.occupants
        .filter((o) => o.status === 'active')
        .map((o) => ({
          occupantId: o.id,
          name: o.user.name,
          phone: o.user.phoneNumber,
          type: o.type,
          isMe: o.userId === actor.id,
          moveInDate: o.moveInDate,
        })),
      requests: f.occupants
        .filter((o) => o.status === 'pending' && o.type === 'family')
        .map((o) => ({ occupantId: o.id, name: o.user.name, phone: o.user.phoneNumber, requestedAt: o.createdAt })),
    })),
  };
}

/** A family request on one of this owner's flats, or a 404 that reveals nothing. */
async function familyRequestFor(actor: Actor, occupantId: string) {
  const flatIds = await ownedFlatIds(actor);
  const request = await prisma.flatOccupant.findFirst({
    where: { id: occupantId, status: 'pending', type: 'family', flatId: { in: flatIds } },
  });
  if (!request) throw new JoinError(404, 'Request not found');
  return request;
}

export async function ownerApprove(actor: Actor, occupantId: string) {
  await familyRequestFor(actor, occupantId);
  return approveJoinRequest(occupantId, actor.id);
}

export async function ownerReject(actor: Actor, occupantId: string) {
  await familyRequestFor(actor, occupantId);
  return rejectJoinRequest(occupantId, actor.id);
}

/**
 * Removes a family member from the owner's flat. Owners and tenants are the
 * society office's to change, and nobody removes themselves this way.
 */
export async function removeFamilyMember(actor: Actor, occupantId: string) {
  const flatIds = await ownedFlatIds(actor);
  const member = await prisma.flatOccupant.findFirst({
    where: { id: occupantId, status: 'active', flatId: { in: flatIds } },
  });
  if (!member) throw new JoinError(404, 'Member not found');
  if (member.userId === actor.id) throw new JoinError(400, 'You cannot remove yourself');
  if (member.type !== 'family') {
    throw new JoinError(
      403,
      'Only family members can be removed here; ask the society office about owners and tenants',
    );
  }
  return moveOut(occupantId);
}

/**
 * Tells a flat's owners that a family member is waiting for them. Runs in the
 * flat's society, since the person asking is not a member of it yet.
 */
export async function tellOwnersOfFamilyRequest(flatId: string, flatNumber: string, requesterName: string) {
  const owners = await prisma.flatOccupant.findMany({
    where: { flatId, type: 'owner', status: 'active' },
    include: { user: { select: { id: true, name: true, phoneNumber: true } } },
  });
  for (const o of owners) {
    if (!o.user.phoneNumber) continue;
    await sendNotification({
      ticketId: null,
      recipientType: 'resident',
      recipientName: o.user.name,
      phone: o.user.phoneNumber,
      recipientUserId: o.user.id,
      message: `${requesterName} has asked to join flat ${flatNumber} as family. Open SocietyOps to approve or reject.`,
    });
  }
}
