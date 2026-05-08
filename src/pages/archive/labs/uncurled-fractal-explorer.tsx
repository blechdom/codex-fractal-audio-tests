import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  clamp01,
  computeViewport,
  fractalPointMetrics,
  type FractalKind,
  lerp,
} from "@/lib/fractal-core";
import { computeEdgeField } from "@/lib/fractal-playback-schemes";

type UncurlMode = "origin-polar" | "cardioid-perimeter";
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

const ACCENT = "#f7b267";
const TAU = Math.PI * 2;

interface NumberBoxProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function NumberBox({ label, value, min, max, step, onChange }: NumberBoxProps) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "center",
        gap: "0.55rem",
        fontSize: "0.76rem",
        color: "#b9b9b9",
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
          const next = Number(e.target.value);
          if (Number.isNaN(next)) return;
          onChange(Math.max(min, Math.min(max, next)));
        }}
        style={{
          background: "#111",
          border: "1px solid #2e2e2e",
          color: "#ececec",
          borderRadius: 4,
          padding: "0.35rem 0.45rem",
          width: "100%",
        }}
      />
    </label>
  );
}

function sampleMainCardioid(t: number) {
  const bx = 0.5 * Math.cos(t) - 0.25 * Math.cos(2 * t);
  const by = 0.5 * Math.sin(t) - 0.25 * Math.sin(2 * t);
  const tx = -0.5 * Math.sin(t) + 0.5 * Math.sin(2 * t);
  const ty = 0.5 * Math.cos(t) - 0.5 * Math.cos(2 * t);

  const nLen = Math.hypot(ty, -tx) || 1;
  let nx = ty / nLen;
  let ny = -tx / nLen;

  // Flip normal so it points mostly away from the main cardioid center mass.
  const cx = 0.25;
  const cy = 0;
  const outwardDot = nx * (bx - cx) + ny * (by - cy);
  if (outwardDot < 0) {
    nx *= -1;
    ny *= -1;
  }
  return { bx, by, nx, ny };
}

function scaledDistance(v: number, span: number, curve: number) {
  if (Math.abs(curve) < 1e-4) return span * v;
  if (curve > 0) {
    const e = Math.exp(curve);
    return span * ((Math.exp(curve * v) - 1) / (e - 1));
  }
  const a = Math.exp(-curve);
  return span * (1 - (Math.exp(-curve * (1 - v)) - 1) / (a - 1));
}

export default function UncurledFractalExplorerPage() {
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const uncurledCanvasRef = useRef<HTMLCanvasElement>(null);

  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [zoom, setZoom] = useState(1.4);
  const [fineStep, setFineStep] = useState(0.00001);
  const [uncurlMode, setUncurlMode] = useState<UncurlMode>("cardioid-perimeter");
  const [originalColorMode, setOriginalColorMode] = useState<ColorMode>("hybrid");
  const [uncurledColorMode, setUncurledColorMode] = useState<ColorMode>("bands");

  const [resolution, setResolution] = useState(820);
  const [maxIter, setMaxIter] = useState(420);
  const [turns, setTurns] = useState(12);
  const [angleOffset, setAngleOffset] = useState(0);
  const [radialCurve, setRadialCurve] = useState(1.5);
  const [rInner, setRInner] = useState(0);
  const [rOuter, setROuter] = useState(2.4);
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);

  const [normalOut, setNormalOut] = useState(1.35);
  const [normalIn, setNormalIn] = useState(0.08);
  const [normalCurve, setNormalCurve] = useState(2.8);
  const [bandFreq, setBandFreq] = useState(14);
  const [edgeGain, setEdgeGain] = useState(4.6);

  const viewport = useMemo(
    () => computeViewport({ zoom, time: 0, centerX, centerY }),
    [centerX, centerY, zoom]
  );

  const colorizeFrame = (
    width: number,
    height: number,
    smooth: Float32Array,
    stripe: Float32Array,
    trap: Float32Array,
    dist: Float32Array,
    iterNorm: Float32Array,
    colorMode: ColorMode
  ) => {
    const edge = computeEdgeField(smooth, width, height, edgeGain);
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < smooth.length; i += 1) {
      const s = smooth[i];
      const e = edge[i];
      const st = stripe[i];
      const tp = trap[i];
      const dn = dist[i];
      const n = iterNorm[i];
      const xNorm = (i % width) / Math.max(1, width - 1);
      const bands = 0.5 + 0.5 * Math.sin(TAU * (bandFreq * xNorm + 0.65 * n + 0.25 * st));

      let r = 0;
      let g = 0;
      let b = 0;
      if (colorMode === "smooth") {
        r = 0.1 + 0.9 * s;
        g = 0.14 + 0.82 * (1 - dn);
        b = 0.2 + 0.8 * (1 - s);
      } else if (colorMode === "edge") {
        r = 0.08 + 0.92 * e;
        g = 0.08 + 0.4 * e;
        b = 0.18 + 0.82 * (1 - e);
      } else if (colorMode === "stripe") {
        r = 0.1 + 0.9 * st;
        g = 0.08 + 0.92 * (1 - st);
        b = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(st * TAU));
      } else if (colorMode === "bw-stripes") {
        const bw = st > 0.5 ? 1 : 0;
        r = bw;
        g = bw;
        b = bw;
      } else if (colorMode === "trap") {
        r = 0.1 + 0.9 * tp;
        g = 0.1 + 0.7 * (1 - tp);
        b = 0.2 + 0.8 * (0.25 + 0.75 * tp);
      } else if (colorMode === "bands") {
        r = clamp01(0.55 * bands + 0.35 * e + 0.1 * tp);
        g = clamp01(0.6 * (1 - bands) + 0.22 * s + 0.18 * st);
        b = clamp01(0.52 * s + 0.28 * bands + 0.2 * (1 - e));
      } else if (colorMode === "grayscale") {
        const mono = clamp01(0.7 * s + 0.3 * e);
        r = mono;
        g = mono;
        b = mono;
      } else if (colorMode === "classic") {
        // Common "escape-time rainbow" style mapped from smooth escape.
        const t = clamp01(s);
        r = 0.5 + 0.5 * Math.cos(TAU * (t + 0.0));
        g = 0.5 + 0.5 * Math.cos(TAU * (t + 0.33));
        b = 0.5 + 0.5 * Math.cos(TAU * (t + 0.67));
        // Darken interior-like regions and emphasize edges slightly.
        const edgeBoost = 0.65 + 0.35 * e;
        r *= edgeBoost;
        g *= edgeBoost;
        b *= edgeBoost;
      } else {
        r = clamp01(0.44 * s + 0.28 * e + 0.18 * tp + 0.1 * bands);
        g = clamp01(0.35 * st + 0.25 * s + 0.2 * bands + 0.2 * (1 - e));
        b = clamp01(0.4 * (1 - dn) + 0.3 * (1 - e) + 0.3 * bands);
      }

      const p = i * 4;
      pixels[p] = Math.floor(255 * r);
      pixels[p + 1] = Math.floor(255 * g);
      pixels[p + 2] = Math.floor(255 * b);
      pixels[p + 3] = 255;
    }
    return pixels;
  };

  const originalFrame = useMemo(() => {
    const width = Math.max(220, Math.round(resolution * 0.52));
    const height = Math.max(150, Math.round(width * 0.62));
    const smooth = new Float32Array(width * height);
    const stripe = new Float32Array(width * height);
    const trap = new Float32Array(width * height);
    const dist = new Float32Array(width * height);
    const iterNorm = new Float32Array(width * height);

    for (let y = 0; y < height; y += 1) {
      const ny = y / Math.max(1, height - 1);
      const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
      for (let x = 0; x < width; x += 1) {
        const nx = x / Math.max(1, width - 1);
        const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
        const p = fractalPointMetrics(cx, cy, maxIter, {
          dataSource: "fractal",
          fractalType,
          juliaCx,
          juliaCy,
        });
        const i = y * width + x;
        smooth[i] = p.smoothNorm;
        stripe[i] = p.stripe;
        trap[i] = p.trap;
        dist[i] = p.distance;
        iterNorm[i] = clamp01(p.iter / Math.max(1, maxIter));
      }
    }
    const pixels = colorizeFrame(width, height, smooth, stripe, trap, dist, iterNorm, originalColorMode);
    return { width, height, pixels };
  }, [edgeGain, fractalType, juliaCx, juliaCy, maxIter, resolution, viewport, bandFreq, originalColorMode]);

  const uncurledFrame = useMemo(() => {
    const width = Math.max(300, Math.round(resolution));
    const height = Math.max(160, Math.round(width * 0.46));
    const smooth = new Float32Array(width * height);
    const stripe = new Float32Array(width * height);
    const trap = new Float32Array(width * height);
    const dist = new Float32Array(width * height);
    const iterNorm = new Float32Array(width * height);

    const startAngle = angleOffset * TAU;
    const fullAngle = TAU * turns;
    const inner = Math.min(rInner, rOuter);
    const outer = Math.max(rInner, rOuter);
    const normScaleX = viewport.radiusX / 2.8;
    const normScaleY = viewport.radiusY / 1.6;

    for (let y = 0; y < height; y += 1) {
      const v = y / Math.max(1, height - 1);
      for (let x = 0; x < width; x += 1) {
        const u = x / Math.max(1, width - 1);
        const theta = startAngle + fullAngle * u;

        let cx = 0;
        let cy = 0;
        if (uncurlMode === "origin-polar") {
          const vCurve = Math.pow(v, Math.max(0.05, radialCurve));
          const radius = lerp(inner, outer, vCurve);
          const ux = originX + radius * Math.cos(theta);
          const uy = originY + radius * Math.sin(theta);
          cx = viewport.centerX + ux * normScaleX;
          cy = viewport.centerY + uy * normScaleY;
        } else {
          const node = sampleMainCardioid(theta);
          const outward = scaledDistance(v, Math.max(0.001, normalOut), normalCurve);
          const inward = normalIn * (1 - v);
          const signedDist = outward - inward;
          const ux = node.bx + node.nx * signedDist;
          const uy = node.by + node.ny * signedDist;
          cx = viewport.centerX + ux * normScaleX;
          cy = viewport.centerY + uy * normScaleY;
        }

        const p = fractalPointMetrics(cx, cy, maxIter, {
          dataSource: "fractal",
          fractalType,
          juliaCx,
          juliaCy,
        });
        const i = y * width + x;
        smooth[i] = p.smoothNorm;
        stripe[i] = p.stripe;
        trap[i] = p.trap;
        dist[i] = p.distance;
        iterNorm[i] = clamp01(p.iter / Math.max(1, maxIter));
      }
    }
    const pixels = colorizeFrame(width, height, smooth, stripe, trap, dist, iterNorm, uncurledColorMode);
    return { width, height, pixels };
  }, [
    angleOffset,
    bandFreq,
    edgeGain,
    fractalType,
    juliaCx,
    juliaCy,
    maxIter,
    normalCurve,
    normalIn,
    normalOut,
    originX,
    originY,
    viewport,
    rInner,
    rOuter,
    radialCurve,
    resolution,
    turns,
    uncurlMode,
    uncurledColorMode,
  ]);

  useEffect(() => {
    const canvas = originalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(originalFrame.pixels), originalFrame.width, originalFrame.height),
      0,
      0
    );
  }, [originalFrame]);

  useEffect(() => {
    const canvas = uncurledCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(uncurledFrame.pixels), uncurledFrame.width, uncurledFrame.height),
      0,
      0
    );
  }, [uncurledFrame]);

  return (
    <>
      <Head>
        <title>Uncurled Fractal Explorer | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>

        <h1 className="site-title">Uncurled Fractal Explorer</h1>
        <p style={{ opacity: 0.8, maxWidth: 900, lineHeight: 1.5 }}>
          Explore Mandelbrot/Julia structure in an uncurled coordinate view. Choose either a
          pivot-about-origin mapping or a cardioid-perimeter traversal, then color by smooth
          escape, edges, stripe phase, trap distance, or branch-like bands to reveal node
          self-similarity.
        </p>
        <p style={{ opacity: 0.66, maxWidth: 980, lineHeight: 1.45, marginTop: "-0.2rem" }}>
          Left viewport is the regular fractal viewer (Cartesian window with zoom/center
          coefficients). Right viewport is the unfurled remapping.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "0.75rem",
            marginBottom: "0.9rem",
          }}
        >
          <div style={{ border: "1px solid #242424", borderRadius: 8, background: "#0a0a0a", padding: "0.45rem" }}>
            <div style={{ fontSize: "0.75rem", opacity: 0.78, marginBottom: "0.35rem" }}>Original Fractal View</div>
            <div style={{ fontSize: "0.68rem", opacity: 0.62, marginBottom: "0.35rem" }}>
              zoom={zoom.toFixed(3)}, center=({centerX.toFixed(6)}, {centerY.toFixed(6)}), color={originalColorMode}
            </div>
            <canvas
              ref={originalCanvasRef}
              width={originalFrame.width}
              height={originalFrame.height}
              style={{ width: "100%", borderRadius: 6, display: "block", background: "#090909", imageRendering: "auto" }}
            />
          </div>
          <div style={{ border: "1px solid #242424", borderRadius: 8, background: "#0a0a0a", padding: "0.45rem" }}>
            <div style={{ fontSize: "0.75rem", opacity: 0.78, marginBottom: "0.35rem" }}>Uncurled Mapping View</div>
            <div style={{ fontSize: "0.68rem", opacity: 0.62, marginBottom: "0.35rem" }}>
              mode={uncurlMode}, turns={turns}, angle={angleOffset.toFixed(3)}, color={uncurledColorMode}
            </div>
            <canvas
              ref={uncurledCanvasRef}
              width={uncurledFrame.width}
              height={uncurledFrame.height}
              style={{ width: "100%", borderRadius: 6, display: "block", background: "#090909", imageRendering: "auto" }}
            />
          </div>
        </div>

        <div className="controls">
          <div className="presets">
            <span className="presets-label">Fractal</span>
            {(["mandelbrot", "julia"] as FractalKind[]).map((kind) => (
              <button
                key={kind}
                className="preset-btn"
                onClick={() => setFractalType(kind)}
                style={kind === fractalType ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {kind}
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

          {fractalType === "julia" && (
            <>
              <Slider label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCx} />
              <Slider label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCy} />
            </>
          )}

          <Slider label="View Zoom" value={zoom} min={0} max={2} step={0.001} onChange={setZoom} />
          <Slider label="Center X" value={centerX} min={-2.2} max={2.2} step={fineStep} onChange={setCenterX} />
          <Slider label="Center Y" value={centerY} min={-2.2} max={2.2} step={fineStep} onChange={setCenterY} />
          <div
            style={{
              border: "1px solid #2b2b2b",
              borderRadius: 8,
              padding: "0.55rem",
              background: "#0f0f0f",
              marginTop: "0.35rem",
              marginBottom: "0.25rem",
            }}
          >
            <div style={{ fontSize: "0.74rem", opacity: 0.78, marginBottom: "0.4rem" }}>
              Fractal View Coefficients (editable)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.45rem" }}>
              <NumberBox label="Zoom" value={zoom} min={0} max={2} step={0.001} onChange={setZoom} />
              <NumberBox label="Center X" value={centerX} min={-2.2} max={2.2} step={fineStep} onChange={setCenterX} />
              <NumberBox label="Center Y" value={centerY} min={-2.2} max={2.2} step={fineStep} onChange={setCenterY} />
              <NumberBox label="Max Iter" value={maxIter} min={80} max={1200} step={1} onChange={setMaxIter} />
              {fractalType === "julia" && (
                <>
                  <NumberBox label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCx} />
                  <NumberBox label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={fineStep} onChange={setJuliaCy} />
                </>
              )}
            </div>
          </div>

          <div className="presets">
            <span className="presets-label">Uncurl Mode</span>
            {(["origin-polar", "cardioid-perimeter"] as UncurlMode[]).map((mode) => (
              <button
                key={mode}
                className="preset-btn"
                onClick={() => setUncurlMode(mode)}
                style={mode === uncurlMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="presets">
            <span className="presets-label">Original Color</span>
            {(
              ["hybrid", "classic", "grayscale", "smooth", "edge", "stripe", "bw-stripes", "trap", "bands"] as ColorMode[]
            ).map((mode) => (
              <button
                key={`orig-${mode}`}
                className="preset-btn"
                onClick={() => setOriginalColorMode(mode)}
                style={mode === originalColorMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="presets">
            <span className="presets-label">Unfurled Color</span>
            {(
              ["bands", "hybrid", "classic", "grayscale", "smooth", "edge", "stripe", "bw-stripes", "trap"] as ColorMode[]
            ).map((mode) => (
              <button
                key={`unf-${mode}`}
                className="preset-btn"
                onClick={() => setUncurledColorMode(mode)}
                style={mode === uncurledColorMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {mode}
              </button>
            ))}
          </div>

          <Slider label="Resolution" value={resolution} min={260} max={1400} step={1} onChange={setResolution} />
          <Slider label="Max Iter" value={maxIter} min={80} max={1200} step={1} onChange={setMaxIter} />
          <Slider label="Turns" value={turns} min={1} max={18} step={1} onChange={setTurns} />
          <Slider label="Angle Offset" value={angleOffset} min={0} max={1} step={0.001} onChange={setAngleOffset} />
          <Slider label="Edge Gain" value={edgeGain} min={1} max={9} step={0.01} onChange={setEdgeGain} />
          <Slider label="Band Freq" value={bandFreq} min={2} max={40} step={0.1} onChange={setBandFreq} />

          {uncurlMode === "origin-polar" ? (
            <>
              <Slider label="Origin X" value={originX} min={-2.2} max={2.2} step={0.00001} onChange={setOriginX} />
              <Slider label="Origin Y" value={originY} min={-2.2} max={2.2} step={0.00001} onChange={setOriginY} />
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
              border: "1px solid #2b2b2b",
              borderRadius: 8,
              padding: "0.55rem",
              background: "#0f0f0f",
              marginTop: "0.35rem",
            }}
          >
            <div style={{ fontSize: "0.74rem", opacity: 0.78, marginBottom: "0.4rem" }}>
              Unfurled Mapping Coefficients (editable)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.45rem" }}>
              <NumberBox label="Turns" value={turns} min={1} max={18} step={1} onChange={setTurns} />
              <NumberBox label="Angle Offset" value={angleOffset} min={0} max={1} step={0.001} onChange={setAngleOffset} />
              <NumberBox label="Edge Gain" value={edgeGain} min={1} max={9} step={0.01} onChange={setEdgeGain} />
              <NumberBox label="Band Freq" value={bandFreq} min={2} max={40} step={0.1} onChange={setBandFreq} />
              {uncurlMode === "origin-polar" ? (
                <>
                  <NumberBox label="Origin X" value={originX} min={-2.2} max={2.2} step={fineStep} onChange={setOriginX} />
                  <NumberBox label="Origin Y" value={originY} min={-2.2} max={2.2} step={fineStep} onChange={setOriginY} />
                  <NumberBox label="R Inner" value={rInner} min={0} max={3} step={0.001} onChange={setRInner} />
                  <NumberBox label="R Outer" value={rOuter} min={0.2} max={5} step={0.001} onChange={setROuter} />
                  <NumberBox label="Radial Curve" value={radialCurve} min={0.1} max={4} step={0.01} onChange={setRadialCurve} />
                </>
              ) : (
                <>
                  <NumberBox label="Normal Out" value={normalOut} min={0.1} max={3.2} step={0.001} onChange={setNormalOut} />
                  <NumberBox label="Normal In" value={normalIn} min={0} max={1.2} step={0.001} onChange={setNormalIn} />
                  <NumberBox label="Normal Curve" value={normalCurve} min={-6} max={8} step={0.01} onChange={setNormalCurve} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

