import { PrismaClient, Vendor as PrismaVendor } from '@prisma/client';

/**
 * How much each live job discounts a vendor's rating when choosing between
 * them. At 0.3 a 4.9-rated plumber already holding two jobs (4.3) loses to a
 * 4.5-rated plumber holding none, but still beats a 4.0 who is idle.
 */
const LOAD_PENALTY = 0.3;

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

  /**
   * Picks the vendor for a category, balancing rating against current load.
   *
   * Previously this took the highest-rated available vendor outright, so the
   * top plumber received every plumbing job however many were already open,
   * while activeJobsCount was tracked and never consulted. If nobody is marked
   * Available it now falls back to the least-loaded vendor in the category
   * rather than returning nothing and leaving the ticket undispatched.
   */
  async findBestForCategory(category: string): Promise<any | undefined> {
    const vendors = await this.prisma.vendor.findMany({
      where: { category, deletedAt: null },
    });

    if (vendors.length === 0) return undefined;

    const available = vendors.filter((v) => v.availability === 'Available');
    const pool = available.length > 0 ? available : vendors;

    return pool.reduce((best, candidate) =>
      this.dispatchScore(candidate) > this.dispatchScore(best) ? candidate : best
    );
  }

  private dispatchScore(vendor: PrismaVendor): number {
    return vendor.rating - vendor.activeJobsCount * LOAD_PENALTY;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.vendor.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
