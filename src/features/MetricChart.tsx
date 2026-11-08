'use client';
import type { Metrics } from '../simulation/engine';

export function MetricChart({
  samples,
  metric,
  label,
  unit,
}: {
  samples: Metrics[];
  metric: 'meanSpeed' | 'queued';
  label: string;
  unit: string;
}) {
  const data = samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 200)) === 0);
  const width = 500,
    height = 122,
    pad = 26;
  const values = data.map((d) => (metric === 'meanSpeed' ? d[metric] * 3.6 : d[metric]));
  const max = Math.max(metric === 'meanSpeed' ? 20 : 5, ...values) * 1.15;
  const lastTime = samples.at(-1)?.time ?? 0;
  const points = data
    .map(
      (d, i) =>
        `${pad + ((width - pad * 2) * d.time) / Math.max(1, lastTime)},${height - pad - (values[i] / max) * (height - pad * 2)}`,
    )
    .join(' ');
  return (
    <div className="chart">
      <div className="chart-heading">
        <h3>{label}</h3>
        <span>{unit}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} over ${Math.round(lastTime)} simulated seconds`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={pad}
              x2={width - pad}
              y1={height - pad - f * (height - 2 * pad)}
              y2={height - pad - f * (height - 2 * pad)}
              stroke="#dce3dc"
              strokeDasharray="3 4"
            />
            <text x={pad - 6} y={height - pad - f * (height - 2 * pad) + 3} textAnchor="end">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {data.length > 1 && (
          <>
            <polygon
              points={`${pad},${height - pad} ${points} ${pad + ((width - pad * 2) * (data.at(-1)?.time ?? 0)) / Math.max(1, lastTime)},${height - pad}`}
              fill={metric === 'meanSpeed' ? '#46a58c15' : '#d3934915'}
            />
            <polyline
              points={points}
              fill="none"
              stroke={metric === 'meanSpeed' ? '#29866e' : '#bf8646'}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </>
        )}
        <text x={pad} y={height - 7}>
          0 s
        </text>
        <text x={width - pad} y={height - 7} textAnchor="end">
          {Math.round(lastTime)} s
        </text>
      </svg>
    </div>
  );
}
