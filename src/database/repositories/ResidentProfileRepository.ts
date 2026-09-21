import { PrismaClient, ResidentProfile as PrismaResident } from '@prisma/client';

export class ResidentProfileRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(): Promise<any[]> {
    return this.prisma.residentProfile.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<any | undefined> {
    return this.prisma.residentProfile.findFirst({ where: { id, deletedAt: null } });
  }

  async findByFlatAndPhone(flatNumber: string, phone: string): Promise<any | undefined> {
    return this.prisma.residentProfile.findFirst({
      where: { flatNumber, phone, deletedAt: null },
    });
  }

  async create(data: any): Promise<any> {
    return this.prisma.residentProfile.create({
      data: {
        ...data,
        createdAt: new Date().toISOString(),
        status: 'active',
        tokensGenerated: 0,
      },
    });
  }

  async issueAccessToken(profileId: string): Promise<any | undefined> {
    const resident = await this.prisma.residentProfile.findFirst({ where: { id: profileId, deletedAt: null } });
    if (!resident) return undefined;

    return this.prisma.residentProfile.update({
      where: { id: profileId },
      data: {
        accessToken: `TOK-${resident.role.toUpperCase()}-${Date.now().toString().slice(-4)}`,
        tokensGenerated: { increment: 1 },
        lastActiveAt: new Date().toISOString(),
      },
    });
  }

  async updateLastActive(residentId: string): Promise<void> {
    await this.prisma.residentProfile.update({
      where: { id: residentId },
      data: { lastActiveAt: new Date().toISOString() },
    });
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.residentProfile.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
