import Head from "next/head";
import Link from "next/link";
import { el, type NodeRepr_t } from "@elemaudio/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import * as engine from "@/audio/spectrum-engine";
import {
  type RecursiveColoringMode,
  type RecursivePlayheadType,
  generateRecursiveFrame,
  samplePlayhead,
} from "@/lib/recursive-sound-chunks";
import { type DataSourceKind } from "@/lib/fractal-core";

const ACCENT = "#72efdd";

function buildGraph(values: number[], output: number, toneNoiseMix: number): NodeRepr_t {
  const n = Math.max(1, values.length);
  let mix: NodeRepr_t = el.const({ key: "rs-v2-zero", value: 0 });
  for (let i = 0; i < values.length; i += 1) {
    const u = i / Math.max(1, values.length - 1);
    const freq = 60 * Math.pow(2, u * 7.2);
    const v = values[i] ?? 0;
    const tone = el.cycle(el.const({ key: `rs-v2-f-${i}`, value: freq }));
    const noise = el.bandpass(el.const({ key: `rs-v2-bp-${i}`, value: 300 + u * 3600 }), 1.4, el.noise());
    const lane = el.add(
      el.mul(tone, el.const({ key: `rs-v2-g-t-${i}`, value: v * (1 - toneNoiseMix) * 0.24 })),
      el.mul(noise, el.const({ key: `rs-v2-g-n-${i}`, value: v * toneNoiseMix * 0.22 }))
    );
    mix = el.add(mix, lane);
  }
  const norm = 1 / Math.sqrt(n);
  const limited = el.tanh(el.mul(mix, norm * 1.7));
  return el.scope({ name: "scope" }, el.mul(limited, el.sm(el.const({ key: "rs-v2-master", value: output }))));
}

export default function RecursivePlayheadSonifierV2Page() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.62);
  const [scanRate, setScanRate] = useState(0.22);
  const [toneNoiseMix, setToneNoiseMix] = useState(0.25);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [playheadType, setPlayheadType] = useState<RecursivePlayheadType>("cw");
  const [coloringMode, setColoringMode] = useState<RecursiveColoringMode>("outlines");
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [phaseUi, setPhaseUi] = useState(0);

  const frame = useMemo(
    () =>
      generateRecursiveFrame({
        width: 256,
        height: 160,
        zoom: 0.45,
        centerX: -0.74364388703,
        centerY: 0.13182590421,
        maxIter: 220,
        plottingMode: "escape",
        coloringMode,
        colorScheme: "color",
        paletteIndex: 2,
        numShades: 10,
        shadeOffset: 0,
        dataSource,
        patternScale,
      }),
    [coloringMode, dataSource, patternScale]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const playingRef = useRef(false);
  const tickRef = useRef<() => void>(() => {});
  const lastScopeUiMsRef = useRef(0);
  const lastPhaseUiMsRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const phase = phaseUi;
    const sample = samplePlayhead(frame, playheadType, phase, 128);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    sample.points.forEach((p) => ctx.fillRect(p.x, p.y, 1.5, 1.5));
  }, [frame, phaseUi, playheadType]);

  useEffect(() => {
    engine.onScope((data) => {
      if (!playingRef.current) return;
      const now = performance.now();
      if (now - lastScopeUiMsRef.current < 70) return;
      lastScopeUiMsRef.current = now;
      setScopeData(data);
    });
  }, []);

  const renderTick = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now();
    if (!t0Ref.current) t0Ref.current = now;
    const t = (now - t0Ref.current) * 0.001;
    const phase = (t * scanRate) % 1;
    const sample = samplePlayhead(frame, playheadType, phase, 48);
    engine.render(buildGraph(sample.values, output, toneNoiseMix));
    if (now - lastPhaseUiMsRef.current > 70) {
      lastPhaseUiMsRef.current = now;
      setPhaseUi(phase);
    }
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [frame, output, playheadType, scanRate, toneNoiseMix]);

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
      lastPhaseUiMsRef.current = 0;
      tickRef.current();
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "rs-v2-silence", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <>
      <Head>
        <title>Recursive Sound V2 | Playhead Sonifier</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Recursive Sound V2: Playhead Sonifier
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45, maxWidth: 920 }}>
          New page inspired by recursive-sound transport logic: a selected playhead traverses a
          transformed matrix (`raw`, `modulo`, `outline`, `outlines`, decomposition variants) and
          turns values into oscillator+noise lanes.
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
            maxWidth: 840,
            imageRendering: "pixelated",
            border: "1px solid #222",
            borderRadius: 6,
            background: "#090909",
            marginBottom: "1rem",
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
          <div className="presets">
            <span className="presets-label">Playhead</span>
            {(["down", "up", "right", "left", "in", "out", "cw", "ccw"] as RecursivePlayheadType[]).map((s) => (
              <button
                key={s}
                className="preset-btn"
                onClick={() => setPlayheadType(s)}
                style={s === playheadType ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
          <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
          <Slider label="Scan Hz" value={scanRate} min={0.03} max={1.5} step={0.01} onChange={setScanRate} />
          <Slider label="Tone/Noise" value={toneNoiseMix} min={0} max={1} step={0.01} onChange={setToneNoiseMix} />
          <Slider label="Phase" value={phaseUi} min={0} max={1} step={0.001} onChange={setPhaseUi} />
        </div>
      </div>
    </>
  );
}
