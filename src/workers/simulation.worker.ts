import { TrafficEngine, DT } from '../simulation/engine';
import type { Command, Reply } from './protocol';

let engine: TrafficEngine | null = null,
  runId = 0,
  speed = 1,
  running = false;
let timer: ReturnType<typeof setTimeout> | undefined,
  previous = 0,
  accumulator = 0;
const reply = (message: Reply) => self.postMessage(message);
const state = () => {
  if (engine) reply({ runId, type: 'state', snapshot: engine.snapshot(), running });
};
const stop = () => {
  running = false;
  clearTimeout(timer);
  timer = undefined;
  accumulator = 0;
};

function loop() {
  if (!running || !engine) return;
  try {
    const now = performance.now();
    accumulator += Math.min(0.15, (now - previous) / 1000) * speed;
    previous = now;
    const steps = Math.floor(accumulator / DT);
    if (steps) {
      engine.step(steps);
      accumulator -= steps * DT;
    }
    if (engine.finished) stop();
    state();
    if (running) timer = setTimeout(loop, 50);
  } catch (error) {
    stop();
    reply({
      runId,
      type: 'error',
      message: error instanceof Error ? error.message : 'Simulation failed.',
    });
  }
}

self.onmessage = async ({ data }: MessageEvent<Command>) => {
  try {
    if (data.type === 'init') {
      stop();
      runId = data.runId;
      engine = new TrafficEngine(data.scenario);
      state();
      return;
    }
    if (data.runId !== runId || !engine) return;
    switch (data.type) {
      case 'play':
        if (!running && !engine.finished) {
          running = true;
          previous = performance.now();
          timer = setTimeout(loop, 0);
        }
        break;
      case 'pause':
        stop();
        break;
      case 'step':
        stop();
        engine.step();
        break;
      case 'speed':
        speed = Math.max(0.25, Math.min(8, data.speed));
        break;
      case 'brake':
        engine.brake(data.id);
        break;
      case 'all-red':
        engine.setAllRed(data.enabled);
        break;
      case 'result':
        reply({ runId, type: 'result', result: engine.result() });
        return;
      case 'experiment': {
        stop();
        if (data.seeds.length > 5) throw new Error('Use at most five experiment seeds.');
        const results = [];
        for (const seed of data.seeds) {
          const experiment = new TrafficEngine({ ...data.scenario, seed });
          while (!experiment.finished) {
            experiment.step(100);
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (data.runId !== runId) return;
          }
          results.push(experiment.result());
        }
        reply({ runId, type: 'experiment', results });
        return;
      }
    }
    state();
  } catch (error) {
    stop();
    reply({
      runId: data.runId,
      type: 'error',
      message: error instanceof Error ? error.message : 'Invalid worker command.',
    });
  }
};
