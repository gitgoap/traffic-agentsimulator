import { atDistance } from './geometry';
import {
  compileNetwork,
  findRoute,
  isGreen,
  segmentRoute,
  type Network,
  type Segment,
} from './network';
import { parseScenario, type Scenario } from './schema';

export const ENGINE_VERSION = '1.0.0';
export const DT = 0.1;
export const VEHICLE_LENGTH = 4.5;
export const MIN_GAP = 2;
export const MAX_ACTIVE = 300;

export function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Intelligent Driver Model, with SI units. Numerical collision bounds are separate. */
export function acceleration(
  speed: number,
  leaderSpeed: number,
  gap: number,
  desiredSpeed: number,
  timeGap: number,
) {
  const a = 1.4,
    b = 2;
  const desiredGap =
    MIN_GAP +
    Math.max(0, speed * timeGap + (speed * (speed - leaderSpeed)) / (2 * Math.sqrt(a * b)));
  return Math.max(
    -8,
    Math.min(a, a * (1 - (speed / desiredSpeed) ** 4 - (desiredGap / Math.max(gap, 0.01)) ** 2)),
  );
}

type Departure = { id: number; time: number; route: string[]; laneChoice: number; factor: number };
export type Vehicle = {
  id: number;
  route: string[];
  routeIndex: number;
  position: number;
  speed: number;
  desiredSpeed: number;
  requestedAt: number;
  enteredAt: number;
  reason: string;
  tails: { movement: string; remaining: number }[];
};
export type Metrics = {
  time: number;
  requested: number;
  waiting: number;
  active: number;
  completed: number;
  meanSpeed: number;
  queued: number;
  travelTime: number | null;
  entryWait: number | null;
  totalTravelTime: number | null;
  delay: number | null;
  throughput: number;
  safetyBounds: number;
};
export type CarView = {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  desiredSpeed: number;
  segmentId: string;
  position: number;
  reason: string;
  level: number;
};
export type Intervention = {
  tick: number;
  type: 'brake' | 'all-red';
  vehicleId?: number;
  enabled?: boolean;
};
export type Snapshot = {
  tick: number;
  finished: boolean;
  metrics: Metrics;
  cars: CarView[];
  samples: Metrics[];
  allRed: boolean;
};
export type RunResult = {
  engineVersion: string;
  scenario: Scenario;
  timestep: number;
  metrics: Metrics;
  samples: Metrics[];
  interventions: Intervention[];
};

export class TrafficEngine {
  readonly scenario: Scenario;
  readonly network: Network;
  readonly dt: number;
  tick = 0;
  vehicles: Vehicle[] = [];
  samples: Metrics[] = [];
  interventions: Intervention[] = [];
  allRed = false;
  private departures: Departure[] = [];
  private pending: Departure[] = [];
  private departureIndex = 0;
  private arrived = 0;
  private sumTravel = 0;
  private sumEntryWait = 0;
  private sumDelay = 0;
  private bounds = 0;
  private ringPasses = 0;
  private freeFlow = new Map<number, number>();

  constructor(input: Scenario, dt = DT) {
    this.scenario = parseScenario(structuredClone(input));
    if (![0.05, 0.1, 0.2].includes(dt))
      throw new Error('Supported timesteps: 0.05, 0.1, 0.2 seconds.');
    this.dt = dt;
    this.network = compileNetwork(this.scenario);
    const random = randomGenerator(input.seed);
    if (input.mode === 'ring') {
      const lanes = this.network.lanes;
      for (let i = 0; i < input.vehicleCount; i++) {
        const lane = lanes[i % lanes.length],
          index = Math.floor(i / lanes.length);
        const count = Math.ceil((input.vehicleCount - (i % lanes.length)) / lanes.length);
        this.vehicles.push({
          id: i + 1,
          route: [lane.id],
          routeIndex: 0,
          position: ((index + 0.5) * lane.length) / count,
          speed: input.desiredSpeed * 0.6,
          desiredSpeed: input.desiredSpeed * (0.9 + 0.2 * random()),
          requestedAt: 0,
          enteredAt: 0,
          reason: 'Following the ring',
          tails: [],
        });
      }
    } else {
      let id = 1;
      const demand = [...input.demand].sort(
        (a, b) =>
          a.origin.localeCompare(b.origin) ||
          a.destination.localeCompare(b.destination) ||
          a.rate - b.rate,
      );
      demand.forEach((d, stream) => {
        if (!d.rate) return;
        // Separate arrival/attribute streams preserve demand under infrastructure changes.
        const rng = randomGenerator(input.seed + stream * 100003);
        const route = findRoute(input, d.origin, d.destination);
        let time = 0;
        while ((time += (-Math.log(1 - rng()) * 3600) / d.rate) < input.duration) {
          this.departures.push({
            id: id++,
            time,
            route,
            laneChoice: rng(),
            factor: 0.9 + 0.2 * rng(),
          });
        }
      });
      this.departures.sort((a, b) => a.time - b.time || a.id - b.id);
    }
    this.samples.push(this.metrics());
  }

  get time() {
    return this.tick * this.dt;
  }
  get finished() {
    return this.tick >= Math.round(this.scenario.duration / this.dt);
  }

  brake(id: number) {
    const vehicle = this.vehicles.find((v) => v.id === id);
    if (vehicle) {
      vehicle.speed = 0;
      this.interventions.push({ tick: this.tick, type: 'brake', vehicleId: id });
    }
  }

  setAllRed(enabled: boolean) {
    this.allRed = enabled;
    this.interventions.push({ tick: this.tick, type: 'all-red', enabled });
  }

  private occupancy() {
    const map = new Map<string, Vehicle[]>();
    for (const car of this.vehicles) {
      const id = car.route[car.routeIndex];
      const list = map.get(id) ?? [];
      list.push(car);
      map.set(id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);
    return map;
  }

  private queueDue(time: number) {
    while (
      this.departureIndex < this.departures.length &&
      this.departures[this.departureIndex].time <= time + 1e-9
    )
      this.pending.push(this.departures[this.departureIndex++]);
  }

  private enter() {
    this.queueDue(this.time);
    const occupancy = this.occupancy(),
      waiting: Departure[] = [];
    for (const d of this.pending) {
      if (this.vehicles.length >= MAX_ACTIVE) {
        waiting.push(d);
        continue;
      }
      const first = this.scenario.roads.find((r) => r.id === d.route[0])!;
      const lane = Math.floor(d.laneChoice * first.lanes);
      const route = segmentRoute(this.scenario, d.route, lane);
      const list = occupancy.get(route[0]) ?? [];
      if (list.length && list[0].position < VEHICLE_LENGTH + MIN_GAP + 1) {
        waiting.push(d);
        continue;
      }
      const car: Vehicle = {
        id: d.id,
        route,
        routeIndex: 0,
        position: 0,
        speed: 0,
        desiredSpeed: this.scenario.desiredSpeed * d.factor,
        requestedAt: d.time,
        enteredAt: this.time,
        reason: 'Entering the network',
        tails: [],
      };
      this.vehicles.push(car);
      list.unshift(car);
      occupancy.set(route[0], list);
      this.freeFlow.set(
        d.id,
        route.reduce((sum, id) => {
          const p = this.network.segments.get(id)!;
          return sum + p.length / Math.min(car.desiredSpeed, p.speedLimit);
        }, 0),
      );
    }
    this.pending = waiting;
  }

  private permissions(occupancy: Map<string, Vehicle[]>) {
    const permitted = new Set<number>(),
      reserved = new Set<string>();
    for (const car of this.vehicles) {
      const segment = this.network.segments.get(car.route[car.routeIndex])!;
      if (segment.nodeId) reserved.add(segment.id);
      for (const tail of car.tails) reserved.add(tail.movement);
    }
    const candidates = this.vehicles
      .filter((v) => {
        const current = this.network.segments.get(v.route[v.routeIndex])!;
        return !current.nodeId && current.length - v.position < Math.max(25, v.speed * 2);
      })
      .sort((a, b) => {
        const left = this.network.segments.get(a.route[a.routeIndex])!.length - a.position;
        const right = this.network.segments.get(b.route[b.routeIndex])!.length - b.position;
        return left - right || a.requestedAt - b.requestedAt || a.id - b.id;
      });
    for (const car of candidates) {
      const next = this.network.segments.get(car.route[car.routeIndex + 1]);
      if (!next?.nodeId || !isGreen(this.scenario, next, this.time, this.allRed)) continue;
      if ([...reserved].some((id) => next.conflicts.has(id))) continue;
      // Keep the box clear: the receiving lane must have room for the full car.
      const exit = occupancy.get(car.route[car.routeIndex + 2]);
      if (exit?.length && exit[0].position < VEHICLE_LENGTH + MIN_GAP + 2) continue;
      permitted.add(car.id);
      reserved.add(next.id);
    }
    return permitted;
  }

  step(count = 1) {
    if (!Number.isInteger(count) || count < 0 || count > 100000)
      throw new Error('Invalid step count.');
    for (let n = 0; n < count && !this.finished; n++) {
      if (this.scenario.mode === 'network') this.enter();
      const occupancy = this.occupancy(),
        permitted = this.permissions(occupancy);
      const nextVehicles: Vehicle[] = [];
      for (const car of this.vehicles) {
        const segment = this.network.segments.get(car.route[car.routeIndex])!;
        let gap = Infinity,
          leaderSpeed = car.desiredSpeed,
          reason = 'Cruising';
        const same = occupancy.get(segment.id)!;
        const ahead = same.find(
          (v) =>
            v.position > car.position + 1e-8 ||
            (Math.abs(v.position - car.position) < 1e-8 && v.id < car.id),
        );
        if (ahead) {
          gap = ahead.position - car.position - VEHICLE_LENGTH;
          leaderSpeed = ahead.speed;
          reason = 'Vehicle ahead';
        }
        if (this.scenario.mode === 'ring') {
          const leader = ahead ?? same[0];
          const ringGap =
            leader.position + (ahead ? 0 : segment.length) - car.position - VEHICLE_LENGTH;
          gap = ringGap;
          leaderSpeed = leader.speed;
          reason = 'Following the ring';
        } else {
          let distanceAhead = segment.length - car.position;
          // Look through connectors so a leader's rear is respected across boundaries.
          for (let j = car.routeIndex + 1; j < car.route.length && distanceAhead < 150; j++) {
            const next = this.network.segments.get(car.route[j])!;
            const leading = occupancy.get(next.id)?.[0];
            if (leading && distanceAhead + leading.position - VEHICLE_LENGTH < gap) {
              gap = distanceAhead + leading.position - VEHICLE_LENGTH;
              leaderSpeed = leading.speed;
              reason = 'Vehicle ahead';
            }
            if (
              j === car.routeIndex + 1 &&
              next.nodeId &&
              !permitted.has(car.id) &&
              distanceAhead - 0.5 < gap
            ) {
              gap = distanceAhead - 0.5;
              leaderSpeed = 0;
              reason = !isGreen(this.scenario, next, this.time, this.allRed)
                ? 'Red signal'
                : 'Yielding / exit blocked';
            }
            distanceAhead += next.length;
          }
        }
        let target = Math.min(car.desiredSpeed, segment.speedLimit);
        const nextSegment = this.network.segments.get(car.route[car.routeIndex + 1]);
        if (nextSegment && segment.length - car.position < 35)
          target = Math.min(target, nextSegment.speedLimit);
        const acc = acceleration(car.speed, leaderSpeed, gap, target, this.scenario.timeGap);
        let speed = Math.max(0, car.speed + acc * this.dt);
        let travel =
          acc < 0 && speed === 0
            ? -(car.speed ** 2) / (2 * acc)
            : car.speed * this.dt + 0.5 * acc * this.dt ** 2;
        const safeTravel = Math.max(0, gap - MIN_GAP);
        if (travel > safeTravel + 1e-8) {
          travel = safeTravel;
          speed = Math.min(speed, travel / this.dt);
          this.bounds++;
        }
        const updated = {
          ...car,
          tails: car.tails
            .map((t) => ({ ...t, remaining: t.remaining - travel }))
            .filter((t) => t.remaining > 0),
          position: car.position + travel,
          speed,
          reason,
        };
        if (this.scenario.mode === 'ring') {
          if (updated.position >= segment.length) this.ringPasses++;
          updated.position %= segment.length;
        } else {
          while (
            updated.position >=
              this.network.segments.get(updated.route[updated.routeIndex])!.length &&
            updated.routeIndex < updated.route.length
          ) {
            const previous = this.network.segments.get(updated.route[updated.routeIndex])!;
            updated.position -= previous.length;
            updated.routeIndex++;
            if (previous.nodeId)
              updated.tails.push({
                movement: previous.id,
                remaining: VEHICLE_LENGTH + MIN_GAP - updated.position,
              });
            if (updated.routeIndex === updated.route.length) break;
          }
        }
        if (updated.routeIndex === updated.route.length) {
          const arrival = this.time + this.dt;
          this.arrived++;
          this.sumTravel += arrival - updated.enteredAt;
          this.sumEntryWait += updated.enteredAt - updated.requestedAt;
          this.sumDelay += arrival - updated.enteredAt - this.freeFlow.get(updated.id)!;
          this.freeFlow.delete(updated.id);
        } else nextVehicles.push(updated);
      }
      this.vehicles = nextVehicles;
      this.tick++;
      if (this.scenario.mode === 'network') this.queueDue(this.time);
      if (this.tick % Math.round(1 / this.dt) === 0 || this.finished)
        this.samples.push(this.metrics());
    }
  }

  metrics(): Metrics {
    const ring = this.scenario.mode === 'ring',
      active = this.vehicles.length;
    return {
      time: this.time,
      requested: ring ? this.scenario.vehicleCount : this.departureIndex,
      waiting: this.pending.length,
      active,
      completed: this.arrived,
      meanSpeed: active ? this.vehicles.reduce((sum, v) => sum + v.speed, 0) / active : 0,
      queued: this.vehicles.filter((v) => v.speed < 0.5).length,
      travelTime: this.arrived ? this.sumTravel / this.arrived : null,
      entryWait: this.arrived ? this.sumEntryWait / this.arrived : null,
      totalTravelTime: this.arrived ? (this.sumTravel + this.sumEntryWait) / this.arrived : null,
      delay: this.arrived ? this.sumDelay / this.arrived : null,
      throughput: this.time ? ((ring ? this.ringPasses : this.arrived) / this.time) * 3600 : 0,
      safetyBounds: this.bounds,
    };
  }

  snapshot(): Snapshot {
    return {
      tick: this.tick,
      finished: this.finished,
      metrics: this.metrics(),
      allRed: this.allRed,
      samples: this.samples,
      cars: this.vehicles.map((v) => {
        const segment = this.network.segments.get(v.route[v.routeIndex])!;
        return {
          id: v.id,
          ...atDistance(segment.points, v.position),
          speed: v.speed,
          desiredSpeed: v.desiredSpeed,
          segmentId: segment.id,
          position: v.position,
          reason: v.reason,
          level: segment.level,
        };
      }),
    };
  }

  result(): RunResult {
    return {
      engineVersion: ENGINE_VERSION,
      timestep: this.dt,
      scenario: this.scenario,
      metrics: this.metrics(),
      samples: [...this.samples],
      interventions: [...this.interventions],
    };
  }
}
