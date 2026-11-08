import { z } from 'zod';
import { distance, lengthOf } from './geometry';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,48}$/);
const coordinate = z.number().finite().min(-2000).max(2000);
const point = z.object({ x: coordinate, y: coordinate });
const node = point.extend({
  id,
  kind: z.enum(['boundary', 'junction']),
  level: z.number().int().min(0).max(2).default(0),
});
const road = z.object({
  id,
  from: id,
  to: id,
  lanes: z.number().int().min(1).max(4),
  laneWidth: z.number().min(2.5).max(5),
  speedLimit: z.number().min(3).max(35),
  level: z.number().int().min(0).max(2).default(0),
  points: z.array(point).min(2).max(130).optional(),
});

export const scenarioSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500),
    mode: z.enum(['ring', 'network']),
    seed: z.number().int().min(0).max(2147483647),
    duration: z.number().int().min(30).max(1800),
    vehicleCount: z.number().int().min(1).max(300),
    desiredSpeed: z.number().min(3).max(33),
    timeGap: z.number().min(0.8).max(3),
    nodes: z.array(node).min(1).max(40),
    roads: z.array(road).min(1).max(60),
    demand: z
      .array(z.object({ origin: id, destination: id, rate: z.number().min(0).max(2400) }))
      .max(16),
    signals: z
      .array(
        z.object({
          nodeId: id,
          greenSeconds: z.number().int().min(5).max(90),
          offset: z.number().min(0).max(180),
        }),
      )
      .max(20),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new TextEncoder().encode(JSON.stringify(s)).byteLength > 100000)
      issue('Scenario data must be smaller than 100 KB.');
    const nodes = new Map(s.nodes.map((n) => [n.id, n]));
    if (nodes.size !== s.nodes.length || new Set(s.roads.map((r) => r.id)).size !== s.roads.length)
      issue('Node and road IDs must be unique.');
    for (const node of s.nodes) {
      if (
        node.kind === 'junction' &&
        s.roads.filter((r) => r.from === node.id || r.to === node.id).length > 8
      )
        issue(`Junction ${node.id} supports at most eight incident directed roads in this demo.`);
    }
    for (const r of s.roads) {
      const a = nodes.get(r.from),
        b = nodes.get(r.to);
      if (!a || !b) {
        issue(`Road ${r.id} references a missing node.`);
        continue;
      }
      const points = r.points ?? [a, b];
      const length = lengthOf(points);
      if (length < (s.mode === 'ring' ? 40 : 65) || length > 10000)
        issue(`Road ${r.id} must be at least 65 m long (40 m for a ring), and at most 10 km.`);
      if (points.slice(1).some((p, i) => distance(p, points[i]) < 0.01))
        issue(`Road ${r.id} contains duplicate consecutive points.`);
      if (r.from === r.to && s.mode !== 'ring')
        issue('Self-loop roads are supported only in ring mode.');
      if (r.points && (distance(points[0], a) > 0.1 || distance(points.at(-1)!, b) > 0.1))
        issue(`Road ${r.id} geometry must meet its nodes.`);
    }
    if (s.mode === 'ring') {
      if (s.roads.length !== 1 || s.roads[0].from !== s.roads[0].to || !s.roads[0].points)
        issue('A ring needs one closed road with explicit geometry.');
      if (s.demand.length || s.signals.length)
        issue('Rings use a fixed population without demand or signals.');
      const r = s.roads[0];
      if (r && r.points && (s.vehicleCount / r.lanes) * 9 > lengthOf(r.points))
        issue('Too many cars to place safely on this ring.');
    }
    if (new Set(s.signals.map((x) => x.nodeId)).size !== s.signals.length)
      issue('Use one signal controller per junction.');
    for (const signal of s.signals)
      if (nodes.get(signal.nodeId)?.kind !== 'junction')
        issue('Signals must belong to junction nodes.');
    if (s.demand.reduce((sum, d) => sum + d.rate, 0) > 7200)
      issue('Total demand must not exceed 7,200 vehicles/hour for this demo.');
    for (const d of s.demand) {
      if (!nodes.has(d.origin) || !nodes.has(d.destination) || d.origin === d.destination) {
        issue('Demand needs distinct valid origins and destinations.');
        continue;
      }
      const visited = new Set<string>();
      // Match the engine: immediate U-turns are not permitted.
      const queue: { node: string; previous: string }[] = [{ node: d.origin, previous: '' }];
      let found = false;
      while (queue.length) {
        const current = queue.shift()!;
        if (current.node === d.destination) {
          found = true;
          break;
        }
        if (current.node !== d.origin && nodes.get(current.node)?.kind === 'boundary') continue;
        const key = current.previous + '/' + current.node;
        if (visited.has(key)) continue;
        visited.add(key);
        for (const r of s.roads)
          if (r.from === current.node && r.to !== current.previous)
            queue.push({ node: r.to, previous: current.node });
      }
      if (!found) issue(`No legal route from ${d.origin} to ${d.destination}.`);
    }
  });

export type Scenario = z.infer<typeof scenarioSchema>;
export type Road = Scenario['roads'][number];
export type NetworkNode = Scenario['nodes'][number];

export function parseScenario(value: unknown): Scenario {
  return scenarioSchema.parse(value);
}

export function scenarioError(error: unknown): string {
  return error instanceof z.ZodError
    ? error.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join(' ')
    : error instanceof Error
      ? error.message
      : 'Could not read this scenario.';
}
