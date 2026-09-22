import { PrismaClient, NotificationLog as PrismaNotification } from '@prisma/client';

export interface NotificationData {
  ticketId: string;
  recipientType: string;
  recipientName: string;
  phone: string;
  message: string;
  channel?: string;
  language?: string;
  status?: string;
  provider?: string;
  providerMessageId?: string;
  failureReason?: string;
}

export class NotificationRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(): Promise<any[]> {
    return this.prisma.notificationLog.findMany({
      where: { deletedAt: null },
      orderBy: { timestamp: 'desc' },
    });
  }

  async create(data: NotificationData): Promise<any> {
    return this.prisma.notificationLog.create({
      data: {
        ...data,
        channel: data.channel || 'WhatsApp',
        language: data.language || 'Hinglish',
        timestamp: new Date().toISOString(),
        // Defaults to Simulated rather than Sent: without a dispatch result
        // the honest claim is that the message was recorded, not delivered.
        status: data.status || 'Simulated',
      },
    });
  }

  async findByTicketId(ticketId: string): Promise<any[]> {
    return this.prisma.notificationLog.findMany({
      where: { ticketId, deletedAt: null },
      orderBy: { timestamp: 'desc' },
    });
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.notificationLog.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
