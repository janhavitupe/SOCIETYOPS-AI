import type { Db } from '../prisma';
import { OPEN_WORK_STATUSES } from '../../services/dispatch';

/** Whether a vendor is working at all; the manager sets this. */
export const isOnDuty = (vendor: { availability: string }) => vendor.availability !== 'Offline';

/**
 * What a vendor is doing right now, worked out from their open tickets: Busy
 * while they have jobs, Available when they have none, Offline when off duty.
 * It used to be a label a manager set by hand, which nothing updated as jobs
 * were assigned and finished.
 */
export type VendorStatus = 'Available' | 'Busy' | 'Offline';

export class VendorRepository {
  constructor(private prisma: Db) {}

  async findAll(): Promise<any[]> {
    const vendors = await this.prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { rating: 'desc' },
    });
    return this.withLiveStatus(vendors);
  }

  async findById(id: string): Promise<any | undefined> {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, deletedAt: null } });
    return vendor ? (await this.withLiveStatus([vendor]))[0] : null;
  }

  /**
   * Adds status and the real number of open jobs. activeJobsCount is replaced
   * by that count in what callers see, since the stored counter can drift.
   */
  private async withLiveStatus<T extends { id: string; availability: string }>(vendors: T[]) {
    const open = await this.openJobCounts(vendors.map((v) => v.id));
    return vendors.map((v) => {
      const openJobs = open.get(v.id) ?? 0;
      const status: VendorStatus = !isOnDuty(v) ? 'Offline' : openJobs > 0 ? 'Busy' : 'Available';
      return { ...v, status, openJobs, activeJobsCount: openJobs };
    });
  }

  /**
   * Picks the vendor for a category: the available one with the shortest
   * queue, and among equally busy ones the best rated.
   *
   * This used to be rating minus a penalty per job, so a 4.9-rated plumber
   * with a job in hand beat an idle 4.0 one, and residents waited while a
   * plumber sat free. It now matches the rule services/rebalance uses to move
   * waiting jobs, so a new ticket is never placed where a rebalance would
   * immediately move it. Queues are counted from open tickets, not the
   * activeJobsCount counter, which can drift.
   *
   * If nobody is marked Available it falls back to the least-loaded vendor in
   * the category rather than leaving the ticket undispatched. Vendors in
   * `excluding` (who turned the job down) are never chosen.
   */
  async findBestForCategory(category: string, excluding: string[] = []): Promise<any | undefined> {
    const vendors = await this.prisma.vendor.findMany({
      where: { category, deletedAt: null, id: { notIn: excluding } },
    });

    if (vendors.length === 0) return undefined;

    // Busy vendors are eligible too: the shortest queue wins, which is an idle
    // vendor whenever there is one.
    const onDuty = vendors.filter(isOnDuty);
    const pool = onDuty.length > 0 ? onDuty : vendors;

    const queues = await this.openJobCounts(pool.map((v) => v.id));
    return [...pool].sort((a, b) => (queues.get(a.id) ?? 0) - (queues.get(b.id) ?? 0) || b.rating - a.rating)[0];
  }

  /** Open jobs per vendor, from the tickets themselves. */
  async openJobCounts(vendorIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.ticket.groupBy({
      by: ['assignedVendorId'],
      where: { assignedVendorId: { in: vendorIds }, status: { in: OPEN_WORK_STATUSES }, deletedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.assignedVendorId!, r._count._all]));
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.vendor.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
