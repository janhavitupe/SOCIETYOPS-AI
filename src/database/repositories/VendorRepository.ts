import { PrismaClient, Vendor as PrismaVendor } from '@prisma/client';

export class VendorRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(): Promise<any[]> {
    return this.prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { rating: 'desc' },
    });
  }

  async findById(id: string): Promise<any | undefined> {
    return this.prisma.vendor.findFirst({ where: { id, deletedAt: null } });
  }

  async findBestForCategory(category: string): Promise<any | undefined> {
    const vendors = await this.prisma.vendor.findMany({
      where: { category, deletedAt: null, availability: 'Available' },
      orderBy: { rating: 'desc' },
      take: 1,
    });
    return vendors[0];
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.vendor.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
