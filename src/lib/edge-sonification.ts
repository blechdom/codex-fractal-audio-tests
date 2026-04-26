import {
  type DataSourceKind,
  type FractalKind,
  type FractalParams,
  clamp01,
  computeViewport,
  fractalPointMetrics,
  lerp,
} from "@/lib/fractal-core";
import {
  computeEdgeField,
  sampleLaneColumnEnergy,
} from "@/lib/fractal-playback-schemes";

export interface EdgeFrameParams {
  zoom: number;
  maxIter: number;
  time: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  dataSource?: DataSourceKind;
  patternScale?: number;
  fractalType?: FractalKind;
  juliaCx?: number;
  juliaCy?: number;
}

export interface EdgeFrame {
  width: number;
  height: number;
  smooth: Float32Array;
  edges: Float32Array;
}

export interface EdgePatterns {
  stepBits: number[][];
  stepStrengths: number[][];
}

export function computeEdgeFrame(params: EdgeFrameParams): EdgeFrame {
  const {
    zoom,
    maxIter,
    time,
    centerX,
    centerY,
    width,
    height,
    dataSource,
    patternScale,
    fractalType,
    juliaCx,
    juliaCy,
  } = params;
  const smooth = new Float32Array(width * height);
  const viewport = computeViewport({
    zoom,
    time: 0,
    centerX: centerX + 0.03 * Math.sin(time * 0.02),
    centerY: centerY + 0.03 * Math.cos(time * 0.024),
  });
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

  const edges = computeEdgeField(smooth, width, height, 4.2);

  return { width, height, smooth, edges };
}

export function edgeFrameToPixels(frame: EdgeFrame) {
  const pixels = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let i = 0; i < frame.edges.length; i += 1) {
    const e = frame.edges[i];
    const s = frame.smooth[i];
    const r = Math.floor(255 * (0.1 + 0.9 * e));
    const g = Math.floor(255 * (0.2 + 0.8 * s));
    const b = Math.floor(255 * (0.12 + 0.88 * (1 - e)));
    const p = i * 4;
    pixels[p] = r;
    pixels[p + 1] = g;
    pixels[p + 2] = b;
    pixels[p + 3] = 255;
  }
  return pixels;
}

export function computeEdgePatterns(
  frame: EdgeFrame,
  lanes: number,
  steps: number,
  threshold: number
): EdgePatterns {
  const stepBits = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));
  const stepStrengths = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));

  for (let lane = 0; lane < lanes; lane += 1) {
    const y0 = Math.floor((lane / lanes) * (frame.height - 1));
    const y1 = Math.floor(((lane + 1) / lanes) * (frame.height - 1));
    for (let step = 0; step < steps; step += 1) {
      const x0 = Math.floor((step / steps) * (frame.width - 1));
      const x1 = Math.floor(((step + 1) / steps) * (frame.width - 1));
      let sum = 0;
      let count = 0;
      for (let y = y0; y <= Math.max(y0, y1); y += 1) {
        for (let x = x0; x <= Math.max(x0, x1); x += 1) {
          sum += frame.edges[y * frame.width + x];
          count += 1;
        }
      }
      const avg = count > 0 ? sum / count : 0;
      stepStrengths[lane][step] = avg;
      stepBits[lane][step] = avg >= threshold ? 1 : 0;
    }
  }

  return { stepBits, stepStrengths };
}

export function laneColumnEnergy(frame: EdgeFrame, lane: number, laneCount: number, xNorm: number) {
  return sampleLaneColumnEnergy(
    frame.edges,
    frame.width,
    frame.height,
    lane,
    laneCount,
    xNorm
  );
}
