import { PrismaClient } from '@prisma/client';

export type ChatRole = 'user' | 'model';

export class ChatMessageRepository {
  constructor(private prisma: PrismaClient) {}

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

    return rows
      .reverse()
      .map((r) => ({ role: r.role === 'model' ? 'model' : 'user', text: r.text }));
  }

  async append(residentId: string, role: ChatRole, text: string): Promise<void> {
    await this.prisma.chatMessage.create({ data: { residentId, role, text } });
  }

  async clear(residentId: string): Promise<number> {
    const result = await this.prisma.chatMessage.deleteMany({ where: { residentId } });
    return result.count;
  }
}
