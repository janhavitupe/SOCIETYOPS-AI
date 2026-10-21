import crypto from 'crypto';
import type { Db } from '../prisma';
import { Prisma } from '@prisma/client';

export class SocietyProfileRepository {
  constructor(private prisma: Db) {}

  async find(): Promise<any | null> {
    const profile = await this.prisma.societyProfile.findFirst();
    return profile;
  }

  /** Callers pass only validated, whitelisted fields (routes/schemas). */
  async update(updates: Prisma.SocietyProfileUncheckedUpdateInput): Promise<any> {
    const existing = await this.prisma.societyProfile.findFirst();
    if (!existing) {
      const blank: Omit<Prisma.SocietyProfileUncheckedCreateInput, 'societyId'> = {
        id: crypto.randomUUID(),
        societyName: '',
        address: '',
        tagline: '',
        introText: '',
        maintenanceContact: '',
        maintenancePhone: '',
        maintenanceEmail: '',
        highlights: [],
        lastUpdatedBy: '',
      };
      return this.prisma.societyProfile.create({
        // societyId is added by the tenant scope.
        data: { ...blank, ...(updates as object) } as Prisma.SocietyProfileUncheckedCreateInput,
      });
    }
    return this.prisma.societyProfile.update({ where: { id: existing.id }, data: updates });
  }
}
