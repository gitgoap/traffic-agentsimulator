'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Code2,
  Copy,
  GitBranch,
  Info,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Route,
  Save,
  Share2,
  SkipForward,
  SlidersHorizontal,
  SquarePen,
  TrafficCone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cloneScenario, presets, presetLabels, type PresetId } from '../simulation/presets';
import { parseScenario, scenarioError, type Scenario } from '../simulation/schema';
import type { RunResult } from '../simulation/engine';
import { NetworkCanvas } from '../renderer/NetworkCanvas';
import { useSimulation } from './useSimulation';
import { SettingsPanel } from './SettingsPanel';
import { MetricChart } from './MetricChart';
import { ComparePanel } from './ComparePanel';
import { csvCell, download } from './files';
import { summarySchema } from '../server/contracts';
import type { z } from 'zod';

const fmt = (n: number | null | undefined, digits = 1) => (n == null ? '—' : n.toFixed(digits));
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
type LocalSave = { id: string; savedAt: string; scenario: Scenario };

export function TrafficLab() {
  const [scenario, setScenario] = useState<Scenario>(() => cloneScenario(presets.ring));
  const [preset, setPreset] = useState<PresetId | null>('ring'),
    [editing, setEditing] = useState(false);
  const [selectedRoad, setSelectedRoad] = useState<string | null>(null),
    [selectedCar, setSelectedCar] = useState<number | null>(null);
  const [addingNode, setAddingNode] = useState(false),
    [notice, setNotice] = useState('');
  const [speed, setSpeed] = useState(1),
    [busy, setBusy] = useState(false),
    [sharing, setSharing] = useState(false);
  const [share, setShare] = useState<{
    id: string;
    token?: string;
    url: string;
    revision: number;
    storage: string;
  } | null>(null);
  const [sharedSummary, setSharedSummary] = useState<z.infer<typeof summarySchema> | null>(null);
  const [localSaves, setLocalSaves] = useState<LocalSave[]>([]),
    [help, setHelp] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sim = useSimulation(scenario),
    m = sim.snapshot?.metrics;
  const car = sim.snapshot?.cars.find((c) => c.id === selectedCar);
  const update = (value: Scenario) => {
    try {
      setScenario(parseScenario(value));
      setAddingNode(false);
    } catch (error) {
      setNotice(scenarioError(error));
    }
  };
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('traffic-lab-saves') ?? '[]');
      if (Array.isArray(saved))
        setLocalSaves(
          saved.slice(0, 20).flatMap((value) => {
            try {
              return [
                {
                  id: String(value.id),
                  savedAt: String(value.savedAt),
                  scenario: parseScenario(value.scenario),
                },
              ];
            } catch {
              return [];
            }
          }),
        );
    } catch {
      /* Export remains available when storage is unavailable. */
    }
    const id = new URLSearchParams(window.location.search).get('scenario');
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/scenarios/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load shared scenario.');
        setScenario(parseScenario(data.scenario));
        setPreset(null);
        let token: string | undefined;
        try {
          token = JSON.parse(localStorage.getItem('traffic-lab-share-tokens') ?? '{}')[id];
        } catch {
          /* Public access does not need a token. */
        }
        setShare({
          id,
          token,
          url: window.location.href,
          revision: data.revision,
          storage: data.storage,
        });
        if (data.summary) setSharedSummary(summarySchema.parse(data.summary));
        setNotice(
          `Loaded shared scenario${data.summary ? ' with a saved run summary' : ''}. Run it to reproduce the results.`,
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(scenarioError(error));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    sim.send({ type: 'speed', speed });
  }, [speed, sim.send]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 14000);
    return () => clearTimeout(timer);
  }, [notice]);

  const selectPreset = (id: PresetId) => {
    setPreset(id);
    setScenario(cloneScenario(presets[id]));
    setSelectedCar(null);
    setSelectedRoad(null);
    setShare(null);
    setAddingNode(false);
    if (typeof window !== 'undefined')
      window.history.replaceState({}, '', window.location.pathname);
  };
  const saveLocal = () => {
    try {
      const entry: LocalSave = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        scenario,
      };
      const saved = [entry, ...localSaves].slice(0, 20);
      localStorage.setItem('traffic-lab-saves', JSON.stringify(saved));
      setLocalSaves(saved);
      setNotice('Scenario saved in this browser. JSON export gives you a portable backup.');
    } catch {
      setNotice('Browser storage is full or unavailable. Export your scenario as JSON instead.');
    }
  };
  const resultExport = async (csv = false) => {
    try {
      const result = await sim.getResult();
      if (!csv) download('traffic-lab-run.json', JSON.stringify(result, null, 2));
      else {
        const keys = Object.keys(result.metrics) as (keyof typeof result.metrics)[];
        download(
          'traffic-lab-metrics.csv',
          [
            keys.map(csvCell).join(','),
            ...result.samples.map((s) => keys.map((k) => csvCell(s[k])).join(',')),
          ].join('\n'),
          'text/csv;charset=utf-8',
        );
      }
    } catch (error) {
      setNotice(scenarioError(error));
    }
  };
  const shareScenario = async () => {
    setSharing(true);
    setNotice('');
    sim.send({ type: 'pause' });
    try {
      const result: RunResult = await sim.getResult();
      const { samples: _samples, scenario: _scenario, ...summary } = result;
      const owned = share?.token;
      const response = await fetch(owned ? `/api/scenarios/${share!.id}` : '/api/scenarios', {
        method: owned ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(owned ? { Authorization: `Bearer ${owned}` } : {}),
        },
        body: JSON.stringify({ scenario, summary, revision: share?.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not share scenario.');
      const token = data.editToken ?? owned,
        id = data.id;
      const url = new URL(window.location.pathname, window.location.origin);
      url.searchParams.set('scenario', id);
      setShare({ id, token, url: url.toString(), revision: data.revision, storage: data.storage });
      setSharedSummary(summary);
      let keySaved = true;
      try {
        const tokens = JSON.parse(localStorage.getItem('traffic-lab-share-tokens') ?? '{}');
        tokens[id] = token;
        localStorage.setItem('traffic-lab-share-tokens', JSON.stringify(tokens));
      } catch {
        keySaved = false;
      }
      setNotice(
        !keySaved
          ? 'Link created, but this browser could not retain your edit key. After closing this page, you may lose the ability to update or delete this shared copy.'
          : data.storage === 'local'
            ? 'Saved on this development server. This link works while the server is available; production sharing needs the deployment database.'
            : 'Read-only link created. Anyone with the link can view this scenario and its saved summary.',
      );
    } catch (error) {
      setNotice(scenarioError(error));
    } finally {
      setSharing(false);
    }
  };
  return (
    <>
      <a className="skip-link" href="#simulation">
        Skip to simulation
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Traffic Lab home">
          <span className="brand-icon">
            <Route size={22} strokeWidth={1.8} />
          </span>
          <span>
            traffic<span className="brand-light">lab</span>
            <small>AN AGENT-BASED EXPLORATION</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#simulation" className="active">
            Playground
          </a>
          <a href="#compare">Experiments</a>
          <button onClick={() => setHelp(true)}>
            <BookOpen size={15} />
            Field notes
          </button>
        </nav>
        <a
          className="github-link"
          href="https://github.com/gitgoap/traffic-agentsimulator"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 size={17} />
          <span>View source</span>
          <ArrowRight size={14} />
        </a>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow intro-eyebrow">
              <span className="live-dot" />
              SMALL RULES. EMERGENT BEHAVIOR.
            </div>
            <h1>
              Every driver has a story.
              <br />
              <em>Together, they make traffic.</em>
            </h1>
            <p>
              A little world of independent agents. Change a road, adjust a signal,
              <br className="desktop-only" /> and discover what happens when their decisions meet.
            </p>
          </div>
          <div className="intro-note">
            <TrafficCone size={27} strokeWidth={1.4} />
            <p>
              Built from first principles.
              <br />
              <strong>Made for curious minds.</strong>
            </p>
            <span>QUEST LAB · IISc PREDOC PROJECT</span>
          </div>
        </section>
        <section id="simulation" className="playground">
          <div className="workspace-header">
            <div className="scenario-tabs" aria-label="Scenario presets">
              {(Object.keys(presets) as PresetId[]).map((id) => (
                <button
                  key={id}
                  className={preset === id ? 'selected' : ''}
                  disabled={busy}
                  onClick={() => selectPreset(id)}
                >
                  {id === 'ring' ? '01' : id === 'junction' ? '02' : '03'}
                  <span>{presetLabels[id]}</span>
                </button>
              ))}
            </div>
            <div className="workspace-actions">
              <button
                className="icon-button"
                onClick={saveLocal}
                aria-label="Save scenario locally"
                title="Save locally"
              >
                <Save size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() => input.current?.click()}
                aria-label="Import scenario"
                disabled={busy}
              >
                <Upload size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() =>
                  download('traffic-lab-scenario.json', JSON.stringify(scenario, null, 2))
                }
                aria-label="Export scenario"
              >
                <ArrowDownToLine size={16} />
              </button>
              <button
                className="share-button"
                disabled={sharing || busy || !sim.snapshot}
                onClick={shareScenario}
              >
                {sharing ? <LoaderCircle size={14} className="spin" /> : <Share2 size={14} />}
                {share?.token ? 'Update share' : 'Share scenario'}
              </button>
            </div>
          </div>
          <input
            type="file"
            hidden
            ref={input}
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 150000)
                  throw new Error('Scenario files must be smaller than 150 KB.');
                const imported = parseScenario(JSON.parse(await file.text()));
                setScenario(imported);
                setPreset(null);
                setShare(null);
                window.history.replaceState({}, '', window.location.pathname);
                setNotice('Scenario imported. Ready for a fresh run.');
              } catch (error) {
                setNotice(scenarioError(error));
              }
              event.target.value = '';
            }}
          />
          <div className="workspace-grid">
            <fieldset className="settings-fieldset" disabled={busy || sharing}>
              <legend className="sr-only">Scenario configuration</legend>
              <SettingsPanel
                scenario={scenario}
                onChange={update}
                editing={editing}
                selectedRoad={selectedRoad}
                onSelectRoad={setSelectedRoad}
                onAddNode={() => setAddingNode((x) => !x)}
              />
            </fieldset>
            <div className="simulation-column">
              <div className="map-heading">
                <div>
                  <span className="eyebrow">02 / OBSERVE</span>
                  <h2>{scenario.name}</h2>
                </div>
                <button
                  className={`secondary small ${editing ? 'selected' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    sim.send({ type: 'pause' });
                    setEditing((x) => !x);
                    setAddingNode(false);
                  }}
                >
                  <SquarePen size={14} />
                  {editing ? 'Done editing' : 'Edit network'}
                </button>
              </div>
              <NetworkCanvas
                scenario={scenario}
                snapshot={sim.snapshot}
                editing={editing}
                selectedRoad={selectedRoad}
                selectedCar={selectedCar}
                onRoad={setSelectedRoad}
                onCar={setSelectedCar}
                addingNode={addingNode && !busy}
                onAddNode={(point) => {
                  let index = 1;
                  while (scenario.nodes.some((n) => n.id === `node${index}`)) index++;
                  update({
                    ...scenario,
                    nodes: [
                      ...scenario.nodes,
                      { ...point, id: `node${index}`, kind: 'junction', level: 0 },
                    ],
                  });
                }}
                onMoveNode={(id, point) => {
                  if (busy) return;
                  update({
                    ...scenario,
                    nodes: scenario.nodes.map((n) => (n.id === id ? { ...n, ...point } : n)),
                    roads: scenario.roads.map((r) =>
                      r.points
                        ? {
                            ...r,
                            points: r.points.map((p, i) =>
                              (i === 0 && r.from === id) ||
                              (i === r.points!.length - 1 && r.to === id)
                                ? point
                                : p,
                            ),
                          }
                        : r,
                    ),
                  });
                }}
              />
              <div className="transport">
                <div className="playback-buttons">
                  <button
                    className="play-button"
                    aria-label={sim.running ? 'Pause simulation' : 'Play simulation'}
                    disabled={!sim.snapshot || sim.snapshot.finished || busy || sharing || editing}
                    onClick={() => sim.send({ type: sim.running ? 'pause' : 'play' })}
                  >
                    {sim.running ? (
                      <Pause size={18} fill="currentColor" />
                    ) : (
                      <Play size={18} fill="currentColor" />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Step simulation"
                    disabled={busy || !sim.snapshot || editing}
                    onClick={() => sim.send({ type: 'step' })}
                  >
                    <SkipForward size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Reset simulation"
                    disabled={busy}
                    onClick={sim.reset}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <div className="timeline">
                  <div className="time-label">
                    <strong data-testid="simulation-time">{clock(m?.time ?? 0)}</strong>
                    <span>/ {clock(scenario.duration)}</span>
                    <small>
                      {sim.snapshot?.finished ? 'RUN COMPLETE' : sim.running ? 'RUNNING' : 'PAUSED'}
                    </small>
                  </div>
                  <progress
                    aria-label="Simulation progress"
                    value={m?.time ?? 0}
                    max={scenario.duration}
                  />
                </div>
                <label className="speed-select">
                  <span>Playback</span>
                  <select
                    aria-label="Playback speed"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[0.25, 0.5, 1, 2, 4, 8].map((v) => (
                      <option value={v} key={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="map-caption">
                <Info size={14} />
                <span>{scenario.description}</span>
              </div>
              <div className="charts-row">
                <MetricChart
                  samples={sim.snapshot?.samples ?? []}
                  metric="meanSpeed"
                  label="The pace of the network"
                  unit="km/h"
                />
                <MetricChart
                  samples={sim.snapshot?.samples ?? []}
                  metric="queued"
                  label="Cars waiting for their turn"
                  unit="below 0.5 m/s"
                />
              </div>
            </div>
            <aside className="results-panel">
              <span className="eyebrow">LIVE READINGS</span>
              <h2>The bigger picture</h2>
              <p className="field-help">Individual decisions. Collective outcomes.</p>
              <div className="hero-metric">
                <span>Average speed</span>
                <strong>
                  {fmt(m ? m.meanSpeed * 3.6 : null)}
                  <small>km/h</small>
                </strong>
                <div className="speed-meter">
                  <i
                    style={{
                      width: `${Math.min(100, ((m?.meanSpeed ?? 0) / scenario.desiredSpeed) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <dl className="metrics-list">
                <div>
                  <dt>On the network</dt>
                  <dd data-testid="active-vehicles">
                    {m?.active ?? '—'} <small>cars</small>
                  </dd>
                </div>
                <div>
                  <dt>Slow / stopped</dt>
                  <dd>{m?.queued ?? '—'}</dd>
                </div>
                <div>
                  <dt>Waiting outside</dt>
                  <dd>{m?.waiting ?? '—'}</dd>
                </div>
                {scenario.mode !== 'ring' && (
                  <>
                    <div>
                      <dt>Requested departures</dt>
                      <dd>{m?.requested ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Completed trips</dt>
                      <dd>{m?.completed ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Network travel time</dt>
                      <dd>
                        {fmt(m?.travelTime)} <small>s</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Entry wait</dt>
                      <dd>
                        {fmt(m?.entryWait)} <small>s</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Total trip time</dt>
                      <dd>
                        {fmt(m?.totalTravelTime)} <small>s</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Network delay</dt>
                      <dd>
                        {fmt(m?.delay)} <small>s</small>
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>{scenario.mode === 'ring' ? 'Ring detector flow' : 'Network exit flow'}</dt>
                  <dd>
                    {fmt(m?.throughput, 0)} <small>veh/h</small>
                  </dd>
                </div>
              </dl>
              <p className="field-help">
                {scenario.mode === 'ring'
                  ? 'Detector flow counts laps over elapsed time.'
                  : 'Trip averages cover completed trips. Entry wait is outside the network; total trip time includes it. Flow is over the full elapsed run.'}
              </p>
              <div className="inspector">
                <h3>Look a little closer</h3>
                <label className="stack-label">
                  Vehicle
                  <select
                    aria-label="Inspect vehicle"
                    value={selectedCar ?? ''}
                    onChange={(e) => setSelectedCar(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Select a car on the map</option>
                    {sim.snapshot?.cars.map((c) => (
                      <option value={c.id} key={c.id}>
                        Vehicle #{c.id}
                      </option>
                    ))}
                  </select>
                </label>
                {car && (
                  <>
                    <p>
                      <strong>#{car.id}</strong> · {fmt(car.speed * 3.6)} km/h
                    </p>
                    <p className="field-help">
                      {car.reason} · {car.segmentId}
                    </p>
                  </>
                )}
                <button
                  className="secondary wide"
                  disabled={busy || !sim.snapshot?.cars.length}
                  onClick={() => {
                    const id = car?.id ?? sim.snapshot?.cars[0]?.id;
                    if (id) {
                      sim.send({ type: 'brake', id });
                      setSelectedCar(id);
                      setNotice(
                        `Vehicle #${id} braked. This intervention is recorded in the run export.`,
                      );
                    }
                  }}
                >
                  <TrafficCone size={14} />
                  Brake {car ? `car #${car.id}` : 'one car'}
                </button>
                {scenario.signals.length > 0 && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      disabled={busy || !sim.snapshot}
                      checked={sim.allRed}
                      onChange={(e) => sim.send({ type: 'all-red', enabled: e.target.checked })}
                    />
                    Hold all signals red
                  </label>
                )}
              </div>
              <div className="export-actions">
                <button
                  className="text-button"
                  onClick={() => resultExport(true)}
                  disabled={busy || !sim.snapshot}
                >
                  <ArrowDownToLine size={13} />
                  Metrics CSV
                </button>
                <button
                  className="text-button"
                  onClick={() => resultExport()}
                  disabled={busy || !sim.snapshot}
                >
                  Full run JSON <ArrowRight size={13} />
                </button>
              </div>
              <div className="model-note">
                <span className="live-dot" />
                <span>
                  Our engine · IDM car-following
                  <br />
                  0.1 s steps · left-hand traffic
                </span>
              </div>
            </aside>
          </div>
        </section>
        {sim.error && (
          <div className="error-banner" role="alert">
            {sim.error}
            <button onClick={sim.reset}>Reset simulation</button>
          </div>
        )}
        {share && (
          <section className="share-result">
            <Share2 size={18} />
            <div>
              <strong>
                {share.storage === 'local'
                  ? 'Local server link · available while this server runs'
                  : 'Read-only scenario link'}
              </strong>
              <input
                aria-label="Shared scenario link"
                readOnly
                value={share.url}
                onFocus={(e) => e.target.select()}
              />
              {sharedSummary && (
                <p className="field-help">
                  Saved run at {clock(sharedSummary.metrics.time)} ·{' '}
                  {sharedSummary.metrics.completed} completed · {sharedSummary.metrics.active}{' '}
                  active · {sharedSummary.metrics.waiting} waiting outside · total trip time{' '}
                  {fmt(sharedSummary.metrics.totalTravelTime)} s. Client-generated summary.
                </p>
              )}
            </div>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(share.url);
                  setNotice('Link copied.');
                } catch {
                  setNotice('Select the link and copy it manually.');
                }
              }}
            >
              <Copy size={14} />
              Copy
            </button>
            {share.token && (
              <button
                className="icon-button danger"
                aria-label="Delete shared scenario"
                onClick={async () => {
                  if (
                    !window.confirm('Delete this shared copy? The local scenario stays available.')
                  )
                    return;
                  try {
                    const response = await fetch(`/api/scenarios/${share.id}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${share.token}` },
                    });
                    if (!response.ok) throw new Error('Could not delete shared scenario.');
                    setShare(null);
                    window.history.replaceState({}, '', window.location.pathname);
                    setNotice('Shared copy deleted.');
                  } catch (error) {
                    setNotice(scenarioError(error));
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </section>
        )}
        {localSaves.length > 0 && (
          <section className="saved-section">
            <h3>
              <Save size={15} />
              Saved in this browser
            </h3>
            <div className="saved-list">
              {localSaves.map((save) => (
                <div key={save.id}>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setScenario(parseScenario(save.scenario));
                      setPreset(null);
                      setShare(null);
                      window.history.replaceState({}, '', window.location.pathname);
                      setNotice('Local scenario loaded.');
                    }}
                  >
                    {save.scenario.name}
                    <small>{new Date(save.savedAt).toLocaleDateString()}</small>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete local ${save.scenario.name}`}
                    onClick={() => {
                      try {
                        const next = localSaves.filter((s) => s.id !== save.id);
                        localStorage.setItem('traffic-lab-saves', JSON.stringify(next));
                        setLocalSaves(next);
                      } catch {
                        setNotice('Could not update browser storage.');
                      }
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        <ComparePanel
          scenario={scenario}
          onNotice={setNotice}
          onBusy={(value) => {
            setBusy(value);
            if (value) sim.send({ type: 'pause' });
          }}
        />
        <section className="learning-strip">
          <div className="learning-icon">
            <GitBranch size={24} />
          </div>
          <div>
            <span className="eyebrow">THE IDEA UNDER THE HOOD</span>
            <h2>There is no “create traffic jam” function.</h2>
            <p>
              Each car follows a few local rules. Queues and congestion emerge when those decisions
              interact. That is the beauty of an agent-based model.
            </p>
          </div>
          <button className="secondary" onClick={() => setHelp(true)}>
            Explore the model <ArrowRight size={15} />
          </button>
        </section>
      </main>
      <footer>
        <span>
          traffic<strong>lab</strong> <span className="footer-dot">/</span> Built to understand the
          everyday.
        </span>
        <p>Educational model · Uncalibrated for real-world forecasting</p>
        <a
          href="https://github.com/gitgoap/traffic-agentsimulator/tree/main/doc"
          target="_blank"
          rel="noreferrer"
        >
          Documentation <ArrowRight size={12} />
        </a>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="notes-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setHelp(false);
                return;
              }
              if (e.key !== 'Tab') return;
              const focusable = e.currentTarget.querySelectorAll<HTMLElement>('button, a[href]');
              const first = focusable[0],
                last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <button
              className="modal-close"
              aria-label="Close field notes"
              autoFocus
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">FIELD NOTES</span>
            <h2 id="notes-title">A small world. A few good rules.</h2>
            <article>
              <h3>01 · The independent driver</h3>
              <p>
                Every vehicle is an agent with a desired speed, following gap, and route. The
                Intelligent Driver Model balances acceleration against braking for the car ahead.
                Agents use rules, not machine learning.
              </p>
            </article>
            <article>
              <h3>02 · Time moves in small steps</h3>
              <p>
                The model advances 0.1 seconds at a time. Playback speed changes how quickly we
                execute those steps. It does not change their size. The same seed reproduces the
                same driver and arrival choices.
              </p>
            </article>
            <article>
              <h3>03 · Crossings are connections</h3>
              <p>
                Vehicles reserve compatible paths through junctions and wait if the exit is blocked.
                Roads crossing on different levels have no connection unless a ramp joins them. The
                flyover preset includes a merge to explore the next bottleneck.
              </p>
            </article>
            <article>
              <h3>04 · Measure what is missing, too</h3>
              <p>
                Averages over completed trips can hide cars stuck in traffic. Always read completed,
                active, and waiting-outside counts together. Our model follows lanes and does not
                yet capture mixed, lane-free urban traffic.
              </p>
            </article>
            <a
              className="primary"
              href="https://github.com/gitgoap/traffic-agentsimulator/tree/main/doc"
              target="_blank"
              rel="noreferrer"
            >
              Read the short learning guides <BookOpen size={15} />
            </a>
          </section>
        </div>
      )}
    </>
  );
}
