import supertest from 'supertest';
import { createApp } from '../server';
import { unscopedPrisma } from '../src/database/prisma';
import { withSociety } from '../src/requestContext';
import { resolveActor, type Actor } from '../src/auth/actor';

/** Societies and credentials as written by prisma/seed.ts. */
export const SOCIETIES = { shreeRam: 'society-main', greenValley: 'society-green' } as const;

export const ACCOUNTS = {
  resident: { phone: '+91 98210 99887', password: 'vikram123' }, // Vikram, B-402
  otherResident: { phone: '+91 99870 11223', password: 'ananya123' }, // Ananya, A-101
  maintenance: { phone: '+91 98765 11111', password: 'arvind123' }, // manager
  admin: { phone: '+91 98000 00000', password: 'admin123' }, // society admin
  greenManager: { phone: '+91 99000 11111', password: 'priya123' }, // Green Valley manager
  greenResident: { phone: '+91 99000 22222', password: 'rohan123' }, // Green Valley, G-201
} as const;

export type Account = { phone: string; password: string };
export type Agent = supertest.Agent;

let cachedApp: Awaited<ReturnType<typeof createApp>> | null = null;
let cached: Agent | null = null;

/** The real Express app, built once per test file. */
export async function app() {
  if (!cachedApp) cachedApp = await createApp();
  return cachedApp;
}

/**
 * Mounts the real Express app in-process. No port is bound and Vite is not
 * started, so this exercises the actual middleware and route stack.
 */
export async function agent(): Promise<Agent> {
  if (!cached) {
    cached = supertest(await app());
  }
  return cached;
}

/** E.164 without spaces, which is what Better Auth's phone endpoints accept. */
export const e164 = (phone: string) => '+' + phone.replace(/[^0-9]/g, '');

/** Signs in with phone and password; returns the session token for `bearer`. */
export async function login(account: Account): Promise<string> {
  const res = await (
    await agent()
  )
    .post('/api/auth/sign-in/phone-number')
    .send({ phoneNumber: e164(account.phone), password: account.password });
  if (res.status !== 200 || !res.body.token) {
    throw new Error(`login failed for ${account.phone}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Wraps a test body so the repositories and agent tools it calls run inside
 * one society's tenant scope, as they do inside a request.
 *
 *   const shree = asSociety(SOCIETIES.shreeRam);
 *   it('...', shree(async () => { ... }));
 */
export function asSociety(societyId: string) {
  return <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A) =>
      withSociety(societyId, () => fn(...args));
}

/** The actor the agent would run as for a seeded user, in their society. */
export async function actorFor(userId: string): Promise<Actor> {
  const user = await unscopedPrisma.user.findUniqueOrThrow({ where: { id: userId } });
  const actor = await resolveActor(
    { userId, name: user.name, phone: user.phoneNumber, email: user.email, platformRole: null, sessionId: '' },
    // Passing a society skips the session update resolveActor would otherwise make.
    (await unscopedPrisma.membership.findFirstOrThrow({ where: { userId } })).societyId,
  );
  if (!actor) throw new Error(`${userId} has no society`);
  return actor;
}

/**
 * Removes tickets a suite created, releasing any vendor still charged for them.
 *
 * Deleting rows straight through Prisma bypasses the repository, so the
 * activeJobsCount that assignVendor incremented would otherwise be stranded
 * and every run would inflate it further.
 */
export async function deleteTickets(ids: string[]): Promise<void> {
  if (!ids.length) return;

  const tickets = await unscopedPrisma.ticket.findMany({
    where: { id: { in: ids } },
    select: { assignedVendorId: true, status: true },
  });

  for (const ticket of tickets) {
    if (ticket.assignedVendorId && !['Resolved', 'Closed'].includes(ticket.status)) {
      await unscopedPrisma.vendor.updateMany({
        where: { id: ticket.assignedVendorId, activeJobsCount: { gt: 0 } },
        data: { activeJobsCount: { decrement: 1 } },
      });
    }
  }

  await unscopedPrisma.ticket.deleteMany({ where: { id: { in: ids } } });
}
