import { describe, it, expect, beforeAll } from 'vitest';
import { agent, type Agent } from './helpers';

let api: Agent;

beforeAll(async () => {
  api = await agent();
});

describe('request ids', () => {
  it('assigns each request an id', async () => {
    const a = await api.get('/api/health');
    const b = await api.get('/api/health');
    expect(a.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  it('keeps a well-formed id from the caller', async () => {
    const res = await api.get('/api/health').set('X-Request-Id', 'proxy-abc-12345');
    expect(res.headers['x-request-id']).toBe('proxy-abc-12345');
  });

  it('replaces a malformed one', async () => {
    const res = await api.get('/api/health').set('X-Request-Id', 'bad id <script>');
    expect(res.headers['x-request-id']).not.toBe('bad id <script>');
  });
});
