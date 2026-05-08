import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  buildMandelbrotFields,
  buildPotentialContours,
  fract,
  lerp,
  relativeAngleSignature,
  samplePath,
  sampleScalar,
  soundAt,
  TAU,
} from "@/lib/fractalContourUtils";

const ACCENT = "#90caf9";

type TimeMode = "depth-cycle" | "depth" | "cycle";

export default function StripeTimeFlowUnfurledPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [timeMode, setTimeMode] = useState<TimeMode>("depth-cycle");
  const [pathCount, setPathCount] = useState(14);
  const [contourLevels, setContourLevels] = useState(18);
  const [startIter, setStartIter] = useState(60);
  const [endIter, setEndIter] = useState(560);
  const [startCycle, setStartCycle] = useState(8);
  const [endCycle, setEndCycle] = useState(42);
  const [phaseTravel, setPhaseTravel] = useState(1);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;
    const grid = 220;
    const maxIter = Math.max(startIter + 1, Math.round(endIter));
    const { potential, smoothIters } = buildMandelbrotFields(grid, maxIter);
    const paths = buildPotentialContours(potential, grid, contourLevels, pathCount);

    const fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = grid;
    fieldCanvas.height = grid;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) return null;
    const image = fieldCtx.createImageData(grid, grid);
    for (let i = 0; i < potential.length; i += 1) {
      const shade = Math.round(18 + potential[i] * 220);
      image.data[i * 4] = shade;
      image.data[i * 4 + 1] = shade;
      image.data[i * 4 + 2] = shade;
      image.data[i * 4 + 3] = 255;
    }
    fieldCtx.putImageData(image, 0, 0);

    const signatures = paths.map((path) => relativeAngleSignature(path, 180, 0.018));
    return { fieldCanvas, grid, maxIter, paths, signatures, smoothIters };
  }, [contourLevels, endIter, pathCount, startIter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1100;
    const h = 800;
    const viewX = 24;
    const viewY = 100;
    const viewSize = 420;
    const stripX = 488;
    const stripY = 100;
    const stripW = 560;
    const laneCount = scene.paths.length;
    const stripH = laneCount > 18 ? 22 : 28;
    const stripGap = 10;
    const arclengthSteps = 260;
    const depthT = timeMode === "cycle" ? 1 : t;
    const cycleT = timeMode === "depth" ? 0 : t;
    const currentIter = Math.round(lerp(startIter, endIter, depthT));
    const currentCycle = lerp(startCycle, endCycle, cycleT);
    const currentPhase = t * phaseTravel;

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACCENT;
    ctx.font = "24px sans-serif";
    ctx.fillText("Stripe Time Flow: Unfurled Contour Bodies", 24, 38);
    ctx.fillStyle = "#b9c7d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("Each contour is straightened left-to-right by arclength. Black is sound at the current depth/time.", 24, 66);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene.fieldCanvas, viewX, viewY, viewSize, viewSize);
    ctx.strokeStyle = "#334055";
    ctx.strokeRect(viewX, viewY, viewSize, viewSize);
    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText(`contours in place, depth ${currentIter}, cycle ${currentCycle.toFixed(1)}`, viewX, viewY - 12);
    ctx.fillText("same contours unfurled left-to-right", stripX, stripY - 12);

    scene.paths.forEach((path, index) => {
      const hue = (index * 360) / Math.max(1, laneCount);
      ctx.strokeStyle = `hsla(${hue}, 90%, 64%, 0.72)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      path.points.forEach((point, pointIndex) => {
        const sx = viewX + point.x * viewSize;
        const sy = viewY + point.y * viewSize;
        if (pointIndex === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      const marker = samplePath(path, t);
      ctx.fillStyle = `hsl(${hue}, 95%, 68%)`;
      ctx.beginPath();
      ctx.arc(viewX + marker.x * viewSize, viewY + marker.y * viewSize, 3.6, 0, TAU);
      ctx.fill();

      const rowY = stripY + index * (stripH + stripGap);
      ctx.fillStyle = "#f6f7fb";
      ctx.fillRect(stripX, rowY, stripW, stripH);
      for (let step = 0; step < arclengthSteps; step += 1) {
        const u = step / (arclengthSteps - 1);
        const p = samplePath(path, u);
        const smoothIter = sampleScalar(scene.smoothIters, scene.grid, p);
        const sound = soundAt(smoothIter, currentIter, currentCycle, currentPhase, scene.maxIter);
        ctx.fillStyle = sound ? "#05070a" : "#f6f7fb";
        ctx.fillRect(stripX + (step * stripW) / arclengthSteps, rowY, Math.ceil(stripW / arclengthSteps), stripH);
      }

      const signature = scene.signatures[index];
      ctx.strokeStyle = `hsla(${hue}, 96%, 62%, 0.9)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      signature.forEach((value, i) => {
        const x = stripX + (i / Math.max(1, signature.length - 1)) * stripW;
        const y = rowY + stripH * 0.5 - value * stripH * 0.42;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = `hsla(${hue}, 85%, 66%, 0.9)`;
      ctx.strokeRect(stripX, rowY, stripW, stripH);
      ctx.fillStyle = `hsl(${hue}, 95%, 70%)`;
      ctx.font = "11px sans-serif";
      ctx.fillText(String(index + 1).padStart(2, "0"), stripX - 24, rowY + stripH * 0.66);
    });

    ctx.fillStyle = "#dce8f7";
    ctx.font = "14px sans-serif";
    ctx.fillText(`T = ${t.toFixed(3)} changes depth/cycle; horizontal position is contour arclength`, stripX, stripY + laneCount * (stripH + stripGap) + 24);
    ctx.fillStyle = "#93a4b9";
    ctx.font = "13px sans-serif";
    ctx.fillText("Colored wiggle on each strip is the relative-angle shape signature riding over the B/W sound gate.", stripX, stripY + laneCount * (stripH + stripGap) + 46);
  }, [endCycle, endIter, phaseTravel, scene, startCycle, startIter, t, timeMode]);

  useEffect(() => {
    if (!animate) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((old) => fract(old + dt * 0.035));
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
        <title>Stripe Time Flow Unfurled | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Stripe Time Flow: Unfurled
        </h1>
        <p style={{ maxWidth: 980, opacity: 0.82, lineHeight: 1.5 }}>
          This page keeps the stripe-time idea, but straightens each contour into a left-to-right instrument body. T still drives depth and stripe phase. Horizontal position is normalized arclength around the contour.
        </p>

        <div className="controls" style={{ marginBottom: "1rem" }}>
          <button className="preset-btn" onClick={() => setAnimate((v) => !v)}>
            {animate ? "pause T" : "animate T"}
          </button>
          <label className="slider-row">
            <span className="slider-label">Time Direction</span>
            <select value={timeMode} onChange={(event) => setTimeMode(event.target.value as TimeMode)}>
              <option value="depth-cycle">depth + color cycle</option>
              <option value="depth">depth only</option>
              <option value="cycle">color cycle only</option>
            </select>
          </label>
          <Slider label="T" value={t} min={0} max={1} step={0.001} onChange={setT} />
          <Slider label="Paths Shown" value={pathCount} min={1} max={24} step={1} onChange={setPathCount} />
          <Slider label="Contour Levels" value={contourLevels} min={3} max={36} step={1} onChange={setContourLevels} />
          <Slider label="Start Iter" value={startIter} min={12} max={240} step={1} onChange={setStartIter} />
          <Slider label="End Iter" value={endIter} min={120} max={900} step={1} onChange={setEndIter} />
          <Slider label="Start Cycle" value={startCycle} min={2} max={48} step={0.1} onChange={setStartCycle} />
          <Slider label="End Cycle" value={endCycle} min={2} max={96} step={0.1} onChange={setEndCycle} />
          <Slider label="Phase Travel" value={phaseTravel} min={0} max={6} step={0.01} onChange={setPhaseTravel} />
        </div>

        <canvas
          ref={canvasRef}
          width={1100}
          height={800}
          style={{ width: "100%", maxWidth: 1100, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>Why Unfurl?</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            The wrapped contour shows the shape in fractal space. The unfurled strip shows the same contour as a playable body. Black/white is the gate, while the colored angle trace shows how the contour turns. This is one way to keep rhythm, timbre, and shape visible at the same time.
          </p>
        </section>
      </div>
    </>
  );
}
