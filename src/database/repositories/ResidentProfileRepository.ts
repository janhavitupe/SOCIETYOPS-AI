import { PrismaClient } from '@prisma/client';

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

  /** phone must already be canonical (services/phone); the flat matches case-insensitively. */
  async findByFlatAndPhone(flatNumber: string, phone: string): Promise<any | undefined> {
    return this.prisma.residentProfile.findFirst({
      where: { flatNumber: { equals: flatNumber.trim(), mode: 'insensitive' }, phone, deletedAt: null },
    });
  }

  async create(data: any): Promise<any> {
    return this.prisma.residentProfile.create({
      data: {
        ...data,
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
        lastActiveAt: new Date(),
      },
    });
  }

  async updateLastActive(residentId: string): Promise<void> {
    await this.prisma.residentProfile.update({
      where: { id: residentId },
      data: { lastActiveAt: new Date() },
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
