import Head from "next/head";
import Link from "next/link";
import type { PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";

type FractalKind = "mandelbrot" | "julia";
type UncurlMode = "origin-polar" | "cardioid-perimeter";
type ViewId =
  | "mandelbrot"
  | "mandelbrot-unfurled"
  | "julia"
  | "julia-unfurled"
  | "double-log-polar"
  | "phase-unwrap"
  | "contour-unwrap"
  | "tile-period-unwrap";
type CanvasTool = "pan" | "julia";
type ColorMode =
  | "classic"
  | "smooth"
  | "escape-bands"
  | "histogram-rank"
  | "grayscale"
  | "bw-stripes"
  | "contour"
  | "distance-field"
  | "edge"
  | "normal-light"
  | "stripe"
  | "orbit-trap"
  | "pickover-stalks"
  | "domain-angle"
  | "external-angle"
  | "sinebow"
  | "turbo"
  | "viridis"
  | "magma"
  | "plasma"
  | "fire"
  | "ice"
  | "electric"
  | "neon"
  | "trap"
  | "bands"
  | "sekino-colorup"
  | "sekino-colordn"
  | "sekino-wave"
  | "sekino-wave6"
  | "sekino-blockwave"
  | "sekino-filled-julia"
  | "sekino-dancing"
  | "convergence-field"
  | "sekino-blockwave-bw"
  | "hybrid";

const ACCENT = "#90caf9";
const GPU_DPR_CAP = 1;
const MAX_RESOLUTION = 720;
const MAX_ITER = 900;
const MAX_ZOOM = 2;
const SAFE_GPU_SURFACE_WIDTH = MAX_RESOLUTION * 3;
const SAFE_GPU_SURFACE_HEIGHT = MAX_RESOLUTION * 3;

const COORD_STEP = 0.000001;

const VIEW_ORDER: { id: ViewId; label: string; mask: number }[] = [
  { id: "mandelbrot", label: "Mandelbrot", mask: 1 },
  { id: "mandelbrot-unfurled", label: "Mandelbrot Unfurled", mask: 2 },
  { id: "julia", label: "Julia", mask: 4 },
  { id: "julia-unfurled", label: "Julia Unfurled", mask: 8 },
  { id: "double-log-polar", label: "Double Log-Polar", mask: 16 },
  { id: "phase-unwrap", label: "Phase Unwrap", mask: 32 },
  { id: "contour-unwrap", label: "Contour Unwrap", mask: 64 },
  { id: "tile-period-unwrap", label: "Tile/Period Unwrap", mask: 128 },
];

const COLOR_MODES: { id: ColorMode; label: string; note: string }[] = [
  { id: "classic", label: "Classic", note: "escape-time rainbow" },
  { id: "smooth", label: "Smooth", note: "continuous escape" },
  { id: "escape-bands", label: "Escape Bands", note: "integer escape bands" },
  { id: "histogram-rank", label: "Histogram-ish", note: "rank-like contrast curve" },
  { id: "grayscale", label: "Grayscale", note: "smooth value" },
  { id: "bw-stripes", label: "B/W Stripes", note: "binary stripe phase" },
  { id: "contour", label: "Contours", note: "equipotential lines" },
  { id: "distance-field", label: "Distance", note: "crisp distance-style mask" },
  { id: "edge", label: "Edge", note: "neighbor gradient" },
  { id: "normal-light", label: "Normal Light", note: "shaded boundary" },
  { id: "stripe", label: "Stripe", note: "stripe average phase" },
  { id: "orbit-trap", label: "Orbit Trap", note: "circle trap distance" },
  { id: "pickover-stalks", label: "Pickover", note: "line trap stalks" },
  { id: "domain-angle", label: "Domain Angle", note: "coordinate angle hue" },
  { id: "external-angle", label: "External Angle", note: "angle plus escape" },
  { id: "sinebow", label: "Sinebow", note: "cyclic hue" },
  { id: "turbo", label: "Turbo", note: "high contrast heat" },
  { id: "viridis", label: "Viridis", note: "scientific palette" },
  { id: "magma", label: "Magma", note: "dark heat" },
  { id: "plasma", label: "Plasma", note: "purple-yellow" },
  { id: "fire", label: "Fire", note: "black-red-yellow" },
  { id: "ice", label: "Ice", note: "blue-white" },
  { id: "electric", label: "Electric", note: "cyan-violet" },
  { id: "neon", label: "Neon", note: "glowing edge mix" },
  { id: "trap", label: "Trap", note: "orbit trap scalar" },
  { id: "bands", label: "Bands", note: "branch bands" },
  { id: "hybrid", label: "Hybrid", note: "mixed metrics" },
  { id: "sekino-colorup", label: "Sekino Up", note: "power ramp C1 to C2" },
  { id: "sekino-colordn", label: "Sekino Down", note: "reverse power ramp C2 to C1" },
  { id: "sekino-wave", label: "Sekino Wave", note: "alternating ColorUp/ColorDn cycles" },
  { id: "sekino-wave6", label: "Sekino Wave6", note: "six-color triangular wave" },
  { id: "sekino-blockwave", label: "Sekino Blocks", note: "discontinuous stepped wave bands" },
  { id: "sekino-blockwave-bw", label: "Sekino Blocks B/W", note: "two-color black/white stepped bands" },
  { id: "sekino-filled-julia", label: "Sekino Filled", note: "green eyes and red/purple convergence-like waves" },
  { id: "sekino-dancing", label: "Dancing Seahorses", note: "palette inspired by Sekino's Julia example" },
  { id: "convergence-field", label: "Convergence Field", note: "period-k convergence iteration field" },
];

interface Preset {
  id: string;
  name: string;
  centerX: number;
  centerY: number;
  zoom: number;
  maxIter: number;
  fractalType?: FractalKind;
  juliaCx?: number;
  juliaCy?: number;
  convPeriod?: number;
  convEpsilon?: number;
  note: string;
}

const PRESETS: Preset[] = [
  { id: "full", name: "Full Set", centerX: -0.5, centerY: 0, zoom: 0, maxIter: 260, note: "whole cardioid and bulbs" },
  { id: "seahorse", name: "Seahorse Valley", centerX: -0.74364388703, centerY: 0.13182590421, zoom: 0.72, maxIter: 520, note: "classic spiral valley" },
  { id: "classic-seahorse", name: "Classic Seahorse Coeff", centerX: -0.7473198, centerY: 0.1084649, zoom: 0.94, maxIter: 760, note: "famous seahorse-tail coefficient" },
  { id: "riddle-seahorse", name: "Riddle Seahorse", centerX: -1.1306329, centerY: 0.5938388, zoom: 0.82, maxIter: 760, note: "high-detail Riddle seahorse region" },
  { id: "deep-seahorse", name: "Deep Seahorse", centerX: -0.743643887037151, centerY: 0.13182590420533, zoom: 1.28, maxIter: 900, note: "deeper filaments" },
  { id: "period2-neck", name: "Period-2 Neck", centerX: -0.75, centerY: 0, zoom: 0.72, maxIter: 680, note: "main cardioid / period-2 bulb junction" },
  { id: "period3-san-marco", name: "Period-3 / Rabbit", centerX: -0.123, centerY: 0.745, zoom: 0.7, maxIter: 680, note: "period-3 bulb region related to Douady Rabbit Julia sets" },
  { id: "elephant", name: "Elephant Valley", centerX: 0.285, centerY: 0.01, zoom: 0.56, maxIter: 520, note: "right-side bulb valley" },
  { id: "left-elephant", name: "Left Elephant", centerX: -1.78, centerY: 0, zoom: 0.6, maxIter: 620, note: "negative real-axis elephant/tentacle region" },
  { id: "feigenbaum", name: "Feigenbaum", centerX: -1.401155, centerY: 0, zoom: 0.9, maxIter: 900, note: "period-doubling accumulation point on the real axis" },
  { id: "triple", name: "Triple Spiral", centerX: -0.088, centerY: 0.654, zoom: 0.68, maxIter: 680, note: "branching spiral hub" },
  { id: "mini", name: "Mini Mandelbrot", centerX: -1.25066, centerY: 0.02012, zoom: 0.98, maxIter: 820, note: "small embedded copy" },
  { id: "antenna", name: "Antenna Needle", centerX: -1.25066, centerY: 0, zoom: 0.72, maxIter: 620, note: "thin real-axis detail" },
  { id: "dendrite", name: "Dendrite Needle", centerX: -0.1011, centerY: 0.9563, zoom: 0.82, maxIter: 720, note: "tree-like upper branch" },
  { id: "spiral-arms", name: "Spiral Arms", centerX: -0.761574, centerY: -0.0847596, zoom: 0.86, maxIter: 720, note: "dense lower spiral" },
  { id: "filament", name: "Valley Filaments", centerX: -0.7453, centerY: 0.1127, zoom: 1.1, maxIter: 880, note: "thin boundary strands" },
  { id: "needle-nest", name: "Needle Nest", centerX: -1.476, centerY: 0, zoom: 0.9, maxIter: 760, note: "left antenna substructure" },
  { id: "julia-lightning", name: "Julia Lightning", centerX: 0, centerY: 0, zoom: 0.36, maxIter: 560, fractalType: "julia", juliaCx: -0.8, juliaCy: 0.156, note: "Julia connected filaments" },
  { id: "julia-dragon", name: "Julia Dragon", centerX: 0, centerY: 0, zoom: 0.24, maxIter: 620, fractalType: "julia", juliaCx: -0.70176, juliaCy: -0.3842, note: "dragon-like Julia set" },
  { id: "julia-dendrite", name: "Julia Dendrite", centerX: 0, centerY: 0, zoom: 0.16, maxIter: 760, fractalType: "julia", juliaCx: 0, juliaCy: 1, note: "dendrite Julia parameter" },
  { id: "julia-rabbit", name: "Julia Douady Rabbit", centerX: 0, centerY: 0, zoom: 0.22, maxIter: 760, fractalType: "julia", juliaCx: -0.123, juliaCy: 0.745, note: "Douady Rabbit / period-3 Julia parameter" },
  { id: "julia-dragon-boundary", name: "Julia Dragon Boundary", centerX: 0, centerY: 0, zoom: 0.18, maxIter: 760, fractalType: "julia", juliaCx: -1, juliaCy: 0, note: "dragon-like Julia boundary parameter" },
  { id: "julia-san-marco", name: "Julia San Marco", centerX: 0, centerY: 0, zoom: 0.24, maxIter: 760, fractalType: "julia", juliaCx: -0.75, juliaCy: 0.1, note: "Fatou/Julia San Marco-style parameter" },
  { id: "julia-cantor-dust", name: "Julia Cantor Dust", centerX: 0, centerY: 0, zoom: 0.18, maxIter: 520, fractalType: "julia", juliaCx: 0.5, juliaCy: 0.5, note: "disconnected Cantor-dust-like Julia parameter" },
  { id: "sekino-dancing-seahorses", name: "Sekino Dancing Seahorses", centerX: 0, centerY: 0, zoom: 0.08, maxIter: 1400, fractalType: "julia", juliaCx: -0.77146, juliaCy: -0.10119, convPeriod: 2, convEpsilon: 0.000001, note: "Julia parameter from Sekino's Dancing Seahorses discussion" },
];


interface NumberBoxProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  info?: string;
  onChange: (v: number) => void;
}

function InfoIcon({ text }: { text: string }) {
  return (
    <span
      className="info-icon"
      data-tooltip={text}
      aria-label={text}
      tabIndex={0}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 15,
        height: 15,
        borderRadius: "50%",
        border: "1px solid #4a5870",
        color: "#90caf9",
        fontSize: "0.62rem",
        fontWeight: 700,
        lineHeight: 1,
        cursor: "help",
        textTransform: "none",
        letterSpacing: 0,
        position: "relative",
      }}
    >
      i
    </span>
  );
}

function ControlLabel({ label, info }: { label: string; info?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
      <span>{label}</span>
      {info && <InfoIcon text={info} />}
    </span>
  );
}

function formatDraftNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}

function NumberBox({ label, value, min, max, step, info, onChange }: NumberBoxProps) {
  const [draft, setDraft] = useState(formatDraftNumber(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatDraftNumber(value));
  }, [focused, value]);

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
      setDraft(formatDraftNumber(value));
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(formatDraftNumber(value));
      return;
    }

    const stepped = step >= 1 ? Math.round(parsed / step) * step : parsed;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
    setDraft(formatDraftNumber(clamped));
  };

  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "0.5rem",
        alignItems: "center",
        fontSize: "0.76rem",
        color: "#bfc9d9",
      }}
    >
      <ControlLabel label={label} info={info} />
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(formatDraftNumber(value));
            e.currentTarget.blur();
          }
        }}
        style={{
          width: "100%",
          background: "#101319",
          border: "1px solid #2c3240",
          color: "#e7edf8",
          borderRadius: 4,
          padding: "0.35rem 0.45rem",
        }}
      />
    </label>
  );
}

const SHADER = `
struct Params {
  a: vec4<f32>,
  b: vec4<f32>,
  c: vec4<f32>,
  d: vec4<f32>,
  e: vec4<f32>,
  f: vec4<f32>,
  g: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Params;

struct VSOut {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vid: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: VSOut;
  out.position = vec4<f32>(p[vid], 0.0, 1.0);
  return out;
}

fn clamp01(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}

fn cardioid(t: f32) -> vec4<f32> {
  let bx = 0.5 * cos(t) - 0.25 * cos(2.0 * t);
  let by = 0.5 * sin(t) - 0.25 * sin(2.0 * t);
  let tx = -0.5 * sin(t) + 0.5 * sin(2.0 * t);
  let ty = 0.5 * cos(t) - 0.5 * cos(2.0 * t);
  let nLen = max(1e-6, length(vec2<f32>(ty, -tx)));
  var nx = ty / nLen;
  var ny = -tx / nLen;
  let outward = nx * (bx - 0.25) + ny * by;
  if (outward < 0.0) {
    nx = -nx;
    ny = -ny;
  }
  return vec4<f32>(bx, by, nx, ny);
}

fn scaledDistance(v: f32, span: f32, curve: f32) -> f32 {
  if (abs(curve) < 1e-4) {
    return span * v;
  }
  if (curve > 0.0) {
    let e = exp(curve);
    return span * ((exp(curve * v) - 1.0) / (e - 1.0));
  }
  let a = exp(-curve);
  return span * (1.0 - (exp(-curve * (1.0 - v)) - 1.0) / (a - 1.0));
}

fn mapPoint(uv: vec2<f32>, viewMode: f32) -> vec2<f32> {
  let center = vec2<f32>(u.a.z, u.a.w);
  let zoomScale = pow(0.94, u.b.x * 120.0);
  let radius = 2.4 * zoomScale;
  var sampleUv = uv;
  var sourceMode = viewMode;

  if (viewMode > 3.5) {
    sourceMode = 1.0;
    if (viewMode < 4.5) {
      // Double unfurl: look at the first unfurled square through a log-polar lens.
      let theta = 6.28318530718 * uv.x;
      let r = exp(mix(log(0.018), log(0.72), uv.y));
      sampleUv = clamp(vec2<f32>(0.5 + r * cos(theta), 0.5 + r * sin(theta)), vec2<f32>(0.0), vec2<f32>(1.0));
    } else if (viewMode < 5.5) {
      // Phase unwrap: shear/repeat angular phase so diagonal phase relationships become rows.
      sampleUv = vec2<f32>(fract(uv.x * max(1.0, u.c.x) + uv.y * 0.5), uv.y);
    } else if (viewMode < 6.5) {
      // Contour unwrap: stack repeated radial/equipotential-ish bands from the first unfurl.
      let band = fract(pow(uv.y, 1.35) * max(2.0, u.f.w * 0.16) + 0.08 * sin(6.28318530718 * uv.x * max(1.0, u.c.x)));
      sampleUv = vec2<f32>(uv.x, band);
    } else {
      // Tile/period unwrap: split angular repetitions into horizontal strips.
      let tiles = 4.0;
      let tile = floor(uv.y * tiles);
      sampleUv = vec2<f32>(fract((uv.x + tile) / tiles), fract(uv.y * tiles));
    }
  }

  // sourceMode: 0 = Mandelbrot, 1 = Mandelbrot unfurled, 2 = Julia, 3 = Julia unfurled.
  if (sourceMode < 0.5) {
    let cx = center.x + mix(-radius, radius, sampleUv.x);
    let cy = center.y + mix(-radius, radius, sampleUv.y);
    return vec2<f32>(cx, cy);
  }
  if (sourceMode > 1.5 && sourceMode < 2.5) {
    let juliaRadius = 1.8;
    return vec2<f32>(mix(-juliaRadius, juliaRadius, sampleUv.x), mix(-juliaRadius, juliaRadius, sampleUv.y));
  }

  let isJuliaSpace = sourceMode > 2.5;
  var baseCenter = center;
  var baseScale = zoomScale;
  if (isJuliaSpace) {
    baseCenter = vec2<f32>(0.0, 0.0);
    baseScale = 0.72;
  }

  let turns = u.c.x;
  let angleOffset = u.c.y;
  let theta = angleOffset * 6.28318530718 + turns * 6.28318530718 * sampleUv.x;
  let uncurlMode = u.c.z;

  if (uncurlMode < 0.5) {
    let rInner = min(u.c.w, u.d.x);
    let rOuter = max(u.c.w, u.d.x);
    let radialCurve = max(0.05, u.d.y);
    let radius = mix(rInner, rOuter, pow(sampleUv.y, radialCurve));
    let ux = u.d.z + radius * cos(theta);
    let uy = u.d.w + radius * sin(theta);
    return baseCenter + vec2<f32>(ux, uy) * baseScale;
  }

  let card = cardioid(theta);
  let outward = scaledDistance(sampleUv.y, max(0.001, u.e.x), u.e.z);
  let inward = u.e.y * (1.0 - sampleUv.y);
  let signedDist = outward - inward;
  let ux = card.x + card.z * signedDist;
  let uy = card.y + card.w * signedDist;
  return baseCenter + vec2<f32>(ux, uy) * baseScale;
}

fn fractalMetrics(c: vec2<f32>, isJulia: bool) -> vec4<f32> {
  let maxIter = u32(u.b.y);

  var zx = select(0.0, c.x, isJulia);
  var zy = select(0.0, c.y, isJulia);
  let cx = select(c.x, u.f.x, isJulia);
  let cy = select(c.y, u.f.y, isJulia);

  var dzx = select(0.0, 1.0, isJulia);
  var dzy = 0.0;
  var trap = 1e9;
  var escaped = false;
  var iter: u32 = 0u;

  for (var i: u32 = 0u; i < 2048u; i = i + 1u) {
    if (i >= maxIter) {
      break;
    }
    let zx2 = zx * zx;
    let zy2 = zy * zy;
    let zxy = zx * zy;

    let ndzx = 2.0 * (zx * dzx - zy * dzy) + select(1.0, 0.0, isJulia);
    let ndzy = 2.0 * (zx * dzy + zy * dzx);
    dzx = ndzx;
    dzy = ndzy;

    zx = zx2 - zy2 + cx;
    zy = 2.0 * zxy + cy;

    let radius = length(vec2<f32>(zx, zy));
    trap = min(trap, min(abs(radius - 0.5), abs(zy)));

    if (zx * zx + zy * zy > 16.0) {
      escaped = true;
      iter = i;
      break;
    }
    iter = i;
  }

  if (!escaped) {
    return vec4<f32>(1.0, 0.0, clamp01(1.0 - trap), 1.0);
  }

  let mag = length(vec2<f32>(zx, zy));
  let smoothRaw = f32(iter) + 1.0 - log2(log2(max(2.0, mag)));
  let smoothNorm = clamp01(smoothRaw / max(1.0, f32(maxIter)));
  let stripe = 0.5 + 0.5 * sin(5.0 * atan2(zy, zx) + smoothRaw * 0.2);
  let iterNorm = clamp01(f32(iter) / max(1.0, f32(maxIter)));
  return vec4<f32>(smoothNorm, stripe, clamp01(1.0 - trap), iterNorm);
}

fn convergenceNorm(c: vec2<f32>, isJulia: bool) -> f32 {
  let maxIter = u32(u.b.y);
  let period = clamp(i32(u.g.y + 0.5), 1, 8);
  let eps = max(1e-9, u.g.z);
  let eps2 = eps * eps;

  var z = vec2<f32>(select(0.0, c.x, isJulia), select(0.0, c.y, isJulia));
  let k = vec2<f32>(select(c.x, u.f.x, isJulia), select(c.y, u.f.y, isJulia));
  var h1 = vec2<f32>(1e20);
  var h2 = vec2<f32>(1e20);
  var h3 = vec2<f32>(1e20);
  var h4 = vec2<f32>(1e20);
  var h5 = vec2<f32>(1e20);
  var h6 = vec2<f32>(1e20);
  var h7 = vec2<f32>(1e20);
  var h8 = vec2<f32>(1e20);

  for (var i: u32 = 0u; i < 2048u; i = i + 1u) {
    if (i >= maxIter) {
      break;
    }

    let next = vec2<f32>(z.x * z.x - z.y * z.y + k.x, 2.0 * z.x * z.y + k.y);
    if (dot(next, next) > 16.0) {
      return 1.0;
    }

    var periodRef = h1;
    if (period == 2) { periodRef = h2; }
    if (period == 3) { periodRef = h3; }
    if (period == 4) { periodRef = h4; }
    if (period == 5) { periodRef = h5; }
    if (period == 6) { periodRef = h6; }
    if (period == 7) { periodRef = h7; }
    if (period == 8) { periodRef = h8; }

    if (i >= u32(period) && dot(next - periodRef, next - periodRef) < eps2) {
      return clamp01(f32(i) / max(1.0, f32(maxIter)));
    }

    h8 = h7;
    h7 = h6;
    h6 = h5;
    h5 = h4;
    h4 = h3;
    h3 = h2;
    h2 = h1;
    h1 = next;
    z = next;
  }

  return 1.0;
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let p = abs(fract(c.xxx + vec3<f32>(0.0, 0.6666667, 0.3333333)) * 6.0 - vec3<f32>(3.0));
  return c.z * mix(vec3<f32>(1.0), clamp(p - vec3<f32>(1.0), vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

fn gradient5(tIn: f32, c0: vec3<f32>, c1: vec3<f32>, c2: vec3<f32>, c3: vec3<f32>, c4: vec3<f32>) -> vec3<f32> {
  let t = clamp01(tIn);
  if (t < 0.25) { return mix(c0, c1, t / 0.25); }
  if (t < 0.5) { return mix(c1, c2, (t - 0.25) / 0.25); }
  if (t < 0.75) { return mix(c2, c3, (t - 0.5) / 0.25); }
  return mix(c3, c4, (t - 0.75) / 0.25);
}

fn sinebow(t: f32) -> vec3<f32> {
  let x = fract(t);
  return vec3<f32>(
    0.5 + 0.5 * sin(6.28318530718 * (x + 0.00)),
    0.5 + 0.5 * sin(6.28318530718 * (x + 0.33)),
    0.5 + 0.5 * sin(6.28318530718 * (x + 0.67))
  );
}

fn viridis(t: f32) -> vec3<f32> {
  return gradient5(t, vec3<f32>(0.267, 0.005, 0.329), vec3<f32>(0.230, 0.322, 0.545), vec3<f32>(0.128, 0.567, 0.551), vec3<f32>(0.369, 0.789, 0.383), vec3<f32>(0.993, 0.906, 0.144));
}

fn magma(t: f32) -> vec3<f32> {
  return gradient5(t, vec3<f32>(0.001, 0.000, 0.014), vec3<f32>(0.251, 0.037, 0.414), vec3<f32>(0.620, 0.162, 0.388), vec3<f32>(0.902, 0.364, 0.184), vec3<f32>(0.987, 0.991, 0.749));
}

fn plasma(t: f32) -> vec3<f32> {
  return gradient5(t, vec3<f32>(0.050, 0.030, 0.528), vec3<f32>(0.494, 0.012, 0.658), vec3<f32>(0.798, 0.280, 0.470), vec3<f32>(0.973, 0.586, 0.252), vec3<f32>(0.940, 0.975, 0.131));
}

fn turbo(t: f32) -> vec3<f32> {
  return gradient5(t, vec3<f32>(0.190, 0.072, 0.232), vec3<f32>(0.152, 0.586, 0.953), vec3<f32>(0.421, 0.996, 0.459), vec3<f32>(0.984, 0.735, 0.166), vec3<f32>(0.480, 0.016, 0.011));
}

fn colorUp(tIn: f32, power: f32, c1: vec3<f32>, c2: vec3<f32>) -> vec3<f32> {
  let t = pow(clamp01(tIn), max(0.001, power));
  return mix(c1, c2, t);
}

fn colorDn(tIn: f32, power: f32, c1: vec3<f32>, c2: vec3<f32>) -> vec3<f32> {
  let t = pow(1.0 - clamp01(tIn), max(0.001, power));
  return mix(c1, c2, t);
}

fn colorWave(tIn: f32, freq: f32, power: f32, c1: vec3<f32>, c2: vec3<f32>) -> vec3<f32> {
  let phase = clamp01(fract(tIn * max(1.0, freq)));
  let tri = 1.0 - abs(phase * 2.0 - 1.0);
  return mix(c1, c2, pow(tri, max(0.001, power)));
}

fn colorWave6(tIn: f32, freq: f32, power: f32) -> vec3<f32> {
  let darkRed = vec3<f32>(0.35, 0.00, 0.00);
  let altRed = vec3<f32>(1.00, 0.20, 0.20);
  let altPurple = vec3<f32>(0.78, 0.00, 0.86);
  let sky = vec3<f32>(0.35, 0.78, 1.00);
  let tea = vec3<f32>(0.45, 0.68, 0.42);
  let amber = vec3<f32>(1.00, 0.88, 0.55);
  let x = fract(tIn * max(1.0, freq)) * 6.0;
  let seg = floor(x);
  let local = fract(x);
  let t = pow(local, max(0.001, power));
  if (seg < 1.0) { return mix(darkRed, altRed, t); }
  if (seg < 2.0) { return mix(altPurple, altRed, 1.0 - t); }
  if (seg < 3.0) { return mix(altPurple, sky, t); }
  if (seg < 4.0) { return mix(tea, sky, 1.0 - t); }
  if (seg < 5.0) { return mix(tea, amber, t); }
  return mix(darkRed, amber, 1.0 - t);
}

fn colorize(metrics: vec4<f32>, edge: f32, uv: vec2<f32>, modeVal: f32, c: vec2<f32>, isJulia: bool) -> vec3<f32> {
  let smoothVal = metrics.x;
  let stripeVal = metrics.y;
  let trapVal = metrics.z;
  let iterNorm = metrics.w;
  let cycle = max(1.0, u.f.w);
  let bands = 0.5 + 0.5 * sin(6.28318530718 * (cycle * uv.x + 0.65 * iterNorm + 0.25 * stripeVal));
  let mode = i32(modeVal + 0.5);

  if (iterNorm > 0.999 && mode != 11 && mode != 12 && mode != 24 && mode != 32 && mode != 33) {
    return vec3<f32>(0.005, 0.008, 0.014);
  }
  if (mode == 0) { // classic
    let t = clamp01(smoothVal);
    let edgeBoost = 0.65 + 0.35 * edge;
    return vec3<f32>(
      (0.5 + 0.5 * cos(6.28318530718 * (t + 0.00))) * edgeBoost,
      (0.5 + 0.5 * cos(6.28318530718 * (t + 0.33))) * edgeBoost,
      (0.5 + 0.5 * cos(6.28318530718 * (t + 0.67))) * edgeBoost
    );
  }
  if (mode == 1) { // smooth
    return gradient5(smoothVal, vec3<f32>(0.02, 0.04, 0.10), vec3<f32>(0.05, 0.22, 0.55), vec3<f32>(0.10, 0.62, 0.70), vec3<f32>(0.95, 0.72, 0.22), vec3<f32>(1.0, 0.96, 0.82));
  }
  if (mode == 2) { return sinebow(floor(smoothVal * cycle * 6.0) / max(1.0, cycle * 6.0)); }
  if (mode == 3) { return viridis(pow(iterNorm, 0.42)); }
  if (mode == 4) { let m = clamp01(0.75 * smoothVal + 0.25 * edge); return vec3<f32>(m); }
  if (mode == 5) { let bw = select(0.0, 1.0, stripeVal > 0.5); return vec3<f32>(bw); }
  if (mode == 6) { let line = smoothstep(0.42, 0.50, abs(fract(smoothVal * cycle * 2.0) - 0.5)); return vec3<f32>(1.0 - line); }
  if (mode == 7) { let d = smoothstep(0.08, 0.92, trapVal); return vec3<f32>(d); }
  if (mode == 8) { return vec3<f32>(0.08 + 0.92 * edge, 0.08 + 0.4 * edge, 0.18 + 0.82 * (1.0 - edge)); }
  if (mode == 9) { let light = clamp01(0.22 + 0.78 * (1.0 - edge) + 0.2 * trapVal); return vec3<f32>(0.36, 0.48, 0.68) * light + vec3<f32>(0.04, 0.02, 0.01); }
  if (mode == 10) { return hsv2rgb(vec3<f32>(stripeVal, 0.86, 0.18 + 0.82 * smoothVal)); }
  if (mode == 11) { return magma(pow(trapVal, 0.55)); }
  if (mode == 12) { return gradient5(pow(trapVal, 0.6), vec3<f32>(0.0, 0.0, 0.02), vec3<f32>(0.0, 0.12, 0.45), vec3<f32>(0.0, 0.75, 1.0), vec3<f32>(0.78, 0.95, 1.0), vec3<f32>(1.0)); }
  if (mode == 13) { return hsv2rgb(vec3<f32>(fract(atan2(uv.y - 0.5, uv.x - 0.5) / 6.28318530718 + 0.5), 0.95, 0.20 + 0.80 * smoothVal)); }
  if (mode == 14) { return hsv2rgb(vec3<f32>(fract(uv.x + 0.28 * smoothVal), 0.82, 0.20 + 0.80 * (1.0 - iterNorm))); }
  if (mode == 15) { return sinebow(smoothVal); }
  if (mode == 16) { return turbo(smoothVal); }
  if (mode == 17) { return viridis(smoothVal); }
  if (mode == 18) { return magma(smoothVal); }
  if (mode == 19) { return plasma(smoothVal); }
  if (mode == 20) { return gradient5(smoothVal, vec3<f32>(0.0), vec3<f32>(0.35, 0.02, 0.0), vec3<f32>(0.85, 0.10, 0.0), vec3<f32>(1.0, 0.65, 0.05), vec3<f32>(1.0, 0.98, 0.70)); }
  if (mode == 21) { return gradient5(smoothVal, vec3<f32>(0.0, 0.02, 0.10), vec3<f32>(0.0, 0.20, 0.45), vec3<f32>(0.0, 0.65, 0.95), vec3<f32>(0.62, 0.90, 1.0), vec3<f32>(1.0)); }
  if (mode == 22) { return gradient5(fract(smoothVal * 1.7 + stripeVal * 0.25), vec3<f32>(0.0, 0.0, 0.03), vec3<f32>(0.16, 0.0, 0.55), vec3<f32>(0.0, 0.90, 1.0), vec3<f32>(0.72, 1.0, 0.20), vec3<f32>(1.0)); }
  if (mode == 23) { return vec3<f32>(0.08, 0.02, 0.12) + edge * vec3<f32>(0.1, 0.95, 1.0) + stripeVal * vec3<f32>(0.8, 0.0, 0.9); }
  if (mode == 24) { return vec3<f32>(0.1 + 0.9 * trapVal, 0.1 + 0.7 * (1.0 - trapVal), 0.2 + 0.8 * (0.25 + 0.75 * trapVal)); }
  if (mode == 25) {
    return vec3<f32>(
      clamp01(0.55 * bands + 0.35 * edge + 0.1 * trapVal),
      clamp01(0.6 * (1.0 - bands) + 0.22 * smoothVal + 0.18 * stripeVal),
      clamp01(0.52 * smoothVal + 0.28 * bands + 0.2 * (1.0 - edge))
    );
  }
  if (mode == 27) { // Sekino ColorUp: dark red to amber over escape iterations.
    return colorUp(smoothVal, 1.0, vec3<f32>(0.67, 0.00, 0.00), vec3<f32>(1.00, 0.88, 0.55));
  }
  if (mode == 28) { // Sekino ColorDn: amber to dark red.
    return colorDn(smoothVal, 1.0, vec3<f32>(0.67, 0.00, 0.00), vec3<f32>(1.00, 0.88, 0.55));
  }
  if (mode == 29) { // Sekino ColorWave: alternating up/down power ramps.
    return colorWave(smoothVal, max(1.0, cycle * 0.45), 1.8, vec3<f32>(0.02, 0.00, 0.00), vec3<f32>(1.00, 0.20, 0.20));
  }
  if (mode == 30) { // Sekino ColorWave6: six-color triangular wave.
    return colorWave6(smoothVal + 0.12 * stripeVal, max(1.0, cycle * 0.25), 1.0);
  }
  if (mode == 31) { // Discontinuous block-wave variant.
    let stepVal = floor(fract(smoothVal * max(1.0, cycle)) * 6.0);
    if (stepVal < 1.0) { return vec3<f32>(0.08, 0.00, 0.00); }
    if (stepVal < 2.0) { return vec3<f32>(1.00, 0.22, 0.12); }
    if (stepVal < 3.0) { return vec3<f32>(1.00, 0.88, 0.55); }
    if (stepVal < 4.0) { return vec3<f32>(0.20, 0.95, 0.43); }
    if (stepVal < 5.0) { return vec3<f32>(0.78, 0.00, 0.86); }
    return vec3<f32>(0.35, 0.78, 1.00);
  }
  if (mode == 32) { // Sekino block-wave variant with strict black/white stepped bands.
    let stepVal = floor(fract(smoothVal * max(1.0, cycle)) * 2.0);
    let bw = select(0.0, 1.0, stepVal >= 1.0);
    return vec3<f32>(bw);
  }
  if (mode == 33) { // Filled-Julia inspired: green eyes plus red/purple slow-convergence waves.
    let conv = convergenceNorm(c, isJulia);
    let filledMask = smoothstep(0.995, 1.0, iterNorm);
    let greenEye = colorUp(1.0 - conv, 4.0, vec3<f32>(0.20, 0.94, 0.43), vec3<f32>(0.00));
    let redWave = colorWave(conv, max(4.0, cycle * 0.55), 1.8, vec3<f32>(0.00), vec3<f32>(1.00, 0.20, 0.20));
    let purpleWave = colorWave(conv + 0.35, max(3.0, cycle * 0.32), 0.7, vec3<f32>(0.78, 0.00, 0.86), vec3<f32>(0.00));
    let filled = mix(mix(redWave, purpleWave, smoothstep(0.64, 0.86, conv)), greenEye, smoothstep(0.0, 0.35, conv));
    let complement = colorUp(smoothVal, 1.0, vec3<f32>(0.67, 0.00, 0.00), vec3<f32>(1.00, 0.88, 0.55));
    return mix(complement, filled, filledMask);
  }
  if (mode == 34) { // Dancing Seahorses palette: Sekino-inspired complement + filled-set treatment.
    let conv = convergenceNorm(c, isJulia);
    let filledMask = smoothstep(0.995, 1.0, iterNorm);
    let complement = colorUp(smoothVal, 1.0, vec3<f32>(0.67, 0.00, 0.00), vec3<f32>(1.00, 0.88, 0.55));
    let filled = mix(
      colorUp(1.0 - conv, 4.0, vec3<f32>(0.20, 0.94, 0.43), vec3<f32>(0.00)),
      colorWave6(conv + stripeVal * 0.18, max(6.0, cycle * 0.35), 1.15),
      smoothstep(0.2, 0.92, conv)
    );
    return mix(complement, filled, filledMask);
  }
  if (mode == 35) { // Inspect the separate period-k convergence field directly.
    let conv = convergenceNorm(c, isJulia);
    if (conv >= 0.999) {
      return vec3<f32>(0.01, 0.01, 0.015);
    }
    return gradient5(1.0 - conv, vec3<f32>(0.0, 0.0, 0.02), vec3<f32>(0.0, 0.18, 0.36), vec3<f32>(0.20, 0.94, 0.43), vec3<f32>(1.0, 0.20, 0.20), vec3<f32>(1.0, 0.88, 0.55));
  }
  return vec3<f32>(
    clamp01(0.44 * smoothVal + 0.28 * edge + 0.18 * trapVal + 0.1 * bands),
    clamp01(0.35 * stripeVal + 0.25 * smoothVal + 0.2 * bands + 0.2 * (1.0 - edge)),
    clamp01(0.4 * (1.0 - smoothVal) + 0.3 * (1.0 - edge) + 0.3 * bands)
  );
}

fn viewAtPanel(panelIndex: i32, mask: i32) -> f32 {
  var seen: i32 = -1;
  if ((mask & 1) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 0.0; }
  }
  if ((mask & 2) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 1.0; }
  }
  if ((mask & 4) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 2.0; }
  }
  if ((mask & 8) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 3.0; }
  }
  if ((mask & 16) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 4.0; }
  }
  if ((mask & 32) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 5.0; }
  }
  if ((mask & 64) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 6.0; }
  }
  if ((mask & 128) != 0) {
    seen = seen + 1;
    if (seen == panelIndex) { return 7.0; }
  }
  return 0.0;
}

@fragment
fn fsMain(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<f32>(max(1.0, u.a.x), max(1.0, u.a.y));
  let uv = fragCoord.xy / size;
  let panelCount = max(1.0, u.e.w);
  var cols = 1.0;
  if (panelCount > 1.5 && panelCount < 4.5) {
    cols = 2.0;
  } else if (panelCount >= 4.5) {
    cols = 3.0;
  }
  let rows = ceil(panelCount / cols);
  let panelCol = min(i32(cols) - 1, max(0, i32(floor(uv.x * cols))));
  let panelRow = min(i32(rows) - 1, max(0, i32(floor(uv.y * rows))));
  let panelIndex = panelRow * i32(cols) + panelCol;
  var localUv = vec2<f32>(fract(uv.x * cols), fract(uv.y * rows));
  if (panelIndex >= i32(panelCount)) {
    return vec4<f32>(0.02, 0.024, 0.032, 1.0);
  }
  let viewMode = viewAtPanel(panelIndex, i32(u.g.w + 0.5));
  let colorMode = u.b.w;
  if ((viewMode > 0.5 && viewMode < 1.5) || viewMode > 2.5) {
    let rot = clamp(i32(u.b.z + 0.5), 0, 3);
    let uv0 = localUv;
    if (rot == 1) {
      localUv = vec2<f32>(uv0.y, 1.0 - uv0.x);
    } else if (rot == 2) {
      localUv = vec2<f32>(1.0 - uv0.x, 1.0 - uv0.y);
    } else if (rot == 3) {
      localUv = vec2<f32>(1.0 - uv0.y, uv0.x);
    }
  }

  let c = mapPoint(localUv, viewMode);
  let isJuliaView = viewMode > 1.5 && viewMode < 3.5;
  let m = fractalMetrics(c, isJuliaView);

  // Two-axis edge estimate in panel-local space so Edge Gain remains visible per square viewport.
  let panelPx = max(1.0, min(size.x / cols, size.y / rows));
  let eps = 1.0 / panelPx;
  let cRight = mapPoint(vec2<f32>(clamp01(localUv.x + eps), localUv.y), viewMode);
  let cDown = mapPoint(vec2<f32>(localUv.x, clamp01(localUv.y + eps)), viewMode);
  let mRight = fractalMetrics(cRight, isJuliaView);
  let mDown = fractalMetrics(cDown, isJuliaView);
  let edgeRaw = length(vec2<f32>(mRight.x - m.x, mDown.x - m.x));
  let edge = clamp01(edgeRaw * u.f.z * 18.0);

  if ((panelCol > 0 && localUv.x < 0.006) || (panelRow > 0 && localUv.y < 0.006)) {
    return vec4<f32>(0.9, 0.9, 0.95, 1.0);
  }

  let baseRgb = colorize(m, edge, localUv, colorMode, c, isJuliaView);
  let edgeInk = smoothstep(0.08, 0.9, edge);
  let rgb = mix(baseRgb, vec3<f32>(1.0), edgeInk * 0.28);
  return vec4<f32>(rgb, 1.0);
}
`;

export default function FractalExplorerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<{
    device: any;
    format: string;
    pipeline: any;
    uniformBuffer: any;
    bindGroup: any;
  } | null>(null);
  const contextConfiguredRef = useRef(false);
  const panDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startCenterX: number;
    startCenterY: number;
    radiusX: number;
    radiusY: number;
    panelWidth: number;
    panelHeight: number;
  } | null>(null);

  const [status, setStatus] = useState("initializing");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [gpuReadyTick, setGpuReadyTick] = useState(0);

  const [visibleViews, setVisibleViews] = useState<Record<ViewId, boolean>>({
    mandelbrot: true,
    "mandelbrot-unfurled": true,
    julia: true,
    "julia-unfurled": true,
    "double-log-polar": false,
    "phase-unwrap": false,
    "contour-unwrap": false,
    "tile-period-unwrap": false,
  });
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("pan");
  const [colorMode, setColorMode] = useState<ColorMode>("classic");
  const [locationPresetId, setLocationPresetId] = useState("seahorse");
  const [juliaPresetId, setJuliaPresetId] = useState("julia-lightning");
  const [uncurlMode, setUncurlMode] = useState<UncurlMode>("cardioid-perimeter");
  const [resolution, setResolution] = useState(512);
  const [maxIter, setMaxIter] = useState(420);
  const [zoom, setZoom] = useState(0.72);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [turns, setTurns] = useState(1);
  const [angleOffset, setAngleOffset] = useState(0);
  const [unfurlRotationDeg, setUnfurlRotationDeg] = useState(0);
  const [rInner, setRInner] = useState(0);
  const [rOuter, setROuter] = useState(2.4);
  const [radialCurve, setRadialCurve] = useState(1.5);
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);
  const [normalOut, setNormalOut] = useState(1.35);
  const [normalIn, setNormalIn] = useState(0.08);
  const [normalCurve, setNormalCurve] = useState(2.8);
  const [edgeGain, setEdgeGain] = useState(3.2);
  const [bandFreq, setBandFreq] = useState(14);
  const [convPeriod, setConvPeriod] = useState(2);
  const [convEpsilon, setConvEpsilon] = useState(0.000001);

  const mandelbrotPresets = useMemo(
    () => PRESETS.filter((preset) => preset.fractalType !== "julia"),
    []
  );
  const juliaPresets = useMemo(
    () => PRESETS.filter((preset) => preset.fractalType === "julia" && preset.juliaCx !== undefined && preset.juliaCy !== undefined),
    []
  );
  const visibleViewList = VIEW_ORDER.filter((view) => visibleViews[view.id]);
  const visibleViewCount = Math.max(1, visibleViewList.length);
  const viewGridCols = visibleViewCount <= 1 ? 1 : visibleViewCount <= 4 ? 2 : 3;
  const viewGridRows = Math.ceil(visibleViewCount / viewGridCols);
  const viewMask = visibleViewList.reduce((mask, view) => mask + view.mask, 0);
  const surfaceSize = useMemo(() => {
    const panelRaw = Math.max(128, Math.min(MAX_RESOLUTION, Math.round(resolution)));
    const wRaw = panelRaw * viewGridCols;
    const hRaw = panelRaw * viewGridRows;
    return {
      w: Math.min(SAFE_GPU_SURFACE_WIDTH, wRaw),
      h: Math.min(SAFE_GPU_SURFACE_HEIGHT, hRaw),
      panelRaw,
      wRaw,
      hRaw,
    };
  }, [resolution, viewGridCols, viewGridRows]);
  const selectedLocationPreset = mandelbrotPresets.find((preset) => preset.id === locationPresetId);
  const selectedJuliaPreset = juliaPresets.find((preset) => preset.id === juliaPresetId);
  const colorModeToIndex = (mode: ColorMode) => COLOR_MODES.findIndex((entry) => entry.id === mode);
  const angleOffsetDeg = angleOffset * 360;
  const setAngleOffsetDeg = (deg: number) => {
    const wrapped = ((deg % 360) + 360) % 360;
    setAngleOffset(wrapped / 360);
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      if (!nav?.gpu) {
        setSupported(false);
        setStatus("WebGPU not supported in this browser");
        return;
      }
      try {
        const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) throw new Error("No WebGPU adapter found");
        const device = await adapter.requestDevice();
        const adapterInfo = adapter.info;
        const format = nav.gpu.getPreferredCanvasFormat();
        const shader = device.createShaderModule({ code: SHADER });
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: shader, entryPoint: "vsMain" },
          fragment: {
            module: shader,
            entryPoint: "fsMain",
            targets: [{ format }],
          },
          primitive: { topology: "triangle-list" },
        });
        const uniformBuffer = device.createBuffer({
          size: 28 * 4,
          usage: (globalThis as any).GPUBufferUsage.UNIFORM | (globalThis as any).GPUBufferUsage.COPY_DST,
        });
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        if (cancelled) return;
        gpuRef.current = { device, format, pipeline, uniformBuffer, bindGroup };
        contextConfiguredRef.current = false;
        setSupported(true);
        setStatus(
          adapterInfo?.device
            ? `ready: ${adapterInfo.vendor ?? "unknown vendor"} ${adapterInfo.device}`
            : "ready: high-performance adapter"
        );
        setGpuReadyTick((v) => v + 1);
      } catch (err: any) {
        setSupported(false);
        setStatus(`WebGPU init failed: ${err?.message ?? "unknown error"}`);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const gpu = gpuRef.current;
    if (!gpu || !canvasRef.current) return;

    const drawToCanvas = (canvas: HTMLCanvasElement, w: number, h: number) => {
      const ctx = canvas.getContext("webgpu") as any;
      if (!ctx) return;
      const dpr = Math.max(
        1,
        Math.min(GPU_DPR_CAP, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)
      );
      const deviceW = Math.min(SAFE_GPU_SURFACE_WIDTH, Math.round(w * dpr));
      const deviceH = Math.min(SAFE_GPU_SURFACE_HEIGHT, Math.round(h * dpr));
      const needsConfigure =
        !contextConfiguredRef.current || canvas.width !== deviceW || canvas.height !== deviceH;
      if (needsConfigure) {
        canvas.width = deviceW;
        canvas.height = deviceH;
        ctx.configure({
          device: gpu.device,
          format: gpu.format,
          alphaMode: "opaque",
        });
        contextConfiguredRef.current = true;
      }

      const u = new Float32Array(28);
      // a
      u[0] = deviceW;
      u[1] = deviceH;
      u[2] = centerX;
      u[3] = centerY;
      // b
      u[4] = zoom;
      u[5] = Math.max(1, Math.min(MAX_ITER, maxIter));
      u[6] = Math.round(unfurlRotationDeg / 90) % 4;
      u[7] = colorModeToIndex(colorMode);
      // c
      u[8] = turns;
      u[9] = angleOffset;
      u[10] = uncurlMode === "cardioid-perimeter" ? 1 : 0;
      u[11] = rInner;
      // d
      u[12] = rOuter;
      u[13] = radialCurve;
      u[14] = originX;
      u[15] = originY;
      // e
      u[16] = normalOut;
      u[17] = normalIn;
      u[18] = normalCurve;
      u[19] = visibleViewCount;
      // f
      u[20] = juliaCx;
      u[21] = juliaCy;
      u[22] = edgeGain;
      u[23] = bandFreq;
      // g
      u[24] = colorModeToIndex(colorMode);
      u[25] = convPeriod;
      u[26] = convEpsilon;
      u[27] = viewMask;

      gpu.device.queue.writeBuffer(gpu.uniformBuffer, 0, u.buffer, u.byteOffset, u.byteLength);

      const encoder = gpu.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0.03, g: 0.03, b: 0.04, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(gpu.pipeline);
      pass.setBindGroup(0, gpu.bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    };

    drawToCanvas(canvasRef.current, surfaceSize.w, surfaceSize.h);
  }, [
    angleOffset,
    bandFreq,
    centerX,
    centerY,
    convEpsilon,
    convPeriod,
    edgeGain,
    juliaCx,
    juliaCy,
    colorMode,
    surfaceSize.h,
    surfaceSize.w,
    maxIter,
    normalCurve,
    normalIn,
    normalOut,
    originX,
    originY,
    rInner,
    rOuter,
    radialCurve,
    turns,
    uncurlMode,
    unfurlRotationDeg,
    viewMask,
    visibleViewCount,
    zoom,
    gpuReadyTick,
  ]);

  const applyPreset = (preset: Preset) => {
    setLocationPresetId(preset.id);
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(Math.min(MAX_ZOOM, preset.zoom));
    setMaxIter(Math.min(MAX_ITER, preset.maxIter));
    if (preset.juliaCx !== undefined) setJuliaCx(preset.juliaCx);
    if (preset.juliaCy !== undefined) setJuliaCy(preset.juliaCy);
    if (preset.convPeriod !== undefined) setConvPeriod(preset.convPeriod);
    if (preset.convEpsilon !== undefined) setConvEpsilon(preset.convEpsilon);
  };

  const handlePresetChange = (id: string) => {
    const preset = mandelbrotPresets.find((entry) => entry.id === id);
    if (preset) applyPreset(preset);
  };

  const applyJuliaPreset = (preset: Preset) => {
    setJuliaPresetId(preset.id);
    if (preset.juliaCx !== undefined) setJuliaCx(preset.juliaCx);
    if (preset.juliaCy !== undefined) setJuliaCy(preset.juliaCy);
    setMaxIter(Math.min(MAX_ITER, preset.maxIter));
    if (preset.convPeriod !== undefined) setConvPeriod(preset.convPeriod);
    if (preset.convEpsilon !== undefined) setConvEpsilon(preset.convEpsilon);
  };

  const handleJuliaPresetChange = (id: string) => {
    const preset = juliaPresets.find((entry) => entry.id === id);
    if (preset) applyJuliaPreset(preset);
  };

  const toggleView = (id: ViewId) => {
    setVisibleViews((current) => {
      const enabledCount = VIEW_ORDER.filter((view) => current[view.id]).length;
      if (current[id] && enabledCount <= 1) return current;
      return { ...current, [id]: !current[id] };
    });
  };

  const cardioidPoint = (theta: number) => {
    const bx = 0.5 * Math.cos(theta) - 0.25 * Math.cos(2 * theta);
    const by = 0.5 * Math.sin(theta) - 0.25 * Math.sin(2 * theta);
    const tx = -0.5 * Math.sin(theta) + 0.5 * Math.sin(2 * theta);
    const ty = 0.5 * Math.cos(theta) - 0.5 * Math.cos(2 * theta);
    const nLen = Math.max(1e-6, Math.hypot(ty, -tx));
    let nx = ty / nLen;
    let ny = -tx / nLen;
    if (nx * (bx - 0.25) + ny * by < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { bx, by, nx, ny };
  };

  const scaledDistance = (v: number, span: number, curve: number) => {
    if (Math.abs(curve) < 1e-4) return span * v;
    if (curve > 0) {
      const e = Math.exp(curve);
      return span * ((Math.exp(curve * v) - 1) / (e - 1));
    }
    const a = Math.exp(-curve);
    return span * (1 - (Math.exp(-curve * (1 - v)) - 1) / (a - 1));
  };

  const rotateUnfurledPoint = (localX: number, localY: number) => {
    const rot = Math.round(unfurlRotationDeg / 90) % 4;
    if (rot === 1) return { x: localY, y: 1 - localX };
    if (rot === 2) return { x: 1 - localX, y: 1 - localY };
    if (rot === 3) return { x: 1 - localY, y: localX };
    return { x: localX, y: localY };
  };

  const mapMandelbrotPanelPoint = (localX: number, localY: number, viewId: ViewId) => {
    const zoomScale = Math.pow(0.94, zoom * 120);
    const radius = 2.4 * zoomScale;

    if (viewId === "mandelbrot") {
      return {
        x: centerX + (-radius + 2 * radius * localX),
        y: centerY + (-radius + 2 * radius * localY),
        radiusX: radius,
        radiusY: radius,
      };
    }

    const rotated = rotateUnfurledPoint(localX, localY);
    const theta = angleOffset * Math.PI * 2 + turns * Math.PI * 2 * rotated.x;
    if (uncurlMode === "origin-polar") {
      const inner = Math.min(rInner, rOuter);
      const outer = Math.max(rInner, rOuter);
      const radius = inner + (outer - inner) * Math.pow(rotated.y, Math.max(0.05, radialCurve));
      return {
        x: centerX + (originX + radius * Math.cos(theta)) * zoomScale,
        y: centerY + (originY + radius * Math.sin(theta)) * zoomScale,
        radiusX: 2.4 * zoomScale,
        radiusY: 2.4 * zoomScale,
      };
    }

    const card = cardioidPoint(theta);
    const outward = scaledDistance(rotated.y, Math.max(0.001, normalOut), normalCurve);
    const inward = normalIn * (1 - rotated.y);
    const signedDist = outward - inward;
    return {
      x: centerX + (card.bx + card.nx * signedDist) * zoomScale,
      y: centerY + (card.by + card.ny * signedDist) * zoomScale,
      radiusX: 2.4 * zoomScale,
      radiusY: 2.4 * zoomScale,
    };
  };

  const getPointerPanel = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const panelCol = Math.min(viewGridCols - 1, Math.max(0, Math.floor(x * viewGridCols)));
    const panelRow = Math.min(viewGridRows - 1, Math.max(0, Math.floor(y * viewGridRows)));
    const panelIndex = panelRow * viewGridCols + panelCol;
    const view = visibleViewList[panelIndex];
    if (!view) return null;

    return {
      viewId: view.id,
      localX: x * viewGridCols - panelCol,
      localY: y * viewGridRows - panelRow,
      panelWidth: rect.width / viewGridCols,
      panelHeight: rect.height / viewGridRows,
    };
  };

  const pickJuliaSeed = (e: PointerEvent<HTMLCanvasElement>) => {
    const point = getPointerPanel(e);
    if (!point || (point.viewId !== "mandelbrot" && point.viewId !== "mandelbrot-unfurled")) return;
    const c = mapMandelbrotPanelPoint(point.localX, point.localY, point.viewId);
    setJuliaPresetId("custom");
    setJuliaCx(c.x);
    setJuliaCy(c.y);
  };

  const handleCanvasPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const point = getPointerPanel(e);
    if (!point) return;
    e.preventDefault();

    if (canvasTool === "julia") {
      pickJuliaSeed(e);
      return;
    }

    if (point.viewId !== "mandelbrot") return;
    const c = mapMandelbrotPanelPoint(point.localX, point.localY, point.viewId);

    e.currentTarget.setPointerCapture(e.pointerId);
    panDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCenterX: centerX,
      startCenterY: centerY,
      radiusX: c.radiusX,
      radiusY: c.radiusY,
      panelWidth: point.panelWidth,
      panelHeight: point.panelHeight,
    };
  };

  const handleCanvasPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (canvasTool === "julia") {
      if (e.buttons === 1) pickJuliaSeed(e);
      return;
    }

    const drag = panDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    setLocationPresetId("custom");
    setCenterX(drag.startCenterX - (dx / drag.panelWidth) * drag.radiusX * 2);
    setCenterY(drag.startCenterY - (dy / drag.panelHeight) * drag.radiusY * 2);
  };

  const endCanvasDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    if (panDragRef.current?.pointerId === e.pointerId) {
      panDragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <>
      <Head>
        <title>WebGPU Fractal Explorer V1 | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          WebGPU Fractal Explorer V1
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45, maxWidth: 980 }}>
          Fresh WebGPU renderer with capped interactive quality, selectable Mandelbrot/Julia views,
          unified colorizers, editable Mandelbrot locations, and Julia constants seeded from
          Mandelbrot clicks or presets.
        </p>

        <div style={{ marginBottom: "0.6rem", fontSize: "0.8rem", color: supported ? "#91e6ad" : "#ff9b9b" }}>
          Status: {status}
        </div>

        <div style={{ border: "1px solid #2a3442", borderRadius: 8, background: "#0d1118", padding: "0.45rem", marginBottom: "0.9rem" }}>
          <div style={{ fontSize: "0.75rem", opacity: 0.78, marginBottom: "0.35rem" }}>
            Single WebGPU Surface ({visibleViewList.map((view) => view.label).join(" | ")})
          </div>
          <canvas
            ref={canvasRef}
            width={surfaceSize.w}
            height={surfaceSize.h}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={endCanvasDrag}
            onPointerCancel={endCanvasDrag}
            style={{
              width: surfaceSize.w,
              maxWidth: "100%",
              height: "auto",
              aspectRatio: `${viewGridCols} / ${viewGridRows}`,
              display: "block",
              borderRadius: 6,
              background: "#090909",
              imageRendering: "auto",
              cursor: canvasTool === "pan" ? "grab" : "crosshair",
              touchAction: "none",
            }}
          />
          <div style={{ fontSize: "0.68rem", opacity: 0.62, marginTop: "0.25rem" }}>
            panel {surfaceSize.panelRaw}x{surfaceSize.panelRaw}, grid {viewGridCols}x{viewGridRows}, gpu-surface {surfaceSize.w}x{surfaceSize.h}. {canvasTool === "pan" ? "Drag the Mandelbrot panel to pan the location." : "Click or drag in Mandelbrot or Mandelbrot Unfurled to choose Julia"} c = {juliaCx.toFixed(6)} {juliaCy < 0 ? "-" : "+"} {Math.abs(juliaCy).toFixed(6)}i.
          </div>
          <div style={{ border: "1px solid #2b2f39", borderRadius: 8, background: "#0f1319", padding: "0.55rem", marginTop: "0.55rem" }}>
            <div style={{ fontSize: "0.74rem", opacity: 0.8, marginBottom: "0.45rem" }}>
              Mandelbrot Location / Quality
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.45rem" }}>
              <NumberBox label="Panel Resolution" value={resolution} min={256} max={MAX_RESOLUTION} step={1} info="Pixel width and height of each square viewport. Higher values reallocate a larger WebGPU surface." onChange={setResolution} />
              <NumberBox label="Center X" value={centerX} min={-2.2} max={2.2} step={COORD_STEP} info="Mandelbrot viewport center on the real axis. You can also change this by dragging with the pan hand tool." onChange={(v) => { setLocationPresetId("custom"); setCenterX(v); }} />
              <NumberBox label="Center Y" value={centerY} min={-2.2} max={2.2} step={COORD_STEP} info="Mandelbrot viewport center on the imaginary axis. You can also change this by dragging with the pan hand tool." onChange={(v) => { setLocationPresetId("custom"); setCenterY(v); }} />
              <NumberBox label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={COORD_STEP} info="Real part of the Julia constant c. Pick Julia mode can set this from Mandelbrot or Mandelbrot Unfurled." onChange={(v) => { setJuliaPresetId("custom"); setJuliaCx(v); }} />
              <NumberBox label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={COORD_STEP} info="Imaginary part of the Julia constant c. Pick Julia mode can set this from Mandelbrot or Mandelbrot Unfurled." onChange={(v) => { setJuliaPresetId("custom"); setJuliaCy(v); }} />
              <NumberBox label="Angle Repeats" value={turns} min={1} max={18} step={1} info="How many full angular wraps are sampled from left to right in the unfurled views." onChange={setTurns} />
              <NumberBox label="Conv Period" value={convPeriod} min={1} max={8} step={1} info="Period-k convergence test used by Sekino-style convergence color modes." onChange={setConvPeriod} />
              <NumberBox label="Conv Epsilon" value={convEpsilon} min={0.000000001} max={0.01} step={0.000000001} info="Tolerance for deciding whether a point is close to period-k convergence. Smaller is stricter." onChange={setConvEpsilon} />
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="presets">
            <span className="presets-label">
              <ControlLabel label="Visible Views" info="Choose which square viewports are rendered. Extra unwrap views include double log-polar, phase, contour, and tiled/period-style remaps." />
            </span>
            {VIEW_ORDER.map((view) => (
              <label
                key={view.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  border: "1px solid #2c3240",
                  borderRadius: 999,
                  padding: "0.28rem 0.55rem",
                  color: visibleViews[view.id] ? "#e7edf8" : "#7f8795",
                  cursor: visibleViewCount <= 1 && visibleViews[view.id] ? "not-allowed" : "pointer",
                  opacity: visibleViewCount <= 1 && visibleViews[view.id] ? 0.75 : 1,
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={visibleViews[view.id]}
                  disabled={visibleViewCount <= 1 && visibleViews[view.id]}
                  onChange={() => toggleView(view.id)}
                  style={{ display: "none" }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "relative",
                    width: 34,
                    height: 18,
                    borderRadius: 999,
                    background: visibleViews[view.id] ? ACCENT : "#242a35",
                    boxShadow: visibleViews[view.id] ? "0 0 10px rgba(144, 202, 249, 0.28)" : "none",
                    transition: "background 120ms ease",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      left: visibleViews[view.id] ? 18 : 3,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: visibleViews[view.id] ? "#06111f" : "#9aa4b5",
                      transition: "left 120ms ease, background 120ms ease",
                    }}
                  />
                </span>
                <span>{view.label}</span>
              </label>
            ))}
          </div>

          <div className="presets">
            <span className="presets-label">
              <ControlLabel label="Canvas Tool" info="Pan hand drags the Mandelbrot location. Pick Julia samples a point from Mandelbrot or Mandelbrot Unfurled and uses it as Julia c." />
            </span>
            {(["pan", "julia"] as CanvasTool[]).map((tool) => (
              <button
                key={tool}
                className="preset-btn"
                onClick={() => setCanvasTool(tool)}
                style={tool === canvasTool ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {tool === "pan" ? "pan hand" : "pick Julia"}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "0.75rem" }}>
            <label className="slider-row" style={{ gridTemplateColumns: "150px minmax(0, 320px)" }}>
              <span className="slider-label">
                <ControlLabel label="Mandelbrot Location" info="Preset viewport locations: center X/Y, zoom, and suggested iteration count." />
              </span>
              <select
                value={selectedLocationPreset ? locationPresetId : "custom"}
                title={selectedLocationPreset?.note ?? "custom location"}
                onChange={(e) => {
                  if (e.target.value !== "custom") handlePresetChange(e.target.value);
                }}
                style={{ width: "100%", background: "#101319", border: "1px solid #2c3240", color: "#e7edf8", borderRadius: 4, padding: "0.4rem 0.5rem" }}
              >
                <option value="custom">Custom location</option>
                {mandelbrotPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="slider-row" style={{ gridTemplateColumns: "120px minmax(0, 320px)" }}>
              <span className="slider-label">
                <ControlLabel label="Julia Constant" info="Preset c values for Julia rendering. These are coefficients/constants, unlike Mandelbrot location presets." />
              </span>
              <select
                value={selectedJuliaPreset ? juliaPresetId : "custom"}
                title={selectedJuliaPreset?.note ?? "click Mandelbrot or Mandelbrot Unfurled"}
                onChange={(e) => {
                  if (e.target.value !== "custom") handleJuliaPresetChange(e.target.value);
                }}
                style={{ width: "100%", background: "#101319", border: "1px solid #2c3240", color: "#e7edf8", borderRadius: 4, padding: "0.4rem 0.5rem" }}
              >
                <option value="custom">Custom from canvas click</option>
                {juliaPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="slider-row">
            <span className="slider-label">
              <ControlLabel label="Color Algorithm" info="Color mapping applied to every visible panel. Some convergence/Sekino modes are heavier than simple palettes." />
            </span>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ColorMode)}
              style={{ width: "100%", background: "#101319", border: "1px solid #2c3240", color: "#e7edf8", borderRadius: 4, padding: "0.4rem 0.5rem" }}
            >
              {COLOR_MODES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} - {entry.note}
                </option>
              ))}
            </select>
            <span className="slider-value">{COLOR_MODES.find((entry) => entry.id === colorMode)?.note}</span>
          </label>

          <Slider label="Zoom" value={zoom} min={0} max={MAX_ZOOM} step={0.001} info="Magnification of the Mandelbrot location. This changes the normal Mandelbrot view and the Mandelbrot-derived unfurled sampling." onChange={(v) => { setLocationPresetId("custom"); setZoom(v); }} />
          <Slider label="Max Iter" value={maxIter} min={32} max={MAX_ITER} step={1} info="Maximum escape iterations per pixel. Higher values reveal deeper boundary detail but can slow expensive views." onChange={setMaxIter} />
          <Slider label="Angle Offset deg" value={angleOffsetDeg} min={0} max={360} step={1} info="Rotation of the unfurled sampling path in degrees. 180 is a half-turn. It only affects the Mandelbrot Unfurled and Julia Unfurled views." onChange={setAngleOffsetDeg} />
          <Slider label="Unfurled Rotation deg" value={unfurlRotationDeg} min={0} max={270} step={90} info="Rotates the drawn unfurled panels in quarter turns: 90 for sideways, 180 for upside-down, 270 for the other sideways orientation." onChange={setUnfurlRotationDeg} />

          <div className="presets">
            <span className="presets-label">
              <ControlLabel label="Uncurl Mode" info="Origin-polar samples circular rings around an origin. Cardioid-perimeter samples around the main Mandelbrot cardioid with inward/outward normal distance." />
            </span>
            {(["origin-polar", "cardioid-perimeter"] as UncurlMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setUncurlMode(m)}
                style={m === uncurlMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>

          <Slider label="Edge Gain" value={edgeGain} min={0} max={12} step={0.01} info="Strength of the edge estimate/overlay. 0 disables the overlay; higher values brighten boundaries and make edge-aware palettes stronger." onChange={setEdgeGain} />
          <Slider label="Color Cycle" value={bandFreq} min={2} max={80} step={0.1} info="Palette/band frequency used by striped, wave, banded, and hybrid color modes." onChange={setBandFreq} />

          {uncurlMode === "origin-polar" ? (
            <>
              <Slider label="Origin X" value={originX} min={-2.2} max={2.2} step={COORD_STEP} info="Center X of the circular/radial unfurl sampling path, relative to the Mandelbrot location." onChange={setOriginX} />
              <Slider label="Origin Y" value={originY} min={-2.2} max={2.2} step={COORD_STEP} info="Center Y of the circular/radial unfurl sampling path, relative to the Mandelbrot location." onChange={setOriginY} />
              <Slider label="R Inner" value={rInner} min={0} max={3} step={0.001} info="Inner radius of the polar unfurled band." onChange={setRInner} />
              <Slider label="R Outer" value={rOuter} min={0.2} max={5} step={0.001} info="Outer radius of the polar unfurled band." onChange={setROuter} />
              <Slider label="Radial Curve" value={radialCurve} min={0.1} max={4} step={0.01} info="Redistributes vertical space between inner and outer radii. Higher values pack more detail near the inner radius." onChange={setRadialCurve} />
            </>
          ) : (
            <>
              <Slider label="Normal Out" value={normalOut} min={0.1} max={3.2} step={0.001} info="How far outward from the main cardioid perimeter the unfurled band samples." onChange={setNormalOut} />
              <Slider label="Normal In" value={normalIn} min={0} max={1.2} step={0.001} info="How far inward from the main cardioid perimeter the unfurled band samples." onChange={setNormalIn} />
              <Slider label="Normal Curve" value={normalCurve} min={-6} max={8} step={0.01} info="Shapes how vertical position maps to inward/outward distance from the cardioid perimeter." onChange={setNormalCurve} />
            </>
          )}

        </div>
      </div>
    </>
  );
}

