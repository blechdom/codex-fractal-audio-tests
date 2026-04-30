import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import * as engine from "@/audio/spectrum-engine";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import {
  computeEdgeFrame,
  computeEdgePatterns,
  edgeFrameToPixels,
  laneColumnEnergy,
} from "@/lib/edge-sonification";
import {
  MANDELBROT_LOCATION_PRESETS,
  type MandelbrotLocationPreset,
} from "@/lib/mandelbrot-presets";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";
import { normalizedSoftLimitedMono } from "@/lib/fractal-audio-engine";

type PlayMode = "clocked" | "sweep" | "bursts";
type NoiseMode = "fixed" | "edge" | "chaos";

const ACCENT = "#90e0ef";
const UI_SCOPE_INTERVAL_MS = 80;
const UI_STEP_INTERVAL_MS = 50;

function buildGraph(
  amps: number[],
  accents: number[],
  noisePerLane: number[],
  output: number,
  freqMin: number,
  freqMax: number,
  toneMix: number,
  noiseMix: number,
  accentMin: number,
  accentMax: number
): NodeRepr_t {
  const loFreq = Math.max(20, Math.min(freqMin, freqMax));
  const hiFreq = Math.max(loFreq + 1, Math.max(freqMin, freqMax));
  const accLo = Math.min(accentMin, accentMax);
  const accHi = Math.max(accentMin, accentMax);
  let mix: NodeRepr_t = el.const({ key: "edge-mix-0", value: 0 });
  for (let lane = 0; lane < amps.length; lane += 1) {
    const laneNorm = lane / Math.max(1, amps.length - 1);
    const freq = loFreq * Math.pow(hiFreq / Math.max(loFreq, 1), laneNorm);
    const tonal = el.cycle(el.const({ key: `edge-f-${lane}`, value: freq }));
    const noisy = el.bandpass(
      el.const({ key: `edge-nf-${lane}`, value: 700 + laneNorm * 3600 }),
      1.5,
      el.noise()
    );
    const accent = accLo + (accHi - accLo) * accents[lane];
    const amp = amps[lane] * accent;
    const noiseAmt = Math.max(0, Math.min(1, noisePerLane[lane] ?? 1));
    mix = el.add(
      mix,
      el.add(
        el.mul(tonal, el.const({ key: `edge-tg-${lane}`, value: amp * toneMix })),
        el.mul(noisy, el.const({ key: `edge-ng-${lane}`, value: amp * noiseMix * noiseAmt }))
      )
    );
  }
  // Keep headroom roughly consistent as lane count rises.
  const limited = normalizedSoftLimitedMono(mix, amps.length, 1.6);
  return el.scope({ name: "scope" }, el.mul(limited, el.sm(el.const({ key: "edge-master", value: output }))));
}

export function EdgeDetectionSonificationLab() {
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<PlayMode>("clocked");
  const [output, setOutput] = useState(0.7);
  const [zoom, setZoom] = useState(1);
  const [maxIter, setMaxIter] = useState(220);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [resolution, setResolution] = useState(320);
  const [lanes, setLanes] = useState(8);
  const [steps, setSteps] = useState(32);
  const [bpm, setBpm] = useState(110);
  const [edgeThreshold, setEdgeThreshold] = useState(0.26);
  const [decayMs, setDecayMs] = useState(130);
  const [scanRate, setScanRate] = useState(0.14);
  const [freqMin, setFreqMin] = useState(50);
  const [freqMax, setFreqMax] = useState(5200);
  const [toneMix, setToneMix] = useState(0.25);
  const [noiseMix, setNoiseMix] = useState(0.22);
  const [noiseMode, setNoiseMode] = useState<NoiseMode>("fixed");
  const [chaosThreshold, setChaosThreshold] = useState(0.2);
  const [accentMin, setAccentMin] = useState(0.4);
  const [accentMax, setAccentMax] = useState(1);
  const [edgeCurve, setEdgeCurve] = useState(1.2);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeStep, setActiveStep] = useState(0);

  const frame = useMemo(
    () =>
      computeEdgeFrame({
        zoom,
        maxIter,
        time: 0,
        dataSource,
        patternScale,
        centerX,
        centerY,
        fractalType,
        juliaCx,
        juliaCy,
        width: resolution,
        height: Math.round(resolution * 0.58),
      }),
    [centerX, centerY, dataSource, fractalType, juliaCx, juliaCy, maxIter, patternScale, resolution, zoom]
  );
  const patterns = useMemo(
    () => computeEdgePatterns(frame, lanes, steps, edgeThreshold),
    [edgeThreshold, frame, lanes, steps]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const tickRef = useRef<() => void>(() => {});
  const t0Ref = useRef(0);
  const playingRef = useRef(false);
  const currentStepRef = useRef(-1);
  const sweepPosRef = useRef(0);
  const lastTimeSecRef = useRef(0);
  const lastOnsetRef = useRef<number[]>([]);
  const prevSweepEnergyRef = useRef<number[]>([]);
  const lastScopeUiMsRef = useRef(0);
  const lastStepUiMsRef = useRef(0);

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
    const pixels = edgeFrameToPixels(frame);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), frame.width, frame.height), 0, 0);
  }, [frame]);

  useEffect(() => {
    lastOnsetRef.current = Array.from({ length: lanes }, () => -1000);
    prevSweepEnergyRef.current = Array.from({ length: lanes }, () => 0);
    currentStepRef.current = -1;
    sweepPosRef.current = 0;
    lastTimeSecRef.current = 0;
  }, [lanes, steps, mode]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      engine.suspend();
    },
    []
  );

  const renderFrame = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now();
    if (!t0Ref.current) t0Ref.current = now;
    const t = (now - t0Ref.current) * 0.001;
    const deltaTimeSec = lastTimeSecRef.current > 0 ? Math.max(1 / 240, t - lastTimeSecRef.current) : 1 / 60;
    lastTimeSecRef.current = t;
    const decaySec = Math.max(0.02, decayMs * 0.001);

    const amps = Array.from({ length: lanes }, () => 0);
    const accents = Array.from({ length: lanes }, () => 0.5);
    const noisePerLane = Array.from({ length: lanes }, () => 1);

    if (mode === "clocked") {
      const sps = (bpm / 60) * (steps / 4);
      const stepNow = Math.floor(t * sps);
      const prevStep = currentStepRef.current < 0 ? stepNow : currentStepRef.current;
      const delta = Math.max(0, stepNow - prevStep);
      const catchup = Math.min(delta, steps * 2);
      if (catchup > 0) {
        for (let k = 1; k <= catchup; k += 1) {
          const step = (prevStep + k) % steps;
          const triggerTime = t - (catchup - k) / Math.max(1e-6, sps);
          for (let lane = 0; lane < lanes; lane += 1) {
            if (patterns.stepBits[lane][step] > 0) {
              lastOnsetRef.current[lane] = triggerTime;
            }
          }
        }
        currentStepRef.current = stepNow;
        const uiStep = stepNow % steps;
        const nowUi = performance.now();
        if (nowUi - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
          lastStepUiMsRef.current = nowUi;
          setActiveStep(uiStep);
        }
      }
      const step = stepNow % steps;
      for (let lane = 0; lane < lanes; lane += 1) {
        const dt = Math.max(0, t - (lastOnsetRef.current[lane] ?? -1000));
        amps[lane] = Math.exp(-dt / decaySec);
        const strength = patterns.stepStrengths[lane][step] ?? 0.4;
        const prev = patterns.stepStrengths[lane][(step - 1 + steps) % steps] ?? strength;
        const next = patterns.stepStrengths[lane][(step + 1) % steps] ?? strength;
        const chaos = Math.max(Math.abs(strength - prev), Math.abs(next - strength));
        accents[lane] = strength;
        noisePerLane[lane] =
          noiseMode === "edge"
            ? strength
            : noiseMode === "chaos"
              ? chaos > chaosThreshold ? Math.min(1, chaos * 2.5) : 0
              : 1;
      }
    } else if (mode === "sweep") {
      // Integrate phase by delta-time to avoid temporal quantization artifacts.
      sweepPosRef.current = (sweepPosRef.current + deltaTimeSec * scanRate) % 1;
      const xNorm = 0.5 + 0.5 * Math.sin(2 * Math.PI * sweepPosRef.current);
      for (let lane = 0; lane < lanes; lane += 1) {
        const e = laneColumnEnergy(frame, lane, lanes, xNorm);
        const prev = prevSweepEnergyRef.current[lane] ?? e;
        const chaos = Math.abs(e - prev);
        prevSweepEnergyRef.current[lane] = e;
        amps[lane] = Math.pow(e, edgeCurve);
        accents[lane] = 0.2 + 0.8 * e;
        noisePerLane[lane] =
          noiseMode === "edge"
            ? e
            : noiseMode === "chaos"
              ? chaos > chaosThreshold ? Math.min(1, chaos * 8) : 0
              : 1;
      }
      const nowUi = performance.now();
      if (nowUi - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
        lastStepUiMsRef.current = nowUi;
        setActiveStep(Math.floor(xNorm * (steps - 1)));
      }
    } else {
      const sps = (bpm / 60) * (steps / 2);
      const stepNow = Math.floor(t * sps);
      const prevStep = currentStepRef.current < 0 ? stepNow : currentStepRef.current;
      const delta = Math.max(0, stepNow - prevStep);
      const catchup = Math.min(delta, steps * 2);
      if (catchup > 0) {
        for (let k = 1; k <= catchup; k += 1) {
          const step = (prevStep + k) % steps;
          const triggerTime = t - (catchup - k) / Math.max(1e-6, sps);
          for (let lane = 0; lane < lanes; lane += 1) {
            const e = patterns.stepStrengths[lane][step] ?? 0;
            const prev = patterns.stepStrengths[lane][(step - 1 + steps) % steps] ?? 0;
            if (e > edgeThreshold && e > prev) {
              lastOnsetRef.current[lane] = triggerTime;
            }
          }
        }
        currentStepRef.current = stepNow;
        const uiStep = stepNow % steps;
        const nowUi = performance.now();
        if (nowUi - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
          lastStepUiMsRef.current = nowUi;
          setActiveStep(uiStep);
        }
      }
      const step = stepNow % steps;
      for (let lane = 0; lane < lanes; lane += 1) {
        const dt = Math.max(0, t - (lastOnsetRef.current[lane] ?? -1000));
        amps[lane] = Math.exp(-dt / Math.max(0.03, decaySec * 0.6));
        const strength = patterns.stepStrengths[lane][step] ?? 0.3;
        const prev = patterns.stepStrengths[lane][(step - 1 + steps) % steps] ?? strength;
        const next = patterns.stepStrengths[lane][(step + 1) % steps] ?? strength;
        const chaos = Math.max(Math.abs(strength - prev), Math.abs(next - strength));
        accents[lane] = strength;
        noisePerLane[lane] =
          noiseMode === "edge"
            ? strength
            : noiseMode === "chaos"
              ? chaos > chaosThreshold ? Math.min(1, chaos * 2.5) : 0
              : 1;
      }
    }

    engine.render(
      buildGraph(
        amps,
        accents,
        noisePerLane,
        output,
        freqMin,
        freqMax,
        toneMix,
        noiseMix,
        accentMin,
        accentMax
      )
    );
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [
    accentMax,
    accentMin,
    bpm,
    decayMs,
    edgeCurve,
    edgeThreshold,
    frame,
    freqMax,
    freqMin,
    lanes,
    mode,
    noiseMode,
    noiseMix,
    output,
    patterns.stepBits,
    patterns.stepStrengths,
    scanRate,
    steps,
    toneMix,
    chaosThreshold,
  ]);

  useEffect(() => {
    tickRef.current = renderFrame;
  }, [renderFrame]);

  const togglePlay = async () => {
    if (!playingRef.current) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
      playingRef.current = true;
      t0Ref.current = 0;
      lastTimeSecRef.current = 0;
      lastScopeUiMsRef.current = 0;
      lastStepUiMsRef.current = 0;
      tickRef.current();
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "edge-silence", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  const applyPreset = (preset: MandelbrotLocationPreset) => {
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(preset.zoom);
    setMaxIter(preset.maxIter);
  };

  return (
    <div className="edge-lab">
      <style>{`
        .edge-lab .play-btn { border-color: ${ACCENT}; color: ${ACCENT}; }
        .edge-lab .play-btn:hover { background: ${ACCENT}; color: #111; }
        .edge-lab input[type="range"]::-webkit-slider-thumb { background: ${ACCENT}; }
        .edge-lab input[type="range"]::-moz-range-thumb { background: ${ACCENT}; }
      `}</style>
      <h1 className="site-title" style={{ color: ACCENT }}>
        Edge Detection Sonification Lab
      </h1>
      <p style={{ opacity: 0.78, marginBottom: "0.7rem", lineHeight: 1.45 }}>
        Three edge playback modes: clocked triggers, scanning edge energy, and edge-rise bursts.
      </p>
      <div style={{ border: "1px solid #2a2a2a", borderRadius: 8, background: "#111", padding: "0.7rem", marginBottom: "0.8rem", fontSize: "0.76rem", color: "#a8a8a8", lineHeight: 1.42 }}>
        <div style={{ color: "#9ee8f6", fontWeight: 600, marginBottom: "0.3rem" }}>How this lab works</div>
        <div><strong>Play Mode:</strong> <code>clocked</code>=step sequencer, <code>sweep</code>=continuous scan across x, <code>bursts</code>=onsets only on rising edges.</div>
        <div><strong>Scan Hz:</strong> only for <code>sweep</code>; it is how many left-right scan cycles per second.</div>
        <div><strong>Edge Curve:</strong> only for <code>sweep</code>; raises/softens edge response (higher = more peaky/transient).</div>
        <div><strong>Why clicks without noise:</strong> hard onset envelopes can click even with pure tones; clicks are mostly envelope transients, not only the noise layer.</div>
        <div><strong>Noise control:</strong> <code>Noise Mix</code> sets amount, and <code>Noise Mode</code> chooses what drives it (fixed/edge/chaos).</div>
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
          padding: "0.55rem",
          marginBottom: "0.9rem",
        }}
      >
        <canvas
          ref={canvasRef}
          width={frame.width}
          height={frame.height}
          style={{
            width: "100%",
            maxWidth: 520,
            imageRendering: "pixelated",
            border: "1px solid #1d1d1d",
            borderRadius: 4,
            display: "block",
          }}
        />
        <div style={{ marginTop: "0.4rem", fontSize: "0.74rem", color: "#909090" }}>
          Active step: {activeStep + 1} / {steps}
        </div>
      </div>

      <div className="controls">
        <div className="presets">
          <span className="presets-label">Famous Areas</span>
          {MANDELBROT_LOCATION_PRESETS.map((preset) => (
            <button key={preset.id} className="preset-btn" onClick={() => applyPreset(preset)}>
              {preset.name}
            </button>
          ))}
        </div>

        <div className="presets">
          <span className="presets-label">Play Mode</span>
          {(["clocked", "sweep", "bursts"] as PlayMode[]).map((m) => (
            <button
              key={m}
              className="preset-btn"
              onClick={() => setMode(m)}
              style={m === mode ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="presets">
          <span className="presets-label">Noise Mode</span>
          {(["fixed", "edge", "chaos"] as NoiseMode[]).map((m) => (
            <button
              key={m}
              className="preset-btn"
              onClick={() => setNoiseMode(m)}
              style={m === noiseMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              {m}
            </button>
          ))}
        </div>

        <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
        <Slider label="BPM" value={bpm} min={40} max={500} step={1} onChange={setBpm} />
        <Slider label="Steps" value={steps} min={8} max={256} step={1} onChange={setSteps} />
        <Slider label="Lanes" value={lanes} min={2} max={256} step={1} onChange={setLanes} />
        <Slider label="Resolution" value={resolution} min={64} max={320} step={1} onChange={setResolution} />
        <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
        <Slider label="Max Iter" value={maxIter} min={40} max={420} step={1} onChange={setMaxIter} />
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
        <Slider label="Edge Th" value={edgeThreshold} min={0} max={1} step={0.01} onChange={setEdgeThreshold} />
        <Slider label="Edge Curve" value={edgeCurve} min={0.2} max={3} step={0.01} onChange={setEdgeCurve} />
        <Slider label="Decay" value={decayMs} min={20} max={500} step={1} unit="ms" onChange={setDecayMs} />
        <Slider label="Scan Hz" value={scanRate} min={0.02} max={2} step={0.01} onChange={setScanRate} />
        <Slider label="Freq Min" value={freqMin} min={20} max={600} step={1} unit="Hz" onChange={setFreqMin} />
        <Slider label="Freq Max" value={freqMax} min={300} max={14000} step={1} unit="Hz" onChange={setFreqMax} />
        <Slider label="Tone Mix" value={toneMix} min={0} max={1} step={0.01} onChange={setToneMix} />
        <Slider label="Noise Mix" value={noiseMix} min={0} max={1} step={0.01} onChange={setNoiseMix} />
        <Slider label="Chaos Th" value={chaosThreshold} min={0} max={1} step={0.01} onChange={setChaosThreshold} />
        <Slider label="Accent Min" value={accentMin} min={0} max={1} step={0.01} onChange={setAccentMin} />
        <Slider label="Accent Max" value={accentMax} min={0} max={2} step={0.01} onChange={setAccentMax} />
      </div>
    </div>
  );
}
