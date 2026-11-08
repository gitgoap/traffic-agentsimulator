import { z } from 'zod';
import { scenarioSchema } from '../simulation/schema';

const finite = z.number().finite();
const count = finite.int().min(0).max(10000000);
const nullableTime = finite.min(0).max(100000).nullable();
export const summarySchema = z
  .object({
    engineVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    timestep: z.number().refine((n) => [0.05, 0.1, 0.2].includes(n)),
    metrics: z.object({
      time: finite.min(0).max(1800),
      requested: count,
      waiting: count,
      active: count,
      completed: count,
      meanSpeed: finite.min(0).max(100),
      queued: count,
      travelTime: nullableTime,
      entryWait: nullableTime,
      totalTravelTime: nullableTime,
      delay: finite.min(-1).max(100000).nullable(),
      throughput: finite.min(0).max(1000000),
      safetyBounds: count,
    }),
    interventions: z
      .array(
        z.object({
          tick: count,
          type: z.enum(['brake', 'all-red']),
          vehicleId: count.optional(),
          enabled: z.boolean().optional(),
        }),
      )
      .max(2000),
  })
  .superRefine((s, ctx) => {
    const m = s.metrics;
    if (m.requested !== m.waiting + m.active + m.completed || m.queued > m.active)
      ctx.addIssue({ code: 'custom', message: 'Run summary counts are inconsistent.' });
  });
export const shareSchema = z
  .object({
    scenario: scenarioSchema,
    summary: summarySchema.nullable().optional(),
    revision: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.summary && data.summary.metrics.time > data.scenario.duration)
      ctx.addIssue({ code: 'custom', message: 'Run time exceeds scenario duration.' });
  });
export type SharedInput = z.infer<typeof shareSchema>;
export type StoredScenario = SharedInput & {
  id: string;
  tokenHash: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export function publicScenario(record: StoredScenario) {
  return {
    id: record.id,
    scenario: record.scenario,
    summary: record.summary ?? null,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
