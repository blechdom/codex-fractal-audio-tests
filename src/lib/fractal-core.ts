export type FractalKind = "mandelbrot" | "julia";
export type DataSourceKind = "fractal" | "stripes" | "checkerboard" | "polka-dots";

export interface FractalParams {
  dataSource?: DataSourceKind;
  patternScale?: number;
  fractalType?: FractalKind;
  juliaCx?: number;
  juliaCy?: number;
}

export interface FractalViewportParams {
  zoom: number;
  time?: number;
  centerX?: number;
  centerY?: number;
}

export interface FractalViewport {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export interface FractalPointMetrics {
  escaped: boolean;
  iter: number;
  smoothRaw: number;
  smoothNorm: number;
  potential: number;
  trap: number;
  stripe: number;
  distance: number;
}

const DEFAULT_CENTER_X = -0.74364388703;
const DEFAULT_CENTER_Y = 0.13182590421;
const DEFAULT_JULIA_CX = -0.8;
const DEFAULT_JULIA_CY = 0.156;
const DEFAULT_PATTERN_SCALE = 5.5;

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function resolveFractalType(params: FractalParams): FractalKind {
  return params.fractalType ?? "mandelbrot";
}

export function resolveDataSource(params: FractalParams): DataSourceKind {
  return params.dataSource ?? "fractal";
}

export function resolveJuliaConstant(params: FractalParams) {
  return {
    cx: params.juliaCx ?? DEFAULT_JULIA_CX,
    cy: params.juliaCy ?? DEFAULT_JULIA_CY,
  };
}

export function computeViewport(params: FractalViewportParams): FractalViewport {
  const t = params.time ?? 0;
  const centerX = params.centerX ?? DEFAULT_CENTER_X + 0.13 * Math.sin(t * 0.03);
  const centerY = params.centerY ?? DEFAULT_CENTER_Y + 0.12 * Math.cos(t * 0.037);
  const zoomScale = Math.pow(0.94, params.zoom * 120);
  return {
    centerX,
    centerY,
    radiusX: 2.8 * zoomScale,
    radiusY: 1.6 * zoomScale,
  };
}

export function fractalPointMetrics(
  x: number,
  y: number,
  maxIter: number,
  params: FractalParams = {}
): FractalPointMetrics {
  const dataSource = resolveDataSource(params);
  if (dataSource !== "fractal") {
    return syntheticPointMetrics(x, y, maxIter, dataSource, params.patternScale);
  }

  const fractalType = resolveFractalType(params);
  const julia = resolveJuliaConstant(params);
  const isJulia = fractalType === "julia";

  let zx = isJulia ? x : 0;
  let zy = isJulia ? y : 0;
  const cx = isJulia ? julia.cx : x;
  const cy = isJulia ? julia.cy : y;

  let dzx = isJulia ? 1 : 0;
  let dzy = 0;
  let iter = maxIter;
  let trap = Number.POSITIVE_INFINITY;
  let escaped = false;

  for (let n = 0; n < maxIter; n += 1) {
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    const zxy = zx * zy;

    const ndzx = 2 * (zx * dzx - zy * dzy) + (isJulia ? 0 : 1);
    const ndzy = 2 * (zx * dzy + zy * dzx);
    dzx = ndzx;
    dzy = ndzy;

    zx = zx2 - zy2 + cx;
    zy = 2 * zxy + cy;

    const radius = Math.hypot(zx, zy);
    trap = Math.min(trap, Math.abs(radius - 0.5), Math.abs(zy));

    if (zx * zx + zy * zy > 16) {
      iter = n;
      escaped = true;
      break;
    }
  }

  if (!escaped) {
    return {
      escaped: false,
      iter,
      smoothRaw: maxIter,
      smoothNorm: 1,
      potential: 0,
      trap: clamp01(1 - trap),
      stripe: 0,
      distance: 0,
    };
  }

  const mag = Math.hypot(zx, zy);
  const smoothRaw = iter + 1 - Math.log2(Math.log2(Math.max(2, mag)));
  const smoothNorm = clamp01(smoothRaw / maxIter);
  const stripe = 0.5 + 0.5 * Math.sin(5 * Math.atan2(zy, zx) + smoothRaw * 0.2);
  const dz = Math.hypot(dzx, dzy);
  const distance = dz > 1e-9 ? clamp01((mag * Math.log(mag)) / (8 * dz)) : 0;

  return {
    escaped: true,
    iter,
    smoothRaw,
    smoothNorm,
    potential: smoothNorm,
    trap: clamp01(1 - trap),
    stripe,
    distance,
  };
}

function syntheticPointMetrics(
  x: number,
  y: number,
  maxIter: number,
  source: Exclude<DataSourceKind, "fractal">,
  patternScale?: number
): FractalPointMetrics {
  const scale = Math.max(0.5, patternScale ?? DEFAULT_PATTERN_SCALE);
  const sx = x * scale;
  const sy = y * scale;
  const cellX = wrapUnit(sx) - 0.5;
  const cellY = wrapUnit(sy) - 0.5;

  let value = 0;
  if (source === "stripes") {
    value = 0.5 + 0.5 * Math.sin(2 * Math.PI * sx);
  } else if (source === "checkerboard") {
    value = ((Math.floor(sx) + Math.floor(sy)) & 1) === 0 ? 1 : 0;
  } else {
    const radius = Math.hypot(cellX, cellY);
    value = clamp01((0.34 - radius) / 0.07);
  }

  const smoothNorm = clamp01(0.5 + 0.5 * Math.tanh((value - 0.5) * 5));
  const smoothRaw = smoothNorm * maxIter;
  const stripe = source === "stripes" ? value : 0.5 + 0.5 * Math.sin(2 * Math.PI * (sx + 0.35 * sy));
  const trap = 1 - Math.min(1, Math.hypot(cellX, cellY) / 0.71);
  const distance = 1 - smoothNorm;
  const escaped = smoothNorm > 0.45;

  return {
    escaped,
    iter: Math.floor(smoothNorm * maxIter),
    smoothRaw,
    smoothNorm,
    potential: smoothNorm,
    trap: clamp01(trap),
    stripe: clamp01(stripe),
    distance: clamp01(distance),
  };
}

function wrapUnit(v: number) {
  return ((v % 1) + 1) % 1;
}
