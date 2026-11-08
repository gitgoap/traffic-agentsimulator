import { describe, expect, it } from 'vitest';
import { TrafficEngine, acceleration, MIN_GAP, VEHICLE_LENGTH, randomGenerator } from './engine';
import { cloneScenario, presets } from './presets';
import { compileNetwork, findRoute, isGreen, signalState } from './network';
import { parseScenario } from './schema';

function checkInvariants(engine: TrafficEngine) {
  const metrics = engine.metrics();
  expect(metrics.requested).toBe(metrics.waiting + metrics.active + metrics.completed);
  const occupied = new Map<string, number[]>();
  for (const v of engine.vehicles) {
    expect(Number.isFinite(v.speed)).toBe(true);
    expect(v.speed).toBeGreaterThanOrEqual(0);
    const id = v.route[v.routeIndex],
      segment = engine.network.segments.get(id)!;
    expect(v.position).toBeGreaterThanOrEqual(0);
    expect(v.position).toBeLessThan(segment.length + 1e-6);
    const positions = occupied.get(id) ?? [];
    positions.push(v.position);
    occupied.set(id, positions);
  }
  for (const [id, positions] of occupied) {
    positions.sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++)
      expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(
        VEHICLE_LENGTH + MIN_GAP - 1e-6,
      );
    if (engine.scenario.mode === 'ring' && positions.length > 1)
      expect(
        engine.network.segments.get(id)!.length + positions[0] - positions.at(-1)!,
      ).toBeGreaterThanOrEqual(VEHICLE_LENGTH + MIN_GAP - 1e-6);
  }
  const movements = engine.vehicles
    .map((v) => engine.network.segments.get(v.route[v.routeIndex])!)
    .filter((s) => s.nodeId);
  for (const a of movements) for (const b of movements) expect(a.conflicts.has(b.id)).toBe(false);
  // Check following gaps across segment boundaries, including the leader's rear.
  if (engine.scenario.mode === 'network')
    for (const follower of engine.vehicles) {
      const nextId = follower.route[follower.routeIndex + 1];
      if (!nextId) continue;
      const remaining =
        engine.network.segments.get(follower.route[follower.routeIndex])!.length -
        follower.position;
      const leaders = occupied.get(nextId) ?? [];
      if (leaders.length)
        expect(remaining + leaders[0]).toBeGreaterThanOrEqual(VEHICLE_LENGTH + MIN_GAP - 1e-6);
    }
}

describe('agent behavior and reproducibility', () => {
  it('accelerates freely and brakes for a closing gap', () => {
    expect(acceleration(0, 0, Infinity, 20, 1.4)).toBeGreaterThan(0);
    expect(acceleration(20, 0, 10, 20, 1.4)).toBeLessThan(0);
    expect(acceleration(0, 0, 0, 20, 1.4)).toBe(-8);
  });
  it('has deterministic seeded randomness', () => {
    const a = randomGenerator(42),
      b = randomGenerator(42);
    expect(Array.from({ length: 100 }, a)).toEqual(Array.from({ length: 100 }, b));
  });
  it('a lone vehicle approaches its desired speed', () => {
    const s = { ...cloneScenario(presets.ring), vehicleCount: 1 };
    const e = new TrafficEngine(s);
    e.step(1000);
    expect(e.vehicles[0].speed).toBeCloseTo(e.vehicles[0].desiredSpeed, 1);
    expect(e.metrics().completed).toBe(0);
  });
  it('matches after equal tick counts, independently of batching', () => {
    const a = new TrafficEngine(presets.ring),
      b = new TrafficEngine(presets.ring);
    a.step(200);
    for (let i = 0; i < 200; i++) b.step();
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(new TrafficEngine(presets.ring).tick).toBe(0);
  });
  it('perturbations are recorded and change traffic without losing cars', () => {
    const e = new TrafficEngine(presets.ring);
    e.step(200);
    e.brake(2);
    expect(e.vehicles.find((v) => v.id === 2)!.speed).toBe(0);
    for (let i = 0; i < 50; i++) {
      e.step(5);
      checkInvariants(e);
    }
    expect(e.interventions).toEqual([{ tick: 200, type: 'brake', vehicleId: 2 }]);
  });
});

describe('networks and signals', () => {
  it.each(Object.entries(presets))('%s is valid and has finite geometry', (_, s) => {
    expect(() => parseScenario(s)).not.toThrow();
    for (const segment of compileNetwork(s).segments.values()) {
      expect(segment.length).toBeGreaterThan(1);
      expect(Number.isFinite(segment.length)).toBe(true);
    }
  });
  it('routes over the flyover and through the ramp without creating a crossing connection', () => {
    expect(findRoute(presets.flyover, 'west', 'east')).toEqual(['over_west', 'over_east']);
    expect(findRoute(presets.flyover, 'south', 'east')).toEqual(['ramp', 'over_east']);
    expect(findRoute(presets.flyover, 'west', 'south')).toEqual([]);
    expect(compileNetwork(presets.flyover).movements.every((m) => m.nodeId === 'merge')).toBe(true);
  });
  it('includes amber and all-red clearance between phases', () => {
    expect(signalState(presets.junction, 'center', 24)!.color).toBe('green');
    expect(signalState(presets.junction, 'center', 26)!.color).toBe('amber');
    expect(signalState(presets.junction, 'center', 29)!.color).toBe('red');
    expect(signalState(presets.junction, 'center', 31)!.group).toBe('vertical');
    const turn = compileNetwork(presets.junction).movements.find((m) => m.fromRoad === 'west_in')!;
    expect(isGreen(presets.junction, turn, 0)).toBe(true);
    expect(isGreen(presets.junction, turn, 26)).toBe(false);
    expect(isGreen(presets.junction, turn, 31)).toBe(false);
  });
  it('holds cars before red stop lines and retains blocked arrivals', () => {
    const s = cloneScenario(presets.junction);
    s.demand = [{ origin: 'west', destination: 'east', rate: 2400 }];
    const e = new TrafficEngine(s);
    e.setAllRed(true);
    for (let i = 0; i < 100; i++) {
      e.step(20);
      checkInvariants(e);
    }
    expect(e.metrics().completed).toBe(0);
    expect(e.metrics().queued).toBeGreaterThan(0);
    expect(e.metrics().waiting).toBeGreaterThan(0);
    expect(e.vehicles.every((v) => v.routeIndex === 0)).toBe(true);
  });
  it.each(['ring', 'junction', 'flyover'] as const)(
    '%s runs to completion with conserved, non-overlapping traffic',
    (key) => {
      const e = new TrafficEngine(presets[key]);
      while (!e.finished) {
        e.step(10);
        checkInvariants(e);
      }
      expect(e.time).toBe(e.scenario.duration);
      expect(e.samples.length).toBe(e.scenario.duration + 1);
      if (key !== 'ring') {
        expect(e.metrics().completed).toBeGreaterThan(10);
        expect(e.metrics().travelTime).toBeGreaterThan(0);
        expect(e.metrics().totalTravelTime).toBeGreaterThanOrEqual(e.metrics().travelTime!);
      }
      const final = e.snapshot();
      e.step(50);
      expect(e.snapshot()).toEqual(final);
    },
  );
  it('supports multiple lanes and a merge to a narrower receiving road', () => {
    const s = cloneScenario(presets.flyover);
    s.roads[0].lanes = 3;
    s.demand = [
      { origin: 'west', destination: 'east', rate: 1800 },
      { origin: 'south', destination: 'east', rate: 1000 },
    ];
    const e = new TrafficEngine(s);
    for (let i = 0; i < 300; i++) {
      e.step(10);
      checkInvariants(e);
    }
    expect(e.metrics().completed).toBeGreaterThan(10);
  });
  it('keeps arrivals identical when infrastructure changes', () => {
    const a = cloneScenario(presets.junction),
      b = cloneScenario(a);
    b.roads.forEach((r) => (r.lanes = 2));
    const left = new TrafficEngine(a),
      right = new TrafficEngine(b);
    left.step(2000);
    right.step(2000);
    expect(left.metrics().requested).toBe(right.metrics().requested);
  });
  it('keeps outcomes identical when the same demand rows are reordered', () => {
    const a = new TrafficEngine(presets.junction);
    const s = cloneScenario(presets.junction);
    s.demand.reverse();
    const b = new TrafficEngine(s);
    a.step(1000);
    b.step(1000);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
  it.each([0, 7, 2026])(
    'preserves spacing under varied speeds, lanes, and signal timing (seed %i)',
    (seed) => {
      for (const preset of [presets.junction, presets.flyover]) {
        const s = cloneScenario(preset);
        s.seed = seed;
        s.duration = 120;
        s.desiredSpeed = 30;
        s.timeGap = 0.8;
        s.roads.forEach((r, i) => {
          r.lanes = (i % 3) + 1;
          r.speedLimit = 33;
        });
        s.signals.forEach((c) => (c.greenSeconds = 5));
        s.demand.forEach((d) => (d.rate = 1800));
        const e = new TrafficEngine(s);
        while (!e.finished) {
          e.step(10);
          checkInvariants(e);
        }
      }
    },
  );
  it('handles the maximum ring population', () => {
    const s = cloneScenario(presets.ring);
    s.roads[0].lanes = 4;
    s.vehicleCount = 300;
    s.duration = 60;
    const e = new TrafficEngine(s);
    e.brake(1);
    while (!e.finished) {
      e.step(10);
      checkInvariants(e);
    }
    expect(e.metrics().active).toBe(300);
  });
  it('retains excess open-network demand when the active-vehicle cap is reached', () => {
    const s = cloneScenario(presets.junction);
    s.duration = 600;
    s.roads.forEach((r) => (r.lanes = 4));
    s.demand.forEach((d) => (d.rate = 1800));
    const e = new TrafficEngine(s);
    e.setAllRed(true);
    while (!e.finished) {
      e.step(100);
      checkInvariants(e);
      expect(e.metrics().active).toBeLessThanOrEqual(300);
    }
    expect(e.metrics().active).toBe(300);
    expect(e.metrics().waiting).toBeGreaterThan(300);
    expect(e.metrics().completed).toBe(0);
  });
  it('counts departures arriving during the final timestep as waiting, not lost', () => {
    const s = cloneScenario(presets.junction);
    s.duration = 30;
    const random = randomGenerator(s.seed);
    const rate = (-Math.log(1 - random()) * 3600) / 29.96;
    s.demand = [{ origin: 'west', destination: 'east', rate }];
    const engine = new TrafficEngine(s);
    engine.step(300);
    expect(engine.metrics().requested).toBe(1);
    expect(engine.metrics().waiting).toBe(1);
    checkInvariants(engine);
  });
  it('has a stable travel-time conclusion under a smaller timestep', () => {
    const a = new TrafficEngine(presets.flyover, 0.1),
      b = new TrafficEngine(presets.flyover, 0.05);
    a.step(3000);
    b.step(6000);
    expect(Math.abs(a.metrics().travelTime! - b.metrics().travelTime!)).toBeLessThan(3);
  });
});

describe('reject invalid inputs', () => {
  it('rejects unknown nodes, unreachable demand, duplicate IDs and unsafe density', () => {
    const missing = cloneScenario(presets.junction);
    missing.roads[0].to = 'unknown';
    expect(() => parseScenario(missing)).toThrow();
    const unreachable = cloneScenario(presets.flyover);
    unreachable.demand.push({ origin: 'west', destination: 'south', rate: 20 });
    expect(() => parseScenario(unreachable)).toThrow();
    const duplicate = cloneScenario(presets.junction);
    duplicate.nodes.push(duplicate.nodes[0]);
    expect(() => parseScenario(duplicate)).toThrow();
    expect(() => parseScenario({ ...presets.ring, vehicleCount: 300 })).toThrow();
    expect(() => new TrafficEngine(presets.ring, 0.9)).toThrow();
  });
  it('rejects NaN and impossible road geometry', () => {
    expect(() => parseScenario({ ...presets.ring, desiredSpeed: NaN })).toThrow();
    const s = cloneScenario(presets.junction);
    s.nodes.find((n) => n.id === 'west')!.x = -20;
    expect(() => parseScenario(s)).toThrow();
  });
});
