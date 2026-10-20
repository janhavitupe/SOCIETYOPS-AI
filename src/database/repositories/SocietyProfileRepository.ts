import { Prisma, PrismaClient } from '@prisma/client';

export class SocietyProfileRepository {
  constructor(private prisma: PrismaClient) {}

  async find(): Promise<any | null> {
    const profile = await this.prisma.societyProfile.findFirst();
    return profile;
  }

  /** Callers pass only validated, whitelisted fields (routes/schemas). */
  async update(updates: Prisma.SocietyProfileUpdateInput): Promise<any> {
    const existing = await this.prisma.societyProfile.findFirst();
    if (!existing) {
      const blank: Prisma.SocietyProfileCreateInput = {
        id: 'society-main',
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
        data: { ...blank, ...(updates as Partial<Prisma.SocietyProfileCreateInput>) },
      });
    }
    return this.prisma.societyProfile.update({ where: { id: existing.id }, data: updates });
  }
}
