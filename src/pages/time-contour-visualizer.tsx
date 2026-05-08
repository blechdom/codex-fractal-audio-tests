import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";

const ACCENT = "#90caf9";
const TAU = Math.PI * 2;

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function fract(x: number) {
  return x - Math.floor(x);
}

function mandelbrotSmooth(cx: number, cy: number, maxIter: number) {
  let zx = 0;
  let zy = 0;
  let iter = 0;

  for (let i = 0; i < maxIter; i += 1) {
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    iter = i;
    if (zx * zx + zy * zy > 16) {
      const mag = Math.hypot(zx, zy);
      const smooth = iter + 1 - Math.log2(Math.log2(Math.max(2, mag)));
      return clamp01(smooth / Math.max(1, maxIter));
    }
  }

  return 1;
}

function blockValue(cx: number, cy: number, maxIter: number, colorCycle: number) {
  const smooth = mandelbrotSmooth(cx, cy, maxIter);
  if (smooth >= 0.999) return 0;
  return Math.floor(fract(smooth * colorCycle) * 2) >= 1 ? 1 : 0;
}

function makePathPoint(layer: number, layerCount: number, t: number) {
  const radius = 0.08 + (0.43 * layer) / Math.max(1, layerCount - 1);
  const wobble = 0.018 * Math.sin(TAU * (t * 3 + layer * 0.17));
  const theta = TAU * t + layer * 0.19;
  return {
    nx: 0.5 + (radius + wobble) * Math.cos(theta),
    ny: 0.5 + (radius + wobble) * Math.sin(theta),
  };
}

function sampleComplex(nx: number, ny: number) {
  const centerX = -0.74364388703;
  const centerY = 0.13182590421;
  const radius = 0.018;
  return {
    x: centerX + (nx * 2 - 1) * radius,
    y: centerY + (ny * 2 - 1) * radius,
  };
}

export default function TimeContourVisualizerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [layerCount, setLayerCount] = useState(16);
  const [colorCycle, setColorCycle] = useState(22);
  const [maxIter, setMaxIter] = useState(360);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;
    const active = Math.max(1, Math.round(layerCount));
    const fieldRes = 360;
    const laneSteps = 240;
    const fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = fieldRes;
    fieldCanvas.height = fieldRes;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) return null;
    const field = fieldCtx.createImageData(fieldRes, fieldRes);
    for (let py = 0; py < fieldRes; py += 1) {
      for (let px = 0; px < fieldRes; px += 1) {
        const c = sampleComplex(px / (fieldRes - 1), py / (fieldRes - 1));
        const v = blockValue(c.x, c.y, maxIter, colorCycle);
        const shade = v ? 236 : 8;
        const idx = (py * fieldRes + px) * 4;
        field.data[idx] = shade;
        field.data[idx + 1] = shade;
        field.data[idx + 2] = shade;
        field.data[idx + 3] = 255;
      }
    }
    fieldCtx.putImageData(field, 0, 0);

    const laneValues = Array.from({ length: active }, (_, layer) =>
      Array.from({ length: laneSteps }, (_, i) => {
        const pt = makePathPoint(layer, active, i / laneSteps);
        const cc = sampleComplex(pt.nx, pt.ny);
        return blockValue(cc.x, cc.y, maxIter, colorCycle);
      }),
    );

    return { active, fieldCanvas, laneSteps, laneValues };
  }, [colorCycle, layerCount, maxIter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 980;
    const h = 760;
    const viewX = 24;
    const viewY = 92;
    const viewSize = 520;
    const stripX = 584;
    const stripY = 92;
    const stripW = 360;
    const stripH = 22;
    const stripGap = 8;
    const { active, fieldCanvas, laneSteps, laneValues } = scene;

    canvas.width = w;
    canvas.height = h;

    const draw = (nowT: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#07090d";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = ACCENT;
      ctx.font = "24px sans-serif";
      ctx.fillText("Shared Time T: Onion Paths Through B/W Block Contours", 24, 38);
      ctx.fillStyle = "#b9c7d8";
      ctx.font = "14px sans-serif";
      ctx.fillText("The image is still. The colored paths are fixed layers. T is the shared playhead phase moving all layers together.", 24, 64);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fieldCanvas, viewX, viewY, viewSize, viewSize);
      ctx.strokeStyle = "#334055";
      ctx.lineWidth = 1;
      ctx.strokeRect(viewX, viewY, viewSize, viewSize);

      ctx.fillStyle = "#dce8f7";
      ctx.font = "13px sans-serif";
      ctx.fillText("Layered paths on one still Mandelbrot frame", viewX, viewY - 12);
      ctx.fillText("Each strip shows one layer's whole T cycle", stripX, stripY - 12);

      for (let layer = 0; layer < active; layer += 1) {
        const hue = (layer * 360) / active;
        ctx.strokeStyle = `hsla(${hue}, 85%, 66%, 0.62)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 360; i += 1) {
          const p = makePathPoint(layer, active, i / 360);
          const sx = viewX + p.nx * viewSize;
          const sy = viewY + p.ny * viewSize;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        const p = makePathPoint(layer, active, nowT);
        const stepIndex = Math.floor(nowT * laneSteps) % laneSteps;
        const prevIndex = (stepIndex + laneSteps - 1) % laneSteps;
        const value = laneValues[layer][stepIndex];
        const prevValue = laneValues[layer][prevIndex];
        const crossing = value !== prevValue;

        ctx.fillStyle = crossing ? "#ffffff" : `hsl(${hue}, 95%, 62%)`;
        ctx.beginPath();
        ctx.arc(viewX + p.nx * viewSize, viewY + p.ny * viewSize, crossing ? 5.5 : 3.6, 0, TAU);
        ctx.fill();

        const rowY = stripY + layer * (stripH + stripGap);
        ctx.fillStyle = "#141a24";
        ctx.fillRect(stripX, rowY, stripW, stripH);
        for (let i = 0; i < laneSteps; i += 1) {
          const vv = laneValues[layer][i];
          ctx.fillStyle = vv ? "#e9edf4" : "#05070a";
          ctx.fillRect(stripX + (i * stripW) / laneSteps, rowY, Math.ceil(stripW / laneSteps), stripH);
        }
        ctx.strokeStyle = `hsla(${hue}, 85%, 66%, 0.9)`;
        ctx.strokeRect(stripX, rowY, stripW, stripH);
        ctx.fillStyle = `hsl(${hue}, 95%, 68%)`;
        ctx.font = "11px sans-serif";
        ctx.fillText(String(layer + 1).padStart(2, "0"), stripX - 24, rowY + 15);
      }

      const cursorX = stripX + nowT * stripW;
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, stripY - 6);
      ctx.lineTo(cursorX, stripY + active * (stripH + stripGap) - stripGap + 6);
      ctx.stroke();

      ctx.fillStyle = "#dce8f7";
      ctx.font = "14px sans-serif";
      ctx.fillText(`T = ${nowT.toFixed(3)}`, stripX, stripY + active * (stripH + stripGap) + 24);
      ctx.fillStyle = "#93a4b9";
      ctx.font = "13px sans-serif";
      ctx.fillText("White/black changes under the cyan cursor are the simplest possible note triggers.", stripX, stripY + active * (stripH + stripGap) + 46);
      ctx.fillText("Wide bands imply slower spacing. Narrow bands imply faster crossings or denser rhythm.", stripX, stripY + active * (stripH + stripGap) + 66);
    };

    draw(t);
  }, [scene, t]);

  useEffect(() => {
    if (!animate) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((old) => fract(old + dt * 0.055));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [animate]);

  return (
    <>
      <Head>
        <title>Shared Time T Contour Visualizer | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Shared Time T Contour Visualizer
        </h1>
        <p style={{ maxWidth: 940, opacity: 0.82, lineHeight: 1.5 }}>
          This is a visual explanation of shared time. The B/W block Mandelbrot frame is still. The onion paths are layers. The cyan cursor and bright dots show one global phase, T, moving through all layers at once.
        </p>

        <div className="controls" style={{ marginBottom: "1rem" }}>
          <button className="preset-btn" onClick={() => setAnimate((v) => !v)}>
            {animate ? "pause T" : "animate T"}
          </button>
          <Slider label="T" value={t} min={0} max={1} step={0.001} onChange={setT} />
          <Slider label="Layers" value={layerCount} min={1} max={16} step={1} onChange={setLayerCount} />
          <Slider label="Color Cycle" value={colorCycle} min={2} max={80} step={0.1} onChange={setColorCycle} />
          <Slider label="Max Iter" value={maxIter} min={32} max={900} step={1} onChange={setMaxIter} />
        </div>

        <canvas
          ref={canvasRef}
          width={980}
          height={760}
          style={{ width: "100%", maxWidth: 980, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>How To Read This</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            The paths are like onion layers. Each layer contains a complete loop from T=0 to T=1. At any instant, shared T selects one point on every layer. If the sampled value changes from black to white or white to black, that crossing could trigger a note.
          </p>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            So T can be seen two ways: as an animation frame when the dots move, and as a vertical slice through the lane strips. The strips are the whole score; the cyan line is the current playback time.
          </p>
        </section>

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>What Is Real Here?</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            The black and white field comes from a real Mandelbrot calculation: each pixel is iterated, smoothed, and folded through a color cycle into a binary stripe value. The rainbow loops on this first page are intentionally not extracted from the fractal. They are simple probe paths, drawn to make the idea of shared time visible before adding harder geometry.
          </p>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            That separation is useful: it lets us ask what it means for many voices to share one normalized time coordinate. T is not seconds yet. It is phase through a path, phase through a lane strip, and a possible clock for musical playback.
          </p>
          <ul style={{ marginBottom: 0, opacity: 0.84, lineHeight: 1.55 }}>
            <li>Path position suggests where a voice listens in the data.</li>
            <li>Black/white crossings suggest gates, note attacks, or rests.</li>
            <li>Dense crossings suggest faster rhythm; sparse crossings suggest slower phrasing.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
