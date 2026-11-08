import type { RunResult, Snapshot } from '../simulation/engine';
import type { Scenario } from '../simulation/schema';

export type Command = { runId: number } & (
  | { type: 'init'; scenario: Scenario }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'speed'; speed: number }
  | { type: 'brake'; id: number }
  | { type: 'all-red'; enabled: boolean }
  | { type: 'result' }
  | { type: 'experiment'; scenario: Scenario; seeds: number[] }
);
export type Reply = { runId: number } & (
  | { type: 'state'; snapshot: Snapshot; running: boolean }
  | { type: 'error'; message: string }
  | { type: 'result'; result: RunResult }
  | { type: 'experiment'; results: RunResult[] }
);
