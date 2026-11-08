import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { POST } from '../app/api/scenarios/route';
import { GET, PUT, DELETE } from '../app/api/scenarios/[id]/route';
import { presets } from '../simulation/presets';
import { TrafficEngine } from '../simulation/engine';
import { LocalRepository, SupabaseRepository, authorize, createRecord } from './storage';
import { checkOrigin } from './http';

let directory: string;
const request = (
  method: string,
  data?: unknown,
  token?: string,
  headers: Record<string, string> = {},
) =>
  new Request('http://localhost/api/scenarios', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'traffic-api-'));
  vi.stubEnv('TRAFFIC_DATA_DIR', directory);
  vi.stubEnv('TRAFFIC_STORAGE', 'local');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('NETLIFY', '');
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('scenario API', () => {
  it('accepts the browser host when Next reconstructs an internal URL', () => {
    expect(() =>
      checkOrigin(
        new Request('http://internal:3100/api/scenarios', {
          headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100' },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      checkOrigin(
        new Request('http://internal:3100/api/scenarios', {
          headers: { host: '127.0.0.1:3100', origin: 'https://evil.example' },
        }),
      ),
    ).toThrow();
  });
  it('saves, reads, updates, and deletes a scenario with a private capability', async () => {
    const engine = new TrafficEngine(presets.ring);
    engine.step(10);
    const { scenario, samples: _samples, ...summary } = engine.result();
    const created = await POST(request('POST', { scenario, summary }));
    expect(created.status).toBe(201);
    const saved = await created.json();
    expect(saved.editToken).toHaveLength(43);
    expect(saved.tokenHash).toBeUndefined();
    const loaded = await GET(request('GET'), context(saved.id));
    const publicData = await loaded.json();
    expect(publicData.scenario).toEqual(scenario);
    expect(publicData.summary).toEqual(summary);
    expect(publicData.editToken).toBeUndefined();
    expect(publicData.tokenHash).toBeUndefined();
    expect((await PUT(request('PUT', { scenario, revision: 1 }), context(saved.id))).status).toBe(
      403,
    );
    expect(
      (await DELETE(request('DELETE', undefined, 'a'.repeat(43)), context(saved.id))).status,
    ).toBe(403);
    const updated = await PUT(
      request('PUT', { scenario: { ...scenario, name: 'Updated' }, revision: 1 }, saved.editToken),
      context(saved.id),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).revision).toBe(2);
    expect(
      (await PUT(request('PUT', { scenario, revision: 1 }, saved.editToken), context(saved.id)))
        .status,
    ).toBe(409);
    expect(
      (await DELETE(request('DELETE', undefined, saved.editToken), context(saved.id))).status,
    ).toBe(200);
    expect((await GET(request('GET'), context(saved.id))).status).toBe(404);
  });
  it('rejects invalid data, invalid IDs, excessive bodies, and cross-origin writes', async () => {
    expect((await POST(request('POST', { scenario: { name: 'invalid' } }))).status).toBe(400);
    expect((await GET(request('GET'), context('../../etc/passwd'))).status).toBe(400);
    expect(
      (await POST(request('POST', { scenario: presets.ring, extra: 'x'.repeat(200000) }))).status,
    ).toBe(413);
    expect(
      (
        await POST(
          request('POST', { scenario: presets.ring }, undefined, {
            origin: 'https://other.example',
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await POST(new Request('http://localhost/api/scenarios', { method: 'POST', body: '{}' })))
        .status,
    ).toBe(415);
    expect(
      (
        await POST(
          new Request('http://localhost/api/scenarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'bad',
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('requires consistent saved metrics', async () => {
    const { samples: _samples, scenario, ...summary } = new TrafficEngine(presets.ring).result();
    summary.metrics.requested = 99;
    expect((await POST(request('POST', { scenario, summary }))).status).toBe(400);
  });
  it('rate limits scenario creation', async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++)
      statuses.push(
        (
          await POST(
            request('POST', { scenario: presets.ring }, undefined, { 'x-real-ip': 'quota-test' }),
          )
        ).status,
      );
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
  });
});

describe('storage ownership and concurrent updates', () => {
  it('hashes tokens and rejects the wrong edit key', () => {
    const { record, token } = createRecord({ scenario: presets.ring });
    expect(record.tokenHash).not.toBe(token);
    expect(() => authorize(record, token)).not.toThrow();
    expect(() => authorize(record, 'b'.repeat(43))).toThrow();
  });
  it('persists across repository instances and detects competing writes', async () => {
    const storage = new LocalRepository(directory),
      { record } = createRecord({ scenario: presets.ring });
    await storage.create(record);
    const second = new LocalRepository(directory);
    expect((await second.get(record.id))?.scenario).toEqual(presets.ring);
    const next = { ...record, revision: 2 };
    const results = await Promise.allSettled([storage.update(next, 1), storage.update(next, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(storage.get('../../secrets')).rejects.toThrow();
  });
});

describe('cloud storage adapter', () => {
  it('maps records to PostgREST and uses conditional revisions', async () => {
    const { record } = createRecord({ scenario: presets.ring });
    const row = {
      id: record.id,
      token_hash: record.tokenHash,
      scenario: record.scenario,
      summary: null,
      revision: 1,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([row]));
    const storage = new SupabaseRepository('https://project.supabase.co', 'test-key');
    expect((await storage.get(record.id))?.scenario).toEqual(record.scenario);
    fetch.mockResolvedValueOnce(Response.json([]));
    await expect(storage.update({ ...record, revision: 2 }, 1)).rejects.toThrow('changed');
    expect(String(fetch.mock.calls.at(-1)![0])).toContain('&revision=eq.1');
    fetch.mockResolvedValueOnce(Response.json(true));
    expect(await storage.quota('test', 10, 60)).toBe(true);
    fetch.mockResolvedValueOnce(new Response('private database details', { status: 500 }));
    await expect(storage.get(record.id)).rejects.toThrow('Cloud storage could not complete');
    fetch.mockRestore();
  });
});
