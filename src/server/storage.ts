import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { HttpError, type StoredScenario, type SharedInput } from './contracts';

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export function authorize(record: StoredScenario, token: string) {
  if (
    !/^[\w-]{43}$/.test(token) ||
    !timingSafeEqual(Buffer.from(record.tokenHash, 'hex'), Buffer.from(hashToken(token), 'hex'))
  )
    throw new HttpError(403, 'The private edit key is missing or invalid.');
}
export function createRecord(input: SharedInput): { record: StoredScenario; token: string } {
  const token = randomBytes(32).toString('base64url'),
    now = new Date().toISOString();
  return {
    token,
    record: {
      ...input,
      id: randomUUID(),
      tokenHash: hashToken(token),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
  };
}
export interface Repository {
  mode: 'local' | 'cloud';
  get(id: string): Promise<StoredScenario | null>;
  create(record: StoredScenario): Promise<void>;
  update(record: StoredScenario, expectedRevision: number): Promise<void>;
  remove(id: string): Promise<void>;
  quota(key: string, limit: number, seconds: number): Promise<boolean>;
}

/** Local development only: atomic files, with serialized per-record writes. */
export class LocalRepository implements Repository {
  mode = 'local' as const;
  private locks = new Map<string, Promise<unknown>>();
  private quotas = new Map<string, { count: number; expires: number }>();
  constructor(private directory: string) {}
  private filename(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new HttpError(400, 'Invalid scenario ID.');
    return path.join(this.directory, id + '.json');
  }
  async get(id: string) {
    try {
      return JSON.parse(await readFile(this.filename(id), 'utf8')) as StoredScenario;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  private async save(record: StoredScenario) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = this.filename(record.id) + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, this.filename(record.id));
  }
  async create(record: StoredScenario) {
    await this.save(record);
  }
  async update(record: StoredScenario, expectedRevision: number) {
    const previous = this.locks.get(record.id) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        const existing = await this.get(record.id);
        if (!existing) throw new HttpError(404, 'Scenario not found.');
        if (existing.revision !== expectedRevision)
          throw new HttpError(409, 'This shared copy changed. Reload it before updating.');
        await this.save(record);
      });
    this.locks.set(record.id, operation);
    try {
      await operation;
    } finally {
      if (this.locks.get(record.id) === operation) this.locks.delete(record.id);
    }
  }
  async remove(id: string) {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        try {
          await unlink(this.filename(id));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      });
    this.locks.set(id, operation);
    try {
      await operation;
    } finally {
      if (this.locks.get(id) === operation) this.locks.delete(id);
    }
  }
  async quota(key: string, limit: number, seconds: number) {
    const now = Date.now();
    for (const [k, q] of this.quotas) if (q.expires < now) this.quotas.delete(k);
    const q = this.quotas.get(key);
    if (!q) {
      this.quotas.set(key, { count: 1, expires: now + seconds * 1000 });
      return true;
    }
    q.count++;
    return q.count <= limit;
  }
}

type Row = {
  id: string;
  token_hash: string;
  scenario: StoredScenario['scenario'];
  summary: StoredScenario['summary'];
  revision: number;
  created_at: string;
  updated_at: string;
};
const toRow = (r: StoredScenario): Row => ({
  id: r.id,
  token_hash: r.tokenHash,
  scenario: r.scenario,
  summary: r.summary ?? null,
  revision: r.revision,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
});
const fromRow = (r: Row): StoredScenario => ({
  id: r.id,
  tokenHash: r.token_hash,
  scenario: r.scenario,
  summary: r.summary,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SupabaseRepository implements Repository {
  mode = 'cloud' as const;
  constructor(
    private url: string,
    private key: string,
  ) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      throw new HttpError(503, 'Set SUPABASE_URL to your HTTPS project origin.');
    this.url = parsed.origin;
  }
  private async request(endpoint: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(`${this.url}/rest/v1/${endpoint}`, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          ...init.headers,
        },
      });
    } catch {
      throw new HttpError(
        503,
        'Cloud storage is temporarily unavailable. Save locally or export JSON.',
      );
    }
    if (!response.ok)
      throw new HttpError(
        503,
        'Cloud storage could not complete the request. Check database setup or export JSON.',
      );
    return response.status === 204 ? null : response.json();
  }
  async get(id: string) {
    const rows = (await this.request(
      `traffic_scenarios?id=eq.${encodeURIComponent(id)}&select=*`,
    )) as Row[];
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async create(record: StoredScenario) {
    await this.request('traffic_scenarios', {
      method: 'POST',
      body: JSON.stringify(toRow(record)),
    });
  }
  async update(record: StoredScenario, expectedRevision: number) {
    const rows = (await this.request(
      `traffic_scenarios?id=eq.${record.id}&revision=eq.${expectedRevision}`,
      { method: 'PATCH', body: JSON.stringify(toRow(record)) },
    )) as Row[];
    if (!rows.length)
      throw new HttpError(409, 'This shared copy changed. Reload it before updating.');
  }
  async remove(id: string) {
    await this.request(`traffic_scenarios?id=eq.${id}`, { method: 'DELETE' });
  }
  async quota(key: string, limit: number, seconds: number) {
    return (await this.request('rpc/traffic_take_quota', {
      method: 'POST',
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: seconds }),
    })) as boolean;
  }
}

const repositories = new Map<string, Repository>();
export function repository(): Repository {
  const local =
    process.env.TRAFFIC_STORAGE === 'local' ||
    (process.env.NODE_ENV !== 'production' && !process.env.SUPABASE_URL);
  if (local && (process.env.VERCEL || process.env.NETLIFY))
    throw new HttpError(
      503,
      'Cloud sharing needs Supabase configuration. Local saving and JSON export are available.',
    );
  const key = local
    ? `local:${process.env.TRAFFIC_DATA_DIR ?? '.local/scenarios'}`
    : `cloud:${process.env.SUPABASE_URL}`;
  if (repositories.has(key)) return repositories.get(key)!;
  let storage: Repository;
  if (local)
    storage = new LocalRepository(
      path.resolve(/* turbopackIgnore: true */ process.env.TRAFFIC_DATA_DIR ?? '.local/scenarios'),
    );
  else {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new HttpError(
        503,
        'Cloud sharing is not configured. Use local saving or JSON export until deployment setup is complete.',
      );
    storage = new SupabaseRepository(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  repositories.set(key, storage);
  return storage;
}
