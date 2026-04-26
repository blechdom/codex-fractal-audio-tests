import Head from "next/head";
import Link from "next/link";
import { el, type NodeRepr_t } from "@elemaudio/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import * as engine from "@/audio/spectrum-engine";
import { clamp01, computeViewport, fractalPointMetrics, lerp } from "@/lib/fractal-core";
import { computeEdgeField } from "@/lib/fractal-playback-schemes";
import { contourControlsFromSegments, marchingSquaresSegments } from "@/lib/contour-tracer";

const ACCENT = "#8ecae6";

type PlayMode = "angle-scan" | "center-orbit";

function buildGraph(freq: number, amp: number, noiseMix: number, output: number): NodeRepr_t {
  const tone = el.cycle(el.sm(el.const({ key: "jb-freq", value: freq })));
  const noise = el.bandpass(el.const({ key: "jb-noise-cut", value: Math.min(12000, freq * 1.8) }), 1.3, el.noise());
  const sig = el.add(
    el.mul(tone, el.const({ key: "jb-tg", value: amp * (1 - noiseMix) })),
    el.mul(noise, el.const({ key: "jb-ng", value: amp * noiseMix }))
  );
  const limited = el.tanh(el.mul(sig, 1.6));
  return el.scope({ name: "scope" }, el.mul(limited, el.sm(el.const({ key: "jb-master", value: output }))));
}

export default function JuliaBoundaryLabPage() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.6);
  const [scanHz, setScanHz] = useState(16);
  const [noiseMix, setNoiseMix] = useState(0.17);
  const [zoom, setZoom] = useState(0.42);
  const [maxIter, setMaxIter] = useState(260);
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [boundaryThreshold, setBoundaryThreshold] = useState(0.52);
  const [playMode, setPlayMode] = useState<PlayMode>("angle-scan");
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const frame = useMemo(() => {
    const width = 280;
    const height = 180;
    const viewport = computeViewport({ zoom, centerX, centerY, time: 0 });
    const smooth = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const ny = y / Math.max(1, height - 1);
      const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
      for (let x = 0; x < width; x += 1) {
        const nx = x / Math.max(1, width - 1);
        const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
        const p = fractalPointMetrics(cx, cy, maxIter, {
          fractalType: "julia",
          juliaCx,
          juliaCy,
        });
        smooth[y * width + x] = p.smoothNorm;
      }
    }
    const edge = computeEdgeField(smooth, width, height, 4.8);
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < edge.length; i += 1) {
      const s = smooth[i];
      const e = edge[i];
      const r = clamp01(0.65 * e + 0.35 * s);
      const g = clamp01(0.32 * s + 0.22 * e);
      const b = clamp01(0.55 * (1 - e) + 0.45 * s);
      const p = i * 4;
      pixels[p] = Math.floor(255 * r);
      pixels[p + 1] = Math.floor(255 * g);
      pixels[p + 2] = Math.floor(255 * b);
      pixels[p + 3] = 255;
    }
    return { width, height, smooth, edge, pixels };
  }, [centerX, centerY, juliaCx, juliaCy, maxIter, zoom]);

  const segments = useMemo(
    () => marchingSquaresSegments(frame.smooth, frame.width, frame.height, boundaryThreshold, 8000),
    [boundaryThreshold, frame]
  );
  const controls = useMemo(
    () => contourControlsFromSegments(segments, frame.width, frame.height, 1500),
    [frame.height, frame.width, segments]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const playingRef = useRef(false);
  const tickRef = useRef<() => void>(() => {});
  const lastScopeUiMsRef = useRef(0);
  const lastStepUiMsRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0);
    segments.forEach((s, i) => {
      const active = i === activeIdx;
      ctx.lineWidth = active ? 1.4 : 1;
      // Bright yellow contour overlay for easier boundary visibility.
      ctx.strokeStyle = active
        ? "rgba(255, 245, 120, 0.98)"
        : "rgba(255, 220, 70, 0.55)";
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    });
  }, [activeIdx, frame, segments]);

  useEffect(() => {
    engine.onScope((data) => {
      if (!playingRef.current) return;
      const now = performance.now();
      if (now - lastScopeUiMsRef.current < 80) return;
      lastScopeUiMsRef.current = now;
      setScopeData(data);
    });
  }, []);

  const renderTick = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now();
    if (!t0Ref.current) t0Ref.current = now;
    if (controls.length === 0) {
      engine.render(el.const({ key: "jb-silence", value: 0 }));
      rafRef.current = requestAnimationFrame(tickRef.current);
      return;
    }
    const t = (now - t0Ref.current) * 0.001;
    const idx = Math.floor(t * scanHz) % controls.length;
    const ctl = controls[idx];
    const angleFreq = 90 + ctl.angle * 8.2;
    const centerDist = Math.hypot(ctl.cx - 0.5, ctl.cy - 0.5);
    const orbitFreq = 120 + (1 - centerDist) * 1200;
    const freq = playMode === "angle-scan" ? angleFreq : orbitFreq;
    const localPhase = (t * scanHz) % 1;
    const amp = Math.exp(-localPhase * (3.2 + ctl.duration * 2));
    engine.render(buildGraph(freq, amp, noiseMix, output));
    if (now - lastStepUiMsRef.current > 70) {
      lastStepUiMsRef.current = now;
      setActiveIdx(idx);
    }
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [controls, noiseMix, output, playMode, scanHz]);

  useEffect(() => {
    tickRef.current = renderTick;
  }, [renderTick]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      engine.suspend();
    },
    []
  );

  const togglePlay = async () => {
    if (!playingRef.current) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
      playingRef.current = true;
      t0Ref.current = 0;
      lastScopeUiMsRef.current = 0;
      lastStepUiMsRef.current = 0;
      tickRef.current();
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "jb-stop", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <>
      <Head>
        <title>Julia Boundary Lab | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Julia Boundary Lab
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45, maxWidth: 920 }}>
          Dedicated Julia-set boundary sonification lab. Boundary contours are extracted with
          marching-squares style sampling, then mapped to pitch/time from segment angle and geometry.
        </p>
        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            background: "#111",
            padding: "0.75rem",
            marginBottom: "0.85rem",
            maxWidth: 920,
            fontSize: "0.8rem",
            color: "#b8c3cc",
            lineHeight: 1.45,
          }}
        >
          <div style={{ color: "#cbe9ff", fontWeight: 600, marginBottom: "0.35rem" }}>
            Julia Process (step by step)
          </div>
          <div><strong>1) Generate Julia field:</strong> each pixel is iterated with fixed <code>Julia Cx/Cy</code> and current viewport (<code>Zoom</code>, <code>Center X/Y</code>, <code>Max Iter</code>).</div>
          <div><strong>2) Build boundary map:</strong> smooth values are converted to an edge-like field; <code>Boundary Th</code> chooses which level set is treated as the contour.</div>
          <div><strong>3) Trace contour segments:</strong> marching-squares-style extraction returns short line segments (shown in bright yellow).</div>
          <div><strong>4) Convert geometry to control stream:</strong> each segment contributes <code>angle</code>, <code>duration</code>, and position data.</div>
          <div><strong>5) Sonify over time:</strong> the transport scans segments at <code>Scan Hz</code>; angle/position map to pitch, segment length shapes decay, and <code>Noise Mix</code> blends tonal vs noisy timbre.</div>
          <div><strong>Play Mode:</strong> <code>angle-scan</code> emphasizes turning direction as pitch motion, while <code>center-orbit</code> emphasizes distance-from-center structure.</div>
        </div>

        <div className="transport">
          <button className="play-btn" style={{ borderColor: ACCENT, color: ACCENT }} onClick={togglePlay}>
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <div className="scope-wrap">
            <Oscilloscope data={scopeData} color={ACCENT} width={360} height={100} />
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={frame.width}
          height={frame.height}
          style={{
            width: "100%",
            maxWidth: 860,
            imageRendering: "pixelated",
            border: "1px solid #222",
            borderRadius: 6,
            background: "#090909",
            marginBottom: "0.9rem",
          }}
        />

        <div className="controls">
          <div className="presets">
            <span className="presets-label">Play Mode</span>
            {(["angle-scan", "center-orbit"] as PlayMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setPlayMode(m)}
                style={m === playMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          <Slider label="Scan Hz" value={scanHz} min={1} max={80} step={0.1} onChange={setScanHz} />
          <Slider label="Noise Mix" value={noiseMix} min={0} max={1} step={0.01} onChange={setNoiseMix} />
          <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
          <Slider label="Boundary Th" value={boundaryThreshold} min={0} max={1} step={0.001} onChange={setBoundaryThreshold} />
          <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
          <Slider label="Max Iter" value={maxIter} min={40} max={600} step={1} onChange={setMaxIter} />
          <Slider label="Center X" value={centerX} min={-2.2} max={2.2} step={0.00001} onChange={setCenterX} />
          <Slider label="Center Y" value={centerY} min={-2.2} max={2.2} step={0.00001} onChange={setCenterY} />
          <Slider label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCx} />
          <Slider label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCy} />
        </div>
      </div>
    </>
  );
}
