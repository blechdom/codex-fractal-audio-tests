import { useEffect, useMemo, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import * as engine from "@/audio/spectrum-engine";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import {
  computeEdgeFrame,
  computeEdgePatterns,
  edgeFrameToPixels,
} from "@/lib/edge-sonification";
import {
  MANDELBROT_LOCATION_PRESETS,
  type MandelbrotLocationPreset,
} from "@/lib/mandelbrot-presets";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";
import { normalizedSoftLimitedMono } from "@/lib/fractal-audio-engine";

const ACCENT = "#bde0fe";
const UI_SCOPE_INTERVAL_MS = 90;
const UI_STEP_INTERVAL_MS = 90;

function buildGraph(
  patterns: { stepBits: number[][]; stepStrengths: number[][] },
  bpm: number,
  steps: number,
  lanes: number,
  output: number,
  freqMin: number,
  freqMax: number,
  toneMix: number,
  noiseMix: number,
  accentMin: number,
  accentMax: number,
  decayMs: number
): NodeRepr_t {
  const stepRate = Math.max(0.001, (bpm / 60) * (steps / 4));
  const metro = el.train(el.const({ key: "edge-c-metro-rate", value: stepRate }));
  const reset = el.const({ key: "edge-c-reset", value: 0 });
  const releaseSec = Math.max(0.03, decayMs * 0.001 * 0.8);

  let mix: NodeRepr_t = el.const({ key: "edge-c-zero", value: 0 });
  const loFreq = Math.max(20, Math.min(freqMin, freqMax));
  const hiFreq = Math.max(loFreq + 1, Math.max(freqMin, freqMax));
  const accLo = Math.min(accentMin, accentMax);
  const accHi = Math.max(accentMin, accentMax);

  for (let lane = 0; lane < lanes; lane += 1) {
    const laneNorm = lane / Math.max(1, lanes - 1);
    const gate = el.seq(
      { key: `edge-c-g-${lane}`, seq: patterns.stepBits[lane] ?? Array(steps).fill(0), hold: true, loop: true },
      metro,
      reset
    );
    const strength = el.seq(
      { key: `edge-c-s-${lane}`, seq: patterns.stepStrengths[lane] ?? Array(steps).fill(0.5), hold: true, loop: true },
      metro,
      reset
    );
    const env = el.adsr(0.001, 0.01, 0, releaseSec, gate);
    const accent = el.add(accLo, el.mul(el.sub(accHi, accLo), strength));
    const amp = el.mul(env, accent);

    const freq = loFreq * Math.pow(hiFreq / Math.max(loFreq, 1), laneNorm);
    const tonal = el.cycle(el.const({ key: `edge-c-f-${lane}`, value: freq }));
    const noisy = el.bandpass(
      el.const({ key: `edge-c-nf-${lane}`, value: 700 + laneNorm * 3600 }),
      1.5,
      el.noise()
    );
    const laneSig = el.add(
      el.mul(tonal, el.mul(amp, el.const({ key: `edge-c-tg-${lane}`, value: toneMix }))),
      el.mul(noisy, el.mul(amp, el.const({ key: `edge-c-ng-${lane}`, value: noiseMix })))
    );
    mix = el.add(mix, laneSig);
  }

  const limited = normalizedSoftLimitedMono(mix, lanes, 1.6);
  return el.scope({ name: "scope" }, el.mul(limited, el.sm(el.const({ key: "edge-c-master", value: output }))));
}

export function EdgeDetectionSonificationLabClock() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.64);
  const [zoom, setZoom] = useState(0.48);
  const [maxIter, setMaxIter] = useState(220);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [resolution, setResolution] = useState(170);
  const [lanes, setLanes] = useState(24);
  const [steps, setSteps] = useState(32);
  const [bpm, setBpm] = useState(110);
  const [edgeThreshold, setEdgeThreshold] = useState(0.26);
  const [decayMs, setDecayMs] = useState(130);
  const [freqMin, setFreqMin] = useState(50);
  const [freqMax, setFreqMax] = useState(5200);
  const [toneMix, setToneMix] = useState(0.24);
  const [noiseMix, setNoiseMix] = useState(0.2);
  const [accentMin, setAccentMin] = useState(0.4);
  const [accentMax, setAccentMax] = useState(1);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeStep, setActiveStep] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const playingRef = useRef(false);
  const lastScopeUiMsRef = useRef(0);
  const lastStepUiMsRef = useRef(0);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixels = edgeFrameToPixels(frame);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), frame.width, frame.height), 0, 0);
  }, [frame]);

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
    engine.render(
      buildGraph(
        patterns,
        bpm,
        steps,
        lanes,
        output,
        freqMin,
        freqMax,
        toneMix,
        noiseMix,
        accentMin,
        accentMax,
        decayMs
      )
    );
  }, [accentMax, accentMin, bpm, decayMs, freqMax, freqMin, lanes, noiseMix, output, patterns, playing, steps, toneMix]);

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
      engine.render(
        buildGraph(
          patterns,
          bpm,
          steps,
          lanes,
          output,
          freqMin,
          freqMax,
          toneMix,
          noiseMix,
          accentMin,
          accentMax,
          decayMs
        )
      );
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "edge-c-stop", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <div className="edge-clock-lab">
      <h1 className="site-title" style={{ color: ACCENT }}>Edge Detection Sonification V2 (Clock Optimized)</h1>
      <p style={{ opacity: 0.8, lineHeight: 1.45 }}>
        EL clocked step transport (`train + seq`) for consistent edge rhythm at high rates.
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
        width={frame.width}
        height={frame.height}
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
              const active = patterns.stepBits[lane][step] > 0;
              const accent = patterns.stepStrengths[lane][step];
              return (
                <div
                  key={`${lane}-${step}`}
                  style={{
                    height: 9,
                    borderRadius: 2,
                    background: active
                      ? `rgba(189, 224, 254, ${0.2 + 0.8 * accent})`
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
          {(["fractal", "stripes", "checkerboard", "polka-dots"] as DataSourceKind[]).map((s) => (
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
        <Slider label="BPM" value={bpm} min={40} max={260} step={1} onChange={setBpm} />
        <Slider label="Steps" value={steps} min={4} max={64} step={1} onChange={setSteps} />
        <Slider label="Lanes" value={lanes} min={4} max={64} step={1} onChange={setLanes} />
        <Slider label="Resolution" value={resolution} min={64} max={320} step={1} onChange={setResolution} />
        <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
        <Slider label="Max Iter" value={maxIter} min={40} max={420} step={1} onChange={setMaxIter} />
        <Slider label="Center X" value={centerX} min={-2.2} max={2.2} step={0.00001} onChange={setCenterX} />
        <Slider label="Center Y" value={centerY} min={-2.2} max={2.2} step={0.00001} onChange={setCenterY} />
        <Slider label="Edge Th" value={edgeThreshold} min={0} max={1} step={0.01} onChange={setEdgeThreshold} />
        <Slider label="Decay" value={decayMs} min={20} max={500} step={1} unit="ms" onChange={setDecayMs} />
        <Slider label="Freq Min" value={freqMin} min={20} max={600} step={1} unit="Hz" onChange={setFreqMin} />
        <Slider label="Freq Max" value={freqMax} min={300} max={14000} step={1} unit="Hz" onChange={setFreqMax} />
        <Slider label="Tone Mix" value={toneMix} min={0} max={1} step={0.01} onChange={setToneMix} />
        <Slider label="Noise Mix" value={noiseMix} min={0} max={1} step={0.01} onChange={setNoiseMix} />
        <Slider label="Accent Min" value={accentMin} min={0} max={1} step={0.01} onChange={setAccentMin} />
        <Slider label="Accent Max" value={accentMax} min={0} max={2} step={0.01} onChange={setAccentMax} />
        <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
      </div>
    </div>
  );
}

