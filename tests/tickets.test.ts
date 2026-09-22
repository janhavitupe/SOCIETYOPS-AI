import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, ACCOUNTS, type Agent } from './helpers';
import { prisma } from '../src/database/prisma';

let api: Agent;
let residentToken: string;
let maintenanceToken: string;

/** Tickets created by this suite, removed again in afterAll. */
const created: string[] = [];

async function createTicket(token: string, body: Record<string, unknown>) {
  const res = await api.post('/api/tickets').set(bearer(token)).send(body);
  if (res.body?.id) created.push(res.body.id);
  return res;
}

beforeAll(async () => {
  api = await agent();
  residentToken = await login(ACCOUNTS.resident);
  maintenanceToken = await login(ACCOUNTS.maintenance);
});

afterAll(async () => {
  if (created.length) {
    await prisma.ticket.deleteMany({ where: { id: { in: created } } });
  }
  await prisma.$disconnect();
});

describe('ticket visibility', () => {
  it('shows a resident only their own flat', async () => {
    const res = await api.get('/api/tickets').set(bearer(residentToken));
    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBeGreaterThan(0);
    for (const t of res.body.tickets) {
      expect(t.flatNumber).toBe('B-402');
    }
  });

  it('shows maintenance staff more than one flat', async () => {
    const res = await api.get('/api/tickets').set(bearer(maintenanceToken));
    expect(res.status).toBe(200);
    const flats = new Set(res.body.tickets.map((t: any) => t.flatNumber));
    expect(flats.size).toBeGreaterThan(1);
  });

  it('does not let a keyword search widen a resident past their flat', async () => {
    // "a" matches descriptions across the society; the flat scope is ANDed on.
    const res = await api.get('/api/tickets?query=a').set(bearer(residentToken));
    expect(res.status).toBe(200);
    for (const t of res.body.tickets) {
      expect(t.flatNumber).toBe('B-402');
    }
  });

  it('refuses a resident reading another flat by id', async () => {
    const all = await api.get('/api/tickets').set(bearer(maintenanceToken));
    const foreign = all.body.tickets.find((t: any) => t.flatNumber !== 'B-402');
    expect(foreign).toBeTruthy();

    const res = await api.get(`/api/tickets/${foreign.id}`).set(bearer(residentToken));
    expect(res.status).toBe(403);
  });

  it('lets a manager read any flat by id', async () => {
    const all = await api.get('/api/tickets').set(bearer(maintenanceToken));
    const foreign = all.body.tickets.find((t: any) => t.flatNumber !== 'B-402');
    const res = await api.get(`/api/tickets/${foreign.id}`).set(bearer(maintenanceToken));
    expect(res.status).toBe(200);
  });

  it('returns 404 for a ticket that does not exist', async () => {
    const res = await api.get('/api/tickets/SOC-nope').set(bearer(maintenanceToken));
    expect(res.status).toBe(404);
  });
});

describe('ticket creation', () => {
  it('pins a resident to their own flat, ignoring the body', async () => {
    const res = await createTicket(residentToken, {
      issueCategory: 'Plumbing',
      description: 'Kitchen tap dripping',
      urgency: 'Low',
      flatNumber: 'A-101',
      residentName: 'Somebody Else',
    });

    expect(res.status).toBe(201);
    expect(res.body.flatNumber).toBe('B-402');
    expect(res.body.residentName).toBe('Vikram Mehta');
  });

  it('links the ticket to the resident who filed it', async () => {
    const res = await createTicket(residentToken, {
      issueCategory: 'Electrical',
      description: 'Bedroom socket sparking',
      urgency: 'High',
    });
    expect(res.status).toBe(201);
    expect(res.body.residentId).toBe('RES-001');
  });

  it('lets a manager file on behalf of another flat', async () => {
    const res = await createTicket(maintenanceToken, {
      issueCategory: 'Cleaning & Pest',
      description: 'Corridor bin overflowing',
      urgency: 'Low',
      flatNumber: 'A-101',
    });
    expect(res.status).toBe(201);
    expect(res.body.flatNumber).toBe('A-101');
  });

  it('rejects a ticket with no description or category', async () => {
    const res = await api.post('/api/tickets').set(bearer(residentToken)).send({ urgency: 'Low' });
    expect(res.status).toBe(400);
  });

  it('issues a distinct id per ticket', async () => {
    const a = await createTicket(residentToken, { issueCategory: 'Plumbing', description: 'one', urgency: 'Low' });
    const b = await createTicket(residentToken, { issueCategory: 'Plumbing', description: 'two', urgency: 'Low' });
    expect(a.body.id).not.toBe(b.body.id);
    expect(a.body.id).toMatch(/^SOC-\d+$/);
  });

  it('does not reuse an id after a ticket is soft deleted', async () => {
    const first = await createTicket(residentToken, { issueCategory: 'Plumbing', description: 'before', urgency: 'Low' });
    await prisma.ticket.update({ where: { id: first.body.id }, data: { deletedAt: new Date() } });

    const second = await createTicket(residentToken, { issueCategory: 'Plumbing', description: 'after', urgency: 'Low' });
    expect(second.body.id).not.toBe(first.body.id);
  });
});

describe('ticket mutation', () => {
  it('denies a resident the manager-only PATCH', async () => {
    const own = await api.get('/api/tickets').set(bearer(residentToken));
    const res = await api
      .patch(`/api/tickets/${own.body.tickets[0].id}`)
      .set(bearer(residentToken))
      .send({ status: 'Closed' });
    expect(res.status).toBe(403);
  });

  it('applies a whitelisted field for a manager', async () => {
    const made = await createTicket(maintenanceToken, {
      issueCategory: 'Plumbing', description: 'patch me', urgency: 'Low', flatNumber: 'B-402',
    });
    const res = await api
      .patch(`/api/tickets/${made.body.id}`)
      .set(bearer(maintenanceToken))
      .send({ urgency: 'High' });

    expect(res.status).toBe(200);
    expect(res.body.urgency).toBe('High');
  });

  it('ignores fields outside the whitelist rather than writing them', async () => {
    const made = await createTicket(maintenanceToken, {
      issueCategory: 'Plumbing', description: 'protected', urgency: 'Low', flatNumber: 'B-402',
    });

    const res = await api
      .patch(`/api/tickets/${made.body.id}`)
      .set(bearer(maintenanceToken))
      .send({ status: 'In Progress', societyName: 'Hacked Society', residentName: 'Mallory' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('In Progress');
    expect(res.body.societyName).not.toBe('Hacked Society');
    expect(res.body.residentName).not.toBe('Mallory');
  });

  it('rejects a PATCH carrying only unknown fields', async () => {
    const made = await createTicket(maintenanceToken, {
      issueCategory: 'Plumbing', description: 'nothing to do', urgency: 'Low', flatNumber: 'B-402',
    });
    const res = await api
      .patch(`/api/tickets/${made.body.id}`)
      .set(bearer(maintenanceToken))
      .send({ societyName: 'Nope' });

    expect(res.status).toBe(400);
  });

  it('lets a resident close their own ticket and records resolvedAt', async () => {
    const made = await createTicket(residentToken, {
      issueCategory: 'Plumbing', description: 'close me', urgency: 'Low',
    });

    const res = await api.post(`/api/tickets/${made.body.id}/close`).set(bearer(residentToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Closed');

    const row = await prisma.ticket.findUnique({ where: { id: made.body.id } });
    expect(row?.resolvedAt).not.toBeNull();
  });

  it('refuses a resident closing a ticket belonging to another flat', async () => {
    const foreign = await createTicket(maintenanceToken, {
      issueCategory: 'Plumbing', description: 'not yours', urgency: 'Low', flatNumber: 'A-101',
    });
    const res = await api.post(`/api/tickets/${foreign.body.id}/close`).set(bearer(residentToken));
    expect(res.status).toBe(403);
  });

  it('denies a resident assigning a vendor', async () => {
    const own = await api.get('/api/tickets').set(bearer(residentToken));
    const res = await api
      .post(`/api/tickets/${own.body.tickets[0].id}/assign`)
      .set(bearer(residentToken))
      .send({ vendorId: 'VND-01' });
    expect(res.status).toBe(403);
  });
});
