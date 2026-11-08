import { createRecord, repository } from '../../../server/storage';
import { body, handleError, json, quota } from '../../../server/http';
import { publicScenario } from '../../../server/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = await body(request),
      storage = repository();
    await quota(request, storage, 'create', 10);
    const { record, token } = createRecord(input);
    await storage.create(record);
    return json({ ...publicScenario(record), editToken: token, storage: storage.mode }, 201);
  } catch (error) {
    return handleError(error);
  }
}
