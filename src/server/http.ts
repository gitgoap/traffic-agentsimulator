import { z } from 'zod';
import { hashToken, type Repository } from './storage';
import { HttpError, shareSchema } from './contracts';

export const scenarioId = z.uuid();
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, 'Cross-origin writes are not allowed.');
  }
  // Next.js may reconstruct request.url with an internal hostname behind a proxy.
  // Host is the browser's actual destination, unlike arbitrary forwarded headers.
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== host)
    throw new HttpError(403, 'Cross-origin writes are not allowed.');
}
export async function body(request: Request) {
  checkOrigin(request);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new HttpError(415, 'Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 200000) {
      await reader.cancel();
      throw new HttpError(413, 'Shared scenarios must be smaller than 200 KB.');
    }
    chunks.push(value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Could not read JSON.');
  }
  return shareSchema.parse(parsed);
}

export async function quota(
  request: Request,
  storage: Repository,
  operation: string,
  limit: number,
  seconds = 3600,
) {
  // Hosting proxies overwrite these headers. Local development quotas are best-effort.
  const ip =
    request.headers.get('x-nf-client-connection-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const key = hashToken(operation + ':' + ip);
  if (!(await storage.quota(key, limit, seconds)))
    throw new HttpError(429, 'Too many requests. Please try later, or save locally.', seconds);
}
export const token = (request: Request) =>
  request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export function handleError(error: unknown) {
  if (error instanceof HttpError) {
    const response = json({ error: error.message }, error.status);
    if (error.status === 429) response.headers.set('Retry-After', String(error.retryAfter ?? 3600));
    return response;
  }
  if (error instanceof z.ZodError)
    return json(
      {
        error: error.issues
          .slice(0, 3)
          .map((i) => i.message)
          .join(' '),
      },
      400,
    );
  // Never return underlying database, credential, or filesystem details.
  console.error('Scenario storage failed:', error instanceof Error ? error.name : 'Unknown error');
  return json(
    { error: 'Storage could not complete the request. Export a local backup and try again.' },
    500,
  );
}
