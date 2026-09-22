import supertest from 'supertest';
import { createApp } from '../server';

/** Credentials as written by prisma/seed.ts. */
export const ACCOUNTS = {
  resident: { flatNumber: 'B-402', phone: '+91 98210 99887', password: 'vikram123' },
  otherResident: { flatNumber: 'A-101', phone: '+91 99870 11223', password: 'ananya123' },
  maintenance: { flatNumber: 'Maintenance Office', phone: '+91 98765 11111', password: 'arvind123' },
  admin: { flatNumber: 'Admin', phone: '+91 98000 00000', password: 'admin123' },
} as const;

export type Agent = supertest.Agent;

let cached: Agent | null = null;

/**
 * Mounts the real Express app in-process. No port is bound and Vite is not
 * started, so this exercises the actual middleware and route stack.
 */
export async function agent(): Promise<Agent> {
  if (!cached) {
    cached = supertest(await createApp());
  }
  return cached;
}

export async function login(account: { flatNumber: string; phone: string; password: string }): Promise<string> {
  const res = await (await agent()).post('/api/auth/login').send(account);
  if (res.status !== 200) {
    throw new Error(`login failed for ${account.flatNumber}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
