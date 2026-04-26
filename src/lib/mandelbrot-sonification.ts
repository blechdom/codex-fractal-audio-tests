import {
  type DataSourceKind,
  type FractalKind,
  clamp01,
  computeViewport,
  fractalPointMetrics,
  lerp,
} from "@/lib/fractal-core";

export interface MandelbrotPoint {
  escaped: boolean;
  iter: number;
  smooth: number;
  potential: number;
  trap: number;
  stripe: number;
  distance: number;
}

export type StrategySlug =
  | "raster-scan"
  | "space-filling-scan"
  | "column-sine-bank"
  | "escape-fm-index"
  | "potential-filter-sweep"
  | "histogram-equalized-loudness"
  | "boundary-transients"
  | "orbit-trap-resonance"
  | "stripe-phase-weave"
  | "distance-spatial-depth"
  | "zoom-macroform"
  | "delta-novelty"
  | "inside-set-drone"
  | "multiresolution-voices"
  | "entropy-structure-mix";

export interface SonificationStrategy {
  slug: StrategySlug;
  title: string;
  description: string;
  accent: string;
}

export const STRATEGIES: SonificationStrategy[] = [
  {
    slug: "raster-scan",
    title: "Raster Scan Sonification",
    description: "Classic left-to-right scan. Escape smoothness maps to oscillator gains and frequency offsets.",
    accent: "#ff4d67",
  },
  {
    slug: "space-filling-scan",
    title: "Space-Filling Curve Scan",
    description: "Pseudo-Hilbert remap keeps nearby points close in time to preserve 2D continuity in audio.",
    accent: "#ff7a45",
  },
  {
    slug: "column-sine-bank",
    title: "Column/Row Sine Bank",
    description: "Rows become harmonic partials. Local fractal intensity behaves like moving spectral formants.",
    accent: "#ffa940",
  },
  {
    slug: "escape-fm-index",
    title: "Escape-Time as FM Index",
    description: "Iteration complexity drives FM depth: interior regions stay pure, chaotic boundaries grow sidebands.",
    accent: "#fadb14",
  },
  {
    slug: "potential-filter-sweep",
    title: "Potential as Filter Sweep",
    description: "Continuous potential controls noise filter cutoff for smooth color-gradient style timbral shifts.",
    accent: "#a0d911",
  },
  {
    slug: "histogram-equalized-loudness",
    title: "Histogram-Equalized Loudness",
    description: "Ranks smooth values each frame to redistribute dynamic range and reveal low-probability structures.",
    accent: "#52c41a",
  },
  {
    slug: "boundary-transients",
    title: "Boundary Transient Detector",
    description: "Local gradients trigger transient noise bursts while stable regions remain tonal and sustained.",
    accent: "#13c2c2",
  },
  {
    slug: "orbit-trap-resonance",
    title: "Orbit Trap Resonance",
    description: "Distance-to-trap metrics feed resonant tonal layers, making geometric traps audible as motifs.",
    accent: "#1890ff",
  },
  {
    slug: "stripe-phase-weave",
    title: "Stripe/Angle Phase Weave",
    description: "Stripe average drives stereo phase and panning for audible equipotential interference textures.",
    accent: "#2f54eb",
  },
  {
    slug: "distance-spatial-depth",
    title: "Distance Estimator Depth",
    description: "Distance estimate controls width and diffusion, turning geometric depth into perceived spatial depth.",
    accent: "#722ed1",
  },
  {
    slug: "zoom-macroform",
    title: "Zoom Trajectory Macro-Form",
    description: "Zoom level itself modulates rate and brightness: zoom-in resolves structure, zoom-out dissolves it.",
    accent: "#b37feb",
  },
  {
    slug: "delta-novelty",
    title: "Perturbation / Delta Novelty",
    description: "Difference from previous frame highlights emergent detail and suppresses regions that stayed unchanged.",
    accent: "#eb2f96",
  },
  {
    slug: "inside-set-drone",
    title: "Inside-Set Drone Anchor",
    description: "Non-escaping points feed a persistent low drone while escaping exterior points texture the upper band.",
    accent: "#f759ab",
  },
  {
    slug: "multiresolution-voices",
    title: "Multiresolution Voice Stack",
    description: "Coarse-to-fine windows drive low-to-high voice groups so global shape and fine filaments are separable.",
    accent: "#fa8c16",
  },
  {
    slug: "entropy-structure-mix",
    title: "Entropy Structure Mixer",
    description: "Local entropy crossfades tonal banks and filtered noise to express structure emerging from turbulence.",
    accent: "#fa541c",
  },
];

export interface FrameParams {
  strategy: StrategySlug;
  time: number;
  zoom: number;
  scan: number;
  maxIter: number;
  centerX?: number;
  centerY?: number;
  dataSource?: DataSourceKind;
  patternScale?: number;
  fractalType?: FractalKind;
  juliaCx?: number;
  juliaCy?: number;
}

export interface SonificationFrame {
  freqs: number[];
  gains: number[];
  pans: number[];
  smoothByVoice: number[];
  stripeByVoice: number[];
  edgeByVoice: number[];
  densityByVoice: number[];
  noiseGain: number;
  cutoff: number;
  resonance: number;
  fmDepth: number;
  lfoRate: number;
  master: number;
}

export interface VisualFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

interface FrameState {
  prevSmooth: number[];
}

const FRAME_STATE: Record<StrategySlug, FrameState> = Object.create(null);

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function logMap(v: number, lo: number, hi: number) {
  const t = clamp01(v);
  return lo * Math.pow(hi / lo, t);
}

function mapScanPosition(i: number, count: number, strategy: StrategySlug, t: number) {
  const x = i / Math.max(1, count - 1);
  if (strategy === "space-filling-scan") {
    const warped = 0.5 + 0.5 * Math.sin(2 * Math.PI * x + 0.4 * Math.sin(8 * x + t * 0.11));
    return clamp01(warped);
  }
  if (strategy === "multiresolution-voices") {
    const octave = Math.floor(x * 4);
    const local = x * 4 - octave;
    const warped = (octave + local * local) / 4;
    return clamp01(warped);
  }
  if (strategy === "column-sine-bank") {
    return clamp01(0.5 + 0.5 * Math.sin(6 * Math.PI * x));
  }
  return x;
}

function mandelbrotPoint(
  cx: number,
  cy: number,
  maxIter: number,
  params: Pick<FrameParams, "fractalType" | "juliaCx" | "juliaCy"> = {}
): MandelbrotPoint {
  const p = fractalPointMetrics(cx, cy, maxIter, params);
  return {
    escaped: p.escaped,
    iter: p.iter,
    smooth: p.smoothRaw,
    potential: p.potential,
    trap: p.trap,
    stripe: p.stripe,
    distance: p.distance,
  };
}

function equalize(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  return values.map((v) => {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / Math.max(1, sorted.length - 1);
  });
}

export function computeFrame(params: FrameParams): SonificationFrame {
  const voiceCount = 24;
  const sampleCount = Math.max(96, Math.floor(96 + params.scan * 120));
  const zoomScale = Math.pow(0.94, params.zoom * 120);
  const viewport = computeViewport({
    zoom: params.zoom,
    time: params.time,
    centerX: params.centerX,
    centerY: params.centerY,
  });

  const smoothVals: number[] = [];
  const potentialVals: number[] = [];
  const trapVals: number[] = [];
  const stripeVals: number[] = [];
  const distanceVals: number[] = [];
  const insideVals: number[] = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const u = mapScanPosition(i, sampleCount, params.strategy, params.time);
    const row = (Math.sin(2 * Math.PI * u + params.time * 0.08) + 1) * 0.5;
    const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, u);
    const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, row);
    const p = mandelbrotPoint(cx, cy, params.maxIter, params);
    smoothVals.push(clamp01(p.smooth / params.maxIter));
    potentialVals.push(p.potential);
    trapVals.push(p.trap);
    stripeVals.push(p.stripe);
    distanceVals.push(p.distance);
    insideVals.push(p.escaped ? 0 : 1);
  }

  const gradients = smoothVals.map((v, i) => Math.abs(v - (i > 0 ? smoothVals[i - 1] : v)));
  const equalizedSmooth = equalize(smoothVals);

  const strategyState = FRAME_STATE[params.strategy] ?? { prevSmooth: smoothVals.slice() };
  FRAME_STATE[params.strategy] = strategyState;
  const deltas = smoothVals.map((v, i) => Math.abs(v - (strategyState.prevSmooth[i] ?? v)));
  strategyState.prevSmooth = smoothVals.slice();

  const freqs: number[] = [];
  const gains: number[] = [];
  const pans: number[] = [];
  const smoothByVoice: number[] = [];
  const stripeByVoice: number[] = [];
  const edgeByVoice: number[] = [];
  const densityByVoice: number[] = [];

  let noiseGain = 0.1;
  let cutoff = 1200;
  let resonance = 0.3;
  let fmDepth = 0.2;
  let lfoRate = 0.2;
  let master = 0.35;

  for (let v = 0; v < voiceCount; v += 1) {
    const idx = Math.floor((v / (voiceCount - 1)) * (sampleCount - 1));
    const base = logMap(v / (voiceCount - 1), 60, 3600);
    const s = smoothVals[idx];
    const e = equalizedSmooth[idx];
    const g = gradients[idx];
    const trap = trapVals[idx];
    const stripe = stripeVals[idx];
    const dist = distanceVals[idx];
    const inside = insideVals[idx];
    const delta = deltas[idx];

    let gain = 0.02 + 0.25 * s;
    let freq = base * (0.8 + 0.8 * s);
    let pan = v / (voiceCount - 1) * 2 - 1;

    switch (params.strategy) {
      case "raster-scan":
        gain = 0.03 + 0.22 * s;
        break;
      case "space-filling-scan":
        gain = 0.03 + 0.2 * (0.6 * s + 0.4 * g);
        pan *= 0.6;
        break;
      case "column-sine-bank":
        gain = 0.02 + 0.24 * (0.4 * s + 0.6 * stripe);
        freq = base * (0.7 + 1.1 * stripe);
        break;
      case "escape-fm-index":
        gain = 0.02 + 0.2 * s;
        fmDepth = 0.15 + 1.2 * s;
        lfoRate = 0.15 + 1.4 * g;
        break;
      case "potential-filter-sweep":
        gain = 0.02 + 0.2 * s;
        cutoff = lerp(220, 6800, potentialVals[idx]);
        resonance = 0.2 + 0.7 * potentialVals[idx];
        break;
      case "histogram-equalized-loudness":
        gain = 0.01 + 0.28 * e;
        break;
      case "boundary-transients":
        gain = 0.02 + 0.16 * s;
        noiseGain = Math.max(noiseGain, 0.03 + 0.7 * g);
        break;
      case "orbit-trap-resonance":
        gain = 0.02 + 0.2 * trap;
        freq = base * (0.65 + 1.5 * trap);
        resonance = Math.max(resonance, 0.2 + 0.75 * trap);
        break;
      case "stripe-phase-weave":
        gain = 0.02 + 0.2 * stripe;
        pan = Math.sin(stripe * Math.PI * 2 + v * 0.25);
        break;
      case "distance-spatial-depth":
        gain = 0.02 + 0.2 * (1 - dist);
        pan *= 0.2 + 1.1 * dist;
        noiseGain = 0.05 + 0.18 * dist;
        break;
      case "zoom-macroform":
        gain = 0.02 + 0.2 * s;
        fmDepth = 0.1 + 0.8 * (1 - zoomScale);
        cutoff = lerp(450, 7200, 1 - zoomScale);
        break;
      case "delta-novelty":
        gain = 0.01 + 0.32 * delta;
        noiseGain = Math.max(noiseGain, 0.03 + 0.45 * delta);
        break;
      case "inside-set-drone":
        gain = inside > 0.5 ? 0.13 : 0.01 + 0.12 * s;
        freq = inside > 0.5 ? base * 0.25 : base * (0.85 + 0.5 * s);
        break;
      case "multiresolution-voices": {
        const band = Math.floor((v / voiceCount) * 3);
        const window = band === 0 ? s : band === 1 ? g : trap;
        gain = 0.02 + 0.22 * window;
        freq = base * (0.8 + 0.7 * window);
        break;
      }
      case "entropy-structure-mix": {
        const entropy = clamp01(logistic((g - 0.06) * 18));
        gain = 0.015 + 0.2 * (1 - entropy) * s;
        noiseGain = Math.max(noiseGain, 0.05 + 0.5 * entropy);
        cutoff = lerp(300, 6400, 1 - entropy);
        break;
      }
    }

    freqs.push(Math.max(30, Math.min(10000, freq)));
    gains.push(clamp01(gain));
    pans.push(Math.max(-1, Math.min(1, pan)));
    smoothByVoice.push(s);
    stripeByVoice.push(stripe);
    edgeByVoice.push(g);
    densityByVoice.push(1 - inside);
  }

  return {
    freqs,
    gains,
    pans,
    smoothByVoice,
    stripeByVoice,
    edgeByVoice,
    densityByVoice,
    noiseGain: clamp01(noiseGain),
    cutoff: Math.max(80, Math.min(14000, cutoff)),
    resonance: clamp01(resonance),
    fmDepth: Math.max(0, Math.min(2, fmDepth)),
    lfoRate: Math.max(0.03, Math.min(8, lfoRate)),
    master,
  };
}

function strategyColor(
  strategy: StrategySlug,
  smooth: number,
  potential: number,
  trap: number,
  stripe: number,
  distance: number,
  gradient: number,
  entropy: number,
  inside: number,
  delta: number
) {
  let r = smooth;
  let g = potential;
  let b = stripe;

  switch (strategy) {
    case "raster-scan":
      r = smooth;
      g = potential;
      b = 0.4 + 0.6 * stripe;
      break;
    case "space-filling-scan":
      r = 0.5 * smooth + 0.5 * gradient;
      g = 0.6 * potential + 0.4 * stripe;
      b = 0.3 + 0.7 * trap;
      break;
    case "column-sine-bank":
      r = 0.2 + 0.8 * stripe;
      g = 0.3 + 0.7 * smooth;
      b = 0.2 + 0.8 * potential;
      break;
    case "escape-fm-index":
      r = 0.2 + 0.8 * smooth;
      g = 0.1 + 0.9 * gradient;
      b = 0.2 + 0.8 * gradient;
      break;
    case "potential-filter-sweep":
      r = 0.2 + 0.8 * potential;
      g = 0.2 + 0.8 * potential;
      b = 0.3 + 0.7 * (1 - potential);
      break;
    case "histogram-equalized-loudness":
      r = 0.25 + 0.75 * smooth;
      g = 0.25 + 0.75 * Math.sqrt(smooth);
      b = 0.25 + 0.75 * (1 - smooth);
      break;
    case "boundary-transients":
      r = gradient;
      g = 0.5 * smooth + 0.5 * gradient;
      b = 0.2 + 0.6 * (1 - gradient);
      break;
    case "orbit-trap-resonance":
      r = 0.2 + 0.8 * trap;
      g = 0.1 + 0.9 * stripe;
      b = 0.2 + 0.8 * smooth;
      break;
    case "stripe-phase-weave":
      r = 0.2 + 0.8 * stripe;
      g = 0.2 + 0.8 * (1 - stripe);
      b = 0.2 + 0.8 * potential;
      break;
    case "distance-spatial-depth":
      r = 0.1 + 0.9 * (1 - distance);
      g = 0.1 + 0.9 * potential;
      b = 0.2 + 0.8 * distance;
      break;
    case "zoom-macroform":
      r = 0.2 + 0.8 * smooth;
      g = 0.3 + 0.7 * potential;
      b = 0.2 + 0.8 * entropy;
      break;
    case "delta-novelty":
      r = 0.2 + 0.8 * delta;
      g = 0.2 + 0.8 * smooth;
      b = 0.3 + 0.7 * gradient;
      break;
    case "inside-set-drone":
      r = inside > 0.5 ? 0.15 : 0.4 + 0.6 * smooth;
      g = inside > 0.5 ? 0.05 : 0.3 + 0.7 * potential;
      b = inside > 0.5 ? 0.2 : 0.2 + 0.8 * stripe;
      break;
    case "multiresolution-voices":
      r = 0.2 + 0.8 * smooth;
      g = 0.2 + 0.8 * gradient;
      b = 0.2 + 0.8 * trap;
      break;
    case "entropy-structure-mix":
      r = 0.2 + 0.8 * (1 - entropy);
      g = 0.2 + 0.8 * smooth;
      b = 0.2 + 0.8 * entropy;
      break;
  }

  const gamma = 0.9;
  return [
    Math.floor(255 * Math.pow(clamp01(r), gamma)),
    Math.floor(255 * Math.pow(clamp01(g), gamma)),
    Math.floor(255 * Math.pow(clamp01(b), gamma)),
  ] as const;
}

export function computeVisualFrame(
  params: FrameParams,
  width: number,
  height: number
): VisualFrame {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const smoothVals = new Float32Array(width * height);
  const potentialVals = new Float32Array(width * height);
  const trapVals = new Float32Array(width * height);
  const stripeVals = new Float32Array(width * height);
  const distanceVals = new Float32Array(width * height);
  const insideVals = new Float32Array(width * height);

  const viewport = computeViewport({
    zoom: params.zoom,
    time: params.time,
    centerX: params.centerX,
    centerY: params.centerY,
  });

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
      const p = mandelbrotPoint(cx, cy, params.maxIter, params);
      const idx = y * width + x;
      smoothVals[idx] = clamp01(p.smooth / params.maxIter);
      potentialVals[idx] = p.potential;
      trapVals[idx] = p.trap;
      stripeVals[idx] = p.stripe;
      distanceVals[idx] = p.distance;
      insideVals[idx] = p.escaped ? 0 : 1;
    }
  }

  const state = FRAME_STATE[params.strategy] ?? { prevSmooth: Array.from(smoothVals) };
  FRAME_STATE[params.strategy] = state;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const left = smoothVals[y * width + Math.max(0, x - 1)];
      const right = smoothVals[y * width + Math.min(width - 1, x + 1)];
      const up = smoothVals[Math.max(0, y - 1) * width + x];
      const down = smoothVals[Math.min(height - 1, y + 1) * width + x];
      const dx = Math.abs(right - left);
      const dy = Math.abs(down - up);
      const gradient = clamp01(Math.hypot(dx, dy) * 4);
      const entropy = clamp01(logistic((gradient - 0.07) * 20));
      const delta = Math.abs(smoothVals[idx] - (state.prevSmooth[idx] ?? smoothVals[idx]));

      const [r, g, b] = strategyColor(
        params.strategy,
        smoothVals[idx],
        potentialVals[idx],
        trapVals[idx],
        stripeVals[idx],
        distanceVals[idx],
        gradient,
        entropy,
        insideVals[idx],
        delta
      );

      const p = idx * 4;
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }

  state.prevSmooth = Array.from(smoothVals);
  return { width, height, pixels };
}
