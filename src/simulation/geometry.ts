export type Point = { x: number; y: number };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const lengthOf = (points: Point[]) =>
  points.slice(1).reduce((s, p, i) => s + distance(points[i], p), 0);

export function atDistance(points: Point[], offset: number): Point & { angle: number } {
  let remaining = Math.max(0, offset);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      len = distance(a, b);
    if (len < 1e-8) continue;
    if (remaining <= len || i === points.length - 1) {
      const t = Math.min(1, remaining / len);
      return {
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    remaining -= len;
  }
  return { ...points[0], angle: 0 };
}

export function offsetPath(points: Point[], amount: number): Point[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const len = distance(a, b) || 1;
    return { x: p.x - ((b.y - a.y) / len) * amount, y: p.y + ((b.x - a.x) / len) * amount };
  });
}

export function trimPath(points: Point[], start: number, end: number): Point[] {
  const length = lengthOf(points);
  const result: Point[] = [atDistance(points, start)];
  let s = 0;
  for (let i = 1; i < points.length - 1; i++) {
    s += distance(points[i - 1], points[i]);
    if (s > start && s < length - end) result.push(points[i]);
  }
  result.push(atDistance(points, length - end));
  return result;
}

export function turnPath(a: Point, center: Point, b: Point): Point[] {
  return Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return {
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * center.x + t * t * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * center.y + t * t * b.y,
    };
  });
}

function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = l2
    ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2))
    : 0;
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function pathsConflict(a: Point[], b: Point[]): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let i = 1; i < a.length; i++)
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1],
        q = a[i],
        r = b[j - 1],
        s = b[j];
      if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
      if (
        Math.min(
          pointSegmentDistance(p, r, s),
          pointSegmentDistance(q, r, s),
          pointSegmentDistance(r, p, q),
          pointSegmentDistance(s, p, q),
        ) < 3
      )
        return true;
    }
  return false;
}
