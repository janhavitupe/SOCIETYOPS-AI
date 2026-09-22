import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { executeToolCall, type ToolActor } from '../src/tools/maintenanceTools';
import { ticketRepo } from '../src/database/repositories';
import { deleteTickets } from './helpers';
import { prisma } from '../src/database/prisma';

/**
 * These exercise the authorisation the agent runs under.
 *
 * /api/chat is only requireAuth: once past it, whatever the model decides to
 * call reaches the repositories. Since the model's prompt contains the
 * resident's own text, a prompt injection is a privilege-escalation attempt,
 * and these are the checks that stop it.
 */

const resident: ToolActor = {
  id: 'RES-001',
  name: 'Vikram Mehta',
  flatNumber: 'B-402',
  role: 'resident',
};

const manager: ToolActor = {
  id: 'RES-003',
  name: 'Mr. Arvind Sharma',
  flatNumber: 'Maintenance Office',
  role: 'maintenance',
};

const created: string[] = [];
let foreignTicketId: string;

async function makeTicket(actor: ToolActor, args: Record<string, unknown>) {
  const result: any = await executeToolCall('create_ticket', args, actor);
  if (result?.ticket?.id) created.push(result.ticket.id);
  return result;
}

beforeAll(async () => {
  const foreign = await makeTicket(manager, {
    flatNumber: 'A-305',
    issueCategory: 'Electrical',
    description: 'Belongs to another flat',
    urgency: 'Low',
  });
  foreignTicketId = foreign.ticket.id;
});

afterAll(async () => {
  if (created.length) {
    await deleteTickets(created);
  }
  await prisma.$disconnect();
});

describe('create_ticket', () => {
  it('pins a resident to their own flat even when the model asks for another', async () => {
    const result: any = await makeTicket(resident, {
      flatNumber: 'A-101',
      residentName: 'Someone Else',
      issueCategory: 'Plumbing',
      description: 'Injected flat number',
      urgency: 'Low',
    });

    expect(result.success).toBe(true);
    expect(result.ticket.flatNumber).toBe('B-402');
    expect(result.ticket.residentName).toBe('Vikram Mehta');
    expect(result.ticket.residentId).toBe('RES-001');
  });

  it('lets a manager file for another flat', async () => {
    const result: any = await makeTicket(manager, {
      flatNumber: 'A-101',
      issueCategory: 'Plumbing',
      description: 'Filed on behalf',
      urgency: 'Low',
    });
    expect(result.ticket.flatNumber).toBe('A-101');
  });
});

describe('reading other flats', () => {
  it('refuses get_ticket for a ticket outside the resident flat', async () => {
    const result: any = await executeToolCall('get_ticket', { ticketId: foreignTicketId }, resident);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/do not have access/i);
  });

  it('allows a manager get_ticket on any flat', async () => {
    const result: any = await executeToolCall('get_ticket', { ticketId: foreignTicketId }, manager);
    expect(result.success).toBe(true);
    expect(result.ticket.flatNumber).toBe('A-305');
  });

  it('scopes search_ticket to the resident own flat', async () => {
    const result: any = await executeToolCall('search_ticket', { query: '' }, resident);
    expect(result.success).toBe(true);
    expect(result.tickets.length).toBeGreaterThan(0);
    for (const t of result.tickets) {
      expect(t.flatNumber).toBe('B-402');
    }
  });

  it('does not scope search_ticket for a manager', async () => {
    const result: any = await executeToolCall('search_ticket', { query: '' }, manager);
    const flats = new Set(result.tickets.map((t: any) => t.flatNumber));
    expect(flats.size).toBeGreaterThan(1);
  });
});

describe('writing to other flats', () => {
  it('refuses close_ticket on another flat', async () => {
    const result: any = await executeToolCall('close_ticket', { ticketId: foreignTicketId }, resident);
    expect(result.success).toBe(false);

    const untouched = await ticketRepo.findById(foreignTicketId);
    expect(untouched.status).not.toBe('Closed');
  });

  it('refuses escalate_ticket on another flat', async () => {
    const result: any = await executeToolCall(
      'escalate_ticket',
      { ticketId: foreignTicketId, reason: 'injected' },
      resident
    );
    expect(result.success).toBe(false);

    const untouched = await ticketRepo.findById(foreignTicketId);
    expect(untouched.status).not.toBe('Escalated');
  });

  it('refuses notify_resident on another flat', async () => {
    const result: any = await executeToolCall(
      'notify_resident',
      { ticketId: foreignTicketId, message: 'leaked' },
      resident
    );
    expect(result.success).toBe(false);
  });

  it('lets a resident close their own ticket', async () => {
    const own: any = await makeTicket(resident, {
      issueCategory: 'Plumbing',
      description: 'Mine to close',
      urgency: 'Low',
    });

    const result: any = await executeToolCall('close_ticket', { ticketId: own.ticket.id }, resident);
    expect(result.success).toBe(true);
    expect(result.ticket.status).toBe('Closed');
  });
});

describe('manager-only tools', () => {
  it.each(['update_ticket', 'assign_vendor', 'generate_daily_report', 'notify_vendor'])(
    'refuses %s for a resident',
    async (tool) => {
      const result: any = await executeToolCall(
        tool,
        { ticketId: foreignTicketId, vendorId: 'VND-01', status: 'Closed', message: 'x' },
        resident
      );
      expect(result.success).toBe(false);
    }
  );

  it('allows generate_daily_report for a manager', async () => {
    const result: any = await executeToolCall('generate_daily_report', {}, manager);
    expect(result.success).toBe(true);
    expect(result.report.totalTickets).toBeGreaterThan(0);
  });
});

describe('unknown tools', () => {
  it('reports an unknown tool rather than throwing', async () => {
    const result: any = await executeToolCall('drop_database', {}, manager);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown tool/i);
  });

  it('refuses a ticket tool with no id', async () => {
    const result: any = await executeToolCall('get_ticket', {}, resident);
    expect(result.success).toBe(false);
  });

  it('refuses a ticket tool for an id that does not exist', async () => {
    const result: any = await executeToolCall('get_ticket', { ticketId: 'SOC-nope' }, resident);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});
