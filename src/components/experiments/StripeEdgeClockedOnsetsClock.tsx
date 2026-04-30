import { useEffect, useMemo, useRef, useState } from "react";
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

const ACCENT = "#ffe29a";
const UI_SCOPE_INTERVAL_MS = 90;
const UI_STEP_INTERVAL_MS = 90;

function buildGraph(
  sequence: { patterns: number[][]; accents: number[][] },
  bpm: number,
  steps: number,
  lanes: number,
  output: number,
  toneMix: number,
  noiseMix: number,
  attackMs: number,
  decayMs: number
): NodeRepr_t {
  const stepRate = Math.max(0.001, (bpm / 60) * (steps / 4));
  const metro = el.train(el.const({ key: "seq-c-metro-rate", value: stepRate }));
  const reset = el.const({ key: "seq-c-reset", value: 0 });
  const attackSec = Math.max(0.001, attackMs * 0.001);
  const decaySec = Math.max(0.02, decayMs * 0.001);
  const releaseSec = Math.max(0.02, decaySec * 0.85);

  let left: NodeRepr_t = el.const({ key: "seq-c-zero-l", value: 0 });
  let right: NodeRepr_t = el.const({ key: "seq-c-zero-r", value: 0 });

  for (let lane = 0; lane < lanes; lane += 1) {
    const laneNorm = lane / Math.max(1, lanes - 1);
    const gate = el.seq(
      { key: `seq-c-g-${lane}`, seq: sequence.patterns[lane] ?? Array(steps).fill(0), hold: true, loop: true },
      metro,
      reset
    );
    const accent = el.seq(
      { key: `seq-c-a-${lane}`, seq: sequence.accents[lane] ?? Array(steps).fill(0.5), hold: true, loop: true },
      metro,
      reset
    );
    const env = el.adsr(attackSec, decaySec, 0, releaseSec, gate);
    const amp = el.mul(env, el.add(0.2, el.mul(0.8, accent)));

    const baseFreq = 70 * Math.pow(2, laneNorm * 4.4);
    const tone = el.cycle(el.const({ key: `seq-c-f-${lane}`, value: baseFreq }));
    const tickNoise = el.highpass(
      el.const({ key: `seq-c-nf-${lane}`, value: 1000 + laneNorm * 3000 }),
      0.8,
      el.noise()
    );

    const sig = el.add(
      el.mul(tone, el.mul(amp, el.const({ key: `seq-c-tg-${lane}`, value: toneMix }))),
      el.mul(tickNoise, el.mul(amp, el.const({ key: `seq-c-ng-${lane}`, value: noiseMix })))
    );
    const { left: lGain, right: rGain } = equalPowerPan(laneNorm * 2 - 1);
    left = el.add(left, el.mul(sig, lGain));
    right = el.add(right, el.mul(sig, rGain));
  }

  const mono = el.mul(el.add(left, right), 0.5);
  const limited = normalizedSoftLimitedMono(mono, lanes, 1.5);
  return el.scope({ name: "scope" }, el.mul(limited, el.sm(el.const({ key: "seq-c-master", value: output }))));
}

export function StripeEdgeClockedOnsetsClock() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.58);
  const [zoom, setZoom] = useState(0);
  const [maxIter, setMaxIter] = useState(160);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [bpm, setBpm] = useState(112);
  const [steps, setSteps] = useState(24);
  const [lanes, setLanes] = useState(24);
  const [toneMix, setToneMix] = useState(0.35);
  const [noiseMix, setNoiseMix] = useState(0.08);
  const [attackMs, setAttackMs] = useState(11);
  const [decayMs, setDecayMs] = useState(140);
  const [playheadMode, setPlayheadMode] = useState<PlayheadMode>("multi-circle");
  const [playheadCount, setPlayheadCount] = useState(4);
  const [resolution, setResolution] = useState(180);
  const [stripeThreshold, setStripeThreshold] = useState(0.5);
  const [edgeThreshold, setEdgeThreshold] = useState(0.24);
  const [frameSeed, setFrameSeed] = useState(0);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeStep, setActiveStep] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(false);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const lastScopeUiMsRef = useRef(0);
  const lastStepUiMsRef = useRef(0);

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
        playheadCount,
      }),
    [
      centerX, centerY, dataSource, edgeThreshold, fractalType, frameSeed, juliaCx, juliaCy, lanes,
      maxIter, patternScale, playheadCount, playheadMode, resolution, steps, stripeThreshold, zoom
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
        playheadCount,
      }),
    [
      centerX, centerY, dataSource, edgeThreshold, fractalType, frameSeed, juliaCx, juliaCy, lanes,
      maxIter, patternScale, playheadCount, playheadMode, resolution, steps, stripeThreshold, zoom
    ]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(visual.pixels), visual.width, visual.height), 0, 0);
  }, [visual]);

  useEffect(() => {
    engine.onScope((data) => {
      if (!playingRef.current) return;
      const now = performance.now();
      if (now - lastScopeUiMsRef.current < UI_SCOPE_INTERVAL_MS) return;
      lastScopeUiMsRef.current = now;
      setScopeData(data);
    });
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      engine.suspend();
    },
    []
  );

  useEffect(() => {
    if (!playing) return;
    engine.render(buildGraph(sequence, bpm, steps, lanes, output, toneMix, noiseMix, attackMs, decayMs));
  }, [attackMs, bpm, decayMs, lanes, noiseMix, output, playing, sequence, steps, toneMix]);

  useEffect(() => {
    if (!playing) return;
    const tickUi = () => {
      const now = performance.now();
      if (!t0Ref.current) t0Ref.current = now;
      const t = (now - t0Ref.current) * 0.001;
      const sps = (bpm / 60) * (steps / 4);
      const step = Math.floor(t * sps) % Math.max(1, steps);
      if (now - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
        lastStepUiMsRef.current = now;
        setActiveStep(step);
      }
      rafRef.current = requestAnimationFrame(tickUi);
    };
    rafRef.current = requestAnimationFrame(tickUi);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bpm, playing, steps]);

  const applyPreset = (preset: MandelbrotLocationPreset) => {
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(preset.zoom);
    setMaxIter(preset.maxIter);
  };

  const togglePlay = async () => {
    if (!playingRef.current) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
      playingRef.current = true;
      t0Ref.current = 0;
      lastScopeUiMsRef.current = 0;
      lastStepUiMsRef.current = 0;
      engine.render(buildGraph(sequence, bpm, steps, lanes, output, toneMix, noiseMix, attackMs, decayMs));
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "seq-c-stop", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <div className="stripe-edge-clock-lab">
      <h1 className="site-title" style={{ color: ACCENT }}>Stripe / Edge Clocked Onsets V4 (Clock Optimized)</h1>
      <p style={{ opacity: 0.8, lineHeight: 1.45 }}>
        EL graph clock (`train + seq`) drives all onset timing; UI follows passively.
      </p>

      <div className="transport">
        <button className="play-btn" style={{ borderColor: ACCENT, color: ACCENT }} onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="scope-wrap">
          <Oscilloscope data={scopeData} color={ACCENT} width={340} height={100} />
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={visual.width}
        height={visual.height}
        style={{ width: "100%", maxWidth: 720, imageRendering: "pixelated", border: "1px solid #222", borderRadius: 6 }}
      />

      <div
        style={{
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          background: "#101010",
          padding: "0.6rem",
          marginTop: "0.8rem",
          marginBottom: "0.8rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))`,
            gap: 2,
          }}
        >
          {Array.from({ length: lanes }, (_, lane) =>
            Array.from({ length: steps }, (_, step) => {
              const active = sequence.patterns[lane][step] > 0;
              const accent = sequence.accents[lane][step];
              return (
                <div
                  key={`${lane}-${step}`}
                  style={{
                    height: 9,
                    borderRadius: 2,
                    background: active
                      ? `rgba(255, 226, 154, ${0.2 + 0.8 * accent})`
                      : "rgba(70,70,70,0.35)",
                    outline: step === activeStep ? `1px solid ${ACCENT}` : "none",
                    outlineOffset: -1,
                  }}
                />
              );
            })
          )}
        </div>
      </div>

      <div className="controls">
        {dataSource === "fractal" && (
          <div className="presets">
            <span className="presets-label">Famous Areas</span>
            {MANDELBROT_LOCATION_PRESETS.map((preset) => (
              <button key={preset.id} className="preset-btn" onClick={() => applyPreset(preset)}>
                {preset.name}
              </button>
            ))}
          </div>
        )}
        <div className="presets">
          <span className="presets-label">Data</span>
          {(["fractal"] as DataSourceKind[]).map((s) => (
            <button key={s} className="preset-btn" onClick={() => setDataSource(s)} style={s === dataSource ? { borderColor: ACCENT, color: ACCENT } : undefined}>
              {s}
            </button>
          ))}
        </div>
        {dataSource === "fractal" && (
          <div className="presets">
            <span className="presets-label">Fractal</span>
            {(["mandelbrot", "julia"] as FractalKind[]).map((s) => (
              <button key={s} className="preset-btn" onClick={() => setFractalType(s)} style={s === fractalType ? { borderColor: ACCENT, color: ACCENT } : undefined}>
                {s}
              </button>
            ))}
          </div>
        )}
        {dataSource === "fractal" && fractalType === "julia" && (
          <>
            <Slider label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCx} />
            <Slider label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCy} />
          </>
        )}
        {dataSource !== "fractal" && <Slider label="Pattern Scale" value={patternScale} min={1} max={14} step={0.1} onChange={setPatternScale} />}
        <div className="presets">
          <span className="presets-label">Playhead</span>
          {(["multi-circle", "circle", "spiral-out", "spiral-in", "horizontal-front", "horizontal-back", "vertical-down", "vertical-up", "serpentine"] as PlayheadMode[]).map((m) => (
            <button key={m} className="preset-btn" onClick={() => setPlayheadMode(m)} style={m === playheadMode ? { borderColor: ACCENT, color: ACCENT } : undefined}>
              {m}
            </button>
          ))}
        </div>
        <Slider label="BPM" value={bpm} min={40} max={260} step={1} onChange={setBpm} />
        <Slider label="Steps" value={steps} min={4} max={64} step={1} onChange={setSteps} />
        <Slider label="Lanes" value={lanes} min={4} max={64} step={1} onChange={setLanes} />
        <Slider label="Heads" value={playheadCount} min={1} max={8} step={1} onChange={setPlayheadCount} />
        <Slider label="Tone Mix" value={toneMix} min={0} max={1} step={0.01} onChange={setToneMix} />
        <Slider label="Noise Mix" value={noiseMix} min={0} max={1} step={0.01} onChange={setNoiseMix} />
        <Slider label="Attack" value={attackMs} min={1} max={40} step={1} unit="ms" onChange={setAttackMs} />
        <Slider label="Decay" value={decayMs} min={20} max={500} step={1} unit="ms" onChange={setDecayMs} />
        <Slider label="Resolution" value={resolution} min={64} max={320} step={1} onChange={setResolution} />
        <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
        <Slider label="Max Iter" value={maxIter} min={40} max={420} step={1} onChange={setMaxIter} />
        <Slider label="Center X" value={centerX} min={-2.2} max={1} step={0.00001} onChange={setCenterX} />
        <Slider label="Center Y" value={centerY} min={-1.4} max={1.4} step={0.00001} onChange={setCenterY} />
        <Slider label="Stripe Th" value={stripeThreshold} min={0} max={1} step={0.01} onChange={setStripeThreshold} />
        <Slider label="Edge Th" value={edgeThreshold} min={0} max={1} step={0.01} onChange={setEdgeThreshold} />
        <Slider label="Frame Seed" value={frameSeed} min={0} max={12} step={0.01} onChange={setFrameSeed} />
        <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
      </div>
    </div>
  );
}

