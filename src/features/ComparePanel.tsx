'use client';
import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, FlaskConical, X } from 'lucide-react';
import type { Scenario } from '../simulation/schema';
import { parseScenario, scenarioError } from '../simulation/schema';
import type { RunResult } from '../simulation/engine';
import { experiment } from './useSimulation';
import { csvCell, download } from './files';

function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}
function summarize(results: RunResult[], value: (r: RunResult) => number | null) {
  const values = results.map(value).filter((v): v is number => v !== null),
    mean = average(values);
  const deviation =
    values.length > 1
      ? Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1))
      : 0;
  return {
    mean,
    deviation,
    display: Number.isFinite(mean)
      ? `${mean.toFixed(1)} ± ${deviation.toFixed(1)}`
      : 'No completed trips',
  };
}

export function ComparePanel({
  scenario,
  onNotice,
  onBusy,
}: {
  scenario: Scenario;
  onNotice: (message: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [baseline, setBaseline] = useState<Scenario | null>(null);
  const [progress, setProgress] = useState(''),
    [comparison, setComparison] = useState<{ a: RunResult[]; b: RunResult[] } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setComparison(null);
    return () => controller.current?.abort();
  }, [scenario]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('traffic-lab-baseline');
      if (stored) setBaseline(parseScenario(JSON.parse(stored)));
    } catch {
      /* An invalid old baseline is ignored. */
    }
    return () => controller.current?.abort();
  }, []);
  const compare = async () => {
    if (!baseline) return;
    const demand = (s: Scenario) =>
      JSON.stringify(
        [...s.demand].sort((a, b) =>
          (a.origin + a.destination).localeCompare(b.origin + b.destination),
        ),
      );
    if (
      baseline.mode !== scenario.mode ||
      baseline.duration !== scenario.duration ||
      demand(baseline) !== demand(scenario) ||
      (scenario.mode === 'ring' && baseline.vehicleCount !== scenario.vehicleCount)
    ) {
      onNotice(
        'For a controlled comparison, keep the same model type, duration, vehicle population (ring), and origin–destination demand. Change roads, signals, or driver behavior instead.',
      );
      return;
    }
    controller.current = new AbortController();
    onBusy(true);
    setComparison(null);
    const seeds = [
      scenario.seed,
      (scenario.seed + 1) % 2147483648,
      (scenario.seed + 2) % 2147483648,
    ];
    try {
      setProgress('Running baseline · 3 seeds');
      const a = await experiment(baseline, seeds, controller.current.signal);
      setProgress('Running your scenario · 3 seeds');
      const b = await experiment(scenario, seeds, controller.current.signal);
      setComparison({ a, b });
    } catch (error) {
      onNotice(scenarioError(error));
    } finally {
      setProgress('');
      onBusy(false);
      controller.current = null;
    }
  };
  const metrics: { label: string; unit: string; value: (r: RunResult) => number | null }[] = [
    { label: 'Network travel time', unit: 's', value: (r) => r.metrics.travelTime },
    { label: 'Entry wait (completed trips)', unit: 's', value: (r) => r.metrics.entryWait },
    { label: 'Total trip time', unit: 's', value: (r) => r.metrics.totalTravelTime },
    { label: 'Detector / exit flow', unit: 'veh/h', value: (r) => r.metrics.throughput },
    { label: 'Completed trips', unit: 'cars', value: (r) => r.metrics.completed },
    { label: 'Still on network', unit: 'cars', value: (r) => r.metrics.active },
    { label: 'Waiting outside', unit: 'cars', value: (r) => r.metrics.waiting },
    { label: 'Final mean speed', unit: 'km/h', value: (r) => r.metrics.meanSpeed * 3.6 },
  ];
  return (
    <section className="compare-panel" id="compare">
      <div className="section-title">
        <div>
          <span className="eyebrow">03 / EXPERIMENT</span>
          <h2>One change. A fair comparison.</h2>
        </div>
        <FlaskConical size={22} />
      </div>
      <p className="muted">
        Save a baseline, change the network or signal timing, then compare three matched random
        seeds. No warm-up is excluded.
      </p>
      <div className="compare-actions">
        <button
          className="secondary"
          disabled={!!progress}
          onClick={() => {
            try {
              localStorage.setItem('traffic-lab-baseline', JSON.stringify(scenario));
              setBaseline(structuredClone(scenario));
              setComparison(null);
              onNotice('Baseline saved. Make one change, then run the comparison.');
            } catch {
              onNotice('Your browser could not save the baseline. Export the scenario instead.');
            }
          }}
        >
          <BookmarkPlus size={15} />
          Use current as baseline
        </button>
        <button className="primary" disabled={!baseline || !!progress} onClick={compare}>
          <FlaskConical size={15} />
          Run comparison
        </button>
        {progress && (
          <button className="secondary" onClick={() => controller.current?.abort()}>
            <X size={14} />
            Cancel
          </button>
        )}
      </div>
      {baseline && (
        <div className="baseline-label">
          Baseline: <strong>{baseline.name}</strong> · {baseline.duration} s · same departure
          schedules
        </div>
      )}
      {progress && (
        <p role="status" className="progress-text">
          <span className="live-dot" />
          {progress}…
        </p>
      )}
      {comparison && (
        <>
          <div className="table-scroll">
            <table>
              <caption>
                Mean ± sample standard deviation, three paired seeds. Travel-time averages cover
                completed trips.
              </caption>
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>Baseline</th>
                  <th>Modified</th>
                  <th>Change in mean</th>
                </tr>
              </thead>
              <tbody>
                {metrics
                  .filter(
                    (m) =>
                      scenario.mode !== 'ring' ||
                      ['Detector / exit flow', 'Final mean speed', 'Still on network'].includes(
                        m.label,
                      ),
                  )
                  .map((metric) => {
                    const a = summarize(comparison.a, metric.value),
                      b = summarize(comparison.b, metric.value);
                    const delta = b.mean - a.mean;
                    return (
                      <tr key={metric.label}>
                        <th>
                          {metric.label}
                          <small>{metric.unit}</small>
                        </th>
                        <td>{a.display}</td>
                        <td>{b.display}</td>
                        <td>
                          {Number.isFinite(delta)
                            ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <button
            className="text-button"
            onClick={() =>
              download(
                'traffic-lab-comparison.csv',
                [
                  [
                    'variant',
                    'seed',
                    'requested',
                    'completed',
                    'active',
                    'waiting',
                    'network_travel_s',
                    'entry_wait_s',
                    'total_trip_s',
                    'flow_veh_h',
                    'final_speed_km_h',
                  ],
                  ...(['a', 'b'] as const).flatMap((k) =>
                    comparison[k].map((r) => [
                      k === 'a' ? 'baseline' : 'modified',
                      r.scenario.seed,
                      r.metrics.requested,
                      r.metrics.completed,
                      r.metrics.active,
                      r.metrics.waiting,
                      r.metrics.travelTime,
                      r.metrics.entryWait,
                      r.metrics.totalTravelTime,
                      r.metrics.throughput,
                      r.metrics.meanSpeed * 3.6,
                    ]),
                  ),
                ]
                  .map((row) => row.map(csvCell).join(','))
                  .join('\n'),
                'text/csv;charset=utf-8',
              )
            }
          >
            Download comparison CSV →
          </button>
        </>
      )}
    </section>
  );
}
