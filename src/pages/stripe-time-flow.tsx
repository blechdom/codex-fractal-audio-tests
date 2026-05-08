import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";

const ACCENT = "#90caf9";
const TAU = Math.PI * 2;

type Point = {
  x: number;
  y: number;
};

type Segment = {
  a: Point;
  b: Point;
  threshold: number;
  used?: boolean;
};

type ContourPath = {
  points: Point[];
  threshold: number;
  length: number;
  cumulative: number[];
  bend: number;
};

type TimeMode = "depth-cycle" | "depth" | "cycle";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function fract(x: number) {
  return x - Math.floor(x);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

function mandelbrotSmoothIter(cx: number, cy: number, maxIter: number) {
  let zx = 0;
  let zy = 0;

  for (let iter = 0; iter < maxIter; iter += 1) {
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;

    const r2 = zx * zx + zy * zy;
    if (r2 > 16) {
      const r = Math.sqrt(r2);
      return iter + 1 - Math.log2(Math.log2(Math.max(2, r)));
    }
  }

  return maxIter + 1;
}

function interpolate(a: Point, b: Point, va: number, vb: number, threshold: number): Point {
  const denom = vb - va;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : clamp01((threshold - va) / denom);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function extractSegments(values: Float32Array, w: number, h: number, threshold: number) {
  const segments: Segment[] = [];

  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const i0 = y * w + x;
      const i1 = i0 + 1;
      const i3 = i0 + w;
      const i2 = i3 + 1;
      const v0 = values[i0];
      const v1 = values[i1];
      const v2 = values[i2];
      const v3 = values[i3];
      const p0 = { x: x / (w - 1), y: y / (h - 1) };
      const p1 = { x: (x + 1) / (w - 1), y: y / (h - 1) };
      const p2 = { x: (x + 1) / (w - 1), y: (y + 1) / (h - 1) };
      const p3 = { x: x / (w - 1), y: (y + 1) / (h - 1) };
      const hits: Point[] = [];

      if ((v0 < threshold) !== (v1 < threshold)) hits.push(interpolate(p0, p1, v0, v1, threshold));
      if ((v1 < threshold) !== (v2 < threshold)) hits.push(interpolate(p1, p2, v1, v2, threshold));
      if ((v2 < threshold) !== (v3 < threshold)) hits.push(interpolate(p2, p3, v2, v3, threshold));
      if ((v3 < threshold) !== (v0 < threshold)) hits.push(interpolate(p3, p0, v3, v0, threshold));

      if (hits.length === 2) {
        segments.push({ a: hits[0], b: hits[1], threshold });
      } else if (hits.length === 4) {
        segments.push({ a: hits[0], b: hits[1], threshold });
        segments.push({ a: hits[2], b: hits[3], threshold });
      }
    }
  }

  return segments;
}

function pointKey(p: Point) {
  return `${Math.round(p.x * 10000)}:${Math.round(p.y * 10000)}`;
}

function pathBend(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = TAU - d;
    total += d;
  }
  return total / Math.max(1, points.length - 2);
}

function preparePath(points: Point[], threshold: number): ContourPath {
  const cumulative = [0];
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(length);
  }
  return { points, threshold, length, cumulative, bend: pathBend(points) };
}

function stitchSegments(segments: Segment[]) {
  const byEndpoint = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    [pointKey(segment.a), pointKey(segment.b)].forEach((key) => {
      const list = byEndpoint.get(key) ?? [];
      list.push(index);
      byEndpoint.set(key, list);
    });
  });

  const paths: ContourPath[] = [];

  const extend = (points: Point[], atFront: boolean) => {
    while (true) {
      const key = pointKey(atFront ? points[0] : points[points.length - 1]);
      const nextIndex = byEndpoint.get(key)?.find((index) => !segments[index].used);
      if (nextIndex === undefined) return;

      const segment = segments[nextIndex];
      segment.used = true;
      const other = pointKey(segment.a) === key ? segment.b : segment.a;
      if (atFront) points.unshift(other);
      else points.push(other);
    }
  };

  segments.forEach((segment) => {
    if (segment.used) return;
    segment.used = true;
    const points = [segment.a, segment.b];
    extend(points, false);
    extend(points, true);
    const path = preparePath(points, segment.threshold);
    if (path.points.length > 5 && path.length > 0.025) paths.push(path);
  });

  return paths;
}

function samplePath(path: ContourPath, t: number) {
  if (path.points.length <= 1 || path.length <= 0) return path.points[0] ?? { x: 0.5, y: 0.5 };
  const target = fract(t) * path.length;
  let hi = path.cumulative.findIndex((value) => value >= target);
  if (hi <= 0) hi = 1;
  const lo = hi - 1;
  const segLen = path.cumulative[hi] - path.cumulative[lo];
  const local = segLen <= 1e-9 ? 0 : (target - path.cumulative[lo]) / segLen;
  const a = path.points[lo];
  const b = path.points[hi];
  return {
    x: a.x + (b.x - a.x) * local,
    y: a.y + (b.y - a.y) * local,
  };
}

function sampleSmoothIter(field: Float32Array, grid: number, point: Point) {
  const x = clamp01(point.x) * (grid - 1);
  const y = clamp01(point.y) * (grid - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid - 1, x0 + 1);
  const y1 = Math.min(grid - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = field[y0 * grid + x0] * (1 - tx) + field[y0 * grid + x1] * tx;
  const b = field[y1 * grid + x0] * (1 - tx) + field[y1 * grid + x1] * tx;
  return a * (1 - ty) + b * ty;
}

function soundAt(smoothIter: number, currentIter: number, colorCycle: number, phase: number, maxIter: number) {
  if (smoothIter > currentIter || smoothIter > maxIter) return 0;
  const potential = clamp01(Math.log1p(Math.max(0, smoothIter)) / Math.log1p(currentIter));
  return fract(potential * colorCycle + phase) >= 0.5 ? 1 : 0;
}

function soundDensityOnPath(path: ContourPath, field: Float32Array, grid: number, currentIter: number, colorCycle: number, phase: number, maxIter: number) {
  const samples = 96;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const p = samplePath(path, i / samples);
    const smoothIter = sampleSmoothIter(field, grid, p);
    sum += soundAt(smoothIter, currentIter, colorCycle, phase, maxIter);
  }
  return sum / samples;
}

export default function StripeTimeFlowPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [timeMode, setTimeMode] = useState<TimeMode>("depth-cycle");
  const [pathCount, setPathCount] = useState(16);
  const [contourLevels, setContourLevels] = useState(16);
  const [startIter, setStartIter] = useState(60);
  const [endIter, setEndIter] = useState(560);
  const [startCycle, setStartCycle] = useState(8);
  const [endCycle, setEndCycle] = useState(42);
  const [phaseTravel, setPhaseTravel] = useState(1);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;

    const grid = 220;
    const maxIter = Math.max(startIter + 1, Math.round(endIter));
    const smoothIters = new Float32Array(grid * grid);
    const contourField = new Float32Array(grid * grid);

    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) {
        const idx = y * grid + x;
        const c = sampleComplex(x / (grid - 1), y / (grid - 1));
        const smoothIter = mandelbrotSmoothIter(c.x, c.y, maxIter);
        smoothIters[idx] = smoothIter;
        contourField[idx] = clamp01(Math.log1p(Math.min(smoothIter, maxIter)) / Math.log1p(maxIter));
      }
    }

    const thresholds = Array.from({ length: Math.max(1, Math.round(contourLevels)) }, (_, i) => 0.08 + (0.84 * (i + 1)) / (contourLevels + 1));
    const segments = thresholds.flatMap((threshold) => extractSegments(contourField, grid, grid, threshold));
    const selectedPaths = stitchSegments(segments)
      .sort((a, b) => b.length - a.length)
      .slice(0, Math.max(1, Math.round(pathCount)));

    return { grid, maxIter, selectedPaths, smoothIters };
  }, [contourLevels, endIter, pathCount, startIter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1040;
    const h = 790;
    const viewX = 24;
    const viewY = 100;
    const viewSize = 560;
    const stripX = 634;
    const stripY = 100;
    const stripW = 360;
    const laneCount = scene.selectedPaths.length;
    const stripH = laneCount > 24 ? 10 : laneCount > 16 ? 14 : 20;
    const stripGap = laneCount > 24 ? 3 : 6;
    const timelineSteps = 220;

    const depthT = timeMode === "cycle" ? 1 : t;
    const cycleT = timeMode === "depth" ? 0 : t;
    const currentIter = Math.round(lerp(startIter, endIter, depthT));
    const currentCycle = lerp(startCycle, endCycle, cycleT);
    const currentPhase = t * phaseTravel;

    canvas.width = w;
    canvas.height = h;

    const fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = scene.grid;
    fieldCanvas.height = scene.grid;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) return;
    const image = fieldCtx.createImageData(scene.grid, scene.grid);
    for (let i = 0; i < scene.smoothIters.length; i += 1) {
      const sound = soundAt(scene.smoothIters[i], currentIter, currentCycle, currentPhase, scene.maxIter);
      const shade = sound ? 0 : 246;
      image.data[i * 4] = shade;
      image.data[i * 4 + 1] = shade;
      image.data[i * 4 + 2] = shade;
      image.data[i * 4 + 3] = 255;
    }
    fieldCtx.putImageData(image, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACCENT;
    ctx.font = "24px sans-serif";
    ctx.fillText("Stripe Time Flow: Going Deeper Into The Data", 24, 38);
    ctx.fillStyle = "#b9c7d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("Black is sound. White is silence. T changes iteration depth and color-cycle phase; contour paths shape the voices.", 24, 66);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fieldCanvas, viewX, viewY, viewSize, viewSize);
    ctx.strokeStyle = "#334055";
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewSize, viewSize);

    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText(`current depth ${currentIter} iter, color cycle ${currentCycle.toFixed(1)}, phase ${currentPhase.toFixed(2)}`, viewX, viewY - 12);
    ctx.fillText("Each row: black density along one contour as T evolves", stripX, stripY - 12);

    scene.selectedPaths.forEach((path, index) => {
      const hue = (index * 360) / Math.max(1, laneCount);
      const density = soundDensityOnPath(path, scene.smoothIters, scene.grid, currentIter, currentCycle, currentPhase, scene.maxIter);
      const thickness = 0.9 + density * 4.4;
      ctx.strokeStyle = `hsla(${hue}, 92%, 63%, ${0.38 + density * 0.52})`;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      path.points.forEach((point, pointIndex) => {
        const sx = viewX + point.x * viewSize;
        const sy = viewY + point.y * viewSize;
        if (pointIndex === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      const ornamentCount = Math.min(9, Math.floor(path.bend * 28));
      ctx.fillStyle = `hsla(${hue}, 95%, 70%, 0.9)`;
      for (let ornament = 0; ornament < ornamentCount; ornament += 1) {
        const p = samplePath(path, fract(t + ornament / Math.max(1, ornamentCount)));
        ctx.beginPath();
        ctx.arc(viewX + p.x * viewSize, viewY + p.y * viewSize, 1.5, 0, TAU);
        ctx.fill();
      }

      const rowY = stripY + index * (stripH + stripGap);
      ctx.fillStyle = "#f6f7fb";
      ctx.fillRect(stripX, rowY, stripW, stripH);
      let previousDensity = 0;
      for (let step = 0; step < timelineSteps; step += 1) {
        const tt = step / (timelineSteps - 1);
        const stepDepthT = timeMode === "cycle" ? 1 : tt;
        const stepCycleT = timeMode === "depth" ? 0 : tt;
        const stepIter = Math.round(lerp(startIter, endIter, stepDepthT));
        const stepCycle = lerp(startCycle, endCycle, stepCycleT);
        const stepPhase = tt * phaseTravel;
        const stepDensity = soundDensityOnPath(path, scene.smoothIters, scene.grid, stepIter, stepCycle, stepPhase, scene.maxIter);
        const shade = Math.round(246 - stepDensity * 246);
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(stripX + (step * stripW) / timelineSteps, rowY, Math.ceil(stripW / timelineSteps), stripH);
        if (Math.abs(stepDensity - previousDensity) > 0.22) {
          ctx.fillStyle = `hsla(${hue}, 95%, 60%, 0.75)`;
          ctx.fillRect(stripX + (step * stripW) / timelineSteps, rowY, 1, stripH);
        }
        previousDensity = stepDensity;
      }
      ctx.strokeStyle = `hsla(${hue}, 85%, 66%, 0.9)`;
      ctx.strokeRect(stripX, rowY, stripW, stripH);
      ctx.fillStyle = `hsl(${hue}, 95%, 68%)`;
      ctx.font = "10px sans-serif";
      ctx.fillText(String(index + 1).padStart(2, "0"), stripX - 24, rowY + Math.max(10, stripH - 4));
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
    ctx.fillText(`T = ${t.toFixed(3)}  |  depth as time, stripe phase as time`, stripX, stripY + laneCount * (stripH + stripGap) + 24);
    ctx.fillStyle = "#93a4b9";
    ctx.font = "13px sans-serif";
    ctx.fillText("Black row areas mean that contour voice is sounding; white areas mean rest/silence.", stripX, stripY + laneCount * (stripH + stripGap) + 46);
    ctx.fillText("Thicker colored contours have more black/sound density at the current depth.", stripX, stripY + laneCount * (stripH + stripGap) + 66);
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
        <title>Stripe Time Flow | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Stripe Time Flow
        </h1>
        <p style={{ maxWidth: 980, opacity: 0.82, lineHeight: 1.5 }}>
          This page treats the B/W stripe depth as time. The playheads are no longer simply walking around contour tracks. Instead, the contours are fixed resonant shapes, and T moves deeper through max iteration and color-cycle evolution. Black is sound. White is silence.
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
          <Slider label="Paths Shown" value={pathCount} min={1} max={32} step={1} onChange={setPathCount} />
          <Slider label="Contour Levels" value={contourLevels} min={1} max={32} step={1} onChange={setContourLevels} />
          <Slider label="Start Iter" value={startIter} min={12} max={240} step={1} onChange={setStartIter} />
          <Slider label="End Iter" value={endIter} min={120} max={900} step={1} onChange={setEndIter} />
          <Slider label="Start Cycle" value={startCycle} min={2} max={48} step={0.1} onChange={setStartCycle} />
          <Slider label="End Cycle" value={endCycle} min={2} max={96} step={0.1} onChange={setEndCycle} />
          <Slider label="Phase Travel" value={phaseTravel} min={0} max={6} step={0.01} onChange={setPhaseTravel} />
        </div>

        <canvas
          ref={canvasRef}
          width={1040}
          height={790}
          style={{ width: "100%", maxWidth: 1040, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>What This Is Saying</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            The stripes are time increments. As T moves, max iteration reveals deeper bands and color cycle moves the stripe phase. A contour with lots of black at the current moment becomes a thicker tone. A wiggly contour gets extra ornament dots, suggesting pitch fluctuation and melisma.
          </p>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            This keeps the contour shapes as the musical body, while the black/white stripe field supplies the rhythm: black means sound, white means silence.
          </p>
        </section>

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>Depth As Musical Time</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            In the contour page, T moved a playhead along a path. Here T changes the calculation itself. Increasing iteration depth lets structure that was previously unresolved become visible. Changing the color cycle moves the stripe phase through that structure. The result is closer to listening to recursion unfold than to scanning a finished image.
          </p>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            The contours remain essential, but they are no longer just tracks for dots. They are the bodies that the rhythm fits into. A broad black region can become a sustained tone. A narrow stripe can become a short pulse. A tightly packed stripe field can become tremolo, buzz, or granular rhythm.
          </p>
          <ul style={{ marginBottom: 0, opacity: 0.84, lineHeight: 1.55 }}>
            <li>Stripe depth maps to time: the music goes deeper into the recursive field.</li>
            <li>Stripe width maps to tone thickness: wider black areas imply longer or denser sound.</li>
            <li>Stripe spacing maps to rhythm: close bands imply faster alternation.</li>
            <li>Contour curvature maps to pitch fluctuation, panning, or timbral motion.</li>
            <li>Tiny noisy edge detail maps to melisma, grace notes, flutter, and ornament.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
