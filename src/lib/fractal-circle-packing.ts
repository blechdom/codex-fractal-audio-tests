import {
  type DataSourceKind,
  type FractalKind,
  type FractalParams,
  clamp01,
  computeViewport,
  fractalPointMetrics,
  lerp,
} from "@/lib/fractal-core";
import { computeEdgeField } from "@/lib/fractal-playback-schemes";

export interface PackedCircle {
  x: number;
  y: number;
  r: number;
  edge: number;
  smooth: number;
}

export interface CirclePackingParams {
  width: number;
  height: number;
  zoom: number;
  maxIter: number;
  centerX: number;
  centerY: number;
  dataSource?: DataSourceKind;
  patternScale?: number;
  fractalType?: FractalKind;
  juliaCx?: number;
  juliaCy?: number;
  maxCircles: number;
  minRadius: number;
  maxRadius: number;
  edgeThreshold: number;
}

export interface CirclePackingResult {
  circles: PackedCircle[];
  pixels: Uint8ClampedArray;
}

function overlap(a: PackedCircle, b: PackedCircle) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 1.5;
}

export function computeFractalCirclePacking(
  params: CirclePackingParams
): CirclePackingResult {
  const {
    width,
    height,
    zoom,
    maxIter,
    centerX,
    centerY,
    dataSource,
    patternScale,
    fractalType,
    juliaCx,
    juliaCy,
    maxCircles,
    minRadius,
    maxRadius,
    edgeThreshold,
  } = params;

  const smooth = new Float32Array(width * height);
  const edge = new Float32Array(width * height);
  const pixels = new Uint8ClampedArray(width * height * 4);

  const viewport = computeViewport({ zoom, time: 0, centerX, centerY });
  const fractalParams: FractalParams = {
    dataSource,
    patternScale,
    fractalType,
    juliaCx,
    juliaCy,
  };

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
      smooth[y * width + x] = fractalPointMetrics(cx, cy, maxIter, fractalParams).smoothNorm;
    }
  }
  const computedEdge = computeEdgeField(smooth, width, height, 4.5);
  edge.set(computedEdge);
  for (let i = 0; i < edge.length; i += 1) {
    const e = edge[i];
    const red = Math.floor(255 * (0.1 + 0.9 * e));
    const green = Math.floor(255 * (0.15 + 0.8 * smooth[i]));
    const blue = Math.floor(255 * (0.12 + 0.75 * (1 - e)));
    const p = i * 4;
    pixels[p] = red;
    pixels[p + 1] = green;
    pixels[p + 2] = blue;
    pixels[p + 3] = 255;
  }

  const candidates: Array<{ x: number; y: number; edge: number; smooth: number }> = [];
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const i = y * width + x;
      if (edge[i] >= edgeThreshold) {
        candidates.push({ x, y, edge: edge[i], smooth: smooth[i] });
      }
    }
  }

  candidates.sort((a, b) => b.edge - a.edge);
  const circles: PackedCircle[] = [];
  const stride = 37;
  for (let k = 0; k < candidates.length && circles.length < maxCircles; k += 1) {
    const c = candidates[(k * stride) % candidates.length];
    let r = lerp(maxRadius, minRadius, c.edge);
    r = Math.max(minRadius, Math.min(maxRadius, r));
    r = Math.min(r, c.x - 1, width - c.x - 1, c.y - 1, height - c.y - 1);
    if (r < minRadius) continue;

    const trial: PackedCircle = { x: c.x, y: c.y, r, edge: c.edge, smooth: c.smooth };
    for (let i = 0; i < circles.length; i += 1) {
      const other = circles[i];
      const dist = Math.hypot(trial.x - other.x, trial.y - other.y);
      const allowed = dist - other.r - 1;
      if (allowed < trial.r) trial.r = allowed;
      if (trial.r < minRadius) break;
    }
    if (trial.r < minRadius) continue;
    if (circles.some((cc) => overlap(trial, cc))) continue;
    circles.push(trial);
  }

  return { circles, pixels };
}
