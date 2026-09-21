import { PrismaClient, Ticket as PrismaTicket, TimelineEvent as PrismaTimelineEvent, Vendor, ResidentProfile } from '@prisma/client';

export interface TicketData {
  flatNumber: string;
  residentName: string;
  residentPhone?: string;
  issueCategory: string;
  description: string;
  urgency: string;
  images?: string[];
  residentId?: string;
  vendorId?: string;
}

export interface TimelineEventData {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  actor: string;
  type: string;
  ticketId: string;
}

function toTicket(t: PrismaTicket & { timeline: TimelineEventData[] }): any {
  return {
    ...t,
    timeline: t.timeline,
  };
}

export class TicketRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(): Promise<any[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: { deletedAt: null },
      include: { timeline: true },
      orderBy: { createdAt: 'desc' },
    });
    return tickets.map(toTicket);
  }

  async findById(id: string): Promise<any | undefined> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, deletedAt: null },
      include: { timeline: true },
    });
    return ticket ? toTicket(ticket) : undefined;
  }

  async create(data: TicketData): Promise<any> {
    const nextNum = 1043 + (await this.prisma.ticket.count()) - 4;
    const ticketId = `SOC-${nextNum}`;
    const now = new Date().toISOString();

    const ticket = await this.prisma.ticket.create({
      data: {
        id: ticketId,
        flatNumber: data.flatNumber || 'Unknown Flat',
        residentName: data.residentName || 'Resident',
        residentPhone: data.residentPhone || '+91 98000 00000',
        issueCategory: data.issueCategory,
        description: data.description,
        urgency: data.urgency,
        status: 'Open',
        images: data.images || [],
        societyName: 'Shree Ram Enclave, Powai',
        residentId: data.residentId,
        vendorId: data.vendorId,
        timeline: {
          create: {
            timestamp: now,
            title: 'Ticket Created',
            description: `Intake Agent registered complaint: "${data.description.substring(0, 80)}..."`,
            actor: 'Intake Agent',
            type: 'created',
          },
        },
      },
      include: { timeline: true },
    });

    return toTicket(ticket);
  }

  async update(id: string, updates: any): Promise<any | undefined> {
    const existing = await this.prisma.ticket.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: now,
        ...(updates.status === 'Resolved' || updates.status === 'Closed' ? { resolvedAt: now } : {}),
      },
      include: { timeline: true },
    });

    return toTicket(updated);
  }

  async assignVendor(ticketId: string, vendorId: string, estimatedEta: string = '30 mins'): Promise<any | undefined> {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, deletedAt: null } });
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });

    if (!ticket || !vendor) return undefined;

    const now = new Date().toISOString();
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
      include: { timeline: true },
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

    const now = new Date().toISOString();
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
      include: { timeline: true },
    });

    return toTicket(updated);
  }

  async search(query: string, category?: string, urgency?: string, status?: string, flatNumber?: string): Promise<any[]> {
    const where: any = { deletedAt: null };

    // Restricts the result to one flat. Callers pass this to stop a resident
    // reading other flats' tickets; it is ANDed with any keyword filter.
    if (flatNumber) where.flatNumber = flatNumber;

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
      include: { timeline: true },
      orderBy: { createdAt: 'desc' },
    });
    return tickets.map(toTicket);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.ticket.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
