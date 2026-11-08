import { parseScenario, type Scenario } from './schema';

const base = {
  schemaVersion: 1 as const,
  seed: 42,
  duration: 300,
  vehicleCount: 36,
  desiredSpeed: 16.7,
  timeGap: 1.4,
};

const ringPoints = Array.from({ length: 97 }, (_, i) => ({
  x: 160 * Math.cos((i * Math.PI * 2) / 96),
  y: 160 * Math.sin((i * Math.PI * 2) / 96),
}));
const ring: Scenario = parseScenario({
  ...base,
  name: 'The phantom traffic jam',
  mode: 'ring',
  description:
    'A circular road. Brake one car and watch how a disturbance travels through the traffic.',
  nodes: [{ id: 'ring', ...ringPoints[0], kind: 'boundary' }],
  roads: [
    {
      id: 'loop',
      from: 'ring',
      to: 'ring',
      lanes: 1,
      laneWidth: 3.5,
      speedLimit: 25,
      points: ringPoints,
    },
  ],
  demand: [],
  signals: [],
});

const junction: Scenario = parseScenario({
  ...base,
  name: 'The signalized crossroads',
  mode: 'network',
  description:
    'Four approaches, protected signals, and queues. Try changing demand or the green phase duration.',
  nodes: [
    { id: 'west', x: -260, y: 0, kind: 'boundary' },
    { id: 'east', x: 260, y: 0, kind: 'boundary' },
    { id: 'north', x: 0, y: -260, kind: 'boundary' },
    { id: 'south', x: 0, y: 260, kind: 'boundary' },
    { id: 'center', x: 0, y: 0, kind: 'junction' },
  ],
  roads: ['west', 'east', 'north', 'south'].flatMap((id) => [
    { id: `${id}_in`, from: id, to: 'center', lanes: 1, laneWidth: 3.5, speedLimit: 16.7 },
    { id: `${id}_out`, from: 'center', to: id, lanes: 1, laneWidth: 3.5, speedLimit: 16.7 },
  ]),
  demand: [
    { origin: 'west', destination: 'east', rate: 600 },
    { origin: 'east', destination: 'west', rate: 420 },
    { origin: 'north', destination: 'south', rate: 480 },
    { origin: 'south', destination: 'north', rate: 360 },
  ],
  signals: [{ nodeId: 'center', greenSeconds: 25, offset: 0 }],
});

const flyover: Scenario = parseScenario({
  ...junction,
  name: 'Over, under, and merging',
  description:
    'East–west traffic passes above the crossing. A curved ramp joins the elevated road: the merge can become the next bottleneck.',
  nodes: [
    { id: 'west', x: -260, y: 0, kind: 'boundary', level: 1 },
    { id: 'east', x: 260, y: 0, kind: 'boundary', level: 1 },
    { id: 'north', x: 0, y: -260, kind: 'boundary' },
    { id: 'south', x: 0, y: 260, kind: 'boundary' },
    { id: 'merge', x: 140, y: 0, kind: 'junction', level: 1 },
  ],
  roads: [
    {
      id: 'over_west',
      from: 'west',
      to: 'merge',
      lanes: 1,
      laneWidth: 3.5,
      speedLimit: 20,
      level: 1,
    },
    {
      id: 'over_east',
      from: 'merge',
      to: 'east',
      lanes: 1,
      laneWidth: 3.5,
      speedLimit: 20,
      level: 1,
    },
    {
      id: 'over_return',
      from: 'east',
      to: 'west',
      lanes: 1,
      laneWidth: 3.5,
      speedLimit: 20,
      level: 1,
    },
    { id: 'under_south', from: 'north', to: 'south', lanes: 1, laneWidth: 3.5, speedLimit: 16.7 },
    { id: 'under_north', from: 'south', to: 'north', lanes: 1, laneWidth: 3.5, speedLimit: 16.7 },
    {
      id: 'ramp',
      from: 'south',
      to: 'merge',
      lanes: 1,
      laneWidth: 3.5,
      speedLimit: 10,
      level: 1,
      points: [
        { x: 0, y: 260 },
        { x: 70, y: 200 },
        { x: 120, y: 100 },
        { x: 140, y: 0 },
      ],
    },
  ],
  signals: [],
});

export const presets = { ring, junction, flyover };
export type PresetId = keyof typeof presets;
export const presetLabels: Record<PresetId, string> = {
  ring: 'Ring road',
  junction: 'Crossroads',
  flyover: 'Flyover',
};
export const cloneScenario = (s: Scenario): Scenario => structuredClone(s);
