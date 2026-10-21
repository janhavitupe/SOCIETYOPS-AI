import type { Db } from '../prisma';
import { requireSocietyId } from '../../requestContext';
export class AgentLogRepository {
  constructor(private prisma: Db) {}

  async findAll(): Promise<any[]> {
    return this.prisma.agentActivityLog.findMany({
      where: { deletedAt: null },
      orderBy: { timestamp: 'desc' },
    });
  }

  async create(data: { agentName: string; action: string; details: string; ticketId?: string }): Promise<any> {
    return this.prisma.agentActivityLog.create({
      data: { ...data, societyId: requireSocietyId() },
    });
  }

  async findByTicketId(ticketId: string): Promise<any[]> {
    return this.prisma.agentActivityLog.findMany({
      where: { ticketId, deletedAt: null },
      orderBy: { timestamp: 'desc' },
    });
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.agentActivityLog.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
