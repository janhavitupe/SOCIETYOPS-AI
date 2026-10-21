import type { Db } from '../prisma';
import { unscopedPrisma } from '../prisma';
import { requireSocietyId } from '../../requestContext';
import { highestRole, type SocietyRole } from '../../auth/actor';

export interface DirectoryEntry {
  id: string;
  name: string;
  phone: string | null;
  roles: SocietyRole[];
  role: SocietyRole;
  /** Flat numbers the person occupies or has asked to. */
  flats: string[];
  flatNumber: string;
  /** The membership's status: invited | pending | active. */
  status: string;
  createdAt: Date;
}

/**
 * The people in the current society. Membership is not a tenant-scoped model
 * (the society switcher reads it across societies), so this filters by the
 * request's society explicitly.
 */
export class MemberRepository {
  constructor(private prisma: Db) {}

  async directory(): Promise<DirectoryEntry[]> {
    const societyId = requireSocietyId();

    const memberships = await unscopedPrisma.membership.findMany({
      where: { societyId, status: { not: 'removed' } },
      include: { user: { select: { id: true, name: true, phoneNumber: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const occupancies = await this.prisma.flatOccupant.findMany({
      where: { status: { in: ['active', 'pending'] } },
      select: { userId: true, flat: { select: { number: true } } },
    });

    const byUser = new Map<string, DirectoryEntry>();
    for (const m of memberships) {
      const entry = byUser.get(m.userId) ?? {
        id: m.userId,
        name: m.user.name,
        phone: m.user.phoneNumber,
        roles: [],
        role: 'resident' as SocietyRole,
        flats: occupancies.filter((o) => o.userId === m.userId).map((o) => o.flat.number),
        flatNumber: '',
        status: m.status,
        createdAt: m.createdAt,
      };
      entry.roles.push(m.role as SocietyRole);
      // Active wins over pending or invited when a person holds several roles.
      if (m.status === 'active') entry.status = 'active';
      byUser.set(m.userId, entry);
    }

    return [...byUser.values()].map((e) => ({ ...e, role: highestRole(e.roles), flatNumber: e.flats.join(', ') }));
  }
}
