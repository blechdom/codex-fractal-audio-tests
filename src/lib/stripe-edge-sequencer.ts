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

export interface StripeEdgeParams {
  zoom: number;
  maxIter: number;
  time: number;
  centerX?: number;
  centerY?: number;
  dataSource?: DataSourceKind;
  patternScale?: number;
  fractalType?: FractalKind;
  juliaCx?: number;
  juliaCy?: number;
  width: number;
  height: number;
  lanes: number;
  steps: number;
  stripeThreshold: number;
  edgeThreshold: number;
  playheadMode?: PlayheadMode;
  playheadCount?: number;
}

export interface StripeEdgeSequence {
  patterns: number[][];
  accents: number[][];
}

export interface StripeEdgeVisual {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export type PlayheadMode =
  | "serpentine"
  | "horizontal-front"
  | "horizontal-back"
  | "vertical-down"
  | "vertical-up"
  | "circle"
  | "multi-circle"
  | "spiral-out"
  | "spiral-in";

export function computeStripeEdgeSequence(params: StripeEdgeParams): StripeEdgeSequence {
  const {
    zoom,
    maxIter,
    time,
    centerX,
    centerY,
    dataSource,
    patternScale,
    fractalType,
    juliaCx,
    juliaCy,
    width,
    height,
    lanes,
    steps,
    stripeThreshold,
    edgeThreshold,
    playheadMode = "serpentine",
    playheadCount = 3,
  } = params;

  const viewport = computeViewport({ zoom, time, centerX, centerY });
  const fractalParams: FractalParams = {
    dataSource,
    patternScale,
    fractalType,
    juliaCx,
    juliaCy,
  };

  const smoothGrid = new Float32Array(width * height);
  const stripeGrid = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
      const p = fractalPointMetrics(cx, cy, maxIter, fractalParams);
      const idx = y * width + x;
      smoothGrid[idx] = p.smoothNorm;
      stripeGrid[idx] = p.stripe;
    }
  }
  const edgeGrid = computeEdgeField(smoothGrid, width, height, 4);

  const patterns = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));
  const accents = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));

  for (let lane = 0; lane < lanes; lane += 1) {
    for (let step = 0; step < steps; step += 1) {
      const stepNorm = step / Math.max(1, steps - 1);
      const rowNorm = (lane + 0.5) / lanes;

      let x = 0;
      let y = 0;

      if (playheadMode === "circle") {
        const theta = stepNorm * Math.PI * 2;
        const r = 0.08 + rowNorm * 0.88;
        x = Math.floor((0.5 + 0.5 * r * Math.cos(theta)) * (width - 1));
        y = Math.floor((0.5 + 0.5 * r * Math.sin(theta)) * (height - 1));
      } else if (playheadMode === "horizontal-front") {
        x = Math.floor(stepNorm * (width - 1));
        y = Math.floor(rowNorm * (height - 1));
      } else if (playheadMode === "horizontal-back") {
        x = Math.floor((1 - stepNorm) * (width - 1));
        y = Math.floor(rowNorm * (height - 1));
      } else if (playheadMode === "vertical-down") {
        x = Math.floor(rowNorm * (width - 1));
        y = Math.floor(stepNorm * (height - 1));
      } else if (playheadMode === "vertical-up") {
        x = Math.floor(rowNorm * (width - 1));
        y = Math.floor((1 - stepNorm) * (height - 1));
      } else if (playheadMode === "multi-circle") {
        const orbit = lane % Math.max(1, playheadCount);
        const phase = (orbit / Math.max(1, playheadCount)) * Math.PI * 2;
        const theta = stepNorm * Math.PI * 2 + phase;
        const r = 0.12 + rowNorm * 0.82;
        x = Math.floor((0.5 + 0.5 * r * Math.cos(theta)) * (width - 1));
        y = Math.floor((0.5 + 0.5 * r * Math.sin(theta)) * (height - 1));
      } else if (playheadMode === "spiral-out" || playheadMode === "spiral-in") {
        const turns = 2.5 + rowNorm * 2.5;
        const theta = stepNorm * turns * Math.PI * 2;
        const radial = playheadMode === "spiral-out" ? stepNorm : 1 - stepNorm;
        const r = 0.06 + radial * 0.92;
        x = Math.floor((0.5 + 0.5 * r * Math.cos(theta)) * (width - 1));
        y = Math.floor((0.5 + 0.5 * r * Math.sin(theta)) * (height - 1));
      } else {
        const serpentine = lane % 2 === 0;
        const sx = serpentine ? stepNorm : 1 - stepNorm;
        x = Math.floor(sx * (width - 1));
        y = Math.floor(rowNorm * (height - 1));
      }

      const idx = y * width + x;
      const edge = edgeGrid[idx];
      const stripe = stripeGrid[idx];

      const stripeBit = stripe > stripeThreshold ? 1 : 0;
      const edgeBit = edge > edgeThreshold ? 1 : 0;
      const bit = stripeBit ^ edgeBit;
      const accent = clamp01(0.2 + 0.55 * stripe + 0.45 * edge);

      patterns[lane][step] = bit;
      accents[lane][step] = accent;
    }
  }

  return { patterns, accents };
}

export function computeStripeEdgeVisual(params: StripeEdgeParams): StripeEdgeVisual {
  const {
    zoom,
    maxIter,
    time,
    centerX,
    centerY,
    dataSource,
    patternScale,
    fractalType,
    juliaCx,
    juliaCy,
    width,
    height,
    stripeThreshold,
    edgeThreshold,
  } = params;

  const viewport = computeViewport({ zoom, time, centerX, centerY });
  const fractalParams: FractalParams = {
    dataSource,
    patternScale,
    fractalType,
    juliaCx,
    juliaCy,
  };

  const smoothGrid = new Float32Array(width * height);
  const stripeGrid = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
      const p = fractalPointMetrics(cx, cy, maxIter, fractalParams);
      const idx = y * width + x;
      smoothGrid[idx] = p.smoothNorm;
      stripeGrid[idx] = p.stripe;
    }
  }
  const edgeGrid = computeEdgeField(smoothGrid, width, height, 4);

  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const edge = edgeGrid[idx];
      const stripe = stripeGrid[idx];

      const stripeBit = stripe > stripeThreshold ? 1 : 0;
      const edgeBit = edge > edgeThreshold ? 1 : 0;
      const active = stripeBit ^ edgeBit;
      const accent = clamp01(0.2 + 0.55 * stripe + 0.45 * edge);

      const r = active ? Math.floor(255 * (0.45 + 0.55 * accent)) : Math.floor(255 * (0.05 + 0.2 * edge));
      const g = active ? Math.floor(255 * (0.35 + 0.65 * stripe)) : Math.floor(255 * (0.06 + 0.24 * stripe));
      const b = active ? Math.floor(255 * (0.08 + 0.3 * (1 - edge))) : Math.floor(255 * (0.14 + 0.5 * (1 - edge)));

      const p = idx * 4;
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }

  return { width, height, pixels };
}
