import {
  type FractalParams,
  clamp01,
  computeViewport,
  fractalPointMetrics,
  lerp,
} from "@/lib/fractal-core";
import { computeEdgeField } from "@/lib/fractal-playback-schemes";

export type RecursivePlottingMode = "escape" | "distance";
export type RecursiveColoringMode =
  | "modulo"
  | "raw"
  | "outline"
  | "outlines"
  | "decomp1"
  | "decomp2";
export type RecursiveColorScheme = "color" | "grayscale";
export type RecursivePlayheadType =
  | "down"
  | "up"
  | "right"
  | "left"
  | "in"
  | "out"
  | "cw"
  | "ccw";

export interface RecursiveFrameParams extends FractalParams {
  width: number;
  height: number;
  zoom: number;
  centerX: number;
  centerY: number;
  maxIter: number;
  plottingMode: RecursivePlottingMode;
  coloringMode: RecursiveColoringMode;
  colorScheme: RecursiveColorScheme;
  paletteIndex: number;
  numShades: number;
  shadeOffset: number;
}

export interface RecursiveFrame {
  width: number;
  height: number;
  values: Float32Array;
  pixels: Uint8ClampedArray;
}

export interface PlayheadSample {
  values: number[];
  points: Array<{ x: number; y: number }>;
}

const PALETTES: Array<[number, number]> = [
  [220, 40],
  [340, 30],
  [280, 65],
  [120, 45],
  [30, 70],
  [200, 85],
];

export function generateRecursiveFrame(params: RecursiveFrameParams): RecursiveFrame {
  const {
    width,
    height,
    zoom,
    centerX,
    centerY,
    maxIter,
    plottingMode,
    coloringMode,
    colorScheme,
    paletteIndex,
    numShades,
    shadeOffset,
    ...fractalParams
  } = params;

  const viewport = computeViewport({ zoom, centerX, centerY, time: 0 });
  const iterNorm = new Float32Array(width * height);
  const valueField = new Float32Array(width * height);
  const angleField = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
      const idx = y * width + x;
      const p = fractalPointMetrics(cx, cy, maxIter, fractalParams);
      const iterLike = p.escaped ? p.iter : 0;
      const rawNorm = clamp01(iterLike / Math.max(1, maxIter));
      iterNorm[idx] = rawNorm;
      valueField[idx] = plottingMode === "distance" ? clamp01(1 - p.distance) : rawNorm;
      angleField[idx] = Math.atan2(cy, cx);
    }
  }

  const edgeField = computeEdgeField(valueField, width, height, 4.2);
  const values = applyColoringMode(
    valueField,
    iterNorm,
    angleField,
    edgeField,
    width,
    height,
    coloringMode,
    numShades,
    shadeOffset
  );

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < values.length; i += 1) {
    const v = clamp01(values[i]);
    const p = i * 4;
    if (colorScheme === "grayscale") {
      const shade = Math.floor(255 * v);
      pixels[p] = shade;
      pixels[p + 1] = shade;
      pixels[p + 2] = shade;
      pixels[p + 3] = 255;
    } else {
      const [baseHue, hueSpan] = PALETTES[((paletteIndex % PALETTES.length) + PALETTES.length) % PALETTES.length];
      const hue = (baseHue + hueSpan * (2 * v - 1) + 360) % 360;
      const sat = 85;
      const light = 20 + v * 60;
      const [r, g, b] = hslToRgb(hue / 360, sat / 100, light / 100);
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }

  return { width, height, values, pixels };
}

function applyColoringMode(
  valueField: Float32Array,
  iterNorm: Float32Array,
  angleField: Float32Array,
  edgeField: Float32Array,
  width: number,
  height: number,
  mode: RecursiveColoringMode,
  numShades: number,
  shadeOffset: number
) {
  const out = new Float32Array(valueField.length);
  const shades = Math.max(2, numShades);
  const offset = ((shadeOffset % shades) + shades) % shades;

  for (let i = 0; i < out.length; i += 1) {
    const v = valueField[i];
    const iterQ = Math.floor(v * (shades - 1));
    const moduloQ = ((iterQ + offset) % shades) / (shades - 1);
    if (mode === "modulo") {
      out[i] = moduloQ;
    } else if (mode === "raw") {
      out[i] = v;
    } else if (mode === "decomp1") {
      out[i] = angleField[i] >= 0 ? 0.15 : 0.95;
    } else if (mode === "decomp2") {
      const a = Math.atan(Math.abs(Math.sin(angleField[i])));
      out[i] = clamp01(a / 1.5);
    } else {
      out[i] = edgeField[i];
    }
  }

  if (mode === "outlines") {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        out[i] = clamp01(0.55 * out[i] + 0.45 * valueField[i]);
      }
    }
  }

  return out;
}

export function samplePlayhead(
  frame: RecursiveFrame,
  playheadType: RecursivePlayheadType,
  phase: number,
  sampleCount: number
): PlayheadSample {
  const count = Math.max(8, sampleCount);
  const values: number[] = [];
  const points: Array<{ x: number; y: number }> = [];
  const u = ((phase % 1) + 1) % 1;
  const width = frame.width;
  const height = frame.height;
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;

  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    let x = 0;
    let y = 0;
    if (playheadType === "down" || playheadType === "up") {
      x = t * (width - 1);
      y = (playheadType === "down" ? u : 1 - u) * (height - 1);
    } else if (playheadType === "right" || playheadType === "left") {
      x = (playheadType === "right" ? u : 1 - u) * (width - 1);
      y = t * (height - 1);
    } else if (playheadType === "in" || playheadType === "out") {
      const rNorm = playheadType === "out" ? u : 1 - u;
      const theta = t * Math.PI * 2;
      const rx = (width * 0.48) * rNorm;
      const ry = (height * 0.48) * rNorm;
      x = cx + Math.cos(theta) * rx;
      y = cy + Math.sin(theta) * ry;
    } else {
      const theta = (playheadType === "cw" ? u : 1 - u) * Math.PI * 2;
      const r = t * 0.5;
      x = cx + Math.cos(theta) * (width - 1) * r;
      y = cy + Math.sin(theta) * (height - 1) * r;
    }

    const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
    points.push({ x: xi, y: yi });
    values.push(frame.values[yi * width + xi]);
  }

  return { values, points };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hueToRgb(p: number, q: number, t: number) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
