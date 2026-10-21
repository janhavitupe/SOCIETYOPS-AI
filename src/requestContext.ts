import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Per-request context carried through async calls, so every log line written
 * while serving a request carries that request's id, and every database query
 * is scoped to the society the request is working in, without passing either
 * around by hand.
 */
interface RequestContext {
  requestId?: string;
  /** Set by the auth middleware once the session's society is known. */
  societyId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

let testFallbackSocietyId: string | undefined;

export function currentSocietyId(): string | undefined {
  const store = storage.getStore();
  // Inside a request (or withSociety) the context is authoritative, including
  // when it has no society: that must stay refused, never defaulted.
  if (store) return store.societyId;
  return testFallbackSocietyId;
}

/**
 * Test seam: the society used by code running outside any request, so a suite
 * can call repositories and agent tools directly. Ignored outside NODE_ENV=test.
 */
export function setTestSociety(societyId: string | undefined): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('setTestSociety is only for tests');
  testFallbackSocietyId = societyId;
}

/** The current society, for code that must have one (creating society rows). */
export function requireSocietyId(): string {
  const societyId = currentSocietyId();
  if (!societyId) throw new Error('No society in context');
  return societyId;
}

/** Scopes the rest of the current request to one society. */
export function setRequestSociety(societyId: string): void {
  const store = storage.getStore();
  if (!store) throw new Error('setRequestSociety called outside a request context');
  store.societyId = societyId;
}

/**
 * Runs fn with every query scoped to societyId. For work outside a request:
 * scheduled jobs, the seed, tests.
 *
 * The result is awaited inside the scope. Prisma queries are lazy and run when
 * awaited, so `withSociety(id, () => prisma.ticket.findMany())` would otherwise
 * hand back a query that executes after the scope has ended.
 */
export function withSociety<T>(societyId: string, fn: () => T | Promise<T>): Promise<T> {
  return storage.run({ ...storage.getStore(), societyId }, async () => await fn());
}

/** A caller-supplied id (from a proxy or the client) is kept if it looks sane. */
const INCOMING_ID = /^[A-Za-z0-9._-]{8,100}$/;

/**
 * Assigns the request an id, returns it in X-Request-Id, and tags error
 * reports with it, so a user's "it failed" can be traced to the exact log lines.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  const id = incoming && INCOMING_ID.test(incoming) ? incoming : crypto.randomUUID();

  res.setHeader('X-Request-Id', id);
  (req as Request & { id: string }).id = id;
  Sentry.getIsolationScope().setTag('request_id', id);

  storage.run({ requestId: id }, next);
}
