import { authorize, repository } from '../../../../server/storage';
import {
  body,
  checkOrigin,
  handleError,
  json,
  quota,
  scenarioId,
  token,
} from '../../../../server/http';
import { HttpError, publicScenario } from '../../../../server/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const id = scenarioId.parse((await context.params).id),
      storage = repository();
    await quota(request, storage, 'read', 180, 60);
    const record = await storage.get(id);
    if (!record) throw new HttpError(404, 'Shared scenario not found.');
    return json({ ...publicScenario(record), storage: storage.mode });
  } catch (error) {
    return handleError(error);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const id = scenarioId.parse((await context.params).id),
      input = await body(request),
      storage = repository();
    await quota(request, storage, 'update', 60);
    const record = await storage.get(id);
    if (!record) throw new HttpError(404, 'Shared scenario not found.');
    authorize(record, token(request));
    if (input.revision !== record.revision)
      throw new HttpError(409, 'This shared copy changed. Reload it before updating.');
    const next = {
      ...record,
      scenario: input.scenario,
      summary: input.summary ?? null,
      revision: record.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await storage.update(next, record.revision);
    return json({ ...publicScenario(next), storage: storage.mode });
  } catch (error) {
    return handleError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const id = scenarioId.parse((await context.params).id),
      storage = repository();
    await quota(request, storage, 'delete', 60);
    const record = await storage.get(id);
    if (!record) throw new HttpError(404, 'Shared scenario not found.');
    authorize(record, token(request));
    await storage.remove(id);
    return json({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
