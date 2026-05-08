import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";

type FractalKind = "mandelbrot" | "julia";
type UncurlMode = "origin-polar" | "cardioid-perimeter";
type DisplayMode = "split" | "main" | "unfurled";
type ColorMode =
  | "smooth"
  | "edge"
  | "stripe"
  | "bw-stripes"
  | "trap"
  | "bands"
  | "grayscale"
  | "classic"
  | "hybrid";

const ACCENT = "#90caf9";
const GPU_DPR_CAP = 1;
const SAFE_GPU_SURFACE_WIDTH = 256;
const SAFE_GPU_SURFACE_HEIGHT = 128;

interface NumberBoxProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function NumberBox({ label, value, min, max, step, onChange }: NumberBoxProps) {
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
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          onChange(Math.max(min, Math.min(max, n)));
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
  let radiusX = 2.8 * zoomScale;
  let radiusY = 1.6 * zoomScale;

  // viewMode: 0 = regular fractal viewport, 1 = unfurled
  if (viewMode < 0.5) {
    let cx = center.x + mix(-radiusX, radiusX, uv.x);
    let cy = center.y + mix(-radiusY, radiusY, uv.y);
    return vec2<f32>(cx, cy);
  }

  let turns = u.c.x;
  let angleOffset = u.c.y;
  let theta = angleOffset * 6.28318530718 + turns * 6.28318530718 * uv.x;
  let uncurlMode = u.c.z;

  if (uncurlMode < 0.5) {
    let rInner = min(u.c.w, u.d.x);
    let rOuter = max(u.c.w, u.d.x);
    let radialCurve = max(0.05, u.d.y);
    let radius = mix(rInner, rOuter, pow(uv.y, radialCurve));
    let ux = u.d.z + radius * cos(theta);
    let uy = u.d.w + radius * sin(theta);
    return center + vec2<f32>(ux, uy) * zoomScale;
  }

  let card = cardioid(theta);
  let outward = scaledDistance(uv.y, max(0.001, u.e.x), u.e.z);
  let inward = u.e.y * (1.0 - uv.y);
  let signedDist = outward - inward;
  let ux = card.x + card.z * signedDist;
  let uy = card.y + card.w * signedDist;
  return center + vec2<f32>(ux, uy) * zoomScale;
}

fn fractalMetrics(c: vec2<f32>) -> vec4<f32> {
  let maxIter = u32(u.b.y);
  let isJulia = u.b.z > 0.5;

  var zx = select(0.0, c.x, isJulia);
  var zy = select(0.0, c.y, isJulia);
  let cx = select(c.x, u.f.x, isJulia);
  let cy = select(c.y, u.f.y, isJulia);

  var dzx = select(0.0, 1.0, isJulia);
  var dzy = 0.0;
  var trap = 1e9;
  var escaped = false;
  var iter: u32 = 0u;

  for (var i: u32 = 0u; i < 768u; i = i + 1u) {
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

fn colorize(metrics: vec4<f32>, edge: f32, uv: vec2<f32>, modeVal: f32) -> vec3<f32> {
  let smoothVal = metrics.x;
  let stripeVal = metrics.y;
  let trapVal = metrics.z;
  let iterNorm = metrics.w;
  let bands = 0.5 + 0.5 * sin(6.28318530718 * (u.f.w * uv.x + 0.65 * iterNorm + 0.25 * stripeVal));
  let mode = i32(modeVal + 0.5);

  if (mode == 0) { // smooth
    return vec3<f32>(0.1 + 0.9 * smoothVal, 0.12 + 0.88 * smoothVal, 0.16 + 0.84 * (1.0 - smoothVal));
  }
  if (mode == 1) { // edge
    return vec3<f32>(0.08 + 0.92 * edge, 0.08 + 0.4 * edge, 0.18 + 0.82 * (1.0 - edge));
  }
  if (mode == 2) { // stripe
    return vec3<f32>(0.1 + 0.9 * stripeVal, 0.08 + 0.92 * (1.0 - stripeVal), 0.18 + 0.82 * (0.5 + 0.5 * sin(stripeVal * 6.28318530718)));
  }
  if (mode == 3) { // bw-stripes
    let bw = select(0.0, 1.0, stripeVal > 0.5);
    return vec3<f32>(bw, bw, bw);
  }
  if (mode == 4) { // trap
    return vec3<f32>(0.1 + 0.9 * trapVal, 0.1 + 0.7 * (1.0 - trapVal), 0.2 + 0.8 * (0.25 + 0.75 * trapVal));
  }
  if (mode == 5) { // bands
    return vec3<f32>(
      clamp01(0.55 * bands + 0.35 * edge + 0.1 * trapVal),
      clamp01(0.6 * (1.0 - bands) + 0.22 * smoothVal + 0.18 * stripeVal),
      clamp01(0.52 * smoothVal + 0.28 * bands + 0.2 * (1.0 - edge))
    );
  }
  if (mode == 6) { // grayscale
    let m = clamp01(0.7 * smoothVal + 0.3 * edge);
    return vec3<f32>(m, m, m);
  }
  if (mode == 7) { // classic
    let t = clamp01(smoothVal);
    let r = 0.5 + 0.5 * cos(6.28318530718 * (t + 0.0));
    let g = 0.5 + 0.5 * cos(6.28318530718 * (t + 0.33));
    let b = 0.5 + 0.5 * cos(6.28318530718 * (t + 0.67));
    let edgeBoost = 0.65 + 0.35 * edge;
    return vec3<f32>(r * edgeBoost, g * edgeBoost, b * edgeBoost);
  }
  // hybrid
  return vec3<f32>(
    clamp01(0.44 * smoothVal + 0.28 * edge + 0.18 * trapVal + 0.1 * bands),
    clamp01(0.35 * stripeVal + 0.25 * smoothVal + 0.2 * bands + 0.2 * (1.0 - edge)),
    clamp01(0.4 * (1.0 - smoothVal) + 0.3 * (1.0 - edge) + 0.3 * bands)
  );
}

@fragment
fn fsMain(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<f32>(max(1.0, u.a.x), max(1.0, u.a.y));
  let uv = fragCoord.xy / size;
  let displayMode = u.e.w;
  var localUv = uv;
  var viewMode = displayMode;
  var colorMode = u.b.w;

  if (displayMode > 1.5) {
    if (uv.x < 0.5) {
      viewMode = 0.0;
      localUv = vec2<f32>(uv.x * 2.0, uv.y);
      colorMode = u.b.w;
    } else {
      viewMode = 1.0;
      localUv = vec2<f32>((uv.x - 0.5) * 2.0, uv.y);
      colorMode = u.g.x;
    }
  } else if (displayMode > 0.5) {
    viewMode = 1.0;
    colorMode = u.g.x;
  } else {
    viewMode = 0.0;
    colorMode = u.b.w;
  }

  let c = mapPoint(localUv, viewMode);
  let m = fractalMetrics(c);

  // Lightweight edge estimate from neighboring smooth sample.
  let eps = 1.0 / max(size.x, size.y);
  let c2 = mapPoint(vec2<f32>(clamp01(localUv.x + eps), localUv.y), viewMode);
  let m2 = fractalMetrics(c2);
  let edge = clamp01(abs(m2.x - m.x) * u.f.z);

  if (displayMode > 1.5 && abs(uv.x - 0.5) < 0.003) {
    return vec4<f32>(0.9, 0.9, 0.95, 1.0);
  }

  let rgb = colorize(m, edge, localUv, colorMode);
  return vec4<f32>(rgb, 1.0);
}
`;

export default function WebGpuDualViewportFractalPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<{
    device: any;
    format: string;
    pipeline: any;
    uniformBuffer: any;
    bindGroup: any;
  } | null>(null);
  const contextConfiguredRef = useRef(false);

  const [status, setStatus] = useState("initializing");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [gpuReadyTick, setGpuReadyTick] = useState(0);

  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("split");
  const [mainColorMode, setMainColorMode] = useState<ColorMode>("hybrid");
  const [unfurledColorMode, setUnfurledColorMode] = useState<ColorMode>("bw-stripes");
  const [uncurlMode, setUncurlMode] = useState<UncurlMode>("cardioid-perimeter");
  const [resolution, setResolution] = useState(SAFE_GPU_SURFACE_WIDTH);
  const [maxIter, setMaxIter] = useState(160);
  const [zoom, setZoom] = useState(0.55);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [fineStep, setFineStep] = useState(0.00001);

  const [turns, setTurns] = useState(5);
  const [angleOffset, setAngleOffset] = useState(0);
  const [rInner, setRInner] = useState(0);
  const [rOuter, setROuter] = useState(2.4);
  const [radialCurve, setRadialCurve] = useState(1.5);
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);
  const [normalOut, setNormalOut] = useState(1.35);
  const [normalIn, setNormalIn] = useState(0.08);
  const [normalCurve, setNormalCurve] = useState(2.8);
  const [edgeGain, setEdgeGain] = useState(4.6);
  const [bandFreq, setBandFreq] = useState(14);

  const surfaceSize = useMemo(() => {
    const wRaw = Math.max(128, Math.round(resolution));
    const hRaw = Math.max(64, Math.round(wRaw * 0.5));
    return {
      w: Math.min(SAFE_GPU_SURFACE_WIDTH, wRaw),
      h: Math.min(SAFE_GPU_SURFACE_HEIGHT, hRaw),
      wRaw,
      hRaw,
    };
  }, [resolution]);

  const colorModeToIndex = (mode: ColorMode) =>
    ({
      smooth: 0,
      edge: 1,
      stripe: 2,
      "bw-stripes": 3,
      trap: 4,
      bands: 5,
      grayscale: 6,
      classic: 7,
      hybrid: 8,
    })[mode];

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
      u[5] = Math.max(1, Math.min(768, maxIter));
      u[6] = fractalType === "julia" ? 1 : 0;
      u[7] = colorModeToIndex(mainColorMode);
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
      u[19] = displayMode === "main" ? 0 : displayMode === "unfurled" ? 1 : 2;
      // f
      u[20] = juliaCx;
      u[21] = juliaCy;
      u[22] = edgeGain;
      u[23] = bandFreq;
      // g
      u[24] = colorModeToIndex(unfurledColorMode);

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
    edgeGain,
    fractalType,
    displayMode,
    juliaCx,
    juliaCy,
    mainColorMode,
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
    unfurledColorMode,
    zoom,
    gpuReadyTick,
  ]);

  return (
    <>
      <Head>
        <title>WebGPU Lab v3 - Dual Fractal Viewports</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/archive/webgpu-sonification-lab" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← WebGPU Sonification Lab
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          WebGPU Lab v3: Dual Fractal + Unfurled Renderer
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45, maxWidth: 980 }}>
          GPU-rendered dual viewport: left is standard Mandelbrot/Julia window, right is unfurled
          mapping. Both are fragment-shader paths with shared coefficients and common color schemes
          including black/white stripes.
        </p>

        <div style={{ marginBottom: "0.6rem", fontSize: "0.8rem", color: supported ? "#91e6ad" : "#ff9b9b" }}>
          Status: {status}
        </div>

        <div style={{ border: "1px solid #2a3442", borderRadius: 8, background: "#0d1118", padding: "0.45rem", marginBottom: "0.9rem" }}>
          <div style={{ fontSize: "0.75rem", opacity: 0.78, marginBottom: "0.35rem" }}>
            Single WebGPU Surface ({displayMode === "split" ? "Main | Unfurled" : displayMode})
          </div>
          <canvas
            ref={canvasRef}
            width={surfaceSize.w}
            height={surfaceSize.h}
            style={{ width: "100%", display: "block", borderRadius: 6, background: "#090909", imageRendering: "auto" }}
          />
          <div style={{ fontSize: "0.68rem", opacity: 0.62, marginTop: "0.25rem" }}>
            logical {surfaceSize.wRaw}x{surfaceSize.hRaw}, gpu-surface {surfaceSize.w}x{surfaceSize.h}
          </div>
        </div>

        <div className="controls">
          <div className="presets">
            <span className="presets-label">View</span>
            {(["split", "main", "unfurled"] as DisplayMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setDisplayMode(m)}
                style={m === displayMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="presets">
            <span className="presets-label">Fractal</span>
            {(["mandelbrot", "julia"] as FractalKind[]).map((k) => (
              <button
                key={k}
                className="preset-btn"
                onClick={() => setFractalType(k)}
                style={k === fractalType ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="presets">
            <span className="presets-label">Fine Step</span>
            {[0.001, 0.0001, 0.00001, 0.000001].map((s) => (
              <button
                key={s}
                className="preset-btn"
                onClick={() => setFineStep(s)}
                style={s === fineStep ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="presets">
            <span className="presets-label">Main Color</span>
            {(
              ["hybrid", "classic", "grayscale", "smooth", "edge", "stripe", "bw-stripes", "trap", "bands"] as ColorMode[]
            ).map((m) => (
              <button
                key={`main-${m}`}
                className="preset-btn"
                onClick={() => setMainColorMode(m)}
                style={m === mainColorMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="presets">
            <span className="presets-label">Unfurled Color</span>
            {(
              ["bands", "bw-stripes", "hybrid", "classic", "grayscale", "smooth", "edge", "stripe", "trap"] as ColorMode[]
            ).map((m) => (
              <button
                key={`unf-${m}`}
                className="preset-btn"
                onClick={() => setUnfurledColorMode(m)}
                style={m === unfurledColorMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>

          <Slider label="Resolution" value={resolution} min={128} max={256} step={1} onChange={setResolution} />
          <Slider label="Zoom" value={zoom} min={0} max={2} step={0.001} onChange={setZoom} />
          <Slider label="Center X" value={centerX} min={-2.2} max={2.2} step={fineStep} onChange={setCenterX} />
          <Slider label="Center Y" value={centerY} min={-2.2} max={2.2} step={fineStep} onChange={setCenterY} />
          <Slider label="Max Iter (<=384)" value={maxIter} min={32} max={384} step={1} onChange={setMaxIter} />

          {fractalType === "julia" && (
            <>
              <Slider label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCx} />
              <Slider label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCy} />
            </>
          )}

          <div className="presets">
            <span className="presets-label">Uncurl Mode</span>
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

          <Slider label="Turns" value={turns} min={1} max={18} step={1} onChange={setTurns} />
          <Slider label="Angle Offset" value={angleOffset} min={0} max={1} step={0.001} onChange={setAngleOffset} />
          <Slider label="Edge Gain" value={edgeGain} min={1} max={9} step={0.01} onChange={setEdgeGain} />
          <Slider label="Band Freq" value={bandFreq} min={2} max={40} step={0.1} onChange={setBandFreq} />

          {uncurlMode === "origin-polar" ? (
            <>
              <Slider label="Origin X" value={originX} min={-2.2} max={2.2} step={fineStep} onChange={setOriginX} />
              <Slider label="Origin Y" value={originY} min={-2.2} max={2.2} step={fineStep} onChange={setOriginY} />
              <Slider label="R Inner" value={rInner} min={0} max={3} step={0.001} onChange={setRInner} />
              <Slider label="R Outer" value={rOuter} min={0.2} max={5} step={0.001} onChange={setROuter} />
              <Slider label="Radial Curve" value={radialCurve} min={0.1} max={4} step={0.01} onChange={setRadialCurve} />
            </>
          ) : (
            <>
              <Slider label="Normal Out" value={normalOut} min={0.1} max={3.2} step={0.001} onChange={setNormalOut} />
              <Slider label="Normal In" value={normalIn} min={0} max={1.2} step={0.001} onChange={setNormalIn} />
              <Slider label="Normal Curve" value={normalCurve} min={-6} max={8} step={0.01} onChange={setNormalCurve} />
            </>
          )}

          <div
            style={{
              border: "1px solid #2b2f39",
              borderRadius: 8,
              background: "#0f1319",
              padding: "0.55rem",
              marginTop: "0.35rem",
            }}
          >
            <div style={{ fontSize: "0.74rem", opacity: 0.8, marginBottom: "0.4rem" }}>
              Editable Coefficients
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.45rem" }}>
              <NumberBox label="Zoom" value={zoom} min={0} max={2} step={0.001} onChange={setZoom} />
              <NumberBox label="Center X" value={centerX} min={-2.2} max={2.2} step={fineStep} onChange={setCenterX} />
              <NumberBox label="Center Y" value={centerY} min={-2.2} max={2.2} step={fineStep} onChange={setCenterY} />
              <NumberBox label="Max Iter" value={maxIter} min={32} max={384} step={1} onChange={setMaxIter} />
              <NumberBox label="Turns" value={turns} min={1} max={18} step={1} onChange={setTurns} />
              <NumberBox label="Angle Offset" value={angleOffset} min={0} max={1} step={0.001} onChange={setAngleOffset} />
              {fractalType === "julia" && (
                <>
                  <NumberBox label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCx} />
                  <NumberBox label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCy} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

