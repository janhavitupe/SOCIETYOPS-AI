import { unscopedPrisma } from '../database/prisma';
import type { AuthSession } from './auth';

export const SOCIETY_ROLES = ['society_admin', 'manager', 'committee', 'resident'] as const;
export type SocietyRole = (typeof SOCIETY_ROLES)[number];

/** Higher outranks lower; the highest role is the one the UI routes by. */
const RANK: Record<SocietyRole, number> = { society_admin: 4, manager: 3, committee: 2, resident: 1 };

/** Run the society's tickets, workers and vendors. */
export const MANAGER_ROLES: SocietyRole[] = ['society_admin', 'manager'];
/** May read the whole society's tickets and reports (committee is read-only). */
export const STAFF_ROLES: SocietyRole[] = ['society_admin', 'manager', 'committee'];

/** Whoever is signed in, whether or not they belong to any society yet. */
export interface Identity {
  userId: string;
  name: string;
  phone: string | null;
  email: string;
  platformRole: string | null;
  sessionId: string;
}

/**
 * A signed-in person working inside one society: what every society route,
 * repository and agent tool authorises against.
 */
export interface Actor {
  /** The user's id. */
  id: string;
  name: string;
  phone: string | null;
  societyId: string;
  roles: SocietyRole[];
  /** The highest of roles. */
  role: SocietyRole;
  /** Flats the person currently occupies in this society. */
  flats: { id: string; number: string }[];
  /** The first occupied flat's number, for display and legacy ticket fields. */
  flatNumber: string;
}

export const highestRole = (roles: SocietyRole[]): SocietyRole =>
  roles.reduce((best, r) => (RANK[r] > RANK[best] ? r : best), 'resident' as SocietyRole);

export const isManager = (actor: Pick<Actor, 'roles'>) => actor.roles.some((r) => MANAGER_ROLES.includes(r));
export const isStaff = (actor: Pick<Actor, 'roles'>) => actor.roles.some((r) => STAFF_ROLES.includes(r));
export const isSocietyAdmin = (actor: Pick<Actor, 'roles'>) => actor.roles.includes('society_admin');

export function identityFrom(session: AuthSession): Identity {
  const user = session.user as AuthSession['user'] & { phoneNumber?: string | null; platformRole?: string | null };
  return {
    userId: user.id,
    name: user.name,
    phone: user.phoneNumber ?? null,
    email: user.email,
    platformRole: user.platformRole ?? null,
    sessionId: session.session.id,
  };
}

/**
 * Works out which society a session is in and what the person may do there.
 *
 * The session's activeSocietyId wins when the person is still an active member
 * there; otherwise their oldest active membership is used and remembered on the
 * session. Returns null for someone with no active membership anywhere.
 */
export async function resolveActor(identity: Identity, activeSocietyId?: string | null): Promise<Actor | null> {
  const memberships = await unscopedPrisma.membership.findMany({
    where: { userId: identity.userId, status: 'active', society: { status: { not: 'suspended' } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!memberships.length) return null;

  const societyId = memberships.some((m) => m.societyId === activeSocietyId)
    ? activeSocietyId!
    : memberships[0].societyId;

  if (societyId !== activeSocietyId) {
    await unscopedPrisma.session.update({ where: { id: identity.sessionId }, data: { activeSocietyId: societyId } });
  }

  const roles = memberships.filter((m) => m.societyId === societyId).map((m) => m.role as SocietyRole);

  const occupancies = await unscopedPrisma.flatOccupant.findMany({
    where: { userId: identity.userId, societyId, status: 'active', flat: { deletedAt: null } },
    select: { flat: { select: { id: true, number: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const flats = occupancies.map((o) => o.flat);

  return {
    id: identity.userId,
    name: identity.name,
    phone: identity.phone,
    societyId,
    roles,
    role: highestRole(roles),
    flats,
    flatNumber: flats[0]?.number ?? '',
  };
}

interface TicketLocation {
  flatId?: string | null;
  flatNumber?: string | null;
  residentId?: string | null;
}

/**
 * Whether the actor may see a ticket. Staff see the whole society; a resident
 * sees tickets for flats they occupy and tickets they reported themselves
 * (which covers their common-area reports).
 */
export function canSeeTicket(actor: Actor, ticket: TicketLocation): boolean {
  if (isStaff(actor)) return true;
  return ownsTicket(actor, ticket);
}

/**
 * Whether the actor may act on a ticket as its resident (escalate, close,
 * message). Managers may act on any ticket; committee members only on their own.
 */
export function canActOnTicket(actor: Actor, ticket: TicketLocation): boolean {
  if (isManager(actor)) return true;
  return ownsTicket(actor, ticket);
}

function ownsTicket(actor: Actor, ticket: TicketLocation): boolean {
  if (ticket.residentId && ticket.residentId === actor.id) return true;
  if (ticket.flatId) return actor.flats.some((f) => f.id === ticket.flatId);
  return false;
}
