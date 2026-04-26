import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import * as engine from "@/audio/spectrum-engine";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import {
  STRATEGIES,
  type StrategySlug,
  computeFrame,
  computeVisualFrame,
} from "@/lib/mandelbrot-sonification";
import {
  MANDELBROT_LOCATION_PRESETS,
  type MandelbrotLocationPreset,
} from "@/lib/mandelbrot-presets";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";
const UI_SCOPE_INTERVAL_MS = 80;
const UI_FRAME_INFO_INTERVAL_MS = 100;
const UI_CANVAS_INTERVAL_MS = 100;

interface Props {
  slug: StrategySlug;
}
type RhythmMode =
  | "stripe-xor-edge"
  | "edge-pulse"
  | "density-gate"
  | "stripe-phase";

function buildGraph(frame: ReturnType<typeof computeFrame>, output: number) {
  const voiceNodes = frame.freqs.map((freq, i) => {
    const mod = el.cycle(el.const({ key: `mod-rate-${i}`, value: frame.lfoRate * (0.7 + i * 0.02) }));
    const freqNode = el.add(
      el.const({ key: `freq-${i}`, value: freq }),
      el.mul(mod, el.const({ key: `fm-${i}`, value: freq * 0.07 * frame.fmDepth }))
    );
    return el.mul(
      el.cycle(freqNode),
      el.sm(el.const({ key: `gain-${i}`, value: frame.gains[i] }))
    );
  });

  let left: NodeRepr_t = el.const({ key: "zero-left", value: 0 });
  let right: NodeRepr_t = el.const({ key: "zero-right", value: 0 });

  voiceNodes.forEach((voice, i) => {
    const pan = frame.pans[i];
    const leftGain = Math.sqrt((1 - pan) * 0.5);
    const rightGain = Math.sqrt((1 + pan) * 0.5);
    left = el.add(left, el.mul(voice, leftGain));
    right = el.add(right, el.mul(voice, rightGain));
  });

  const shapedNoise = el.lowpass(
    el.const({ key: "noise-cutoff", value: frame.cutoff }),
    el.const({ key: "noise-q", value: 0.5 + frame.resonance * 8 }),
    el.mul(el.noise(), el.const({ key: "noise-gain", value: frame.noiseGain }))
  );

  const mixLeft = el.mul(
    el.add(left, el.mul(shapedNoise, 0.35)),
    el.sm(el.const({ key: "master-left", value: frame.master * output }))
  );
  const mixRight = el.mul(
    el.add(right, el.mul(shapedNoise, 0.35)),
    el.sm(el.const({ key: "master-right", value: frame.master * output }))
  );
  const mono = el.mul(el.add(mixLeft, mixRight), 0.5);
  return el.scope({ name: "scope" }, mono);
}

function applyRhythmicGating(
  frame: ReturnType<typeof computeFrame>,
  timeSec: number,
  bpm: number,
  stepsPerBar: number,
  threshold: number,
  depth: number,
  decay: number,
  mode: RhythmMode
) {
  const stepsPerSecond = (bpm / 60) * (stepsPerBar / 4);
  const n = Math.max(1, frame.gains.length);
  const gains = frame.gains.map((base, i) => {
    const lanePhase = i / n;
    const stepPos = timeSec * stepsPerSecond + lanePhase * 0.75 * stepsPerBar;
    const stepIdx = Math.floor(stepPos);
    const u = stepPos - stepIdx;
    const stripe = frame.stripeByVoice[i] ?? 0;
    const edge = frame.edgeByVoice[i] ?? 0;
    const density = frame.densityByVoice[i] ?? 0;
    const stepInt = ((stepIdx % stepsPerBar) + stepsPerBar) % stepsPerBar;

    let active = false;
    switch (mode) {
      case "stripe-xor-edge": {
        const stripePhase =
          Math.sin((stepInt / stepsPerBar) * Math.PI * 2 + stripe * Math.PI * 2) > 0
            ? 1
            : 0;
        const edgePulses = 1 + Math.floor(edge * 8);
        const edgeSpan = Math.max(1, Math.floor(stepsPerBar / edgePulses));
        const edgeBit = ((stepInt + Math.floor(stripe * stepsPerBar)) % edgeSpan) === 0 ? 1 : 0;
        active = stripePhase !== edgeBit;
        break;
      }
      case "edge-pulse": {
        const pulses = 1 + Math.floor(edge * 10);
        const span = Math.max(1, Math.floor(stepsPerBar / pulses));
        active = ((stepInt + Math.floor(stripe * stepsPerBar)) % span) === 0 && edge > threshold * 0.6;
        break;
      }
      case "density-gate": {
        const pulses = 1 + Math.floor(density * 12);
        const span = Math.max(1, Math.floor(stepsPerBar / pulses));
        active = ((stepInt + Math.floor(edge * stepsPerBar)) % span) === 0 && density > threshold * 0.6;
        break;
      }
      case "stripe-phase":
        active = Math.sin((stepIdx / stepsPerBar) * Math.PI * 2 + stripe * Math.PI * 2) > 0;
        break;
    }

    const env = active ? Math.exp(-u * decay) : 0;
    const gate = (1 - depth) + depth * env;
    return base * gate;
  });

  return { ...frame, gains };
}

export function MandelbrotSonificationDemo({ slug }: Props) {
  const strategy = useMemo(() => STRATEGIES.find((s) => s.slug === slug), [slug]);
  const isBoundaryStrategy = slug === "boundary-transients";
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.65);
  const [zoom, setZoom] = useState(0);
  const [scan, setScan] = useState(0.5);
  const [maxIter, setMaxIter] = useState(120);
  const [autopilot, setAutopilot] = useState(false);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [rhythmEnabled, setRhythmEnabled] = useState(true);
  const [rhythmMode, setRhythmMode] = useState<RhythmMode>(
    isBoundaryStrategy ? "edge-pulse" : "stripe-xor-edge"
  );
  const [rhythmBpm, setRhythmBpm] = useState(isBoundaryStrategy ? 148 : 120);
  const [rhythmSteps, setRhythmSteps] = useState(isBoundaryStrategy ? 24 : 16);
  const [rhythmThreshold, setRhythmThreshold] = useState(isBoundaryStrategy ? 0.32 : 0.45);
  const [rhythmDepth, setRhythmDepth] = useState(isBoundaryStrategy ? 0.98 : 0.85);
  const [rhythmDecay, setRhythmDecay] = useState(isBoundaryStrategy ? 14 : 8);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [frameInfo, setFrameInfo] = useState({
    cutoff: 0,
    noise: 0,
    fmDepth: 0,
  });

  const rafRef = useRef<number>(0);
  const tickRef = useRef<() => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(false);
  const t0Ref = useRef(0);
  const frozenFrameTimeRef = useRef(0);
  const lastScopeUiMsRef = useRef(0);
  const lastFrameInfoUiMsRef = useRef(0);
  const lastCanvasUiMsRef = useRef(0);

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

  const tick = useCallback(() => {
    tickRef.current();
  }, []);

  const renderFrame = useCallback(
    (t: number, useAutopilot: boolean) => {
      if (!strategy) return;
      const autoZoom = useAutopilot ? 0.5 + 0.5 * Math.sin(t * 0.09) : zoom;
      const autoScan = useAutopilot ? 0.5 + 0.5 * Math.cos(t * 0.11) : scan;
      const dynamicIter = useAutopilot
        ? Math.round(lerp(maxIter * 0.7, maxIter * 1.3, 0.5 + 0.5 * Math.sin(t * 0.07)))
        : maxIter;
      const uiNow = performance.now();

      const frame = computeFrame({
        strategy: strategy.slug,
        time: useAutopilot ? t : frozenFrameTimeRef.current,
        zoom: autoZoom,
        scan: autoScan,
        maxIter: Math.max(40, dynamicIter),
        dataSource,
        patternScale,
        centerX,
        centerY,
        fractalType,
        juliaCx,
        juliaCy,
      });
      const visual = computeVisualFrame(
        {
          strategy: strategy.slug,
          time: useAutopilot ? t : frozenFrameTimeRef.current,
          zoom: autoZoom,
          scan: autoScan,
          maxIter: Math.max(40, dynamicIter),
          dataSource,
          patternScale,
          centerX,
          centerY,
          fractalType,
          juliaCx,
          juliaCy,
        },
        240,
        140
      );

      if (!useAutopilot || uiNow - lastFrameInfoUiMsRef.current >= UI_FRAME_INFO_INTERVAL_MS) {
        lastFrameInfoUiMsRef.current = uiNow;
        setFrameInfo({
          cutoff: frame.cutoff,
          noise: frame.noiseGain,
          fmDepth: frame.fmDepth,
        });
      }

      const canvas = canvasRef.current;
      if (canvas && (!useAutopilot || uiNow - lastCanvasUiMsRef.current >= UI_CANVAS_INTERVAL_MS)) {
        lastCanvasUiMsRef.current = uiNow;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const pixelCopy = new Uint8ClampedArray(visual.pixels);
          ctx.putImageData(new ImageData(pixelCopy, visual.width, visual.height), 0, 0);
        }
      }

      const finalFrame = rhythmEnabled
        ? applyRhythmicGating(
            frame,
            t,
            rhythmBpm,
            rhythmSteps,
            rhythmThreshold,
            rhythmDepth,
            rhythmDecay,
            rhythmMode
          )
        : frame;
      engine.render(buildGraph(finalFrame, output));
    },
    [
      centerX,
      centerY,
      dataSource,
      fractalType,
      juliaCx,
      juliaCy,
      maxIter,
      output,
      rhythmBpm,
      rhythmDecay,
      rhythmDepth,
      rhythmEnabled,
      rhythmMode,
      rhythmSteps,
      rhythmThreshold,
      patternScale,
      scan,
      strategy,
      zoom,
    ]
  );

  useEffect(() => {
    tickRef.current = () => {
      if (!playingRef.current || !strategy) return;
      const now = performance.now();
      if (t0Ref.current === 0) t0Ref.current = now;
      const t = (now - t0Ref.current) * 0.001;
      renderFrame(t, autopilot);
      rafRef.current = requestAnimationFrame(tickRef.current);
    };
  }, [autopilot, renderFrame, strategy]);

  useEffect(() => {
    if (!strategy || playingRef.current) return;
    const visual = computeVisualFrame(
      {
        strategy: strategy.slug,
        time: autopilot ? 1.234 : frozenFrameTimeRef.current,
        zoom,
        scan,
        maxIter,
        dataSource,
        patternScale,
        centerX,
        centerY,
        fractalType,
        juliaCx,
        juliaCy,
      },
      240,
      140
    );
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixelCopy = new Uint8ClampedArray(visual.pixels);
    ctx.putImageData(new ImageData(pixelCopy, visual.width, visual.height), 0, 0);
  }, [autopilot, centerX, centerY, dataSource, fractalType, juliaCx, juliaCy, maxIter, patternScale, scan, strategy, zoom]);

  const applyPreset = (preset: MandelbrotLocationPreset) => {
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(preset.zoom);
    setMaxIter(preset.maxIter);
  };

  const togglePlay = async () => {
    if (!strategy) return;
    if (!playingRef.current) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
      playingRef.current = true;
      lastScopeUiMsRef.current = 0;
      lastFrameInfoUiMsRef.current = 0;
      lastCanvasUiMsRef.current = 0;
      frozenFrameTimeRef.current = 0;
      t0Ref.current = 0;
      tick();
      return;
    }

    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "silence", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  if (!strategy) {
    return <p>Unknown strategy.</p>;
  }

  return (
    <div style={{ ["--accent" as string]: strategy.accent }}>
      <style>{`
        .mandelbrot-demo .play-btn { border-color: var(--accent); color: var(--accent); }
        .mandelbrot-demo .play-btn:hover { background: var(--accent); color: #111; }
        .mandelbrot-demo input[type="range"]::-webkit-slider-thumb { background: var(--accent); }
        .mandelbrot-demo input[type="range"]::-moz-range-thumb { background: var(--accent); }
      `}</style>
      <div className="mandelbrot-demo">
        <h1 className="site-title" style={{ color: strategy.accent }}>
          {strategy.title}
        </h1>
        <p style={{ opacity: 0.78, marginBottom: "1rem", lineHeight: 1.4 }}>
          {strategy.description} This version layers coloring-driven rhythmic gates on top
          of each strategy so stripe/edge/density structures can be heard as timing, not
          just sustained timbre.
        </p>

        <div className="transport">
          <button className="play-btn" onClick={togglePlay}>
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <div className="scope-wrap">
            <Oscilloscope data={scopeData} color={strategy.accent} width={320} height={100} />
          </div>
        </div>
        <div
          style={{
            border: "1px solid #222",
            borderRadius: 8,
            background: "#111",
            padding: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#888",
              marginBottom: "0.35rem",
            }}
          >
            Frame coloring linked to audio mapping
          </div>
          <canvas
            ref={canvasRef}
            width={240}
            height={140}
            style={{
              width: "100%",
              maxWidth: 480,
              imageRendering: "pixelated",
              borderRadius: 4,
              background: "#080808",
              border: "1px solid #1d1d1d",
              display: "block",
            }}
          />
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
          <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
          <Slider label="Scan" value={scan} min={0} max={1} step={0.001} onChange={setScan} />
          <Slider label="Max Iter" value={maxIter} min={40} max={280} step={1} onChange={setMaxIter} />
          <div className="presets">
            <span className="presets-label">Data</span>
            {(["fractal", "stripes", "checkerboard", "polka-dots"] as DataSourceKind[]).map((source) => (
              <button
                key={source}
                className="preset-btn"
                onClick={() => setDataSource(source)}
                style={source === dataSource ? { borderColor: strategy.accent, color: strategy.accent } : undefined}
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
                  style={kind === fractalType ? { borderColor: strategy.accent, color: strategy.accent } : undefined}
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
          <div className="presets">
            <span className="presets-label">Rhythm Mode</span>
            {(["stripe-xor-edge", "edge-pulse", "density-gate", "stripe-phase"] as RhythmMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setRhythmMode(m)}
                style={m === rhythmMode ? { borderColor: strategy.accent, color: strategy.accent } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
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
              checked={rhythmEnabled}
              onChange={(e) => setRhythmEnabled(e.target.checked)}
              style={{ accentColor: strategy.accent }}
            />
            Coloring-driven rhythm
          </label>
          <Slider label="Rhythm BPM" value={rhythmBpm} min={30} max={320} step={1} onChange={setRhythmBpm} />
          <Slider label="Rhythm Steps" value={rhythmSteps} min={4} max={64} step={1} onChange={setRhythmSteps} />
          <Slider label="Rhythm Th" value={rhythmThreshold} min={0} max={1} step={0.01} onChange={setRhythmThreshold} />
          <Slider label="Rhythm Depth" value={rhythmDepth} min={0} max={1} step={0.01} onChange={setRhythmDepth} />
          <Slider label="Rhythm Decay" value={rhythmDecay} min={1} max={24} step={0.1} onChange={setRhythmDecay} />
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
              checked={autopilot}
              onChange={(e) => setAutopilot(e.target.checked)}
              style={{ accentColor: strategy.accent }}
            />
            Autopilot motion
          </label>
          <div className="info-row">
            <span className="info-label">Frame Stats</span>
            <span className="info-value">cutoff {Math.round(frameInfo.cutoff)} Hz</span>
            <span className="info-value">noise {frameInfo.noise.toFixed(2)}</span>
            <span className="info-value">fm {frameInfo.fmDepth.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
