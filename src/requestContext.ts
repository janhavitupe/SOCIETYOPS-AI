import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Per-request context carried through async calls, so every log line written
 * while serving a request carries that request's id without passing it around.
 */
interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
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
