import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  buildMandelbrotFields,
  clamp01,
  extractSegments,
  fract,
  lerp,
  stitchSegments,
  TAU,
} from "@/lib/fractalContourUtils";

const ACCENT = "#90caf9";

function activeBandValue(smoothIter: number, currentIter: number, bandWidth: number, endIter: number) {
  if (smoothIter > endIter) return 0;
  const distance = Math.abs(smoothIter - currentIter);
  return clamp01(1 - distance / Math.max(0.25, bandWidth));
}

export default function GradientSlidePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [startIter, setStartIter] = useState(24);
  const [endIter, setEndIter] = useState(620);
  const [bandWidth, setBandWidth] = useState(2.2);
  const [stairSteps, setStairSteps] = useState(28);
  const [contoursShown, setContoursShown] = useState(18);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;

    const grid = 230;
    const maxIter = Math.max(startIter + 1, Math.round(endIter));
    const { smoothIters } = buildMandelbrotFields(grid, maxIter);
    const steps = Array.from({ length: Math.max(4, Math.round(stairSteps)) }, (_, i) => {
      const u = i / Math.max(1, Math.round(stairSteps) - 1);
      const curved = Math.pow(u, 1.7);
      return Math.round(lerp(startIter, endIter, curved));
    });

    const stepStats = steps.map((iter) => {
      let density = 0;
      let weight = 0;
      for (let i = 0; i < smoothIters.length; i += 1) {
        const value = activeBandValue(smoothIters[i], iter, bandWidth, maxIter);
        density += value;
        if (value > 0) weight += 1;
      }
      const contours = stitchSegments(extractSegments(smoothIters, grid, grid, iter)).sort((a, b) => b.length - a.length);
      const complexity =
        contours.slice(0, 8).reduce((sum, path) => sum + path.bend * path.length, 0) / Math.max(0.001, contours.slice(0, 8).reduce((sum, path) => sum + path.length, 0));
      return {
        complexity: clamp01(complexity * 3.5),
        contours: contours.slice(0, 4),
        density: density / smoothIters.length,
        iter,
        weight,
      };
    });

    return { grid, maxIter, smoothIters, stepStats };
  }, [bandWidth, endIter, stairSteps, startIter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1100;
    const h = 820;
    const viewX = 24;
    const viewY = 102;
    const viewSize = 560;
    const stairX = 632;
    const stairY = 102;
    const stairW = 390;
    const rowGap = 4;
    const rowH = Math.max(8, Math.min(18, (560 - rowGap * scene.stepStats.length) / scene.stepStats.length));
    const currentIter = Math.round(lerp(startIter, endIter, Math.pow(t, 1.7)));
    const currentStepIndex = scene.stepStats.reduce((best, step, index) => {
      const bestDelta = Math.abs(scene.stepStats[best].iter - currentIter);
      const delta = Math.abs(step.iter - currentIter);
      return delta < bestDelta ? index : best;
    }, 0);

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACCENT;
    ctx.font = "24px sans-serif";
    ctx.fillText("Gradient Slide: Time Slides Through Iteration Bands", 24, 38);
    ctx.fillStyle = "#b9c7d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("This preserves the previous Striped Staircase sketch: a continuous active band slides through max-iteration depth.", 24, 66);

    const activeCanvas = document.createElement("canvas");
    activeCanvas.width = scene.grid;
    activeCanvas.height = scene.grid;
    const activeCtx = activeCanvas.getContext("2d");
    if (!activeCtx) return;
    const activeImage = activeCtx.createImageData(scene.grid, scene.grid);
    for (let i = 0; i < scene.smoothIters.length; i += 1) {
      const active = activeBandValue(scene.smoothIters[i], currentIter, bandWidth, scene.maxIter);
      const past = scene.smoothIters[i] < currentIter ? 1 : 0;
      const shade = active > 0 ? Math.round(245 - active * 245) : past ? 214 : 248;
      activeImage.data[i * 4] = shade;
      activeImage.data[i * 4 + 1] = shade;
      activeImage.data[i * 4 + 2] = shade + (active > 0 ? 0 : 4);
      activeImage.data[i * 4 + 3] = 255;
    }
    activeCtx.putImageData(activeImage, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(activeCanvas, viewX, viewY, viewSize, viewSize);
    ctx.strokeStyle = "#334055";
    ctx.strokeRect(viewX, viewY, viewSize, viewSize);
    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText(`current slide: iteration ${currentIter}; black is the sounding band`, viewX, viewY - 12);

    const activeContours = stitchSegments(extractSegments(scene.smoothIters, scene.grid, scene.grid, currentIter))
      .sort((a, b) => b.length - a.length)
      .slice(0, Math.round(contoursShown));
    activeContours.forEach((path, index) => {
      const hue = 195 + (index * 80) / Math.max(1, activeContours.length);
      ctx.strokeStyle = `hsla(${hue}, 95%, 62%, 0.72)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      path.points.forEach((point, pointIndex) => {
        const sx = viewX + point.x * viewSize;
        const sy = viewY + point.y * viewSize;
        if (pointIndex === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    });

    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText("iteration bands: early rows are big/coarse, later rows are small/intricate", stairX, stairY - 12);
    scene.stepStats.forEach((step, index) => {
      const y = stairY + index * (rowH + rowGap);
      const isActive = index === currentStepIndex;
      const width = Math.max(22, stairW * Math.sqrt(step.density * 16));
      const x = stairX + (stairW - width) * 0.5;
      const hue = 205 + step.complexity * 105;

      ctx.fillStyle = isActive ? "#071016" : "#101722";
      ctx.fillRect(stairX, y, stairW, rowH);
      ctx.fillStyle = `hsla(${hue}, 90%, ${isActive ? 64 : 48}%, ${isActive ? 0.95 : 0.62})`;
      ctx.fillRect(x, y + 1, width, Math.max(2, rowH - 2));
      ctx.strokeStyle = isActive ? "#00e5ff" : "#273347";
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(stairX, y, stairW, rowH);
      ctx.fillStyle = isActive ? "#dffbff" : "#93a4b9";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${step.iter}`, stairX - 34, y + rowH * 0.72);

      const contour = step.contours[0];
      if (contour) {
        ctx.strokeStyle = "rgba(255,255,255,0.42)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        contour.points.forEach((point, pointIndex) => {
          const sx = stairX + point.x * stairW;
          const sy = y + point.y * rowH;
          if (pointIndex === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
    });

    const activeY = stairY + currentStepIndex * (rowH + rowGap) + rowH / 2;
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(stairX - 48, activeY);
    ctx.lineTo(stairX - 8, activeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stairX - 8, activeY, 4, 0, TAU);
    ctx.fillStyle = "#00e5ff";
    ctx.fill();

    const probeY = viewY + viewSize + 54;
    ctx.fillStyle = "#dce8f7";
    ctx.font = "14px sans-serif";
    ctx.fillText(`T = ${t.toFixed(3)} -> maxIter/time = ${currentIter}`, viewX, probeY);
    ctx.fillStyle = "#93a4b9";
    ctx.font = "13px sans-serif";
    ctx.fillText("The black region is the current sounding stripe. Its thickness is tone thickness; its wiggle is pitch/timbre motion.", viewX, probeY + 24);
    ctx.fillText("This page is the saved continuous slide version; Striped Staircase now explores discrete stripe steps.", viewX, probeY + 44);
  }, [bandWidth, contoursShown, endIter, scene, startIter, t]);

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
        <title>Gradient Slide | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Gradient Slide
        </h1>
        <p style={{ maxWidth: 980, opacity: 0.82, lineHeight: 1.5 }}>
          This page preserves the previous Striped Staircase sketch as-is: a continuous active band slides through max-iteration depth, with contour outlines showing where the current sounding band sits.
        </p>

        <div className="controls" style={{ marginBottom: "1rem" }}>
          <button className="preset-btn" onClick={() => setAnimate((v) => !v)}>
            {animate ? "pause T" : "animate T"}
          </button>
          <Slider label="T" value={t} min={0} max={1} step={0.001} onChange={setT} />
          <Slider label="Start Iter" value={startIter} min={2} max={180} step={1} onChange={setStartIter} />
          <Slider label="End Iter" value={endIter} min={120} max={900} step={1} onChange={setEndIter} />
          <Slider label="Stripe Thickness" value={bandWidth} min={0.5} max={10} step={0.1} onChange={setBandWidth} />
          <Slider label="Band Rows" value={stairSteps} min={8} max={48} step={1} onChange={setStairSteps} />
          <Slider label="Contours Shown" value={contoursShown} min={1} max={42} step={1} onChange={setContoursShown} />
        </div>

        <canvas
          ref={canvasRef}
          width={1100}
          height={820}
          style={{ width: "100%", maxWidth: 1100, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>Why This Page Exists</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            This keeps the smooth gradient-slide idea available for comparison. It is useful as a continuous depth scanner, while the new Striped Staircase is a discrete threshold-to-threshold rhythm model.
          </p>
        </section>
      </div>
    </>
  );
}
