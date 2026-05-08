import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";

const ACCENT = "#90caf9";
const TAU = Math.PI * 2;

type TechniqueId = "escape" | "equipotential" | "distance" | "boundary" | "color-cycle";

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
};

const TECHNIQUES: Array<{ id: TechniqueId; label: string; description: string }> = [
  {
    id: "escape",
    label: "Escape-Time Contours",
    description: "Contours of equal smoothed escape iteration. These are literal bands in the Mandelbrot calculation.",
  },
  {
    id: "equipotential",
    label: "Equipotential Contours",
    description: "A logarithmic version of escape time. It tends to make smoother onion-like rings around exterior structure.",
  },
  {
    id: "distance",
    label: "Distance-Estimator Contours",
    description: "Contours of estimated distance from the fractal boundary, using the Mandelbrot derivative during iteration.",
  },
  {
    id: "boundary",
    label: "Inside/Outside Boundary",
    description: "Marching-squares traces where sampled points flip between inside and outside the set.",
  },
  {
    id: "color-cycle",
    label: "Color-Cycle Contours",
    description: "Contours through a cyclic stripe phase. These are close to the B/W visual bands that can become note triggers.",
  },
];

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function fract(x: number) {
  return x - Math.floor(x);
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

function mandelbrotMetrics(cx: number, cy: number, maxIter: number) {
  let zx = 0;
  let zy = 0;
  let dzx = 0;
  let dzy = 0;

  for (let iter = 0; iter < maxIter; iter += 1) {
    const nextDzx = 2 * (zx * dzx - zy * dzy) + 1;
    const nextDzy = 2 * (zx * dzy + zy * dzx);
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    const nextZy = 2 * zx * zy + cy;
    const nextZx = zx2 - zy2 + cx;

    zx = nextZx;
    zy = nextZy;
    dzx = nextDzx;
    dzy = nextDzy;

    const r2 = zx * zx + zy * zy;
    if (r2 > 16) {
      const r = Math.sqrt(r2);
      const smooth = iter + 1 - Math.log2(Math.log2(Math.max(2, r)));
      const derivative = Math.max(1e-12, Math.hypot(dzx, dzy));
      const distance = (Math.log(r) * r) / derivative;
      return {
        escaped: true,
        escape: clamp01(smooth / maxIter),
        potential: clamp01(Math.log1p(Math.max(0, smooth)) / Math.log1p(maxIter)),
        distance: clamp01(Math.log10(1 + Math.max(0, distance) * 200000) / 3),
      };
    }
  }

  return {
    escaped: false,
    escape: 1,
    potential: 1,
    distance: 0,
  };
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

function preparePath(points: Point[], threshold: number): ContourPath {
  const cumulative = [0];
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(length);
  }
  return { points, threshold, length, cumulative };
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
    if (path.points.length > 4 && path.length > 0.025) paths.push(path);
  });

  return paths;
}

function sampleField(values: Float32Array, w: number, h: number, point: Point) {
  const x = clamp01(point.x) * (w - 1);
  const y = clamp01(point.y) * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = values[y0 * w + x0] * (1 - tx) + values[y0 * w + x1] * tx;
  const b = values[y1 * w + x0] * (1 - tx) + values[y1 * w + x1] * tx;
  return a * (1 - ty) + b * ty;
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

function thresholdsFor(technique: TechniqueId, values: Float32Array, levelCount: number) {
  if (technique === "boundary") return [0.5];

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  if (technique === "color-cycle") {
    return Array.from({ length: Math.max(1, levelCount) }, (_, i) => (i + 1) / (levelCount + 1));
  }

  const lo = min + (max - min) * 0.08;
  const hi = min + (max - min) * 0.92;
  return Array.from({ length: Math.max(1, levelCount) }, (_, i) => lo + ((hi - lo) * (i + 1)) / (levelCount + 1));
}

export default function RealContourPathsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [technique, setTechnique] = useState<TechniqueId>("equipotential");
  const [t, setT] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [pathCount, setPathCount] = useState(16);
  const [levelCount, setLevelCount] = useState(16);
  const [colorCycle, setColorCycle] = useState(22);
  const [maxIter, setMaxIter] = useState(360);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;

    const grid = 220;
    const laneSteps = 240;
    const escape = new Float32Array(grid * grid);
    const potential = new Float32Array(grid * grid);
    const distance = new Float32Array(grid * grid);
    const boundary = new Float32Array(grid * grid);
    const phase = new Float32Array(grid * grid);
    const audio = new Float32Array(grid * grid);

    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) {
        const idx = y * grid + x;
        const c = sampleComplex(x / (grid - 1), y / (grid - 1));
        const m = mandelbrotMetrics(c.x, c.y, maxIter);
        escape[idx] = m.escape;
        potential[idx] = m.potential;
        distance[idx] = m.distance;
        boundary[idx] = m.escaped ? 0 : 1;
        phase[idx] = m.escaped ? fract(m.potential * colorCycle) : 0;
        audio[idx] = phase[idx] >= 0.5 ? 1 : 0;
      }
    }

    const fields: Record<TechniqueId, Float32Array> = {
      escape,
      equipotential: potential,
      distance,
      boundary,
      "color-cycle": phase,
    };
    const values = fields[technique];
    const thresholds = thresholdsFor(technique, values, Math.round(levelCount));
    const segments = thresholds.flatMap((threshold) => extractSegments(values, grid, grid, threshold));
    const allPaths = stitchSegments(segments).sort((a, b) => b.length - a.length);
    const selectedPaths = allPaths.slice(0, Math.max(1, Math.round(pathCount)));

    const fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = grid;
    fieldCanvas.height = grid;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) return null;
    const image = fieldCtx.createImageData(grid, grid);
    for (let i = 0; i < values.length; i += 1) {
      const scalar = clamp01(values[i]);
      const block = audio[i] > 0.5 ? 34 : 0;
      const shade = Math.round(22 + scalar * 190 + block);
      image.data[i * 4] = shade;
      image.data[i * 4 + 1] = shade;
      image.data[i * 4 + 2] = shade;
      image.data[i * 4 + 3] = 255;
    }
    fieldCtx.putImageData(image, 0, 0);

    const laneValues = selectedPaths.map((path) =>
      Array.from({ length: laneSteps }, (_, i) => {
        const p = samplePath(path, i / laneSteps);
        return sampleField(audio, grid, grid, p) >= 0.5 ? 1 : 0;
      }),
    );

    return {
      allPathCount: allPaths.length,
      fieldCanvas,
      grid,
      laneSteps,
      laneValues,
      selectedPaths,
    };
  }, [colorCycle, levelCount, maxIter, pathCount, technique]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1020;
    const h = 780;
    const viewX = 24;
    const viewY = 92;
    const viewSize = 560;
    const stripX = 634;
    const stripY = 92;
    const stripW = 340;
    const laneCount = scene.selectedPaths.length;
    const stripH = laneCount > 24 ? 10 : laneCount > 16 ? 14 : 20;
    const stripGap = laneCount > 24 ? 3 : 6;

    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACCENT;
    ctx.font = "24px sans-serif";
    ctx.fillText("Real Contour Path Techniques", 24, 38);
    ctx.fillStyle = "#b9c7d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("These paths are extracted from Mandelbrot scalar fields with marching squares, then played with shared T.", 24, 64);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene.fieldCanvas, viewX, viewY, viewSize, viewSize);
    ctx.strokeStyle = "#334055";
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewSize, viewSize);

    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText(`${TECHNIQUES.find((item) => item.id === technique)?.label ?? technique}: showing ${laneCount} of ${scene.allPathCount} extracted paths`, viewX, viewY - 12);
    ctx.fillText("Right strips sample the B/W stripe field along each contour path", stripX, stripY - 12);

    scene.selectedPaths.forEach((path, index) => {
      const hue = (index * 360) / Math.max(1, laneCount);
      ctx.strokeStyle = `hsla(${hue}, 88%, 66%, 0.76)`;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      path.points.forEach((point, pointIndex) => {
        const sx = viewX + point.x * viewSize;
        const sy = viewY + point.y * viewSize;
        if (pointIndex === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      const p = samplePath(path, t);
      const stepIndex = Math.floor(t * scene.laneSteps) % scene.laneSteps;
      const prevIndex = (stepIndex + scene.laneSteps - 1) % scene.laneSteps;
      const crossing = scene.laneValues[index]?.[stepIndex] !== scene.laneValues[index]?.[prevIndex];
      ctx.fillStyle = crossing ? "#ffffff" : `hsl(${hue}, 95%, 62%)`;
      ctx.beginPath();
      ctx.arc(viewX + p.x * viewSize, viewY + p.y * viewSize, crossing ? 5.5 : 3.7, 0, TAU);
      ctx.fill();

      const rowY = stripY + index * (stripH + stripGap);
      ctx.fillStyle = "#141a24";
      ctx.fillRect(stripX, rowY, stripW, stripH);
      for (let i = 0; i < scene.laneSteps; i += 1) {
        const value = scene.laneValues[index]?.[i] ?? 0;
        ctx.fillStyle = value ? "#e9edf4" : "#05070a";
        ctx.fillRect(stripX + (i * stripW) / scene.laneSteps, rowY, Math.ceil(stripW / scene.laneSteps), stripH);
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
    ctx.fillText(`T = ${t.toFixed(3)}`, stripX, stripY + laneCount * (stripH + stripGap) + 24);
    ctx.fillStyle = "#93a4b9";
    ctx.font = "13px sans-serif";
    ctx.fillText("The paths are real contours; the dots are playheads moving along path arclength.", stripX, stripY + laneCount * (stripH + stripGap) + 46);
    ctx.fillText("The strips ask: what B/W stripe values would this contour hear as time moves forward?", stripX, stripY + laneCount * (stripH + stripGap) + 66);
  }, [scene, t, technique]);

  useEffect(() => {
    if (!animate) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((old) => fract(old + dt * 0.045));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [animate]);

  const selectedTechnique = TECHNIQUES.find((item) => item.id === technique);

  return (
    <>
      <Head>
        <title>Real Contour Paths | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Real Contour Path Techniques
        </h1>
        <p style={{ maxWidth: 960, opacity: 0.82, lineHeight: 1.5 }}>
          This version replaces the synthetic rainbow onions with real contour paths extracted from Mandelbrot data. The paths are discrete in code because playheads need point lists, but each one approximates a continuous contour in the underlying field.
        </p>

        <div className="controls" style={{ marginBottom: "1rem" }}>
          <button className="preset-btn" onClick={() => setAnimate((v) => !v)}>
            {animate ? "pause T" : "animate T"}
          </button>
          <label className="slider-row">
            <span className="slider-label">Path Technique</span>
            <select value={technique} onChange={(event) => setTechnique(event.target.value as TechniqueId)}>
              {TECHNIQUES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Slider label="T" value={t} min={0} max={1} step={0.001} onChange={setT} />
          <Slider label="Paths Shown" value={pathCount} min={1} max={32} step={1} onChange={setPathCount} />
          <Slider label="Contour Levels" value={levelCount} min={1} max={32} step={1} onChange={setLevelCount} />
          <Slider label="Color Cycle" value={colorCycle} min={2} max={80} step={0.1} onChange={setColorCycle} />
          <Slider label="Max Iter" value={maxIter} min={64} max={700} step={1} onChange={setMaxIter} />
        </div>

        <canvas
          ref={canvasRef}
          width={1020}
          height={780}
          style={{ width: "100%", maxWidth: 1020, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>{selectedTechnique?.label}</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>{selectedTechnique?.description}</p>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            The discrete path list is an implementation detail: marching squares gives line segments, those segments are stitched into polylines, and the playhead moves by arclength. Musically, each path can become one voice, and shared T is the conductor.
          </p>
        </section>

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>Why These Paths Matter</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            This page asks the opposite question from a raster scan. Instead of reading rows and columns, it first derives meaningful shapes from the fractal field. A contour is a place where some hidden scalar relationship stays constant: equal escape time, equal potential, equal estimated distance, equal boundary membership, or equal color-cycle phase.
          </p>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            Marching squares turns those relationships into drawable polylines. The browser stores them as discrete point lists, but the musical idea is continuous: a voice can travel around the contour by arclength, or the contour can act as a resonant frame that shapes another rhythm.
          </p>
          <ul style={{ marginBottom: 0, opacity: 0.84, lineHeight: 1.55 }}>
            <li>Escape-time contours show iteration bands: recursion depth as shape.</li>
            <li>Equipotential contours smooth those bands into more onion-like flow.</li>
            <li>Distance contours emphasize nearness to boundary structure.</li>
            <li>Boundary contours trace inside/outside transitions.</li>
            <li>Color-cycle contours follow the stripe phase that can become rhythm.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
