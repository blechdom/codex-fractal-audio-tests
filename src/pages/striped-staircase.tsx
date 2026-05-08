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

function inStep(smoothIter: number, low: number, high: number, softness: number) {
  const enter = clamp01((smoothIter - low) / Math.max(0.1, softness));
  const exit = clamp01((high - smoothIter) / Math.max(0.1, softness));
  return Math.min(enter, exit);
}

function stripeValue(smoothIter: number, stripePeriod: number) {
  return Math.floor(smoothIter / Math.max(0.5, stripePeriod)) % 2;
}

export default function StripedStaircasePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [startIter, setStartIter] = useState(18);
  const [endIter, setEndIter] = useState(640);
  const [stairSteps, setStairSteps] = useState(32);
  const [stripePeriod, setStripePeriod] = useState(7);
  const [edgeSoftness, setEdgeSoftness] = useState(1.4);
  const [contoursShown, setContoursShown] = useState(18);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;

    const grid = 230;
    const maxIter = Math.max(startIter + 1, Math.round(endIter));
    const { smoothIters } = buildMandelbrotFields(grid, maxIter);
    const stepCount = Math.max(4, Math.round(stairSteps));
    const boundaries = Array.from({ length: stepCount + 1 }, (_, i) => {
      const u = i / stepCount;
      // Exponential spacing gives more rows near the boundary, where later iteration bands get tiny.
      const curved = Math.pow(u, 1.7);
      return Math.round(lerp(startIter, endIter, curved));
    });

    const stepStats = Array.from({ length: stepCount }, (_, index) => {
      const low = boundaries[index];
      const high = Math.max(low + 1, boundaries[index + 1]);
      let density = 0;
      let stripeBlack = 0;
      for (let i = 0; i < smoothIters.length; i += 1) {
        const value = inStep(smoothIters[i], low, high, edgeSoftness);
        density += value;
        if (value > 0 && stripeValue(smoothIters[i], stripePeriod) === 1) stripeBlack += value;
      }
      const contours = stitchSegments(extractSegments(smoothIters, grid, grid, low)).sort((a, b) => b.length - a.length);
      const complexity =
        contours.slice(0, 8).reduce((sum, path) => sum + path.bend * path.length, 0) / Math.max(0.001, contours.slice(0, 8).reduce((sum, path) => sum + path.length, 0));
      return {
        complexity: clamp01(complexity * 3.5),
        contours: contours.slice(0, 4),
        density: density / smoothIters.length,
        high,
        low,
        stripeBlack: stripeBlack / Math.max(1, density),
      };
    });

    return { boundaries, grid, maxIter, smoothIters, stepStats };
  }, [edgeSoftness, endIter, stairSteps, startIter, stripePeriod]);

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
    const currentStepIndex = Math.min(scene.stepStats.length - 1, Math.floor(t * scene.stepStats.length));
    const currentStep = scene.stepStats[currentStepIndex];
    const localT = fract(t * scene.stepStats.length);
    const thresholdIter = Math.round(lerp(currentStep.low, currentStep.high, localT));

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACCENT;
    ctx.font = "24px sans-serif";
    ctx.fillText("Striped Staircase: Whole Stripes As Time Steps", 24, 38);
    ctx.fillStyle = "#b9c7d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("T advances from threshold to threshold. The active black chunk is the whole stripe step, not a playhead on its boundary.", 24, 66);

    const activeCanvas = document.createElement("canvas");
    activeCanvas.width = scene.grid;
    activeCanvas.height = scene.grid;
    const activeCtx = activeCanvas.getContext("2d");
    if (!activeCtx) return;
    const activeImage = activeCtx.createImageData(scene.grid, scene.grid);
    for (let i = 0; i < scene.smoothIters.length; i += 1) {
      const originalStripe = stripeValue(scene.smoothIters[i], stripePeriod);
      const active = inStep(scene.smoothIters[i], currentStep.low, currentStep.high, edgeSoftness);
      const passed = scene.smoothIters[i] < currentStep.low ? 1 : 0;
      const base = originalStripe ? 44 : 238;
      const shade = active > 0 ? Math.round(245 - active * 245) : passed ? Math.round(base * 0.72 + 54) : base;
      activeImage.data[i * 4] = shade;
      activeImage.data[i * 4 + 1] = shade;
      activeImage.data[i * 4 + 2] = active > 0 ? shade : Math.min(255, shade + 8);
      activeImage.data[i * 4 + 3] = 255;
    }
    activeCtx.putImageData(activeImage, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(activeCanvas, viewX, viewY, viewSize, viewSize);
    ctx.strokeStyle = "#334055";
    ctx.strokeRect(viewX, viewY, viewSize, viewSize);
    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText(`active step: iter ${currentStep.low} to ${currentStep.high}; threshold crossing ${thresholdIter}`, viewX, viewY - 12);

    const lowContours = stitchSegments(extractSegments(scene.smoothIters, scene.grid, scene.grid, currentStep.low))
      .sort((a, b) => b.length - a.length)
      .slice(0, Math.round(contoursShown));
    const highContours = stitchSegments(extractSegments(scene.smoothIters, scene.grid, scene.grid, currentStep.high))
      .sort((a, b) => b.length - a.length)
      .slice(0, Math.max(1, Math.round(contoursShown / 2)));
    lowContours.forEach((path, index) => {
      const hue = 190 + (index * 70) / Math.max(1, lowContours.length);
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
    highContours.forEach((path) => {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 0.9;
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
    ctx.fillText("each row is one whole threshold interval; cyan marks the current step", stairX, stairY - 12);
    scene.stepStats.forEach((step, index) => {
      const y = stairY + index * (rowH + rowGap);
      const isActive = index === currentStepIndex;
      const width = Math.max(18, stairW * Math.sqrt(step.density * 18));
      const x = stairX + (stairW - width) * 0.5;
      const hue = 205 + step.complexity * 105;

      ctx.fillStyle = isActive ? "#071016" : "#101722";
      ctx.fillRect(stairX, y, stairW, rowH);
      ctx.fillStyle = "#f6f7fb";
      ctx.fillRect(x, y + 1, width, Math.max(2, rowH - 2));
      ctx.fillStyle = `hsla(${hue}, 90%, ${isActive ? 34 : 26}%, ${isActive ? 0.98 : 0.64})`;
      ctx.fillRect(x, y + 1, width * clamp01(0.25 + step.stripeBlack * 0.95), Math.max(2, rowH - 2));
      ctx.strokeStyle = isActive ? "#00e5ff" : "#273347";
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(stairX, y, stairW, rowH);
      ctx.fillStyle = isActive ? "#dffbff" : "#93a4b9";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${step.low}`, stairX - 34, y + rowH * 0.72);

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
    ctx.fillText(`T = ${t.toFixed(3)} -> step ${currentStepIndex + 1}/${scene.stepStats.length}, iter ${currentStep.low}-${currentStep.high}`, viewX, probeY);
    ctx.fillStyle = "#93a4b9";
    ctx.font = "13px sans-serif";
    ctx.fillText("The background keeps the original B/W stripe field. The current threshold interval becomes the black sounding chunk.", viewX, probeY + 24);
    ctx.fillText("Time is a staircase: pass one threshold, reveal the whole next stripe step.", viewX, probeY + 44);
  }, [contoursShown, edgeSoftness, endIter, scene, startIter, stripePeriod, t]);

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
        <title>Striped Staircase | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Striped Staircase
        </h1>
        <p style={{ maxWidth: 980, opacity: 0.82, lineHeight: 1.5 }}>
          This is the discrete stripe-time model. Time is not a playhead moving along a contour. Time passes threshold to threshold: the whole current stripe interval turns into the black sounding chunk, then the next interval becomes the next step.
        </p>

        <div className="controls" style={{ marginBottom: "1rem" }}>
          <button className="preset-btn" onClick={() => setAnimate((v) => !v)}>
            {animate ? "pause T" : "animate T"}
          </button>
          <Slider label="T" value={t} min={0} max={1} step={0.001} onChange={setT} />
          <Slider label="Start Iter" value={startIter} min={2} max={180} step={1} onChange={setStartIter} />
          <Slider label="End Iter" value={endIter} min={120} max={900} step={1} onChange={setEndIter} />
          <Slider label="Stair Steps" value={stairSteps} min={8} max={48} step={1} onChange={setStairSteps} />
          <Slider label="Original Stripe Period" value={stripePeriod} min={1} max={24} step={0.1} onChange={setStripePeriod} />
          <Slider label="Step Edge Softness" value={edgeSoftness} min={0.2} max={8} step={0.1} onChange={setEdgeSoftness} />
          <Slider label="Contours Shown" value={contoursShown} min={1} max={42} step={1} onChange={setContoursShown} />
        </div>

        <canvas
          ref={canvasRef}
          width={1100}
          height={820}
          style={{ width: "100%", maxWidth: 1100, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>What Changed From Stripe Time Flow?</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            The earlier flow still had traces of a playhead model. This page treats the stripe itself as the clock. The active band is the current moment. The next moment is the next escape-depth interval, closer to the boundary, usually smaller and more detailed.
          </p>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            That means the musical motion is perpendicular to contour traversal: big stripe, smaller stripe, smaller stripe, intricate stripe. The contours outline the thresholds between steps, but the listener steps through the stripes rather than walking along the rails.
          </p>
        </section>
      </div>
    </>
  );
}
