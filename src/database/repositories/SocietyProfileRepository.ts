import { PrismaClient, SocietyProfile as PrismaProfile } from '@prisma/client';

export class SocietyProfileRepository {
  constructor(private prisma: PrismaClient) {}

  async find(): Promise<any | null> {
    const profile = await this.prisma.societyProfile.findFirst();
    return profile;
  }

  async update(updates: any): Promise<any> {
    const existing = await this.prisma.societyProfile.findFirst();
    if (!existing) {
      return this.prisma.societyProfile.create({ data: { ...updates, updatedAt: new Date().toISOString() } });
    }
    return this.prisma.societyProfile.update({
      where: { id: existing.id },
      data: { ...updates, updatedAt: new Date().toISOString() },
    });
  }
}
