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

/** Captures the codes the OTP sender would have texted. */
export class CapturingOtpSender {
  readonly name = 'capture';
  codes = new Map<string, string>();
  async send(phone: string, code: string) {
    this.codes.set(phone, code);
  }
}

/** Verifies a phone by code, as a new person does. Returns the session token. */
export async function verifyPhone(phone: string): Promise<string> {
  const { setOtpSender } = await import('../src/services/otp');
  const sender = new CapturingOtpSender();
  setOtpSender(sender);
  try {
    const api = await agent();
    await api.post('/api/auth/phone-number/send-otp').send({ phoneNumber: phone });
    const verified = await api
      .post('/api/auth/phone-number/verify')
      .send({ phoneNumber: phone, code: sender.codes.get(phone) });
    if (verified.status !== 200) throw new Error(`verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
    return verified.body.token as string;
  } finally {
    setOtpSender(null);
  }
}

/**
 * Creates a brand-new account the way a person does: phone code, then name
 * and password. Returns the session token. phone must be canonical (+91...).
 */
export async function signUp(phone: string, name: string, password = 'longenough1'): Promise<string> {
  const token = await verifyPhone(phone);
  const named = await (await agent()).patch('/api/me').set(bearer(token)).send({ name, password });
  if (named.status !== 200) throw new Error(`profile failed: ${named.status} ${JSON.stringify(named.body)}`);
  return token;
}

/** Deletes test users and every society they created (cascading their data). */
export async function deleteUsersAndTheirSocieties(phones: string[]): Promise<void> {
  const users = await unscopedPrisma.user.findMany({ where: { phoneNumber: { in: phones } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const owned = await unscopedPrisma.membership.findMany({
    where: { userId: { in: ids }, role: 'society_admin', societyId: { notIn: Object.values(SOCIETIES) } },
    select: { societyId: true },
  });
  await unscopedPrisma.society.deleteMany({ where: { id: { in: owned.map((m) => m.societyId) } } });
  await unscopedPrisma.user.deleteMany({ where: { id: { in: ids } } });
}
