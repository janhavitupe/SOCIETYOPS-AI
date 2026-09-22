import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  sendNotification,
  setNotificationProvider,
  ConsoleNotificationProvider,
  toE164,
  type NotificationProvider,
  type DispatchResult,
} from '../src/services/notifications';
import { ticketRepo, vendorRepo, notificationRepo } from '../src/database/repositories';
import { prisma } from '../src/database/prisma';
import { deleteTickets } from './helpers';

const created: string[] = [];

async function makeTicket(urgency = 'Medium', category = 'Plumbing') {
  const t = await ticketRepo.create({
    flatNumber: 'B-402',
    residentName: 'Vikram Mehta',
    residentPhone: '+91 98210 99887',
    issueCategory: category,
    description: 'notification test',
    urgency,
  });
  created.push(t.id);
  return t;
}

afterEach(() => {
  setNotificationProvider(null);
});

afterAll(async () => {
  if (created.length) {
    await deleteTickets(created);
  }
  await prisma.$disconnect();
});

describe('toE164', () => {
  it('strips the spacing the seed and UI use', () => {
    expect(toE164('+91 98201 44321')).toBe('+919820144321');
  });

  it('adds the country code to a bare ten digit number', () => {
    expect(toE164('9820144321')).toBe('+919820144321');
  });

  it('returns empty for an unusable value', () => {
    expect(toE164('')).toBe('');
    expect(toE164('n/a')).toBe('');
  });
});

describe('dispatch status', () => {
  it('records Simulated when no provider is configured, not Sent', async () => {
    setNotificationProvider(new ConsoleNotificationProvider());
    const ticket = await makeTicket();

    const row = await sendNotification({
      ticketId: ticket.id,
      recipientType: 'resident',
      recipientName: 'Vikram Mehta',
      phone: '+91 98210 99887',
      message: 'Your plumber is on the way',
    });

    // The whole point: an undelivered message must not claim it was sent.
    expect(row.status).toBe('Simulated');
    expect(row.provider).toBe('console');
  });

  it('records Sent and the provider id when a provider delivers', async () => {
    const stub: NotificationProvider = {
      name: 'stub',
      async send(): Promise<DispatchResult> {
        return { status: 'Sent', provider: 'stub', providerMessageId: 'SM123' };
      },
    };
    setNotificationProvider(stub);
    const ticket = await makeTicket();

    const row = await sendNotification({
      ticketId: ticket.id,
      recipientType: 'vendor',
      recipientName: 'Ramesh',
      phone: '+91 98201 44321',
      message: 'New job',
    });

    expect(row.status).toBe('Sent');
    expect(row.providerMessageId).toBe('SM123');
  });

  it('still logs a failed dispatch, with the reason', async () => {
    const failing: NotificationProvider = {
      name: 'stub',
      async send(): Promise<DispatchResult> {
        return { status: 'Failed', provider: 'stub', failureReason: 'number unreachable' };
      },
    };
    setNotificationProvider(failing);
    const ticket = await makeTicket();

    const row = await sendNotification({
      ticketId: ticket.id,
      recipientType: 'resident',
      recipientName: 'Vikram Mehta',
      phone: '+91 98210 99887',
      message: 'Update',
    });

    expect(row.status).toBe('Failed');
    expect(row.failureReason).toBe('number unreachable');

    // A failure that vanished would be worse than one that is recorded.
    const logged = await notificationRepo.findByTicketId(ticket.id);
    expect(logged).toHaveLength(1);
    expect(logged[0].status).toBe('Failed');
  });
});

describe('vendor load', () => {
  it('releases the vendor when a ticket is closed', async () => {
    const ticket = await makeTicket();
    const vendor = await vendorRepo.findBestForCategory('Plumbing');
    expect(vendor).toBeTruthy();

    await ticketRepo.assignVendor(ticket.id, vendor.id, '20 mins');
    const busy = await vendorRepo.findById(vendor.id);

    await ticketRepo.update(ticket.id, { status: 'Closed' });
    const freed = await vendorRepo.findById(vendor.id);

    // assignVendor incremented this and nothing ever decremented it.
    expect(freed.activeJobsCount).toBe(busy.activeJobsCount - 1);
  });

  it('does not double release when an already closed ticket is updated again', async () => {
    const ticket = await makeTicket();
    const vendor = await vendorRepo.findBestForCategory('Plumbing');
    await ticketRepo.assignVendor(ticket.id, vendor.id, '20 mins');

    await ticketRepo.update(ticket.id, { status: 'Closed' });
    const afterFirst = await vendorRepo.findById(vendor.id);

    await ticketRepo.update(ticket.id, { status: 'Closed' });
    const afterSecond = await vendorRepo.findById(vendor.id);

    expect(afterSecond.activeJobsCount).toBe(afterFirst.activeJobsCount);
  });

  it('releases the vendor when a ticket is soft deleted', async () => {
    const ticket = await makeTicket();
    const vendor = await vendorRepo.findBestForCategory('Plumbing');

    await ticketRepo.assignVendor(ticket.id, vendor.id, '20 mins');
    const busy = await vendorRepo.findById(vendor.id);

    await ticketRepo.softDelete(ticket.id);
    const freed = await vendorRepo.findById(vendor.id);

    // A deleted ticket left the vendor charged for it forever, which is how
    // activeJobsCount drifted to 142 against a seeded value of 1.
    expect(freed.activeJobsCount).toBe(busy.activeJobsCount - 1);
  });

  it('prefers a less loaded vendor over a marginally better rated one', async () => {
    const plumbers = await prisma.vendor.findMany({ where: { category: 'Plumbing', deletedAt: null } });
    if (plumbers.length < 2) return; // seed only guarantees one in some categories

    const [a, b] = plumbers;
    const before = { a: a.activeJobsCount, b: b.activeJobsCount };

    // Load the higher rated one heavily enough to lose on score.
    const better = a.rating >= b.rating ? a : b;
    const worse = better.id === a.id ? b : a;

    await prisma.vendor.update({
      where: { id: better.id },
      data: { activeJobsCount: better.activeJobsCount + 20, availability: 'Available' },
    });
    await prisma.vendor.update({
      where: { id: worse.id },
      data: { activeJobsCount: 0, availability: 'Available' },
    });

    const chosen = await vendorRepo.findBestForCategory('Plumbing');
    expect(chosen.id).toBe(worse.id);

    await prisma.vendor.update({ where: { id: a.id }, data: { activeJobsCount: before.a, availability: a.availability } });
    await prisma.vendor.update({ where: { id: b.id }, data: { activeJobsCount: before.b, availability: b.availability } });
  });
});

describe('ticket SLA stamp', () => {
  it('gives a new ticket a deadline matching its urgency', async () => {
    const high = await makeTicket('High');
    const low = await makeTicket('Low');

    expect(high.slaDueAt).toBeTruthy();
    expect(low.slaDueAt).toBeTruthy();
    expect(new Date(high.slaDueAt).getTime()).toBeLessThan(new Date(low.slaDueAt).getTime());
  });
});
