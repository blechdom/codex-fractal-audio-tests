import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import * as engine from "@/audio/spectrum-engine";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import { computeStripeEdgeSequence } from "@/lib/stripe-edge-sequencer";
import {
  MANDELBROT_LOCATION_PRESETS,
  type MandelbrotLocationPreset,
} from "@/lib/mandelbrot-presets";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";

const ACCENT = "#f9c74f";
const UI_SCOPE_INTERVAL_MS = 80;
const UI_STEP_INTERVAL_MS = 50;

function buildGraph(
  amps: number[],
  ampAccents: number[],
  output: number
): NodeRepr_t {
  let left: NodeRepr_t = el.const({ key: "seq-zero-l", value: 0 });
  let right: NodeRepr_t = el.const({ key: "seq-zero-r", value: 0 });

  for (let lane = 0; lane < amps.length; lane += 1) {
    const laneNorm = lane / Math.max(1, amps.length - 1);
    const baseFreq = 70 * Math.pow(2, laneNorm * 4.4);
    const tone = el.cycle(el.const({ key: `seq-freq-${lane}`, value: baseFreq }));
    const tickNoise = el.highpass(
      el.const({ key: `seq-noise-cut-${lane}`, value: 1000 + laneNorm * 3000 }),
      0.8,
      el.noise()
    );

    const amp = amps[lane] * ampAccents[lane];
    const laneSig = el.add(
      el.mul(tone, el.const({ key: `seq-tone-g-${lane}`, value: amp * 0.42 })),
      el.mul(tickNoise, el.const({ key: `seq-noise-g-${lane}`, value: amp * 0.28 }))
    );

    const pan = laneNorm * 2 - 1;
    const lGain = Math.sqrt((1 - pan) * 0.5);
    const rGain = Math.sqrt((1 + pan) * 0.5);
    left = el.add(left, el.mul(laneSig, lGain));
    right = el.add(right, el.mul(laneSig, rGain));
  }

  const mono = el.mul(el.add(left, right), 0.5);
  return el.scope(
    { name: "scope" },
    el.mul(mono, el.sm(el.const({ key: "seq-master", value: output })))
  );
}

export function StripeEdgeClockedOnsets() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.7);
  const [zoom, setZoom] = useState(1);
  const [maxIter, setMaxIter] = useState(140);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [bpm, setBpm] = useState(110);
  const [steps, setSteps] = useState(32);
  const [lanes, setLanes] = useState(8);
  const [resolution, setResolution] = useState(256);
  const [stripeThreshold, setStripeThreshold] = useState(0.5);
  const [edgeThreshold, setEdgeThreshold] = useState(0.25);
  const [decayMs, setDecayMs] = useState(120);
  const [frameSeed, setFrameSeed] = useState(0);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeStep, setActiveStep] = useState(0);

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
        height: Math.round(resolution * 0.6),
        lanes,
        steps,
        stripeThreshold,
        edgeThreshold,
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
      zoom,
    ]
  );

  const applyPreset = (preset: MandelbrotLocationPreset) => {
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(preset.zoom);
    setMaxIter(preset.maxIter);
  };

  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const playingRef = useRef(false);
  const currentStepRef = useRef(-1);
  const lastOnsetRef = useRef<number[]>([]);
  const tickRef = useRef<() => void>(() => {});
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
    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.suspend();
    };
  }, []);

  useEffect(() => {
    lastOnsetRef.current = Array.from({ length: lanes }, () => -1000);
    currentStepRef.current = -1;
  }, [lanes, steps, sequence]);

  const renderTick = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now();
    if (!t0Ref.current) t0Ref.current = now;
    const t = (now - t0Ref.current) * 0.001;

    const stepsPerSecond = (bpm / 60) * (steps / 4);
    const phase = t * stepsPerSecond;
    const stepIdx = Math.floor(phase) % steps;

    if (stepIdx !== currentStepRef.current) {
      currentStepRef.current = stepIdx;
      const nowUi = performance.now();
      if (nowUi - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
        lastStepUiMsRef.current = nowUi;
        setActiveStep(stepIdx);
      }
      for (let lane = 0; lane < lanes; lane += 1) {
        if (sequence.patterns[lane][stepIdx] > 0) {
          lastOnsetRef.current[lane] = t;
        }
      }
    }

    const decaySec = Math.max(0.02, decayMs * 0.001);
    const amps = Array.from({ length: lanes }, (_, lane) => {
      const dt = Math.max(0, t - (lastOnsetRef.current[lane] ?? -1000));
      return Math.exp(-dt / decaySec);
    });
    const ampAccents = Array.from({ length: lanes }, (_, lane) =>
      sequence.accents[lane][stepIdx] ?? 0.4
    );

    engine.render(buildGraph(amps, ampAccents, output));
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [bpm, decayMs, lanes, output, sequence.accents, sequence.patterns, steps]);

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
      tickRef.current();
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "seq-silence", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <div className="stripe-edge-demo">
      <style>{`
        .stripe-edge-demo .play-btn { border-color: ${ACCENT}; color: ${ACCENT}; }
        .stripe-edge-demo .play-btn:hover { background: ${ACCENT}; color: #111; }
        .stripe-edge-demo input[type="range"]::-webkit-slider-thumb { background: ${ACCENT}; }
        .stripe-edge-demo input[type="range"]::-moz-range-thumb { background: ${ACCENT}; }
      `}</style>
      <h1 className="site-title" style={{ color: ACCENT }}>
        Stripe / Edge Clocked Onsets
      </h1>
      <p style={{ opacity: 0.78, marginBottom: "0.8rem", lineHeight: 1.45 }}>
        Time is an explicit transport clock. A frozen Mandelbrot frame is sampled into{" "}
        {steps} steps x {lanes} lanes. Stripe/edge bits trigger onsets per step.
      </p>

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
                    height: 12,
                    borderRadius: 2,
                    background: active
                      ? `rgba(249, 199, 79, ${0.2 + 0.8 * accent})`
                      : "rgba(70,70,70,0.35)",
                    outline: step === activeStep ? `1px solid ${ACCENT}` : "none",
                    outlineOffset: -1,
                  }}
                />
              );
            })
          )}
        </div>
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
        <div className="presets">
          <span className="presets-label">Famous Areas</span>
          {MANDELBROT_LOCATION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="preset-btn"
              onClick={() => applyPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
        <Slider label="BPM" value={bpm} min={40} max={220} step={1} onChange={setBpm} />
        <Slider label="Steps" value={steps} min={8} max={64} step={1} onChange={setSteps} />
        <Slider label="Lanes" value={lanes} min={2} max={12} step={1} onChange={setLanes} />
        <Slider label="Resolution" value={resolution} min={48} max={256} step={1} onChange={setResolution} />
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
        <Slider
          label="Stripe Th"
          value={stripeThreshold}
          min={0}
          max={1}
          step={0.01}
          onChange={setStripeThreshold}
        />
        <Slider
          label="Edge Th"
          value={edgeThreshold}
          min={0}
          max={1}
          step={0.01}
          onChange={setEdgeThreshold}
        />
        <Slider label="Decay" value={decayMs} min={20} max={500} step={1} unit="ms" onChange={setDecayMs} />
        <Slider label="Frame Seed" value={frameSeed} min={0} max={12} step={0.01} onChange={setFrameSeed} />
      </div>
    </div>
  );
}
