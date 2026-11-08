'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, GitBranch, Plus, Trash2 } from 'lucide-react';
import type { Scenario } from '../simulation/schema';
import { lengthOf } from '../simulation/geometry';

function NumberField({
  label,
  ariaLabel,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid = (text: string) =>
    text.trim() !== '' &&
    Number.isInteger(Number(text)) &&
    Number(text) >= min &&
    Number(text) <= max;
  return (
    <label>
      {label}
      <input
        type="number"
        aria-label={ariaLabel}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (valid(next)) onChange(Number(next));
        }}
        onBlur={() => {
          if (!valid(draft)) {
            setDraft(String(value));
            onChange(NaN);
          }
        }}
      />
    </label>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <strong>
          {Number.isInteger(value) ? value : value.toFixed(1)} <small>{suffix}</small>
        </strong>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

type Props = {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  editing: boolean;
  selectedRoad: string | null;
  onSelectRoad: (id: string) => void;
  onAddNode: () => void;
};
export function SettingsPanel({
  scenario: s,
  onChange,
  editing,
  selectedRoad,
  onSelectRoad,
  onAddNode,
}: Props) {
  const [nodeId, setNodeId] = useState(''),
    [signalId, setSignalId] = useState('');
  const road = s.roads.find((r) => r.id === selectedRoad) ?? s.roads[0];
  const node = s.nodes.find((n) => n.id === nodeId) ?? s.nodes[0];
  const junctions = s.nodes.filter((n) => n.kind === 'junction');
  const signalNode = junctions.find((n) => n.id === signalId) ?? junctions[0];
  const signal = s.signals.find((c) => c.nodeId === signalNode?.id);
  const updateRoad = (key: string, value: number) =>
    onChange({ ...s, roads: s.roads.map((r) => (r.id === road.id ? { ...r, [key]: value } : r)) });
  const setGreen = (greenSeconds: number) =>
    onChange({
      ...s,
      signals: s.signals.map((c) => (c.nodeId === signalNode.id ? { ...c, greenSeconds } : c)),
    });
  return (
    <aside className="settings-panel">
      <div className="panel-heading">
        <span className="eyebrow">01 / CONFIGURE</span>
        <h2>{editing ? 'Shape your network' : 'Set the conditions'}</h2>
        <p>
          {editing
            ? 'Changes start a fresh run. Distances are in meters.'
            : 'Small changes. Different traffic stories.'}
        </p>
      </div>
      {editing && (
        <section className="setting-section">
          <form
            key={s.name}
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ ...s, name: String(new FormData(e.currentTarget).get('name')) });
            }}
          >
            <label className="stack-label">
              Scenario name
              <input
                aria-label="Scenario name"
                name="name"
                type="text"
                defaultValue={s.name}
                required
                maxLength={80}
              />
            </label>
            <button className="secondary wide">Rename scenario</button>
          </form>
        </section>
      )}
      <section className="setting-section">
        <h3>Driver behavior</h3>
        <Range
          label="Desired speed"
          value={Math.round(s.desiredSpeed * 3.6)}
          min={15}
          max={110}
          suffix="km/h"
          onChange={(v) => onChange({ ...s, desiredSpeed: v / 3.6 })}
        />
        <Range
          label="Following gap"
          value={s.timeGap}
          min={0.8}
          max={3}
          step={0.1}
          suffix="sec"
          onChange={(v) => onChange({ ...s, timeGap: v })}
        />
        {s.mode === 'ring' && (
          <Range
            label="Vehicle population"
            value={s.vehicleCount}
            min={1}
            max={Math.min(110 * road.lanes, 300)}
            suffix="cars"
            onChange={(vehicleCount) => onChange({ ...s, vehicleCount })}
          />
        )}
        <div className="two-fields">
          <NumberField
            label="Seed"
            ariaLabel="Random seed"
            min={0}
            max={2147483647}
            value={s.seed}
            onChange={(seed) => onChange({ ...s, seed })}
          />
          <NumberField
            label="Duration (s)"
            ariaLabel="Duration"
            min={30}
            max={1800}
            value={s.duration}
            onChange={(duration) => onChange({ ...s, duration })}
          />
        </div>
      </section>
      {s.mode === 'network' && (
        <section className="setting-section">
          <h3>
            Travel demand <span className="tag">veh/h</span>
          </h3>
          <p className="field-help">Requested departures. Blocked arrivals wait outside.</p>
          {s.demand.map((d, i) => (
            <div className="demand-row" key={`${d.origin}-${d.destination}-${i}`}>
              <div className="demand-label">
                <span>
                  {d.origin} <ArrowRight size={11} /> {d.destination}
                </span>
                {editing && (
                  <button
                    className="icon-button"
                    aria-label={`Remove demand ${i + 1}`}
                    onClick={() => onChange({ ...s, demand: s.demand.filter((_, j) => i !== j) })}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <Range
                label={`Demand ${i + 1}`}
                value={d.rate}
                min={0}
                max={2400}
                step={60}
                suffix="veh/h"
                onChange={(rate) =>
                  onChange({ ...s, demand: s.demand.map((x, j) => (j === i ? { ...x, rate } : x)) })
                }
              />
            </div>
          ))}
          {editing && (
            <form
              className="compact-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                onChange({
                  ...s,
                  demand: [
                    ...s.demand,
                    {
                      origin: String(form.get('origin')),
                      destination: String(form.get('destination')),
                      rate: 360,
                    },
                  ],
                });
              }}
            >
              <div className="two-fields">
                <label>
                  Origin
                  <select name="origin" aria-label="Demand origin">
                    {s.nodes
                      .filter((n) => n.kind === 'boundary')
                      .map((n) => (
                        <option key={n.id}>{n.id}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Destination
                  <select
                    name="destination"
                    aria-label="Demand destination"
                    defaultValue={s.nodes.filter((n) => n.kind === 'boundary')[1]?.id}
                  >
                    {s.nodes
                      .filter((n) => n.kind === 'boundary')
                      .map((n) => (
                        <option key={n.id}>{n.id}</option>
                      ))}
                  </select>
                </label>
              </div>
              <button className="secondary wide" type="submit">
                <Plus size={13} />
                Add demand
              </button>
            </form>
          )}
        </section>
      )}
      {junctions.length > 0 && (
        <section className="setting-section">
          <h3>Traffic signals</h3>
          <label className="stack-label">
            Junction
            <select
              aria-label="Signal junction"
              value={signalNode?.id}
              onChange={(e) => setSignalId(e.target.value)}
            >
              {junctions.map((n) => (
                <option key={n.id}>{n.id}</option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!signal}
              onChange={(e) =>
                onChange({
                  ...s,
                  signals: e.target.checked
                    ? [...s.signals, { nodeId: signalNode.id, greenSeconds: 25, offset: 0 }]
                    : s.signals.filter((c) => c.nodeId !== signalNode.id),
                })
              }
            />
            Fixed-time control
          </label>
          {signal ? (
            <>
              <Range
                label="Green phase"
                value={signal.greenSeconds}
                min={5}
                max={90}
                suffix="sec"
                onChange={setGreen}
              />
              <Range
                label="Signal offset"
                value={signal.offset}
                min={0}
                max={180}
                suffix="sec"
                onChange={(offset) =>
                  onChange({
                    ...s,
                    signals: s.signals.map((c) =>
                      c.nodeId === signalNode.id ? { ...c, offset } : c,
                    ),
                  })
                }
              />
            </>
          ) : (
            <p className="field-help">
              Unsignalized movements yield through conflict reservations.
            </p>
          )}
          {signal && (
            <p className="field-help">
              Each direction group gets green, 3 s amber, then 2 s clearance. Conflicting turns
              still yield.
            </p>
          )}
        </section>
      )}
      <section className="setting-section">
        <h3>
          <GitBranch size={14} />
          Road inspector
        </h3>
        <label className="stack-label">
          Selected road
          <select
            aria-label="Selected road"
            value={road.id}
            onChange={(e) => onSelectRoad(e.target.value)}
          >
            {s.roads.map((r) => (
              <option key={r.id}>{r.id}</option>
            ))}
          </select>
        </label>
        <div className="road-meta">
          <span>
            {road.from} → {road.to}
          </span>
          <span>
            {Math.round(
              lengthOf(
                road.points ?? [
                  s.nodes.find((n) => n.id === road.from)!,
                  s.nodes.find((n) => n.id === road.to)!,
                ],
              ),
            )}{' '}
            m
          </span>
        </div>
        <Range
          label="Lanes per direction"
          value={road.lanes}
          min={1}
          max={4}
          suffix="lanes"
          onChange={(v) => updateRoad('lanes', v)}
        />
        <Range
          label="Lane width"
          value={road.laneWidth}
          min={2.5}
          max={5}
          step={0.1}
          suffix="m"
          onChange={(v) => updateRoad('laneWidth', v)}
        />
        <Range
          label="Road speed limit"
          value={Math.round(road.speedLimit * 3.6)}
          min={15}
          max={120}
          suffix="km/h"
          onChange={(v) => updateRoad('speedLimit', v / 3.6)}
        />
        <p className="field-help">
          Width controls geometry. Lanes, following gaps, signals, and merges determine flow.
        </p>
        {editing && (
          <>
            <label className="stack-label">
              Road level
              <select
                aria-label="Road level"
                value={road.level}
                onChange={(e) => updateRoad('level', Number(e.target.value))}
              >
                <option value={0}>Ground</option>
                <option value={1}>Elevated</option>
                <option value={2}>Upper</option>
              </select>
            </label>
            <p className="field-help">
              Connections follow node IDs. Crossing drawings do not automatically create a junction.
            </p>
            {s.mode !== 'ring' && (
              <button
                className="text-button danger"
                onClick={() => onChange({ ...s, roads: s.roads.filter((r) => r.id !== road.id) })}
              >
                <Trash2 size={13} />
                Remove road
              </button>
            )}
          </>
        )}
      </section>
      {editing && s.mode !== 'ring' && (
        <>
          <section className="setting-section">
            <h3>Nodes & connections</h3>
            <button className="secondary wide" onClick={onAddNode}>
              <Plus size={14} />
              Place a junction on map
            </button>
            <label className="stack-label">
              Selected node
              <select
                aria-label="Selected node"
                value={node.id}
                onChange={(e) => setNodeId(e.target.value)}
              >
                {s.nodes.map((n) => (
                  <option key={n.id}>{n.id}</option>
                ))}
              </select>
            </label>
            <form
              key={`${node.id}-${node.x}-${node.y}-${node.kind}`}
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const x = Number(data.get('x')),
                  y = Number(data.get('y'));
                onChange({
                  ...s,
                  nodes: s.nodes.map((n) =>
                    n.id === node.id
                      ? {
                          ...n,
                          x,
                          y,
                          level: Number(data.get('level')),
                          kind: String(data.get('kind')) as 'boundary' | 'junction',
                        }
                      : n,
                  ),
                  roads: s.roads.map((r) =>
                    r.points
                      ? {
                          ...r,
                          points: r.points.map((p, i) =>
                            (i === 0 && r.from === node.id) ||
                            (i === r.points!.length - 1 && r.to === node.id)
                              ? { x, y }
                              : p,
                          ),
                        }
                      : r,
                  ),
                });
              }}
            >
              <div className="two-fields">
                <label>
                  X (m)
                  <input
                    aria-label="Node X"
                    name="x"
                    type="number"
                    min={-2000}
                    max={2000}
                    defaultValue={node.x}
                    required
                  />
                </label>
                <label>
                  Y (m)
                  <input
                    aria-label="Node Y"
                    name="y"
                    type="number"
                    min={-2000}
                    max={2000}
                    defaultValue={node.y}
                    required
                  />
                </label>
              </div>
              <label className="stack-label">
                Type
                <select name="kind" defaultValue={node.kind}>
                  <option value="junction">Junction</option>
                  <option value="boundary">Origin / destination</option>
                </select>
              </label>
              <label className="stack-label">
                Node level
                <select name="level" defaultValue={node.level}>
                  <option value={0}>Ground</option>
                  <option value={1}>Elevated</option>
                  <option value={2}>Upper</option>
                </select>
              </label>
              <button className="secondary wide">Apply node</button>
            </form>
            <button
              className="text-button danger"
              onClick={() =>
                onChange({
                  ...s,
                  nodes: s.nodes.filter((n) => n.id !== node.id),
                  roads: s.roads.filter((r) => r.from !== node.id && r.to !== node.id),
                  demand: s.demand.filter((d) => d.origin !== node.id && d.destination !== node.id),
                  signals: s.signals.filter((c) => c.nodeId !== node.id),
                })
              }
            >
              <Trash2 size={13} />
              Remove node and attached roads
            </button>
            <form
              className="compact-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const from = String(data.get('from')),
                  to = String(data.get('to'));
                let index = 1;
                while (s.roads.some((r) => r.id === `road${index}`)) index++;
                onChange({
                  ...s,
                  roads: [
                    ...s.roads,
                    {
                      id: `road${index}`,
                      from,
                      to,
                      lanes: 1,
                      laneWidth: 3.5,
                      speedLimit: 16.7,
                      level: 0,
                    },
                  ],
                });
              }}
            >
              <div className="two-fields">
                <label>
                  From
                  <select aria-label="New road from" name="from">
                    {s.nodes.map((n) => (
                      <option key={n.id}>{n.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select aria-label="New road to" name="to" defaultValue={s.nodes[1]?.id}>
                    {s.nodes.map((n) => (
                      <option key={n.id}>{n.id}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="secondary wide">
                <Plus size={13} />
                Connect with one-way road
              </button>
            </form>
          </section>
        </>
      )}
    </aside>
  );
}
