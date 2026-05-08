import Head from "next/head";
import Link from "next/link";
import { el, type NodeRepr_t } from "@elemaudio/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import * as engine from "@/audio/spectrum-engine";
import {
  type RecursiveColoringMode,
  type RecursivePlottingMode,
  generateRecursiveFrame,
} from "@/lib/recursive-sound-chunks";
import { contourControlsFromSegments, marchingSquaresSegments } from "@/lib/contour-tracer";
import { type DataSourceKind } from "@/lib/fractal-core";

const ACCENT = "#80ed99";

function buildGraph(freq: number, amp: number, noiseMix: number, output: number): NodeRepr_t {
  const tone = el.cycle(el.sm(el.const({ key: "rs-v3-freq", value: freq })));
  const noise = el.bandpass(
    el.const({ key: "rs-v3-noise-cut", value: Math.min(12000, freq * 2.4) }),
    1.4,
    el.noise()
  );
  const sig = el.add(
    el.mul(tone, el.const({ key: "rs-v3-tone-g", value: amp * (1 - noiseMix) })),
    el.mul(noise, el.const({ key: "rs-v3-noise-g", value: amp * noiseMix }))
  );
  const limited = el.tanh(el.mul(sig, 1.7));
  return el.scope({ name: "scope" }, el.mul(limited, el.sm(el.const({ key: "rs-v3-master", value: output }))));
}

export default function RecursiveContourTracerV3Page() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.62);
  const [scanHz, setScanHz] = useState(18);
  const [noiseMix, setNoiseMix] = useState(0.22);
  const [threshold, setThreshold] = useState(0.5);
  const [plottingMode, setPlottingMode] = useState<RecursivePlottingMode>("distance");
  const [coloringMode, setColoringMode] = useState<RecursiveColoringMode>("outlines");
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeControl, setActiveControl] = useState(0);

  const frame = useMemo(
    () =>
      generateRecursiveFrame({
        width: 280,
        height: 168,
        zoom: 0.52,
        centerX: -0.74364388703,
        centerY: 0.13182590421,
        maxIter: 240,
        plottingMode,
        coloringMode,
        colorScheme: "color",
        paletteIndex: 1,
        numShades: 10,
        shadeOffset: 2,
        dataSource,
        patternScale,
      }),
    [coloringMode, dataSource, patternScale, plottingMode]
  );

  const segments = useMemo(
    () => marchingSquaresSegments(frame.values, frame.width, frame.height, threshold, 7000),
    [frame, threshold]
  );
  const controls = useMemo(
    () => contourControlsFromSegments(segments, frame.width, frame.height, 1400),
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
      const alpha = i === activeControl ? 0.95 : 0.28;
      const hue = s.angleDeg;
      ctx.strokeStyle = `hsla(${hue}, 100%, 68%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    });
  }, [activeControl, frame, segments]);

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
      engine.render(el.const({ key: "rs-v3-silence", value: 0 }));
      rafRef.current = requestAnimationFrame(tickRef.current);
      return;
    }
    const t = (now - t0Ref.current) * 0.001;
    const idx = Math.floor(t * scanHz) % controls.length;
    const ctl = controls[idx];
    const freq = 70 + ((ctl.angle - 180) * 2.6 + 180) * 7.8;
    const stepU = (t * scanHz) % 1;
    const amp = Math.exp(-stepU * (2.8 + ctl.duration * 1.7));
    engine.render(buildGraph(Math.max(40, freq), amp, noiseMix, output));
    if (now - lastStepUiMsRef.current > 70) {
      lastStepUiMsRef.current = now;
      setActiveControl(idx);
    }
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [controls, noiseMix, output, scanHz]);

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
    engine.render(el.const({ key: "rs-v3-stop", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <>
      <Head>
        <title>Recursive Sound V3 | Contour Tracer</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Recursive Sound V3: Contour Tracer Sonifier
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45, maxWidth: 920 }}>
          Marching-squares inspired contour extraction from the active data field. Segment angle and
          segment duration drive frequency and envelope, echoing recursive-sound contour concepts.
        </p>

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
            imageRendering: "auto",
            border: "1px solid #222",
            borderRadius: 6,
            background: "#090909",
            marginBottom: "0.9rem",
          }}
        />

        <div className="controls">
          <div className="presets">
            <span className="presets-label">Data</span>
            {(["fractal"] as DataSourceKind[]).map((s) => (
              <button
                key={s}
                className="preset-btn"
                onClick={() => setDataSource(s)}
                style={s === dataSource ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
          {dataSource !== "fractal" && (
            <Slider label="Pattern Scale" value={patternScale} min={1} max={14} step={0.1} onChange={setPatternScale} />
          )}
          <div className="presets">
            <span className="presets-label">Plot</span>
            {(["escape", "distance"] as RecursivePlottingMode[]).map((s) => (
              <button
                key={s}
                className="preset-btn"
                onClick={() => setPlottingMode(s)}
                style={s === plottingMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="presets">
            <span className="presets-label">Coloring</span>
            {(["modulo", "raw", "outline", "outlines", "decomp1", "decomp2"] as RecursiveColoringMode[]).map((s) => (
              <button
                key={s}
                className="preset-btn"
                onClick={() => setColoringMode(s)}
                style={s === coloringMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
          <Slider label="Threshold" value={threshold} min={0} max={1} step={0.001} onChange={setThreshold} />
          <Slider label="Scan Hz" value={scanHz} min={1} max={80} step={0.1} onChange={setScanHz} />
          <Slider label="Noise Mix" value={noiseMix} min={0} max={1} step={0.01} onChange={setNoiseMix} />
          <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
        </div>
      </div>
    </>
  );
}
