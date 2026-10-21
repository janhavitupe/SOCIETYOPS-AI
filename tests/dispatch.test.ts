import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agent, login, bearer, deleteTickets, ACCOUNTS, type Agent } from './helpers';
import { unscopedPrisma } from '../src/database/prisma';
import { formatMinutes, ordinal, parseMinutes, queuedEta } from '../src/services/dispatch';

/**
 * Busy vendors. Green Valley has one plumber (VND-G1, 45 mins a job), so every
 * plumbing ticket there queues behind the ones before it.
 */

let api: Agent;
let resident: string;
let manager: string;
const created: string[] = [];

const openJobsOf = (vendorId: string) =>
  unscopedPrisma.ticket.count({
    where: {
      assignedVendorId: vendorId,
      status: { in: ['Vendor Assigned', 'In Progress', 'Escalated'] },
      deletedAt: null,
    },
  });

async function reportLeak(description: string) {
  const res = await api
    .post('/api/tickets')
    .set(bearer(resident))
    .send({ issueCategory: 'Plumbing', description, urgency: 'High' });
  expect(res.status).toBe(201);
  created.push(res.body.id);
  return res.body;
}

beforeAll(async () => {
  api = await agent();
  resident = await login(ACCOUNTS.greenResident);
  manager = await login(ACCOUNTS.greenManager);

  // A job from before tickets carried vendorId: only assignedVendorId is set.
  // The queue must still count it, as the seeded SOC-1042 showed it did not.
  await unscopedPrisma.ticket.create({
    data: {
      id: 'SOC-DISPATCH-LEGACY',
      societyId: 'society-green',
      flatNumber: 'G-101',
      residentName: 'Legacy',
      residentPhone: '+919900000000',
      issueCategory: 'Plumbing',
      description: 'Assigned before vendorId existed',
      urgency: 'Low',
      status: 'Vendor Assigned',
      assignedVendorId: 'VND-G1',
      images: [],
      societyName: 'Green Valley Residency',
    },
  });
  created.push('SOC-DISPATCH-LEGACY');
});

afterAll(async () => {
  await deleteTickets(created);
  await unscopedPrisma.$disconnect();
});

describe('estimates', () => {
  it('reads the ways people write durations', () => {
    expect(parseMinutes('25 mins')).toBe(25);
    expect(parseMinutes('1 hr')).toBe(60);
    expect(parseMinutes('1 hr 30 mins')).toBe(90);
    expect(parseMinutes('2 hours')).toBe(120);
    expect(parseMinutes('45')).toBe(45);
    expect(parseMinutes('soon')).toBe(30);
  });

  it('writes them back readably', () => {
    expect(formatMinutes(25)).toBe('25 mins');
    expect(formatMinutes(75)).toBe('1 hr 15 mins');
    expect(formatMinutes(120)).toBe('2 hrs');
  });

  it('grows with the jobs ahead', () => {
    expect(queuedEta('25 mins', 0)).toBe('25 mins');
    expect(queuedEta('25 mins', 2)).toBe('1 hr 15 mins');
  });

  it('numbers places in the queue', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
    ]);
  });
});

describe('a busy vendor', () => {
  it('queues each new job behind the earlier ones, and the estimate says so', async () => {
    const ahead = await openJobsOf('VND-G1');

    const first = await reportLeak('Kitchen pipe leaking');
    const second = await reportLeak('Bathroom tap leaking');

    expect(first.assignedVendorId).toBe('VND-G1');
    expect(second.assignedVendorId).toBe('VND-G1');
    expect(first.estimatedEta).toBe(queuedEta('45 mins', ahead));
    expect(second.estimatedEta).toBe(queuedEta('45 mins', ahead + 1));

    const detail = await api.get(`/api/tickets/${second.id}`).set(bearer(manager));
    expect(detail.body.vendorQueue).toEqual({ position: ahead + 2, total: ahead + 2 });

    const assigned = detail.body.timeline.find((e: any) => e.type === 'assigned');
    expect(assigned.description).toContain(`${ahead + 1} job`);
  });

  it('moves a job up the queue when the one ahead is finished', async () => {
    const [first, second] = created.slice(-2);
    const before = (await api.get(`/api/tickets/${second}`).set(bearer(manager))).body.vendorQueue;

    await api.patch(`/api/tickets/${first}`).set(bearer(manager)).send({ status: 'Resolved' });

    const after = (await api.get(`/api/tickets/${second}`).set(bearer(manager))).body.vendorQueue;
    expect(after.position).toBe(before.position - 1);
    expect(after.total).toBe(before.total - 1);
  });

  it('tells the resident they are queued, without naming anyone else', async () => {
    const res = await api
      .post('/api/chat')
      .set(bearer(resident))
      .send({ text: 'Bathroom pipe leaking, water everywhere' });
    expect(res.status).toBe(200);
    const ticket = res.body.ticketCreated;
    created.push(ticket.id);

    expect(ticket.vendorQueue.position).toBeGreaterThan(1);
    if (res.body.source === 'fallback') {
      expect(res.body.replyText).toContain(`aapka number ${ordinal(ticket.vendorQueue.position)} hai`);
    }
    // The other jobs in the queue are never described to this resident.
    expect(res.body.replyText).not.toMatch(/Priya|Kitchen pipe|Bathroom tap|SOC-2001/);
  });

  it('uses a manager’s own estimate as given', async () => {
    const ticket = await reportLeak('Overhead tank overflowing');
    const res = await api
      .post(`/api/tickets/${ticket.id}/assign`)
      .set(bearer(manager))
      .send({ vendorId: 'VND-G1', estimatedEta: '10 mins' });
    expect(res.body.estimatedEta).toBe('10 mins');
  });
});

describe('job counts follow the job', () => {
  let rival: string;

  beforeAll(async () => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(manager))
      .send({ name: 'Dispatch Test Plumber', category: 'Plumbing', phone: '98200 77777' });
    rival = res.body.id;
  });

  afterAll(async () => {
    // Removed the way the app removes vendors, so their open jobs are handed
    // on rather than orphaned for the next test to trip over.
    await api.delete(`/api/vendors/${rival}`).set(bearer(manager));
  });

  const countOf = async (id: string) =>
    (await unscopedPrisma.vendor.findUniqueOrThrow({ where: { id } })).activeJobsCount;

  it('gives a new job to the vendor with the shorter queue', async () => {
    // Adding the rival already rebalanced the waiting jobs between the two.
    const loads = { g1: await openJobsOf('VND-G1'), rival: await openJobsOf(rival) };
    const ticket = await reportLeak('Should go to the shorter queue');
    // On a tie the higher rating wins: VND-G1 is 4.5, the rival 4.
    const expected = loads.rival < loads.g1 ? rival : 'VND-G1';
    expect(ticket.assignedVendorId).toBe(expected);
  });

  it('reassigning to another vendor moves the job off the first one', async () => {
    const ticket = await reportLeak('Reassignment test');
    await api.post(`/api/tickets/${ticket.id}/assign`).set(bearer(manager)).send({ vendorId: 'VND-G1' });
    const from = 'VND-G1';
    const before = { from: await countOf(from), to: await countOf(rival) };

    await api.post(`/api/tickets/${ticket.id}/assign`).set(bearer(manager)).send({ vendorId: rival });

    expect(await countOf(from)).toBe(before.from - 1);
    expect(await countOf(rival)).toBe(before.to + 1);
  });

  it('reassigning to the same vendor does not count the job twice', async () => {
    const ticket = created[created.length - 1];
    const before = await countOf(rival);
    await api.post(`/api/tickets/${ticket}/assign`).set(bearer(manager)).send({ vendorId: rival });
    expect(await countOf(rival)).toBe(before);
  });
});

describe('a vendor with room takes over waiting jobs', () => {
  const addPlumber = (name: string, availability = 'Available', category = 'Plumbing') =>
    api.post('/api/vendors').set(bearer(manager)).send({ name, category, phone: '98200 66666', availability });

  const ticketOf = (id: string) =>
    api
      .get(`/api/tickets/${id}`)
      .set(bearer(manager))
      .then((r) => r.body);

  afterAll(async () => {
    const extras = await unscopedPrisma.vendor.findMany({ where: { name: { startsWith: 'Rebalance' } } });
    await unscopedPrisma.ticket.updateMany({
      where: { assignedVendorId: { in: extras.map((v) => v.id) } },
      data: { assignedVendorId: null, vendorId: null },
    });
    await unscopedPrisma.vendor.deleteMany({ where: { id: { in: extras.map((v) => v.id) } } });
  });

  it('moves the job waiting longest to a new vendor, and leaves started work alone', async () => {
    const waiting = [await reportLeak('Queue A'), await reportLeak('Queue B'), await reportLeak('Queue C')];
    const last = waiting[2];
    const started = waiting[1];
    await api.patch(`/api/tickets/${started.id}`).set(bearer(manager)).send({ status: 'In Progress' });

    const before = await ticketOf(last.id);
    expect(before.assignedVendorId).toBe('VND-G1');
    expect(before.vendorQueue.position).toBeGreaterThan(1);

    const added = await addPlumber('Rebalance Plumber One');
    expect(added.status).toBe(201);
    const moves = added.body.reassigned;
    expect(moves.find((m: any) => m.ticketId === last.id)).toMatchObject({
      fromVendorName: 'GV Plumbing Co',
      toVendorName: 'Rebalance Plumber One',
    });
    expect(moves.map((m: any) => m.ticketId)).not.toContain(started.id);

    const after = await ticketOf(last.id);
    expect(after.assignedVendorId).toBe(added.body.id);
    expect(after.vendorQueue.position).toBe(1);
    expect(after.estimatedEta).toBe('45 mins');
    expect(after.timeline.at(-1).description).toMatch(/^Reassigned from GV Plumbing Co, who had \d+ jobs? ahead/);

    const told = await unscopedPrisma.notificationLog.findFirst({
      where: { ticketId: last.id, recipientType: 'resident', message: { contains: 'will now attend' } },
    });
    expect(told?.message).toContain('Rebalance Plumber One');

    // Nobody left waiting longer than the new vendor's queue would make them.
    const newLoad = await openJobsOf(added.body.id);
    const stillQueued = await unscopedPrisma.ticket.findMany({
      where: { assignedVendorId: 'VND-G1', status: 'Vendor Assigned', deletedAt: null },
      select: { id: true },
    });
    for (const { id } of stillQueued) {
      const t = await ticketOf(id);
      expect(t.vendorQueue.position - 1).toBeLessThanOrEqual(newLoad);
      // And their estimates shrank to match their new place.
      expect(t.estimatedEta).toBe(queuedEta('45 mins', t.vendorQueue.position - 1));
    }
  });

  it('an offline vendor takes nothing until they become available', async () => {
    await reportLeak('Queue D');
    await reportLeak('Queue E');

    const offline = await addPlumber('Rebalance Plumber Two', 'Offline');
    expect(offline.body.reassigned).toEqual([]);

    const available = await api
      .patch(`/api/vendors/${offline.body.id}`)
      .set(bearer(manager))
      .send({ availability: 'Available' });
    expect(available.body.reassigned.length).toBeGreaterThan(0);
    expect(available.body.reassigned.every((m: any) => m.toVendorName === 'Rebalance Plumber Two')).toBe(true);
  });

  it('a vendor in another trade takes nothing', async () => {
    await reportLeak('Queue F');
    const electrician = await addPlumber('Rebalance Electrician', 'Available', 'Electrical');
    expect(electrician.body.reassigned).toEqual([]);
  });
});

describe('live vendor status', () => {
  const vendorView = async (id: string) =>
    (await api.get('/api/vendors').set(bearer(manager))).body.vendors.find((v: any) => v.id === id);

  const addElectrician = async (name: string, availability = 'Available') => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(manager))
      .send({ name, category: 'Electrical', phone: '98200 88888', availability });
    expect(res.status).toBe(201);
    return res.body;
  };

  const reportSpark = async (description: string) => {
    const res = await api
      .post('/api/tickets')
      .set(bearer(resident))
      .send({ issueCategory: 'Electrical', description, urgency: 'Medium' });
    created.push(res.body.id);
    return res.body;
  };

  afterAll(async () => {
    const extras = await unscopedPrisma.vendor.findMany({ where: { name: { startsWith: 'Status' } } });
    await unscopedPrisma.ticket.updateMany({
      where: { assignedVendorId: { in: extras.map((v) => v.id) } },
      data: { assignedVendorId: null, vendorId: null },
    });
    await unscopedPrisma.vendor.deleteMany({ where: { id: { in: extras.map((v) => v.id) } } });
  });

  it('turns Busy when given a job and Available again when it is done', async () => {
    const sparky = await addElectrician('Status Electrician One');
    expect(sparky.status).toBe('Available');
    expect(sparky.openJobs).toBe(0);

    const ticket = await reportSpark('Socket sparking');
    expect(ticket.assignedVendorId).toBe(sparky.id);
    expect(await vendorView(sparky.id)).toMatchObject({ status: 'Busy', openJobs: 1, activeJobsCount: 1 });

    await api.patch(`/api/tickets/${ticket.id}`).set(bearer(manager)).send({ status: 'Resolved' });
    expect(await vendorView(sparky.id)).toMatchObject({ status: 'Available', openJobs: 0 });
  });

  it('shows Offline for an off-duty vendor, whatever their jobs', async () => {
    const off = await addElectrician('Status Electrician Off', 'Offline');
    expect(off.status).toBe('Offline');
  });

  it('no longer accepts a hand-set "On Job"', async () => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(manager))
      .send({ name: 'Status Bad', category: 'Electrical', phone: '98200 88889', availability: 'On Job' });
    expect(res.status).toBe(400);
  });

  it('a vendor who finishes a job picks up one waiting in a busier queue', async () => {
    // Only Electrician One is on duty: three jobs queue on them.
    const one = (await unscopedPrisma.vendor.findFirstOrThrow({ where: { name: 'Status Electrician One' } })).id;
    const jobs = [
      await reportSpark('Fan humming'),
      await reportSpark('Light flickering'),
      await reportSpark('MCB trips'),
    ];
    expect(jobs.every((j) => j.assignedVendorId === one)).toBe(true);

    // A second electrician comes on duty and takes the last one at once.
    const two = await api
      .patch(
        `/api/vendors/${(await unscopedPrisma.vendor.findFirstOrThrow({ where: { name: 'Status Electrician Off' } })).id}`,
      )
      .set(bearer(manager))
      .send({ availability: 'Available' });
    expect(two.body.reassigned.map((m: any) => m.ticketId)).toEqual([jobs[2].id]);

    // Two finishes their job: they are now free, and One still has two
    // queued, so the one waiting behind takes Two's place.
    await api.patch(`/api/tickets/${jobs[2].id}`).set(bearer(manager)).send({ status: 'Resolved' });
    const moved = await api.get(`/api/tickets/${jobs[1].id}`).set(bearer(manager));
    expect(moved.body.assignedVendorId).toBe(two.body.id);
    expect(moved.body.vendorQueue.position).toBe(1);
    expect(await vendorView(two.body.id)).toMatchObject({ status: 'Busy', openJobs: 1 });
    expect(await vendorView(one)).toMatchObject({ status: 'Busy', openJobs: 1 });
  });
});

describe('escalated and orphaned jobs', () => {
  const addTech = async (name: string) => {
    const res = await api
      .post('/api/vendors')
      .set(bearer(manager))
      .send({ name, category: 'AC & Appliances', phone: '98200 99990' });
    return res.body;
  };
  const reportAc = async (description: string) => {
    const res = await api
      .post('/api/tickets')
      .set(bearer(resident))
      .send({ issueCategory: 'AC & Appliances', description, urgency: 'High' });
    created.push(res.body.id);
    return res.body;
  };

  afterAll(async () => {
    const extras = await unscopedPrisma.vendor.findMany({ where: { name: { startsWith: 'Orphan' } } });
    await unscopedPrisma.ticket.updateMany({
      where: { assignedVendorId: { in: extras.map((v) => v.id) } },
      data: { assignedVendorId: null, vendorId: null },
    });
    await unscopedPrisma.vendor.deleteMany({ where: { id: { in: extras.map((v) => v.id) } } });
  });

  it('an escalated job that nobody has started moves to a free vendor, still escalated', async () => {
    const first = await addTech('Orphan Tech One');
    const a = await reportAc('AC dripping on the bed');
    const b = await reportAc('Geyser not heating');
    expect([a.assignedVendorId, b.assignedVendorId]).toEqual([first.id, first.id]);
    await api.post(`/api/tickets/${b.id}/escalate`).set(bearer(resident)).send({ reason: 'Waited all day' });

    const second = await addTech('Orphan Tech Two');
    expect(second.reassigned.map((m: any) => m.ticketId)).toEqual([b.id]);

    const moved = await api.get(`/api/tickets/${b.id}`).set(bearer(manager));
    expect(moved.body.assignedVendorId).toBe(second.id);
    expect(moved.body.status).toBe('Escalated');
  });

  it('removing a vendor hands their open jobs to the rest of the trade', async () => {
    const one = await unscopedPrisma.vendor.findFirstOrThrow({ where: { name: 'Orphan Tech One' } });
    const theirs = await unscopedPrisma.ticket.findMany({
      where: { assignedVendorId: one.id, status: { notIn: ['Resolved', 'Closed'] } },
      select: { id: true },
    });
    expect(theirs.length).toBeGreaterThan(0);

    const removed = await api.delete(`/api/vendors/${one.id}`).set(bearer(manager));
    expect(removed.status).toBe(200);
    expect(removed.body.reassigned.map((m: any) => m.ticketId).sort()).toEqual(theirs.map((t) => t.id).sort());

    for (const { id } of theirs) {
      const t = await api.get(`/api/tickets/${id}`).set(bearer(manager));
      expect(t.body.assignedVendorName).toBe('Orphan Tech Two');
      expect(t.body.timeline.at(-1).description).toContain('is no longer one of the society');
    }
  });

  it('picks up jobs left with a vendor who was deleted some other way', async () => {
    // As a vendor removed straight from the database, outside the app.
    const two = await unscopedPrisma.vendor.findFirstOrThrow({ where: { name: 'Orphan Tech Two' } });
    const job = await reportAc('Fridge not cooling');
    expect(job.assignedVendorId).toBe(two.id);
    await unscopedPrisma.vendor.update({ where: { id: two.id }, data: { deletedAt: new Date() } });

    const three = await addTech('Orphan Tech Three');
    expect(three.reassigned.map((m: any) => m.ticketId)).toContain(job.id);
  });
});
