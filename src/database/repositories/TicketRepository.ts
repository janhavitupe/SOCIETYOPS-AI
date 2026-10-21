import type { Db } from '../prisma';
import { requireSocietyId } from '../../requestContext';
import { Ticket as PrismaTicket } from '@prisma/client';
import { slaDueAt } from '../../services/sla';
import { resolveImageUrls } from '../../services/storage';

export interface TicketData {
  /** Display copy of the flat number, or a description of the place. */
  flatNumber: string;
  residentName: string;
  residentPhone?: string;
  issueCategory: string;
  description: string;
  urgency: string;
  images?: string[];
  residentId?: string;
  vendorId?: string;
  flatId?: string | null;
  commonAreaId?: string | null;
  assetId?: string | null;
}

/**
 * Restricts a ticket search to what one resident may see: tickets for the
 * flats they occupy, and tickets they reported themselves.
 */
export interface ResidentScope {
  flatIds: string[];
  residentId: string;
}

/** Timeline events oldest first; Postgres returns them in no fixed order otherwise. */
const TIMELINE_IN_ORDER = { timeline: { orderBy: { timestamp: 'asc' as const } } };

/** Statuses after which a vendor is no longer working the job. */
const FINISHED_STATUSES = ['Resolved', 'Closed'];

export interface TimelineEventData {
  id: string;
  timestamp: Date;
  title: string;
  description: string;
  actor: string;
  type: string;
  ticketId: string;
}

/** Stored image keys become signed URLs here, on the way out to any caller. */
async function toTicket(t: PrismaTicket & { timeline: TimelineEventData[] }): Promise<any> {
  return {
    ...t,
    images: await resolveImageUrls(t.images),
    timeline: t.timeline,
  };
}

export class TicketRepository {
  constructor(private prisma: Db) {}

  async findAll(): Promise<any[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: { deletedAt: null },
      include: TIMELINE_IN_ORDER,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(tickets.map(toTicket));
  }

  async findById(id: string): Promise<any | undefined> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, deletedAt: null },
      include: TIMELINE_IN_ORDER,
    });
    return ticket ? toTicket(ticket) : undefined;
  }

  /** The current society's name, copied onto each ticket for display. */
  private async societyName(): Promise<string> {
    const profile = await this.prisma.societyProfile.findFirst({ select: { societyName: true } });
    return profile?.societyName || '';
  }

  /**
   * Draws the next ticket number from a Postgres sequence.
   *
   * Replaces a count-based scheme that raced under concurrent inserts and
   * reissued numbers after a soft delete. The sequence is created by the
   * ticket_number_sequence migration; Prisma has no way to model a standalone
   * sequence in schema.prisma, so it lives in raw SQL.
   */
  private async nextTicketNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('ticket_number_seq')`;
    return rows[0].nextval.toString();
  }

  async create(data: TicketData): Promise<any> {
    const ticketId = `SOC-${await this.nextTicketNumber()}`;

    const ticket = await this.prisma.ticket.create({
      data: {
        id: ticketId,
        societyId: requireSocietyId(),
        flatNumber: data.flatNumber || 'Unknown Flat',
        residentName: data.residentName || 'Resident',
        residentPhone: data.residentPhone || '+91 98000 00000',
        issueCategory: data.issueCategory,
        description: data.description,
        urgency: data.urgency,
        status: 'Open',
        // Give the ticket a real deadline now, rather than inferring urgency
        // pressure later from status alone.
        slaDueAt: slaDueAt(data.urgency),
        images: data.images || [],
        societyName: await this.societyName(),
        residentId: data.residentId,
        vendorId: data.vendorId,
        flatId: data.flatId ?? null,
        commonAreaId: data.commonAreaId ?? null,
        assetId: data.assetId ?? null,
        timeline: {
          create: {
            title: 'Ticket Created',
            description: `Intake Agent registered complaint: "${data.description.substring(0, 80)}..."`,
            actor: 'Intake Agent',
            type: 'created',
          },
        },
      },
      include: TIMELINE_IN_ORDER,
    });

    return toTicket(ticket);
  }

  async update(id: string, updates: any): Promise<any | undefined> {
    const existing = await this.prisma.ticket.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return undefined;

    const now = new Date();
    const isFinishing = FINISHED_STATUSES.includes(updates.status) && !FINISHED_STATUSES.includes(existing.status);

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: now,
        ...(isFinishing ? { resolvedAt: now } : {}),
      },
      include: TIMELINE_IN_ORDER,
    });

    // Release the vendor. assignVendor incremented this counter and nothing
    // ever decremented it, so every vendor looked permanently busier than they
    // were and the figure was unusable for dispatch decisions.
    if (isFinishing && existing.assignedVendorId) {
      await this.releaseVendor(existing.assignedVendorId);
    }

    return toTicket(updated);
  }

  /** Decrements a vendor's live job count without letting it go negative. */
  private async releaseVendor(vendorId: string): Promise<void> {
    await this.prisma.vendor.updateMany({
      where: { id: vendorId, activeJobsCount: { gt: 0 } },
      data: { activeJobsCount: { decrement: 1 } },
    });
  }

  async assignVendor(ticketId: string, vendorId: string, estimatedEta: string = '30 mins'): Promise<any | undefined> {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, deletedAt: null } });
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });

    if (!ticket || !vendor) return undefined;

    const now = new Date();
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedVendorId: vendor.id,
        assignedVendorName: vendor.name,
        assignedVendorPhone: vendor.phone,
        estimatedEta,
        status: 'Vendor Assigned',
        updatedAt: now,
        vendorId: vendor.id,
        timeline: {
          create: {
            timestamp: now,
            title: 'Vendor Assigned',
            description: `Dispatcher Agent assigned ${vendor.name} (${vendor.rating} stars). ETA: ${estimatedEta}`,
            actor: 'Dispatcher Agent',
            type: 'assigned',
          },
        },
      },
      include: TIMELINE_IN_ORDER,
    });

    await this.prisma.vendor.update({
      where: { id: vendor.id },
      data: { activeJobsCount: { increment: 1 } },
    });

    return toTicket(updated);
  }

  async escalateTicket(ticketId: string, reason: string): Promise<any | undefined> {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, deletedAt: null } });
    if (!ticket) return undefined;

    const now = new Date();
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'Escalated',
        urgency: 'High',
        escalationReason: reason,
        updatedAt: now,
        timeline: {
          create: {
            timestamp: now,
            title: 'Ticket Escalated',
            description: `Follow-up Agent escalated ticket. Reason: ${reason}`,
            actor: 'Follow-up Agent',
            type: 'escalated',
          },
        },
      },
      include: TIMELINE_IN_ORDER,
    });

    return toTicket(updated);
  }

  async search(
    query: string,
    category?: string,
    urgency?: string,
    status?: string,
    residentScope?: ResidentScope,
  ): Promise<any[]> {
    const where: any = { deletedAt: null };

    // Stops a resident reading other flats' tickets; ANDed with any keyword filter.
    if (residentScope) {
      where.AND = [{ OR: [{ flatId: { in: residentScope.flatIds } }, { residentId: residentScope.residentId }] }];
    }

    if (query) {
      where.OR = [
        { id: { contains: query, mode: 'insensitive' } },
        { flatNumber: { contains: query, mode: 'insensitive' } },
        { residentName: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { assignedVendorName: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (category && category !== 'All') where.issueCategory = category;
    if (urgency && urgency !== 'All') where.urgency = urgency;
    if (status && status !== 'All') where.status = status;

    const tickets = await this.prisma.ticket.findMany({
      where,
      include: TIMELINE_IN_ORDER,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(tickets.map(toTicket));
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = await this.prisma.ticket.findFirst({ where: { id, deletedAt: null } });

    const result = await this.prisma.ticket.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // A deleted ticket is no longer work in progress. Without this the vendor
    // stays charged for it forever, which is how activeJobsCount drifted far
    // above the number of jobs actually open.
    if (result.count > 0 && existing?.assignedVendorId && !FINISHED_STATUSES.includes(existing.status)) {
      await this.releaseVendor(existing.assignedVendorId);
    }

    return result.count > 0;
  }
}
