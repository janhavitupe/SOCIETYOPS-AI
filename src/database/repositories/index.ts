import { prisma } from '../prisma';
import { TicketRepository } from './TicketRepository';
import { VendorRepository } from './VendorRepository';
import { NotificationRepository } from './NotificationRepository';
import { AgentLogRepository } from './AgentLogRepository';
import { SocietyProfileRepository } from './SocietyProfileRepository';
import { ChatMessageRepository } from './ChatMessageRepository';
import { MemberRepository } from './MemberRepository';

export const ticketRepo = new TicketRepository(prisma);
export const vendorRepo = new VendorRepository(prisma);
export const notificationRepo = new NotificationRepository(prisma);
export const agentLogRepo = new AgentLogRepository(prisma);
export const societyProfileRepo = new SocietyProfileRepository(prisma);
export const chatRepo = new ChatMessageRepository(prisma);
export const memberRepo = new MemberRepository(prisma);
