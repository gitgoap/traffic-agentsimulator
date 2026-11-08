'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { atDistance, distance, type Point } from '../simulation/geometry';
import { compileNetwork, isGreen, type Network } from '../simulation/network';
import type { Scenario } from '../simulation/schema';
import type { CarView, Snapshot } from '../simulation/engine';

type Props = {
  scenario: Scenario;
  snapshot: Snapshot | null;
  editing: boolean;
  selectedRoad: string | null;
  selectedCar: number | null;
  onRoad: (id: string) => void;
  onCar: (id: number) => void;
  onMoveNode: (id: string, point: Point) => void;
  onAddNode: (point: Point) => void;
  addingNode: boolean;
};

export const speedColor = (speed: number, desired = 16.7) =>
  speed < 0.5 ? '#ff9776' : speed / desired < 0.5 ? '#f3d27b' : '#8be5c5';

export function NetworkCanvas(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    wrapper = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const compiled = useMemo(() => compileNetwork(props.scenario), [props.scenario]);
  const network = useRef<Network>(compiled);
  network.current = compiled;
  const view = useRef({
    zoom: 1,
    pan: { x: 0, y: 0 },
    scale: 1,
    center: { x: 0, y: 0 },
    w: 800,
    h: 500,
  });
  const drag = useRef<{ x: number; y: number; point: Point; moved: boolean; node?: string } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const element = canvas.current!,
      parent = wrapper.current!;
    const resize = () => {
      const rect = parent.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1;
      element.width = Math.round(rect.width * dpr);
      element.height = Math.round(rect.height * dpr);
      view.current.w = rect.width;
      view.current.h = rect.height;
      // Assigning canvas dimensions clears its bitmap. Repaint in this callback,
      // rather than leaving a blank frame until the next animation tick.
      draw();
    };
    let frame = 0;
    const draw = () => {
      const ctx = element.getContext('2d')!;
      const { scenario, snapshot, editing, selectedRoad, selectedCar } = latest.current;
      const v = view.current,
        dpr = window.devicePixelRatio || 1;
      const points = [...network.current.lanes.flatMap((l) => l.points), ...scenario.nodes];
      const minX = Math.min(...points.map((p) => p.x)),
        maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y)),
        maxY = Math.max(...points.map((p) => p.y));
      v.center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      v.scale =
        Math.min(
          (v.w - 110) / Math.max(100, maxX - minX),
          (v.h - 115) / Math.max(100, maxY - minY),
        ) * v.zoom;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, v.w, v.h);
      ctx.fillStyle = '#142f32';
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.save();
      ctx.translate(v.w / 2 + v.pan.x, v.h / 2 + v.pan.y);
      ctx.scale(v.scale, v.scale);
      ctx.translate(-v.center.x, -v.center.y);
      ctx.fillStyle = 'rgba(151,192,181,.11)';
      for (let x = -2000; x <= 2000; x += 25)
        for (let y = -2000; y <= 2000; y += 25) {
          // Only draw dots that are near the visible canvas.
          if (
            Math.abs((x - v.center.x) * v.scale + v.pan.x) > v.w / 2 ||
            Math.abs((y - v.center.y) * v.scale + v.pan.y) > v.h / 2
          )
            continue;
          ctx.beginPath();
          ctx.arc(x, y, 0.7 / v.scale, 0, 2 * Math.PI);
          ctx.fill();
        }
      const stroke = (path: Point[], width: number, color: string, dash: number[] = []) => {
        ctx.beginPath();
        path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.setLineDash(dash);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.setLineDash([]);
      };
      const cars = snapshot?.cars ?? [];
      for (const level of [0, 1, 2]) {
        for (const node of scenario.nodes.filter(
          (n) => n.kind === 'junction' && n.level === level,
        )) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 21, 0, 2 * Math.PI);
          ctx.fillStyle = '#33484a';
          ctx.fill();
          ctx.strokeStyle = '#52645f';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
        for (const road of scenario.roads.filter((r) => r.level === level)) {
          const lanes = network.current.lanes.filter((l) => l.roadId === road.id);
          for (const lane of lanes) {
            if (level) {
              ctx.save();
              ctx.translate(3, 7);
              stroke(lane.points, road.laneWidth + 7, '#10282bd9');
              ctx.restore();
            }
            stroke(
              lane.points,
              road.laneWidth + 1.5,
              selectedRoad === road.id ? '#e9c47a' : level ? '#80968e' : '#687971',
            );
            stroke(lane.points, road.laneWidth + 0.1, '#34494a');
            if (road.lanes > 1) stroke(lane.points, 0.16, '#abc0af88', [2.5, 5]);
          }
          if (editing) {
            const p = atDistance(lanes[0].points, lanes[0].length / 2);
            ctx.font = `${11 / v.scale}px system-ui`;
            ctx.fillStyle = '#d7e3d8';
            ctx.textAlign = 'center';
            ctx.fillText(road.id, p.x, p.y - 9 / v.scale);
          }
        }
        for (const movement of network.current.movements.filter((m) => m.level === level)) {
          if (editing) stroke(movement.points, 0.5, '#b6cbbb55', [1, 2]);
          if (scenario.signals.some((s) => s.nodeId === movement.nodeId)) {
            const lane = network.current.segments.get(`${movement.fromRoad}:${movement.lane}`)!;
            const point = atDistance(lane.points, lane.length);
            ctx.fillStyle = isGreen(
              scenario,
              movement,
              snapshot?.metrics.time ?? 0,
              snapshot?.allRed,
            )
              ? '#8be5c5'
              : '#ff9776';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        for (const car of cars.filter((c) => c.level === level)) {
          ctx.save();
          ctx.translate(car.x, car.y);
          ctx.rotate(car.angle);
          if (selectedCar === car.id) {
            ctx.strokeStyle = '#fff6d7';
            ctx.lineWidth = 1 / v.scale;
            ctx.strokeRect(-6, -3.4, 8, 6.8);
          }
          ctx.fillStyle = speedColor(car.speed, car.desiredSpeed);
          ctx.fillRect(-4.5, -1.1, 4.5, 2.2);
          ctx.fillStyle = '#174b4b';
          ctx.fillRect(-1.8, -0.8, 0.65, 1.6);
          ctx.restore();
        }
      }
      for (const node of scenario.nodes) {
        if (editing) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 5 / v.scale, 0, Math.PI * 2);
          ctx.fillStyle = '#e8cc8c';
          ctx.fill();
          ctx.strokeStyle = '#142f32';
          ctx.lineWidth = 1 / v.scale;
          ctx.stroke();
        }
        if (node.kind === 'boundary' && scenario.mode !== 'ring') {
          ctx.font = `${10 / v.scale}px system-ui`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#9fb9af';
          ctx.fillText(node.id.toUpperCase(), node.x, node.y + 20 / v.scale);
        }
      }
      ctx.restore();
    };
    const animate = () => {
      draw();
      frame = requestAnimationFrame(animate);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const world = (x: number, y: number): Point => {
    const v = view.current;
    return {
      x: (x - v.w / 2 - v.pan.x) / v.scale + v.center.x,
      y: (y - v.h / 2 - v.pan.y) / v.scale + v.center.y,
    };
  };
  const changeZoom = (factor: number) => {
    view.current.zoom = Math.max(0.5, Math.min(4, view.current.zoom * factor));
    setZoom(view.current.zoom);
  };
  return (
    <div className={`map-wrapper ${props.addingNode ? 'crosshair' : ''}`} ref={wrapper}>
      <canvas
        ref={canvas}
        aria-label="Interactive traffic network. Select roads or vehicles with a pointer; equivalent controls are in the inspector."
        role="img"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect(),
            x = event.clientX - rect.left,
            y = event.clientY - rect.top;
          const point = world(x, y);
          if (props.addingNode) {
            props.onAddNode({ x: Math.round(point.x), y: Math.round(point.y) });
            return;
          }
          const node =
            props.editing && props.scenario.mode !== 'ring'
              ? props.scenario.nodes.find((n) => distance(n, point) < 12 / view.current.scale)
              : undefined;
          drag.current = { x, y, point, moved: false, node: node?.id };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const rect = event.currentTarget.getBoundingClientRect(),
            x = event.clientX - rect.left,
            y = event.clientY - rect.top;
          const d = drag.current;
          if (Math.hypot(x - d.x, y - d.y) > 3) d.moved = true;
          if (!d.node && d.moved) {
            view.current.pan.x += x - d.x;
            view.current.pan.y += y - d.y;
            d.x = x;
            d.y = y;
          }
        }}
        onPointerUp={(event) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const rect = event.currentTarget.getBoundingClientRect(),
            x = event.clientX - rect.left,
            y = event.clientY - rect.top,
            point = world(x, y);
          if (d.node && d.moved) {
            props.onMoveNode(d.node, { x: Math.round(point.x), y: Math.round(point.y) });
            return;
          }
          if (d.moved) return;
          const car = [...(props.snapshot?.cars ?? [])].sort(
            (a, b) => distance(a, point) - distance(b, point),
          )[0];
          if (!props.editing && car && distance(car, point) < 12 / view.current.scale) {
            props.onCar(car.id);
            return;
          }
          let closest: { id: string; gap: number } | null = null;
          for (const lane of network.current.lanes)
            for (let offset = 0; offset < lane.length; offset += 5) {
              const gap = distance(atDistance(lane.points, offset), point);
              if (gap < 12 / view.current.scale && (!closest || gap < closest.gap))
                closest = { id: lane.roadId, gap };
            }
          if (closest) props.onRoad(closest.id);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(event) => {
          changeZoom(event.deltaY > 0 ? 0.92 : 1.08);
        }}
      />
      <div className="map-badge">
        <span className="live-dot" />
        {props.editing ? 'NETWORK EDITOR' : 'AGENT VIEW'}
        <span className="map-scale">1 unit = 1 meter</span>
      </div>
      <div className="map-tools">
        <button aria-label="Zoom in" onClick={() => changeZoom(1.25)}>
          <Plus size={16} />
        </button>
        <button aria-label="Zoom out" onClick={() => changeZoom(0.8)}>
          <Minus size={16} />
        </button>
        <button
          aria-label="Fit network"
          onClick={() => {
            view.current.zoom = 1;
            view.current.pan = { x: 0, y: 0 };
            setZoom(1);
          }}
        >
          <Crosshair size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <div className="map-legend">
        <span>
          <i style={{ background: '#8be5c5' }} />
          Moving
        </span>
        <span>
          <i style={{ background: '#f3d27b' }} />
          Slowing
        </span>
        <span>
          <i style={{ background: '#ff9776' }} />
          Stopped
        </span>
      </div>
      {props.editing && (
        <div className="map-help">
          {props.addingNode
            ? 'Click the map to place a junction'
            : 'Drag a node to move it · Select a road to edit'}
        </div>
      )}
    </div>
  );
}
