import type { Db } from '../prisma';
import { requireSocietyId } from '../../requestContext';
export type ChatRole = 'user' | 'model';

export class ChatMessageRepository {
  constructor(private prisma: Db) {}

  /**
   * The most recent turns for a resident, oldest first so the result can be
   * handed straight to the model as conversation history.
   */
  async recent(residentId: string, limit = 10): Promise<{ role: ChatRole; text: string }[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { residentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.reverse().map((r) => ({ role: r.role === 'model' ? 'model' : 'user', text: r.text }));
  }

  async append(residentId: string, role: ChatRole, text: string, ticketId?: string): Promise<void> {
    await this.prisma.chatMessage.create({
      data: { societyId: requireSocietyId(), residentId, role, text, ticketId: ticketId ?? null },
    });
  }

  /** The conversation as the person saw it, oldest first, for showing again after a reload. */
  async history(residentId: string, limit = 60) {
    const rows = await this.prisma.chatMessage.findMany({
      where: { residentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, role: true, text: true, ticketId: true, createdAt: true },
    });
    return rows.reverse();
  }

  async clear(residentId: string): Promise<number> {
    const result = await this.prisma.chatMessage.deleteMany({ where: { residentId } });
    return result.count;
  }
}
