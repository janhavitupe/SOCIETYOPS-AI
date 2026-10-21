import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import { agent, login, bearer, ACCOUNTS, deleteTickets, type Agent } from './helpers';
import { unscopedPrisma as prisma } from '../src/database/prisma';
import { getStorage, LocalStorageDriver } from '../src/services/storage';

let api: Agent;
let residentToken: string;
let otherToken: string;
const created: string[] = [];

/** A 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function requestUpload(token: string, size = PNG.length, contentType = 'image/png') {
  return api.post('/api/uploads').set(bearer(token)).send({ contentType, size });
}

async function uploadPng(token: string): Promise<string> {
  const res = await requestUpload(token);
  expect(res.status).toBe(201);
  const put = await api.put(res.body.upload.url).set(res.body.upload.headers).send(PNG);
  expect(put.status).toBe(200);
  return res.body.key;
}

beforeAll(async () => {
  api = await agent();
  residentToken = await login(ACCOUNTS.resident);
  otherToken = await login(ACCOUNTS.otherResident);
});

afterAll(async () => {
  await deleteTickets(created);
  await fs.rm((getStorage() as LocalStorageDriver).root, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('upload requests', () => {
  it('uses the local driver in tests', () => {
    expect(getStorage().name).toBe('local');
  });

  it('refuses a type that is not a photo', async () => {
    expect((await requestUpload(residentToken, 100, 'application/pdf')).status).toBe(400);
  });

  it('refuses a photo over 5 MB', async () => {
    expect((await requestUpload(residentToken, 6 * 1024 * 1024)).status).toBe(400);
  });

  it('requires a session', async () => {
    const res = await api.post('/api/uploads').send({ contentType: 'image/png', size: 10 });
    expect(res.status).toBe(401);
  });
});

describe('signed upload URLs', () => {
  it('rejects a body of a different size than was signed', async () => {
    const res = await requestUpload(residentToken, PNG.length + 10);
    const put = await api.put(res.body.upload.url).set(res.body.upload.headers).send(PNG);
    expect(put.status).toBe(400);
  });

  it('rejects a tampered signature', async () => {
    const res = await requestUpload(residentToken);
    const url = res.body.upload.url.replace(/sig=[^&]+/, 'sig=forged');
    const put = await api.put(url).set(res.body.upload.headers).send(PNG);
    expect(put.status).toBe(403);
  });

  it('rejects a URL re-pointed at another key', async () => {
    const res = await requestUpload(residentToken);
    const url = res.body.upload.url.replace(res.body.key, res.body.key.replace(/[0-9a-f]{8}-/, '00000000-'));
    const put = await api.put(url).set(res.body.upload.headers).send(PNG);
    expect(put.status).toBe(403);
  });
});

describe('attaching photos to a ticket', () => {
  it('stores the key and returns a URL that serves the photo', async () => {
    const key = await uploadPng(residentToken);

    const res = await api
      .post('/api/tickets')
      .set(bearer(residentToken))
      .send({
        issueCategory: 'Plumbing',
        description: 'Leak under sink, photo attached',
        urgency: 'Low',
        images: [key],
      });
    expect(res.status).toBe(201);
    created.push(res.body.id);

    const row = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(row?.images).toEqual([key]);

    const url: string = res.body.images[0];
    expect(url).toContain('sig=');
    const photo = await api
      .get(url)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(photo.body, PNG)).toBe(0);
  });

  it("refuses another resident's upload", async () => {
    const key = await uploadPng(otherToken);
    const res = await api
      .post('/api/tickets')
      .set(bearer(residentToken))
      .send({ issueCategory: 'Plumbing', description: 'not my photo', urgency: 'Low', images: [key] });
    expect(res.status).toBe(400);
  });

  it('refuses a key that was never uploaded', async () => {
    const pending = await requestUpload(residentToken);
    const res = await api
      .post('/api/tickets')
      .set(bearer(residentToken))
      .send({
        issueCategory: 'Plumbing',
        description: 'upload never finished',
        urgency: 'Low',
        images: [pending.body.key],
      });
    expect(res.status).toBe(400);
  });

  it('refuses an inline data URL', async () => {
    const res = await api
      .post('/api/tickets')
      .set(bearer(residentToken))
      .send({
        issueCategory: 'Plumbing',
        description: 'base64 again',
        urgency: 'Low',
        images: ['data:image/png;base64,AAAA'],
      });
    expect(res.status).toBe(400);
  });

  it('refuses a download link without a valid signature', async () => {
    const key = await uploadPng(residentToken);
    expect((await api.get(`/api/files/${key}`)).status).toBe(403);
  });
});
