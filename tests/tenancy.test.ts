import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, app, login, bearer, actorFor, deleteTickets, ACCOUNTS, SOCIETIES, type Agent } from './helpers';
import { prisma, unscopedPrisma, TenantScopeError } from '../src/database/prisma';
import { withSociety } from '../src/requestContext';
import { executeToolCall } from '../src/tools/maintenanceTools';
import { ticketRepo, vendorRepo } from '../src/database/repositories';

/**
 * Tenant isolation: nothing in one society can be read or changed from another.
 *
 * Green Valley's people are the attackers throughout; Shree Ram's seeded
 * ticket SOC-1042, vendor VND-01 and flat B-402 are the targets. A foreign row
 * should be indistinguishable from one that does not exist (404, not 403), so
 * ids from other societies leak nothing.
 */

let api: Agent;
let greenManager: string;
let greenResident: string;
let shreeManager: string;
const created: string[] = [];

const SHREE_TICKET = 'SOC-1042';
const SHREE_VENDOR = 'VND-01';
const GREEN_VENDOR = 'VND-G1';

const snapshot = (id: string) => unscopedPrisma.ticket.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  api = await agent();
  greenManager = await login(ACCOUNTS.greenManager);
  greenResident = await login(ACCOUNTS.greenResident);
  shreeManager = await login(ACCOUNTS.maintenance);
});

afterAll(async () => {
  await deleteTickets(created);
  await unscopedPrisma.$disconnect();
});

describe('the tenant scope itself', () => {
  it('refuses a society query with no society in context', async () => {
    await expect(prisma.ticket.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(prisma.vendor.count()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('filters reads to the society in context', async () => {
    const green = await withSociety(SOCIETIES.greenValley, () => prisma.ticket.findMany({ select: { id: true } }));
    const shree = await withSociety(SOCIETIES.shreeRam, () => prisma.ticket.findMany({ select: { id: true } }));
    expect(green.map((t) => t.id)).toContain('SOC-2001');
    expect(green.map((t) => t.id)).not.toContain(SHREE_TICKET);
    expect(shree.map((t) => t.id)).not.toContain('SOC-2001');
  });

  it('finds nothing by id across societies, even with findUnique', async () => {
    const found = await withSociety(SOCIETIES.greenValley, () =>
      prisma.ticket.findUnique({ where: { id: SHREE_TICKET } }),
    );
    expect(found).toBeNull();
  });

  it('stamps new rows with the society in context, whatever the data says', async () => {
    const vendor = await withSociety(SOCIETIES.greenValley, () =>
      prisma.vendor.create({
        data: {
          id: 'VND-TENANCY-1',
          societyId: SOCIETIES.shreeRam,
          name: 'Smuggled',
          category: 'Plumbing',
          rating: 1,
          availability: 'Offline',
          phone: '+919800012345',
          avgResolutionTime: '1 min',
          completedJobs: 0,
          skills: [],
          societyName: 'x',
        },
      }),
    );
    expect(vendor.societyId).toBe(SOCIETIES.greenValley);
    await unscopedPrisma.vendor.delete({ where: { id: vendor.id } });
  });

  it('will not move a row to another society on update', async () => {
    await withSociety(SOCIETIES.greenValley, () =>
      prisma.ticket.update({ where: { id: 'SOC-2001' }, data: { societyId: SOCIETIES.shreeRam } }),
    );
    expect((await snapshot('SOC-2001')).societyId).toBe(SOCIETIES.greenValley);
  });

  it('cannot update or delete another society’s rows in bulk', async () => {
    const before = await snapshot(SHREE_TICKET);
    await withSociety(SOCIETIES.greenValley, async () => {
      await prisma.ticket.updateMany({ where: { id: SHREE_TICKET }, data: { status: 'Closed' } });
      await prisma.ticket.deleteMany({ where: { id: SHREE_TICKET } });
    });
    const after = await snapshot(SHREE_TICKET);
    expect(after.status).toBe(before.status);
  });

  it('rejects a single-row update of another society’s row', async () => {
    await expect(
      withSociety(SOCIETIES.greenValley, () =>
        prisma.ticket.update({ where: { id: SHREE_TICKET }, data: { status: 'Closed' } }),
      ),
    ).rejects.toThrow();
  });
});

describe('ticket routes across societies', () => {
  it('lists only the caller’s society', async () => {
    const res = await api.get('/api/tickets').set(bearer(greenManager));
    expect(res.status).toBe(200);
    const ids = res.body.tickets.map((t: any) => t.id);
    expect(ids).toContain('SOC-2001');
    expect(res.body.tickets.every((t: any) => t.societyId === SOCIETIES.greenValley)).toBe(true);
  });

  it('keyword search does not reach another society', async () => {
    const res = await api.get('/api/tickets?query=B-402').set(bearer(greenManager));
    expect(res.body.tickets).toEqual([]);
  });

  it('answers 404 for another society’s ticket', async () => {
    expect((await api.get(`/api/tickets/${SHREE_TICKET}`).set(bearer(greenManager))).status).toBe(404);
    expect((await api.get(`/api/tickets/${SHREE_TICKET}`).set(bearer(greenResident))).status).toBe(404);
  });

  it('cannot edit, assign, escalate or close another society’s ticket', async () => {
    const before = await snapshot(SHREE_TICKET);

    const patch = await api.patch(`/api/tickets/${SHREE_TICKET}`).set(bearer(greenManager)).send({ status: 'Closed' });
    const assign = await api
      .post(`/api/tickets/${SHREE_TICKET}/assign`)
      .set(bearer(greenManager))
      .send({ vendorId: GREEN_VENDOR });
    const escalate = await api.post(`/api/tickets/${SHREE_TICKET}/escalate`).set(bearer(greenManager)).send({});
    const close = await api.post(`/api/tickets/${SHREE_TICKET}/close`).set(bearer(greenManager)).send({});

    expect([patch.status, assign.status, escalate.status, close.status]).toEqual([404, 404, 404, 404]);

    const after = await snapshot(SHREE_TICKET);
    expect(after.status).toBe(before.status);
    expect(after.assignedVendorId).toBe(before.assignedVendorId);
  });

  it('cannot assign a ticket to another society’s vendor', async () => {
    const res = await api
      .post(`/api/tickets/${SHREE_TICKET}/assign`)
      .set(bearer(shreeManager))
      .send({ vendorId: GREEN_VENDOR });
    expect(res.status).toBe(404);
    expect((await snapshot(SHREE_TICKET)).assignedVendorId).toBe(SHREE_VENDOR);
  });

  it('cannot file a ticket against another society’s flat', async () => {
    const shreeFlat = await unscopedPrisma.flat.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam, number: 'B-402' },
    });

    const byId = await api
      .post('/api/tickets')
      .set(bearer(greenManager))
      .send({ issueCategory: 'Plumbing', description: 'cross-society by id', flatId: shreeFlat.id });
    expect(byId.status).toBe(400);

    // A number that only exists elsewhere is not a place here at all.
    const byNumber = await api
      .post('/api/tickets')
      .set(bearer(greenManager))
      .send({ issueCategory: 'Plumbing', description: 'cross-society by number', flatNumber: 'B-402' });
    expect(byNumber.status).toBe(400);

    // Nor are another society's common areas and assets.
    const lift = await unscopedPrisma.asset.findFirstOrThrow({ where: { societyId: SOCIETIES.shreeRam } });
    const byAsset = await api
      .post('/api/tickets')
      .set(bearer(greenManager))
      .send({ issueCategory: 'Lift & Elevator', description: 'cross-society asset', assetId: lift.id });
    expect(byAsset.status).toBe(400);
  });

  it('new tickets are dispatched only to the caller’s vendors', async () => {
    const res = await api
      .post('/api/tickets')
      .set(bearer(greenResident))
      .send({ issueCategory: 'Plumbing', description: 'tap leaking', urgency: 'Low' });
    expect(res.status).toBe(201);
    created.push(res.body.id);
    expect(res.body.flatNumber).toBe('G-201');
    expect(res.body.assignedVendorId).toBe(GREEN_VENDOR);
  });
});

describe('society data routes across societies', () => {
  it('vendors', async () => {
    const res = await api.get('/api/vendors').set(bearer(greenManager));
    expect(res.body.vendors.map((v: any) => v.id)).toEqual([GREEN_VENDOR]);
  });

  it('notifications and agent logs', async () => {
    const notifications = await api.get('/api/notifications').set(bearer(greenManager));
    const logs = await api.get('/api/logs').set(bearer(greenManager));
    expect(notifications.body.notifications.every((n: any) => n.societyId === SOCIETIES.greenValley)).toBe(true);
    expect(logs.body.logs.every((l: any) => l.societyId === SOCIETIES.greenValley)).toBe(true);
    expect(JSON.stringify(notifications.body)).not.toContain(SHREE_TICKET);
  });

  it('analytics count only the caller’s tickets', async () => {
    const res = await api.get('/api/analytics').set(bearer(greenManager));
    const greenCount = await unscopedPrisma.ticket.count({
      where: { societyId: SOCIETIES.greenValley, deletedAt: null },
    });
    expect(res.body.totalTickets).toBe(greenCount);
  });

  it('member directory', async () => {
    const res = await api.get('/api/resident-profiles').set(bearer(greenManager));
    const names = res.body.residents.map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Priya Nair', 'Rohan Desai']));
    expect(names).not.toContain('Vikram Mehta');
  });

  it('society profile, read and write', async () => {
    const read = await api.get('/api/society-profile').set(bearer(greenManager));
    expect(read.body.societyId).toBe(SOCIETIES.greenValley);

    const shreeBefore = await unscopedPrisma.societyProfile.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam },
    });
    const write = await api.post('/api/society-profile').set(bearer(greenManager)).send({ tagline: 'Green only' });
    expect(write.body.societyId).toBe(SOCIETIES.greenValley);
    const shreeAfter = await unscopedPrisma.societyProfile.findFirstOrThrow({
      where: { societyId: SOCIETIES.shreeRam },
    });
    expect(shreeAfter.tagline).toBe(shreeBefore.tagline);

    await unscopedPrisma.societyProfile.update({ where: { id: read.body.id }, data: { tagline: read.body.tagline } });
  });

  it('the follow-up cycle only touches the caller’s tickets', async () => {
    const res = await api.post('/api/followup/run').set(bearer(greenManager));
    const greenCount = await unscopedPrisma.ticket.count({
      where: { societyId: SOCIETIES.greenValley, deletedAt: null },
    });
    expect(res.body.checkedCount).toBe(greenCount);
  });

  it('society details are always the caller’s own', async () => {
    const read = await api.get('/api/society').set(bearer(greenManager));
    expect(read.body.id).toBe(SOCIETIES.greenValley);
    expect(read.body.joinCode).toBe('GREENVAL');
    // There is no id to aim at another society with, and a manager cannot edit.
    expect((await api.patch('/api/society').set(bearer(greenManager)).send({ city: 'Mumbai' })).status).toBe(403);
  });

  it('switching to a society you do not belong to is refused', async () => {
    const res = await api
      .post('/api/me/active-society')
      .set(bearer(greenManager))
      .send({ societyId: SOCIETIES.shreeRam });
    expect(res.status).toBe(403);
  });

  it('uploads issued to one society’s user cannot be attached by another', async () => {
    const shreeResident = await login(ACCOUNTS.resident);
    const grant = await api
      .post('/api/uploads')
      .set(bearer(shreeResident))
      .send({ contentType: 'image/png', size: 10 });
    const res = await api
      .post('/api/tickets')
      .set(bearer(greenResident))
      .send({ issueCategory: 'Plumbing', description: 'stolen photo', images: [grant.body.key] });
    expect(res.status).toBe(400);
  });

  it('chat history is per society', async () => {
    const rows = await unscopedPrisma.chatMessage.findMany({ where: { societyId: SOCIETIES.greenValley } });
    expect(rows.every((r) => r.societyId === SOCIETIES.greenValley)).toBe(true);
  });
});

describe('agent tools across societies', () => {
  const asGreen = <T>(fn: () => Promise<T>) => withSociety(SOCIETIES.greenValley, fn);

  it('cannot read, search, escalate, close or notify on another society’s ticket', async () => {
    const manager = await actorFor('GV-001');
    const before = await snapshot(SHREE_TICKET);

    for (const tool of [
      'get_ticket',
      'escalate_ticket',
      'close_ticket',
      'notify_resident',
      'notify_vendor',
      'followup_vendor',
    ]) {
      const result: any = await asGreen(() =>
        executeToolCall(tool, { ticketId: SHREE_TICKET, reason: 'x', message: 'x' }, manager),
      );
      expect(result.success, tool).toBe(false);
    }

    const search: any = await asGreen(() => executeToolCall('search_ticket', { query: '' }, manager));
    expect(search.tickets.map((t: any) => t.id)).not.toContain(SHREE_TICKET);

    const after = await snapshot(SHREE_TICKET);
    expect(after.status).toBe(before.status);
  });

  it('cannot assign another society’s ticket or vendor, or update the ticket', async () => {
    const manager = await actorFor('GV-001');
    const assign: any = await asGreen(() =>
      executeToolCall('assign_vendor', { ticketId: SHREE_TICKET, vendorId: GREEN_VENDOR }, manager),
    );
    const update: any = await asGreen(() =>
      executeToolCall('update_ticket', { ticketId: SHREE_TICKET, status: 'Closed' }, manager),
    );
    expect(assign.success).toBe(false);
    expect(update.success).toBe(false);
    expect((await snapshot(SHREE_TICKET)).status).not.toBe('Closed');
  });

  it('lists only the caller’s vendors and reports only the caller’s tickets', async () => {
    const manager = await actorFor('GV-001');
    const vendors: any = await asGreen(() => executeToolCall('get_vendors', {}, manager));
    const report: any = await asGreen(() => executeToolCall('generate_daily_report', {}, manager));
    expect(vendors.vendors.map((v: any) => v.id)).toEqual([GREEN_VENDOR]);
    const greenCount = await unscopedPrisma.ticket.count({
      where: { societyId: SOCIETIES.greenValley, deletedAt: null },
    });
    expect(report.report.totalTickets).toBe(greenCount);
  });

  it('repositories called inside one society cannot see the other', async () => {
    const vendor = await asGreen(() => vendorRepo.findById(SHREE_VENDOR));
    const ticket = await asGreen(() => ticketRepo.findById(SHREE_TICKET));
    expect(vendor).toBeNull();
    expect(ticket).toBeUndefined();
  });
});

/**
 * Every API route must appear in a test above (or be deliberately exempt).
 * When this fails, a new route was added: give it a cross-society test, then
 * list it here.
 */
describe('coverage', () => {
  const COVERED = new Set([
    'GET /api/health', // public, no society data
    'GET /api/me', // the caller's own memberships only (auth.test.ts)
    'PATCH /api/me', // the caller's own account only (auth.test.ts)
    'POST /api/me/active-society',
    'POST /api/societies', // creates a new society; nothing to cross into (societies.test.ts)
    'GET /api/society',
    'PATCH /api/society',
    'GET /api/tickets',
    'GET /api/tickets/:id',
    'POST /api/tickets',
    'PATCH /api/tickets/:id',
    'POST /api/tickets/:id/assign',
    'POST /api/tickets/:id/escalate',
    'POST /api/tickets/:id/close',
    'POST /api/tickets/:id/reopen', // same access rule as close (signoff.test.ts)
    'GET /api/vendors',
    'GET /api/vendors/performance', // the society's own vendors only (performance.test.ts)
    // Vendor management and buildings: cross-society attempts in buildings.test.ts.
    'POST /api/vendors',
    'PATCH /api/vendors/:id',
    'DELETE /api/vendors/:id',
    'GET /api/towers',
    'POST /api/towers',
    'PATCH /api/towers/:id',
    'DELETE /api/towers/:id',
    'POST /api/towers/:id/flats/generate',
    'GET /api/flats',
    'POST /api/flats',
    'PATCH /api/flats/:id',
    'DELETE /api/flats/:id',
    'GET /api/flats/:id/occupants',
    'POST /api/flats/:id/occupants',
    'POST /api/occupants/:id/move-out',
    // The register as CSV: everything inside the caller's society (flatRegister.test.ts).
    'GET /api/flats/template.csv',
    'GET /api/flats/export.csv',
    'POST /api/flats/import',
    // Joining and invites: cross-society attempts in joining.test.ts.
    'GET /api/join/:code', // public; shows flat numbers only, never occupants
    'POST /api/join/:code',
    'GET /api/join-requests',
    'POST /api/join-requests/:id/approve',
    'POST /api/join-requests/:id/reject',
    'GET /api/invites',
    'POST /api/invites',
    'DELETE /api/invites/:id',
    'GET /api/invite-links/:token', // public; the unguessable token is the credential
    'POST /api/invite-links/:token/accept',
    // Common areas and assets: cross-society attempts in places.test.ts.
    'GET /api/common-areas',
    'POST /api/common-areas',
    'PATCH /api/common-areas/:id',
    'DELETE /api/common-areas/:id',
    'POST /api/assets',
    'PATCH /api/assets/:id',
    'DELETE /api/assets/:id',
    // A vendor's own jobs: other vendors and other societies in worker.test.ts.
    'GET /api/worker/jobs',
    'GET /api/worker/jobs/:id',
    'POST /api/worker/jobs/:id/status',
    'PUT /api/worker/duty',
    'GET /api/notifications',
    // The setup wizard: the caller's own society only (onboarding.test.ts).
    'GET /api/onboarding',
    'POST /api/onboarding/steps/:step/visit',
    'POST /api/onboarding/steps/:step/skip',
    'POST /api/onboarding/finish',
    // An owner's own flat only: other flats and societies in household.test.ts.
    'GET /api/my-flat',
    'POST /api/my-flat/requests/:id/approve',
    'POST /api/my-flat/requests/:id/reject',
    'POST /api/my-flat/members/:id/remove',
    // The resident directory: other societies in residents.test.ts.
    'GET /api/residents',
    'POST /api/residents/invite',
    // A person's own notifications only (inbox.test.ts).
    'GET /api/me/notifications',
    'POST /api/me/notifications/read',
    'GET /api/chat/history', // the caller's own conversation only (inbox.test.ts)
    'GET /api/logs',
    'GET /api/analytics',
    'GET /api/society-profile',
    'POST /api/society-profile',
    'GET /api/resident-profiles',
    'POST /api/followup/run',
    'POST /api/chat', // runs the agent tools covered above
    'POST /api/uploads',
    'PUT /api/files/*key', // signed per key; keys are per user (uploads.test.ts)
    'GET /api/files/*key',
  ]);

  it('has a cross-society test for every API route', async () => {
    const routes: string[] = [];
    for (const layer of (await app()).router.stack as any[]) {
      for (const inner of layer.handle?.stack ?? []) {
        if (!inner.route) continue;
        for (const method of Object.keys(inner.route.methods)) {
          routes.push(`${method.toUpperCase()} /api${inner.route.path}`);
        }
      }
    }
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => !COVERED.has(r))).toEqual([]);
  });
});
