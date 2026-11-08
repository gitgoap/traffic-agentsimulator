import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { TrafficEngine } from '../src/simulation/engine';
import { cloneScenario, presets, type PresetId } from '../src/simulation/presets';
import { parseScenario } from '../src/simulation/schema';

const args = process.argv.slice(2);
function option(name: string) {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
}

try {
  const preset = option('preset') ?? 'junction';
  if (!(preset in presets)) throw new Error('Preset must be ring, junction, or flyover.');
  const source = option('scenario');
  const scenario = source
    ? parseScenario(JSON.parse(await readFile(source, 'utf8')))
    : cloneScenario(presets[preset as PresetId]);
  const seed = option('seed'),
    duration = option('duration'),
    step = option('timestep');
  if (seed !== undefined) scenario.seed = Number(seed);
  if (duration !== undefined) scenario.duration = Number(duration);
  const engine = new TrafficEngine(scenario, step === undefined ? 0.1 : Number(step));
  const started = performance.now();
  while (!engine.finished) engine.step(100);
  const result = engine.result(),
    elapsedMs = performance.now() - started;
  console.log(`${scenario.name} · seed ${scenario.seed} · ${engine.dt} s timestep`);
  console.table(result.metrics);
  console.log(
    `${engine.tick.toLocaleString()} steps in ${elapsedMs.toFixed(0)} ms (${((scenario.duration / elapsedMs) * 1000).toFixed(0)} simulated seconds per wall second).`,
  );
  const output = option('output');
  if (output) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ ...result, elapsedMs }, null, 2));
    console.log(`Result written to ${output}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Experiment failed.');
  process.exitCode = 1;
}
