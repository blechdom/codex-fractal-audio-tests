import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  buildMandelbrotFields,
  buildPotentialContours,
  fract,
  relativeAngleSignature,
  samplePath,
  sampleScalar,
  soundAt,
  TAU,
} from "@/lib/fractalContourUtils";

const ACCENT = "#90caf9";

export default function RealContourPathsUnfurledPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [pathCount, setPathCount] = useState(16);
  const [contourLevels, setContourLevels] = useState(18);
  const [maxIter, setMaxIter] = useState(560);
  const [colorCycle, setColorCycle] = useState(28);
  const [phase, setPhase] = useState(0);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;
    const grid = 220;
    const { potential, smoothIters } = buildMandelbrotFields(grid, Math.round(maxIter));
    const paths = buildPotentialContours(potential, grid, contourLevels, pathCount);

    const fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = grid;
    fieldCanvas.height = grid;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) return null;
    const image = fieldCtx.createImageData(grid, grid);
    for (let i = 0; i < potential.length; i += 1) {
      const sound = soundAt(smoothIters[i], maxIter, colorCycle, phase, maxIter);
      const shade = sound ? 12 : 238;
      image.data[i * 4] = shade;
      image.data[i * 4 + 1] = shade;
      image.data[i * 4 + 2] = shade;
      image.data[i * 4 + 3] = 255;
    }
    fieldCtx.putImageData(image, 0, 0);

    const signatures = paths.map((path) => relativeAngleSignature(path, 180, 0.018));
    return { fieldCanvas, grid, paths, signatures, smoothIters };
  }, [colorCycle, contourLevels, maxIter, pathCount, phase]);

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
    const stripH = laneCount > 22 ? 16 : laneCount > 16 ? 20 : 26;
    const stripGap = laneCount > 22 ? 5 : 8;
    const arclengthSteps = 260;

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACCENT;
    ctx.font = "24px sans-serif";
    ctx.fillText("Real Contour Paths: Unfurled Traversal", 24, 38);
    ctx.fillStyle = "#b9c7d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("T is traversal by arclength. Each row is a real contour straightened into a playable strip.", 24, 66);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene.fieldCanvas, viewX, viewY, viewSize, viewSize);
    ctx.strokeStyle = "#334055";
    ctx.strokeRect(viewX, viewY, viewSize, viewSize);
    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText("contours in fractal space", viewX, viewY - 12);
    ctx.fillText("same contours unfurled; cyan line is shared T", stripX, stripY - 12);

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
      const markerSound = soundAt(sampleScalar(scene.smoothIters, scene.grid, marker), maxIter, colorCycle, phase, maxIter);
      ctx.fillStyle = markerSound ? "#ffffff" : `hsl(${hue}, 95%, 66%)`;
      ctx.beginPath();
      ctx.arc(viewX + marker.x * viewSize, viewY + marker.y * viewSize, markerSound ? 5.2 : 3.8, 0, TAU);
      ctx.fill();

      const rowY = stripY + index * (stripH + stripGap);
      ctx.fillStyle = "#f6f7fb";
      ctx.fillRect(stripX, rowY, stripW, stripH);
      for (let step = 0; step < arclengthSteps; step += 1) {
        const u = step / (arclengthSteps - 1);
        const p = samplePath(path, u);
        const smoothIter = sampleScalar(scene.smoothIters, scene.grid, p);
        const sound = soundAt(smoothIter, maxIter, colorCycle, phase, maxIter);
        ctx.fillStyle = sound ? "#05070a" : "#f6f7fb";
        ctx.fillRect(stripX + (step * stripW) / arclengthSteps, rowY, Math.ceil(stripW / arclengthSteps), stripH);
      }

      const signature = scene.signatures[index];
      ctx.strokeStyle = `hsla(${hue}, 96%, 62%, 0.9)`;
      ctx.lineWidth = 1.1;
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
      ctx.font = "10px sans-serif";
      ctx.fillText(String(index + 1).padStart(2, "0"), stripX - 24, rowY + stripH * 0.66);
    });

    const cursorX = stripX + t * stripW;
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, stripY - 6);
    ctx.lineTo(cursorX, stripY + laneCount * (stripH + stripGap) - stripGap + 6);
    ctx.stroke();

    ctx.fillStyle = "#dce8f7";
    ctx.font = "14px sans-serif";
    ctx.fillText(`T = ${t.toFixed(3)} traverses every unfurled contour left-to-right`, stripX, stripY + laneCount * (stripH + stripGap) + 24);
    ctx.fillStyle = "#93a4b9";
    ctx.font = "13px sans-serif";
    ctx.fillText("Black/white gives the gate at each arclength position. The colored trace gives relative-angle shape.", stripX, stripY + laneCount * (stripH + stripGap) + 46);
  }, [colorCycle, maxIter, phase, scene, t]);

  useEffect(() => {
    if (!animate) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((old) => fract(old + dt * 0.05));
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
        <title>Real Contour Paths Unfurled | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Real Contour Paths: Unfurled
        </h1>
        <p style={{ maxWidth: 980, opacity: 0.82, lineHeight: 1.5 }}>
          This is the traversal version. The contours are extracted from the fractal, then each contour is unwrapped into a left-to-right lane. The playhead moves by normalized arclength, so T means the same proportional location on every path.
        </p>

        <div className="controls" style={{ marginBottom: "1rem" }}>
          <button className="preset-btn" onClick={() => setAnimate((v) => !v)}>
            {animate ? "pause T" : "animate T"}
          </button>
          <Slider label="T" value={t} min={0} max={1} step={0.001} onChange={setT} />
          <Slider label="Paths Shown" value={pathCount} min={1} max={28} step={1} onChange={setPathCount} />
          <Slider label="Contour Levels" value={contourLevels} min={3} max={36} step={1} onChange={setContourLevels} />
          <Slider label="Max Iter" value={maxIter} min={120} max={900} step={1} onChange={setMaxIter} />
          <Slider label="Color Cycle" value={colorCycle} min={2} max={96} step={0.1} onChange={setColorCycle} />
          <Slider label="Stripe Phase" value={phase} min={0} max={1} step={0.001} onChange={setPhase} />
        </div>

        <canvas
          ref={canvasRef}
          width={1100}
          height={800}
          style={{ width: "100%", maxWidth: 1100, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>Traversal Versus Depth</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            This page is intentionally different from Stripe Time Flow Unfurled. Here T traverses the contour. There, T changes depth. Keeping both pages separate lets us compare two meanings of time: time as movement along a shape, and time as recursion going deeper.
          </p>
        </section>
      </div>
    </>
  );
}
