export const TAU = Math.PI * 2;

export type Point = {
  x: number;
  y: number;
};

export type Segment = {
  a: Point;
  b: Point;
  threshold: number;
  used?: boolean;
};

export type ContourPath = {
  points: Point[];
  threshold: number;
  length: number;
  cumulative: number[];
  bend: number;
};

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function fract(x: number) {
  return x - Math.floor(x);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function angleDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

export function sampleComplex(nx: number, ny: number) {
  const centerX = -0.74364388703;
  const centerY = 0.13182590421;
  const radius = 0.018;
  return {
    x: centerX + (nx * 2 - 1) * radius,
    y: centerY + (ny * 2 - 1) * radius,
  };
}

export function mandelbrotSmoothIter(cx: number, cy: number, maxIter: number) {
  let zx = 0;
  let zy = 0;

  for (let iter = 0; iter < maxIter; iter += 1) {
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;

    const r2 = zx * zx + zy * zy;
    if (r2 > 16) {
      const r = Math.sqrt(r2);
      return iter + 1 - Math.log2(Math.log2(Math.max(2, r)));
    }
  }

  return maxIter + 1;
}

function interpolate(a: Point, b: Point, va: number, vb: number, threshold: number): Point {
  const denom = vb - va;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : clamp01((threshold - va) / denom);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function extractSegments(values: Float32Array, w: number, h: number, threshold: number) {
  const segments: Segment[] = [];

  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const i0 = y * w + x;
      const i1 = i0 + 1;
      const i3 = i0 + w;
      const i2 = i3 + 1;
      const v0 = values[i0];
      const v1 = values[i1];
      const v2 = values[i2];
      const v3 = values[i3];
      const p0 = { x: x / (w - 1), y: y / (h - 1) };
      const p1 = { x: (x + 1) / (w - 1), y: y / (h - 1) };
      const p2 = { x: (x + 1) / (w - 1), y: (y + 1) / (h - 1) };
      const p3 = { x: x / (w - 1), y: (y + 1) / (h - 1) };
      const hits: Point[] = [];

      if ((v0 < threshold) !== (v1 < threshold)) hits.push(interpolate(p0, p1, v0, v1, threshold));
      if ((v1 < threshold) !== (v2 < threshold)) hits.push(interpolate(p1, p2, v1, v2, threshold));
      if ((v2 < threshold) !== (v3 < threshold)) hits.push(interpolate(p2, p3, v2, v3, threshold));
      if ((v3 < threshold) !== (v0 < threshold)) hits.push(interpolate(p3, p0, v3, v0, threshold));

      if (hits.length === 2) {
        segments.push({ a: hits[0], b: hits[1], threshold });
      } else if (hits.length === 4) {
        segments.push({ a: hits[0], b: hits[1], threshold });
        segments.push({ a: hits[2], b: hits[3], threshold });
      }
    }
  }

  return segments;
}

function pointKey(p: Point) {
  return `${Math.round(p.x * 10000)}:${Math.round(p.y * 10000)}`;
}

function pathBend(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    total += Math.abs(angleDelta(a1, a2));
  }
  return total / Math.max(1, points.length - 2);
}

export function preparePath(points: Point[], threshold: number): ContourPath {
  const cumulative = [0];
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(length);
  }
  return { points, threshold, length, cumulative, bend: pathBend(points) };
}

export function stitchSegments(segments: Segment[]) {
  const byEndpoint = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    [pointKey(segment.a), pointKey(segment.b)].forEach((key) => {
      const list = byEndpoint.get(key) ?? [];
      list.push(index);
      byEndpoint.set(key, list);
    });
  });

  const paths: ContourPath[] = [];

  const extend = (points: Point[], atFront: boolean) => {
    while (true) {
      const key = pointKey(atFront ? points[0] : points[points.length - 1]);
      const nextIndex = byEndpoint.get(key)?.find((index) => !segments[index].used);
      if (nextIndex === undefined) return;

      const segment = segments[nextIndex];
      segment.used = true;
      const other = pointKey(segment.a) === key ? segment.b : segment.a;
      if (atFront) points.unshift(other);
      else points.push(other);
    }
  };

  segments.forEach((segment) => {
    if (segment.used) return;
    segment.used = true;
    const points = [segment.a, segment.b];
    extend(points, false);
    extend(points, true);
    const path = preparePath(points, segment.threshold);
    if (path.points.length > 5 && path.length > 0.025) paths.push(path);
  });

  return paths;
}

export function samplePath(path: ContourPath, t: number) {
  if (path.points.length <= 1 || path.length <= 0) return path.points[0] ?? { x: 0.5, y: 0.5 };
  const target = fract(t) * path.length;
  let hi = path.cumulative.findIndex((value) => value >= target);
  if (hi <= 0) hi = 1;
  const lo = hi - 1;
  const segLen = path.cumulative[hi] - path.cumulative[lo];
  const local = segLen <= 1e-9 ? 0 : (target - path.cumulative[lo]) / segLen;
  const a = path.points[lo];
  const b = path.points[hi];
  return {
    x: a.x + (b.x - a.x) * local,
    y: a.y + (b.y - a.y) * local,
  };
}

export function tangentAngle(path: ContourPath, t: number, window: number) {
  const half = Math.max(0.0005, window * 0.5);
  const a = samplePath(path, t - half);
  const b = samplePath(path, t + half);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function relativeAngleSignature(path: ContourPath, samples: number, window: number) {
  const count = Math.max(8, Math.round(samples));
  const base = tangentAngle(path, 0, window);
  return Array.from({ length: count }, (_, i) => {
    const theta = tangentAngle(path, i / count, window);
    return angleDelta(base, theta) / Math.PI;
  });
}

export function curvatureSignature(path: ContourPath, samples: number, window: number) {
  const count = Math.max(8, Math.round(samples));
  return Array.from({ length: count }, (_, i) => {
    const t = i / count;
    const a = tangentAngle(path, t - window, window);
    const b = tangentAngle(path, t + window, window);
    return angleDelta(a, b) / Math.PI;
  });
}

export function sampleScalar(field: Float32Array, grid: number, point: Point) {
  const x = clamp01(point.x) * (grid - 1);
  const y = clamp01(point.y) * (grid - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid - 1, x0 + 1);
  const y1 = Math.min(grid - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = field[y0 * grid + x0] * (1 - tx) + field[y0 * grid + x1] * tx;
  const b = field[y1 * grid + x0] * (1 - tx) + field[y1 * grid + x1] * tx;
  return a * (1 - ty) + b * ty;
}

export function soundAt(smoothIter: number, currentIter: number, colorCycle: number, phase: number, maxIter: number) {
  if (smoothIter > currentIter || smoothIter > maxIter) return 0;
  const potential = clamp01(Math.log1p(Math.max(0, smoothIter)) / Math.log1p(currentIter));
  return fract(potential * colorCycle + phase) >= 0.5 ? 1 : 0;
}

export function buildMandelbrotFields(grid: number, maxIter: number) {
  const smoothIters = new Float32Array(grid * grid);
  const potential = new Float32Array(grid * grid);

  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const idx = y * grid + x;
      const c = sampleComplex(x / (grid - 1), y / (grid - 1));
      const smoothIter = mandelbrotSmoothIter(c.x, c.y, maxIter);
      smoothIters[idx] = smoothIter;
      potential[idx] = clamp01(Math.log1p(Math.min(smoothIter, maxIter)) / Math.log1p(maxIter));
    }
  }

  return { potential, smoothIters };
}

export function buildPotentialContours(potential: Float32Array, grid: number, contourLevels: number, pathCount: number) {
  const levels = Math.max(1, Math.round(contourLevels));
  const thresholds = Array.from({ length: levels }, (_, i) => 0.08 + (0.84 * (i + 1)) / (levels + 1));
  return stitchSegments(thresholds.flatMap((threshold) => extractSegments(potential, grid, grid, threshold)))
    .sort((a, b) => b.length - a.length)
    .slice(0, Math.max(1, Math.round(pathCount)));
}
