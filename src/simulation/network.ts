import {
  atDistance,
  lengthOf,
  offsetPath,
  pathsConflict,
  trimPath,
  turnPath,
  type Point,
} from './geometry';
import type { Scenario, Road } from './schema';

export type Segment = {
  id: string;
  points: Point[];
  length: number;
  speedLimit: number;
  roadId: string;
  lane: number;
  level: number;
  nodeId?: string;
  fromRoad?: string;
  toRoad?: string;
  conflicts: Set<string>;
};
export type Network = { segments: Map<string, Segment>; lanes: Segment[]; movements: Segment[] };
export const laneId = (road: string, lane: number) => `${road}:${lane}`;
export const turnId = (from: string, lane: number, to: string) => `${from}:${lane}>${to}`;

export function compileNetwork(s: Scenario): Network {
  const segments = new Map<string, Segment>(),
    lanes: Segment[] = [],
    movements: Segment[] = [];
  const nodes = new Map(s.nodes.map((n) => [n.id, n]));
  for (const r of s.roads) {
    const a = nodes.get(r.from)!,
      b = nodes.get(r.to)!;
    const path = r.points ?? [a, b];
    for (let lane = 0; lane < r.lanes; lane++) {
      // Lanes lie to the left of each direction's centreline: left-hand traffic.
      const offset = -(lane + 0.5) * r.laneWidth;
      const points =
        s.mode === 'ring'
          ? offsetPath(path, offset)
          : trimPath(
              offsetPath(path, offset),
              a.kind === 'junction' ? 18 : 0,
              b.kind === 'junction' ? 18 : 0,
            );
      const segment: Segment = {
        id: laneId(r.id, lane),
        roadId: r.id,
        lane,
        points,
        length: lengthOf(points),
        speedLimit: r.speedLimit,
        level: r.level,
        conflicts: new Set(),
      };
      segments.set(segment.id, segment);
      lanes.push(segment);
    }
  }
  if (s.mode !== 'ring')
    for (const a of s.roads)
      for (const b of s.roads) {
        if (a.to !== b.from || a.from === b.to || nodes.get(a.to)!.kind !== 'junction') continue;
        for (let lane = 0; lane < a.lanes; lane++) {
          const from = segments.get(laneId(a.id, lane))!,
            to = segments.get(laneId(b.id, Math.min(lane, b.lanes - 1)))!;
          const points = turnPath(
            atDistance(from.points, from.length),
            nodes.get(a.to)!,
            atDistance(to.points, 0),
          );
          const straight =
            Math.cos(atDistance(from.points, from.length).angle - atDistance(to.points, 0).angle) >
            0.95;
          const segment: Segment = {
            id: turnId(a.id, lane, b.id),
            roadId: '',
            lane,
            points,
            length: lengthOf(points),
            speedLimit: Math.min(a.speedLimit, b.speedLimit, straight ? 35 : 10),
            level: nodes.get(a.to)!.level,
            nodeId: a.to,
            fromRoad: a.id,
            toRoad: b.id,
            conflicts: new Set(),
          };
          segments.set(segment.id, segment);
          movements.push(segment);
        }
      }
  for (const a of movements)
    for (const b of movements) {
      if (
        a.id !== b.id &&
        a.nodeId === b.nodeId &&
        (a.toRoad === b.toRoad || pathsConflict(a.points, b.points))
      )
        a.conflicts.add(b.id);
    }
  return { segments, lanes, movements };
}

export function findRoute(s: Scenario, origin: string, destination: string): string[] {
  const nodes = new Map(s.nodes.map((n) => [n.id, n]));
  const cost = (r: Road) =>
    lengthOf(r.points ?? [nodes.get(r.from)!, nodes.get(r.to)!]) / r.speedLimit;
  const queue: { node: string; previous: string; path: string[]; cost: number }[] = [
    { node: origin, previous: '', path: [], cost: 0 },
  ];
  const visited = new Set<string>();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const c = queue.shift()!;
    if (c.node === destination) return c.path;
    if (c.node !== origin && nodes.get(c.node)!.kind === 'boundary') continue;
    const key = c.previous + '/' + c.node;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const r of s.roads)
      if (r.from === c.node && r.to !== c.previous)
        queue.push({
          node: r.to,
          previous: c.node,
          path: [...c.path, r.id],
          cost: c.cost + cost(r),
        });
  }
  return [];
}

export function segmentRoute(s: Scenario, roads: string[], firstLane: number): string[] {
  let lane = firstLane;
  return roads.flatMap((r, i) => {
    const parts = [laneId(r, lane)];
    if (i < roads.length - 1) {
      parts.push(turnId(r, lane, roads[i + 1]));
      lane = Math.min(lane, s.roads.find((x) => x.id === roads[i + 1])!.lanes - 1);
    }
    return parts;
  });
}

export type SignalState = {
  color: 'green' | 'amber' | 'red';
  remaining: number;
  group: 'horizontal' | 'vertical';
};
export function signalState(s: Scenario, nodeId: string, time: number): SignalState | null {
  const controller = s.signals.find((x) => x.nodeId === nodeId);
  if (!controller) return null;
  const g = controller.greenSeconds,
    cycle = 2 * (g + 5),
    t = (((time + controller.offset) % cycle) + cycle) % cycle;
  const group = t < g + 5 ? 'horizontal' : 'vertical',
    phase = t % (g + 5);
  const color = phase < g ? 'green' : phase < g + 3 ? 'amber' : 'red';
  return {
    color,
    remaining: color === 'green' ? g - phase : color === 'amber' ? g + 3 - phase : g + 5 - phase,
    group,
  };
}

export function isGreen(s: Scenario, segment: Segment, time: number, forcedRed = false): boolean {
  const state = signalState(s, segment.nodeId!, time);
  if (forcedRed) return false;
  if (!state) return true;
  const r = s.roads.find((r) => r.id === segment.fromRoad)!;
  const a = s.nodes.find((n) => n.id === r.from)!,
    b = s.nodes.find((n) => n.id === r.to)!;
  const group = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertical';
  return state.color === 'green' && group === state.group;
}
