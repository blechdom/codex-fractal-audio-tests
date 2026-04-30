import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import * as engine from "@/audio/spectrum-engine";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import {
  computeStripeEdgeSequence,
  computeStripeEdgeVisual,
  type PlayheadMode,
} from "@/lib/stripe-edge-sequencer";
import {
  MANDELBROT_LOCATION_PRESETS,
  type MandelbrotLocationPreset,
} from "@/lib/mandelbrot-presets";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";
import { equalPowerPan, normalizedSoftLimitedMono } from "@/lib/fractal-audio-engine";

const ACCENT = "#ffd166";
const UI_SCOPE_INTERVAL_MS = 80;
const UI_STEP_INTERVAL_MS = 50;
const SEQ_CANVAS_SIZE = 420;
type TimeMode = "clocked" | "infinite";

function buildGraph(
  amps: number[],
  ampAccents: number[],
  output: number,
  toneMix: number,
  noiseMix: number
): NodeRepr_t {
  let left: NodeRepr_t = el.const({ key: "seq-v2-zero-l", value: 0 });
  let right: NodeRepr_t = el.const({ key: "seq-v2-zero-r", value: 0 });

  for (let lane = 0; lane < amps.length; lane += 1) {
    const laneNorm = lane / Math.max(1, amps.length - 1);
    const baseFreq = 70 * Math.pow(2, laneNorm * 4.4);
    const tone = el.cycle(el.const({ key: `seq-v2-freq-${lane}`, value: baseFreq }));
    const tickNoise = el.highpass(
      el.const({ key: `seq-v2-noise-cut-${lane}`, value: 1000 + laneNorm * 3000 }),
      0.8,
      el.noise()
    );

    const amp = amps[lane] * ampAccents[lane];
    const smoothAmp = el.sm(el.const({ key: `seq-v2-amp-${lane}`, value: amp }));
    const laneSig = el.add(
      el.mul(tone, el.mul(smoothAmp, el.const({ key: `seq-v2-tone-g-${lane}`, value: toneMix }))),
      el.mul(tickNoise, el.mul(smoothAmp, el.const({ key: `seq-v2-noise-g-${lane}`, value: noiseMix })))
    );

    const pan = laneNorm * 2 - 1;
    const { left: lGain, right: rGain } = equalPowerPan(pan);
    left = el.add(left, el.mul(laneSig, lGain));
    right = el.add(right, el.mul(laneSig, rGain));
  }

  const mono = el.mul(el.add(left, right), 0.5);
  const limited = normalizedSoftLimitedMono(mono, amps.length, 1.5);
  return el.scope(
    { name: "scope" },
    el.mul(limited, el.sm(el.const({ key: "seq-v2-master", value: output })))
  );
}

interface Props {
  advanced?: boolean;
  title?: string;
}

function StripeEdgeClockedOnsetsCore({ advanced = false, title = "Stripe / Edge Clocked Onsets V2" }: Props) {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(advanced ? 0.58 : 0.7);
  const [zoom, setZoom] = useState(0);
  const [maxIter, setMaxIter] = useState(140);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [bpm, setBpm] = useState(110);
  const [steps, setSteps] = useState(16);
  const [lanes, setLanes] = useState(16);
  const [squareLock, setSquareLock] = useState(true);
  const [playheadMode, setPlayheadMode] = useState<PlayheadMode>("multi-circle");
  const [playheadCount, setPlayheadCount] = useState(3);
  const [timeMode, setTimeMode] = useState<TimeMode>(advanced ? "infinite" : "clocked");
  const [infiniteHeads, setInfiniteHeads] = useState(4);
  const [crossfadeShape, setCrossfadeShape] = useState(1.0);
  const [toneMix, setToneMix] = useState(advanced ? 0.36 : 0.42);
  const [noiseMix, setNoiseMix] = useState(advanced ? 0.08 : 0.16);
  const [resolution, setResolution] = useState(160);
  const [stripeThreshold, setStripeThreshold] = useState(0.5);
  const [edgeThreshold, setEdgeThreshold] = useState(0.25);
  const [decayMs, setDecayMs] = useState(120);
  const [frameSeed, setFrameSeed] = useState(0);
  const [attackMs, setAttackMs] = useState(advanced ? 12 : 7);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [activeHeadSteps, setActiveHeadSteps] = useState<number[]>([0]);
  const effectiveTimeMode: TimeMode = advanced ? timeMode : "clocked";
  const activeHeadCount =
    advanced && effectiveTimeMode === "infinite" ? infiniteHeads : playheadCount;

  const sequence = useMemo(
    () =>
      computeStripeEdgeSequence({
        zoom,
        maxIter,
        time: frameSeed,
        dataSource,
        patternScale,
        centerX,
        centerY,
        fractalType,
        juliaCx,
        juliaCy,
        width: resolution,
        height: resolution,
        lanes,
        steps,
        stripeThreshold,
        edgeThreshold,
        playheadMode,
        playheadCount: activeHeadCount,
      }),
    [
      edgeThreshold,
      frameSeed,
      lanes,
      dataSource,
      centerX,
      centerY,
      fractalType,
      juliaCx,
      juliaCy,
      maxIter,
      resolution,
      steps,
      stripeThreshold,
      patternScale,
      activeHeadCount,
      playheadMode,
      zoom,
    ]
  );

  const visual = useMemo(
    () =>
      computeStripeEdgeVisual({
        zoom,
        maxIter,
        time: frameSeed,
        dataSource,
        patternScale,
        centerX,
        centerY,
        fractalType,
        juliaCx,
        juliaCy,
        width: resolution,
        height: resolution,
        lanes,
        steps,
        stripeThreshold,
        edgeThreshold,
        playheadMode,
        playheadCount: activeHeadCount,
      }),
    [
      centerX,
      centerY,
      dataSource,
      fractalType,
      juliaCx,
      juliaCy,
      edgeThreshold,
      frameSeed,
      lanes,
      maxIter,
      resolution,
      steps,
      stripeThreshold,
      patternScale,
      activeHeadCount,
      playheadMode,
      zoom,
    ]
  );

  const applyPreset = (preset: MandelbrotLocationPreset) => {
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(preset.zoom);
    setMaxIter(preset.maxIter);
  };

  const setStepsMaybeSquare = (next: number) => {
    setSteps(next);
    if (squareLock) setLanes(next);
  };

  const setLanesMaybeSquare = (next: number) => {
    setLanes(next);
    if (squareLock) setSteps(next);
  };

  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const playingRef = useRef(false);
  const currentStepRef = useRef<number[]>([]);
  const lastOnsetRef = useRef<number[]>([]);
  const tickRef = useRef<() => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seqCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastScopeUiMsRef = useRef(0);
  const lastStepUiMsRef = useRef(0);
  const laneAmpRef = useRef<number[]>([]);
  const lastTickSecRef = useRef(0);

  useEffect(() => {
    engine.onScope((data) => {
      if (!playingRef.current) return;
      const now = performance.now();
      if (now - lastScopeUiMsRef.current < UI_SCOPE_INTERVAL_MS) return;
      lastScopeUiMsRef.current = now;
      setScopeData(data);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(visual.pixels), visual.width, visual.height), 0, 0);
  }, [visual]);

  useEffect(() => {
    const canvas = seqCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cellW = SEQ_CANVAS_SIZE / Math.max(1, steps);
    const cellH = SEQ_CANVAS_SIZE / Math.max(1, lanes);
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, SEQ_CANVAS_SIZE, SEQ_CANVAS_SIZE);

    for (let lane = 0; lane < lanes; lane += 1) {
      for (let step = 0; step < steps; step += 1) {
        const active = sequence.patterns[lane]?.[step] > 0;
        const accent = sequence.accents[lane]?.[step] ?? 0;
        ctx.fillStyle = active
          ? `rgba(255, 209, 102, ${0.2 + 0.8 * accent})`
          : "rgba(70,70,70,0.35)";
        ctx.fillRect(step * cellW, lane * cellH, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
      }
    }

    ctx.lineWidth = 1;
    activeHeadSteps.forEach((headStep, idx) => {
      const x = headStep * cellW + 0.5;
      ctx.strokeStyle = idx === 0 ? ACCENT : "rgba(255, 209, 102, 0.55)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SEQ_CANVAS_SIZE);
      ctx.stroke();
    });
  }, [activeHeadSteps, lanes, sequence.accents, sequence.patterns, steps]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.suspend();
    };
  }, []);

  useEffect(() => {
    lastOnsetRef.current = Array.from({ length: lanes }, () => -1000);
    laneAmpRef.current = Array.from({ length: lanes }, () => 0);
    currentStepRef.current = Array.from({ length: Math.max(1, activeHeadCount) }, () => -1);
    lastTickSecRef.current = 0;
  }, [lanes, activeHeadCount, steps, sequence]);

  const renderTick = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now();
    if (!t0Ref.current) t0Ref.current = now;
    const t = (now - t0Ref.current) * 0.001;

    const stepsPerSecond = (bpm / 60) * (steps / 4);
    const phase = t * stepsPerSecond;
    const stepIdx = Math.floor(phase) % steps;

    const decaySec = Math.max(0.02, decayMs * 0.001);
    const attackSec = Math.max(0.001, attackMs * 0.001);
    const amps = Array.from({ length: lanes }, () => 0);
    const ampAccents = Array.from({ length: lanes }, () => 0.4);

    const nowUi = performance.now();
    if (nowUi - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
      lastStepUiMsRef.current = nowUi;
      setActiveStep(stepIdx);
      if (effectiveTimeMode === "infinite") {
        setActiveHeadSteps([stepIdx]);
      }
    }

    if (effectiveTimeMode === "clocked") {
      const headCount = Math.max(1, activeHeadCount);
      if (currentStepRef.current.length !== headCount) {
        currentStepRef.current = Array.from({ length: headCount }, () => -1);
      }
      const headSteps = Array.from({ length: headCount }, (_, h) => {
        const hp = phase + (h / headCount) * steps;
        return ((Math.floor(hp) % steps) + steps) % steps;
      });
      if (nowUi - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
        lastStepUiMsRef.current = nowUi;
        setActiveStep(headSteps[0] ?? stepIdx);
        setActiveHeadSteps(headSteps);
      }

      for (let h = 0; h < headCount; h += 1) {
        const hp = phase + (h / headCount) * steps;
        const stepAbs = Math.floor(hp);
        let prevAbs = currentStepRef.current[h];
        if (prevAbs < 0) prevAbs = stepAbs - 1;
        const delta = Math.max(0, stepAbs - prevAbs);
        const catchup = Math.min(delta, steps);
        for (let k = 1; k <= catchup; k += 1) {
          const s = (((prevAbs + k) % steps) + steps) % steps;
          const triggerTime = t - (catchup - k) / Math.max(1e-6, stepsPerSecond);
          for (let lane = 0; lane < lanes; lane += 1) {
            if (sequence.patterns[lane][s] > 0) {
              lastOnsetRef.current[lane] = triggerTime;
            }
          }
        }
        currentStepRef.current[h] = stepAbs;
      }
      for (let lane = 0; lane < lanes; lane += 1) {
        const dt = Math.max(0, t - (lastOnsetRef.current[lane] ?? -1000));
        const env = (1 - Math.exp(-dt / attackSec)) * Math.exp(-dt / decaySec);
        amps[lane] = env;
        ampAccents[lane] = sequence.accents[lane][stepIdx] ?? 0.4;
      }
    } else {
      // Infinite mode: phase-offset heads crossfade at loop boundaries.
      const baseCycle = (phase / Math.max(1, steps)) % 1;
      let envSum = 0;
      const target = Array.from({ length: lanes }, () => 0);
      for (let h = 0; h < infiniteHeads; h += 1) {
        const ph = (baseCycle + h / Math.max(1, infiniteHeads)) % 1;
        const env = Math.pow(Math.max(0, 0.5 - 0.5 * Math.cos(2 * Math.PI * ph)), crossfadeShape);
        envSum += env;
        const pos = ph * steps;
        const i0 = Math.floor(pos) % steps;
        const i1 = (i0 + 1) % steps;
        const frac = pos - Math.floor(pos);
        for (let lane = 0; lane < lanes; lane += 1) {
          const s0 = (sequence.patterns[lane][i0] ?? 0) * (sequence.accents[lane][i0] ?? 0);
          const s1 = (sequence.patterns[lane][i1] ?? 0) * (sequence.accents[lane][i1] ?? 0);
          target[lane] += env * ((1 - frac) * s0 + frac * s1);
        }
      }
      const norm = envSum > 1e-6 ? 1 / envSum : 1;
      const dtTick = Math.max(1 / 240, t - (lastTickSecRef.current || t - 1 / 60));
      lastTickSecRef.current = t;
      const alpha = 1 - Math.exp(-dtTick / decaySec);
      for (let lane = 0; lane < lanes; lane += 1) {
        const desired = target[lane] * norm;
        const prev = laneAmpRef.current[lane] ?? 0;
        const next = prev + (desired - prev) * alpha;
        laneAmpRef.current[lane] = next;
        amps[lane] = next;
        ampAccents[lane] = 0.25 + 0.75 * desired;
      }
    }

    engine.render(buildGraph(amps, ampAccents, output, toneMix, noiseMix));
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [
    bpm,
    crossfadeShape,
    decayMs,
    attackMs,
    infiniteHeads,
    lanes,
    output,
    toneMix,
    noiseMix,
    sequence.accents,
    sequence.patterns,
    activeHeadCount,
    steps,
    effectiveTimeMode,
  ]);

  useEffect(() => {
    tickRef.current = renderTick;
  }, [renderTick]);

  const togglePlay = async () => {
    if (!playingRef.current) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
      playingRef.current = true;
      t0Ref.current = 0;
      lastScopeUiMsRef.current = 0;
      lastStepUiMsRef.current = 0;
      lastTickSecRef.current = 0;
      tickRef.current();
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "seq-v2-silence", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <div className="stripe-edge-demo-v2">
      <style>{`
        .stripe-edge-demo-v2 .play-btn { border-color: ${ACCENT}; color: ${ACCENT}; }
        .stripe-edge-demo-v2 .play-btn:hover { background: ${ACCENT}; color: #111; }
        .stripe-edge-demo-v2 input[type="range"]::-webkit-slider-thumb { background: ${ACCENT}; }
        .stripe-edge-demo-v2 input[type="range"]::-moz-range-thumb { background: ${ACCENT}; }
      `}</style>
      <h1 className="site-title" style={{ color: ACCENT }}>
        {title}
      </h1>
      <p style={{ opacity: 0.78, marginBottom: "0.8rem", lineHeight: 1.45 }}>
        Square-grid default ({steps}x{lanes}). The frame map below uses the same stripe/edge
        XOR coloring logic that drives onset activity. Playhead mode defaults to{" "}
        <strong>multi-circle</strong> to emphasize spatial pattern over raster scan.
      </p>
      <div
        style={{
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          background: "#111",
          padding: "0.7rem 0.8rem",
          marginBottom: "0.9rem",
          fontSize: "0.77rem",
          lineHeight: 1.45,
          color: "#b0b0b0",
        }}
      >
        <div style={{ color: "#f0d28a", marginBottom: "0.35rem", fontWeight: 600 }}>
          How this sequencer turns data into sound
        </div>
        <div><strong>Time:</strong> transport clock advances steps at BPM; playhead path decides where data is read.</div>
        <div><strong>Rhythm:</strong> each cell triggers when <code>stripeBit XOR edgeBit</code> is active.</div>
        <div><strong>Timbre:</strong> each lane mixes sine tone + filtered noise for clicky, edge-sensitive hits.</div>
        <div><strong>Pitch:</strong> lane index maps exponentially low-to-high across the voice bank.</div>
        <div><strong>Dynamics:</strong> per-cell accent and exponential decay shape hit strength over time.</div>
        <div><strong>Heads:</strong> number of active playheads in the current time mode.</div>
        {advanced && (
          <div><strong>V3 simplification:</strong> one head-count control is shown at a time to avoid confusion.</div>
        )}
        <div><strong>Noise:</strong> noise is mixed with tone per lane to emphasize transients. Use <code>Noise Mix</code> to reduce hiss/click texture.</div>
        <div style={{ marginTop: "0.35rem" }}>
          <strong>Playhead modes:</strong> <code>multi-circle</code> (layered orbits), <code>circle</code> (single orbit),
          <code> spiral-out</code>/<code>spiral-in</code> (radial traversal), <code>horizontal-front/back</code>,
          <code> vertical-down/up</code>, <code>serpentine</code> (reference scan).
        </div>
      </div>

      <div className="transport">
        <button className="play-btn" onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="scope-wrap">
          <Oscilloscope data={scopeData} color={ACCENT} width={320} height={100} />
        </div>
      </div>

      <div
        style={{
          border: "1px solid #222",
          borderRadius: 8,
          background: "#101010",
          padding: "0.6rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            fontSize: "0.74rem",
            color: "#8f8f8f",
            marginBottom: "0.35rem",
            letterSpacing: "0.03em",
          }}
        >
          Stripe/Edge Activity Map (same logic as sequencer)
        </div>
        <canvas
          ref={canvasRef}
          width={visual.width}
          height={visual.height}
          style={{
            width: "100%",
            maxWidth: 520,
            aspectRatio: "1 / 1",
            imageRendering: "pixelated",
            borderRadius: 4,
            border: "1px solid #1d1d1d",
            background: "#080808",
            display: "block",
            marginBottom: "0.6rem",
          }}
        />
        <canvas
          ref={seqCanvasRef}
          width={SEQ_CANVAS_SIZE}
          height={SEQ_CANVAS_SIZE}
          style={{
            width: "100%",
            maxWidth: 520,
            aspectRatio: "1 / 1",
            imageRendering: "pixelated",
            borderRadius: 4,
            border: "1px solid #1d1d1d",
            background: "#080808",
            display: "block",
          }}
        />
        <div
          style={{
            marginTop: "0.45rem",
            fontSize: "0.74rem",
            color: "#8f8f8f",
            letterSpacing: "0.03em",
          }}
        >
          step {activeStep + 1} / {steps}
        </div>
      </div>

      <div className="controls">
        <div
          style={{
            border: "1px dashed #2a2a2a",
            borderRadius: 8,
            padding: "0.6rem 0.7rem",
            marginBottom: "0.2rem",
            fontSize: "0.74rem",
            color: "#9a9a9a",
            lineHeight: 1.4,
          }}
        >
          Quick start improvements:
          try <code>multi-circle</code> + 3-5 heads, keep <code>steps/lanes</code> square, then sweep
          <code> stripeTh</code> and <code>edgeTh</code> until the activity map shows clustered but not saturated triggers.
        </div>
        <div className="presets">
          <span className="presets-label">Famous Areas</span>
          {MANDELBROT_LOCATION_PRESETS.map((preset) => (
            <button key={preset.id} className="preset-btn" onClick={() => applyPreset(preset)}>
              {preset.name}
            </button>
          ))}
        </div>
        <div className="presets">
          <span className="presets-label">Playhead</span>
          {([
            "multi-circle",
            "circle",
            "spiral-out",
            "spiral-in",
            "horizontal-front",
            "horizontal-back",
            "vertical-down",
            "vertical-up",
            "serpentine",
          ] as PlayheadMode[]).map((m) => (
            <button
              key={m}
              className="preset-btn"
              onClick={() => setPlayheadMode(m)}
              style={m === playheadMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              {m}
            </button>
          ))}
        </div>
        {advanced && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.78rem",
              color: "#999",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={timeMode === "infinite"}
              onChange={(e) => setTimeMode(e.target.checked ? "infinite" : "clocked")}
              style={{ accentColor: ACCENT }}
            />
            Infinite heads mode
          </label>
        )}
        <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
        <Slider label="BPM" value={bpm} min={40} max={220} step={1} onChange={setBpm} />
        {advanced ? (
          effectiveTimeMode === "infinite" ? (
            <>
              <Slider label="Heads" value={infiniteHeads} min={2} max={12} step={1} onChange={setInfiniteHeads} />
              <Slider label="Xfade" value={crossfadeShape} min={0.4} max={3} step={0.01} onChange={setCrossfadeShape} />
            </>
          ) : (
            <Slider label="Heads" value={playheadCount} min={1} max={8} step={1} onChange={setPlayheadCount} />
          )
        ) : (
          <Slider label="Heads" value={playheadCount} min={1} max={8} step={1} onChange={setPlayheadCount} />
        )}
        <Slider label="Tone Mix" value={toneMix} min={0} max={1} step={0.01} onChange={setToneMix} />
        <Slider label="Noise Mix" value={noiseMix} min={0} max={1} step={0.01} onChange={setNoiseMix} />
        <Slider label="Steps" value={steps} min={4} max={128} step={1} onChange={setStepsMaybeSquare} />
        <Slider label="Lanes" value={lanes} min={4} max={128} step={1} onChange={setLanesMaybeSquare} />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.78rem",
            color: "#999",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={squareLock}
            onChange={(e) => setSquareLock(e.target.checked)}
            style={{ accentColor: ACCENT }}
          />
          Square lock (steps == lanes)
        </label>
        <Slider label="Resolution" value={resolution} min={64} max={320} step={1} onChange={setResolution} />
        <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
        <Slider label="Max Iter" value={maxIter} min={40} max={360} step={1} onChange={setMaxIter} />
        <div className="presets">
          <span className="presets-label">Data</span>
          {(["fractal"] as DataSourceKind[]).map((source) => (
            <button
              key={source}
              className="preset-btn"
              onClick={() => setDataSource(source)}
              style={source === dataSource ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              {source}
            </button>
          ))}
        </div>
        {dataSource !== "fractal" && (
          <Slider label="Pattern Scale" value={patternScale} min={1} max={14} step={0.1} onChange={setPatternScale} />
        )}
        {dataSource === "fractal" && (
          <div className="presets">
            <span className="presets-label">Fractal</span>
            {(["mandelbrot", "julia"] as FractalKind[]).map((kind) => (
              <button
                key={kind}
                className="preset-btn"
                onClick={() => setFractalType(kind)}
                style={kind === fractalType ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {kind}
              </button>
            ))}
          </div>
        )}
        <Slider label="Center X" value={centerX} min={-2.2} max={1} step={0.00001} onChange={setCenterX} />
        <Slider label="Center Y" value={centerY} min={-1.4} max={1.4} step={0.00001} onChange={setCenterY} />
        {dataSource === "fractal" && fractalType === "julia" && (
          <>
            <Slider label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCx} />
            <Slider label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCy} />
          </>
        )}
        <Slider label="Stripe Th" value={stripeThreshold} min={0} max={1} step={0.01} onChange={setStripeThreshold} />
        <Slider label="Edge Th" value={edgeThreshold} min={0} max={1} step={0.01} onChange={setEdgeThreshold} />
        <Slider label="Attack" value={attackMs} min={1} max={40} step={1} unit="ms" onChange={setAttackMs} />
        <Slider label="Decay" value={decayMs} min={20} max={500} step={1} unit="ms" onChange={setDecayMs} />
        <Slider label="Frame Seed" value={frameSeed} min={0} max={12} step={0.01} onChange={setFrameSeed} />
      </div>
    </div>
  );
}

export function StripeEdgeClockedOnsetsV2() {
  return (
    <StripeEdgeClockedOnsetsCore
      advanced={false}
      title="Stripe / Edge Clocked Onsets V2"
    />
  );
}

export function StripeEdgeClockedOnsetsV3() {
  return (
    <StripeEdgeClockedOnsetsCore
      advanced={true}
      title="Stripe / Edge Clocked Onsets V3"
    />
  );
}
