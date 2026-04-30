import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import * as engine from "@/audio/spectrum-engine";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import { computeFractalCirclePacking, type PackedCircle } from "@/lib/fractal-circle-packing";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";

const ACCENT = "#ff9f1c";
const UI_SCOPE_INTERVAL_MS = 80;
const UI_STEP_INTERVAL_MS = 50;

function buildGraph(
  circles: PackedCircle[],
  amps: number[],
  output: number,
  minFreq: number,
  maxFreq: number
): NodeRepr_t {
  let mix: NodeRepr_t = el.const({ key: "cp-zero", value: 0 });
  const n = Math.max(1, circles.length);
  for (let i = 0; i < circles.length; i += 1) {
    const c = circles[i];
    const yNorm = c.y / 255;
    const freq = minFreq * Math.pow(maxFreq / Math.max(1, minFreq), 1 - yNorm);
    const tone = el.cycle(el.const({ key: `cp-f-${i}`, value: freq }));
    const noise = el.bandpass(el.const({ key: `cp-bp-${i}`, value: freq * 2.3 }), 1.2, el.noise());
    const amp = amps[i] ?? 0;
    const sig = el.add(
      el.mul(tone, el.const({ key: `cp-g-tone-${i}`, value: amp * 0.28 })),
      el.mul(noise, el.const({ key: `cp-g-noise-${i}`, value: amp * 0.18 }))
    );
    const pan = (c.x / 255) * 2 - 1;
    const l = Math.sqrt((1 - pan) * 0.5);
    const r = Math.sqrt((1 + pan) * 0.5);
    mix = el.add(mix, el.add(el.mul(sig, l), el.mul(sig, r)));
  }
  return el.scope(
    { name: "scope" },
    el.mul(mix, el.sm(el.const({ key: "cp-master", value: output / Math.sqrt(n) })))
  );
}

export function FractalCirclePackingDemo() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.8);
  const [bpm, setBpm] = useState(115);
  const [zoom, setZoom] = useState(2);
  const [maxIter, setMaxIter] = useState(220);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [resolution, setResolution] = useState(1024);
  const [maxCircles, setMaxCircles] = useState(36);
  const [minRadius, setMinRadius] = useState(4);
  const [maxRadius, setMaxRadius] = useState(18);
  const [edgeThreshold, setEdgeThreshold] = useState(0.22);
  const [decayMs, setDecayMs] = useState(140);
  const [minFreq, setMinFreq] = useState(70);
  const [maxFreq, setMaxFreq] = useState(5200);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeCircle, setActiveCircle] = useState(0);

  const packing = useMemo(
    () =>
      computeFractalCirclePacking({
        width: resolution,
        height: resolution,
        zoom,
        maxIter,
        dataSource,
        patternScale,
        centerX,
        centerY,
        fractalType,
        juliaCx,
        juliaCy,
        maxCircles,
        minRadius,
        maxRadius,
        edgeThreshold,
      }),
    [
      centerX,
      centerY,
      edgeThreshold,
      dataSource,
      fractalType,
      juliaCx,
      juliaCy,
      maxCircles,
      maxIter,
      maxRadius,
      minRadius,
      patternScale,
      resolution,
      zoom,
    ]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const tickRef = useRef<() => void>(() => {});
  const playingRef = useRef(false);
  const t0Ref = useRef(0);
  const lastOnsetRef = useRef<number[]>([]);
  const currentCircleRef = useRef(-1);
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
    ctx.putImageData(new ImageData(new Uint8ClampedArray(packing.pixels), resolution, resolution), 0, 0);
    ctx.strokeStyle = "rgba(255, 200, 90, 0.9)";
    ctx.lineWidth = 1.5;
    packing.circles.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.stroke();
      if (i === activeCircle) {
        ctx.fillStyle = "rgba(255, 159, 28, 0.8)";
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(2, c.r * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [activeCircle, packing.circles, packing.pixels, resolution]);

  useEffect(() => {
    lastOnsetRef.current = Array.from({ length: packing.circles.length }, () => -1000);
    currentCircleRef.current = -1;
  }, [packing]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      engine.suspend();
    },
    []
  );

  const renderTick = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now();
    if (!t0Ref.current) t0Ref.current = now;
    const t = (now - t0Ref.current) * 0.001;
    const n = Math.max(1, packing.circles.length);
    const eventsPerSecond = (bpm / 60) * 4;
    const idx = Math.floor(t * eventsPerSecond) % n;
    if (idx !== currentCircleRef.current) {
      currentCircleRef.current = idx;
      lastOnsetRef.current[idx] = t;
      const nowUi = performance.now();
      if (nowUi - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
        lastStepUiMsRef.current = nowUi;
        setActiveCircle(idx);
      }
    }
    const decaySec = Math.max(0.02, decayMs * 0.001);
    const amps = packing.circles.map((c, i) => {
      const dt = Math.max(0, t - (lastOnsetRef.current[i] ?? -1000));
      const env = Math.exp(-dt / decaySec);
      return env * (0.3 + 0.7 * c.edge);
    });
    engine.render(buildGraph(packing.circles, amps, output, minFreq, maxFreq));
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [bpm, decayMs, maxFreq, minFreq, output, packing.circles]);

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
    engine.render(el.const({ key: "cp-silence", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <div className="fractal-circle-packing">
      <style>{`
        .fractal-circle-packing .play-btn { border-color: ${ACCENT}; color: ${ACCENT}; }
        .fractal-circle-packing .play-btn:hover { background: ${ACCENT}; color: #111; }
        .fractal-circle-packing input[type="range"]::-webkit-slider-thumb { background: ${ACCENT}; }
        .fractal-circle-packing input[type="range"]::-moz-range-thumb { background: ${ACCENT}; }
      `}</style>
      <h1 className="site-title" style={{ color: ACCENT }}>Fractal Circle Packing</h1>
      <p style={{ opacity: 0.8, marginBottom: "0.8rem", lineHeight: 1.45 }}>
        Circle clusters extracted from fractal edges become discrete audio events. This maps
        shape to objects to rhythm more directly than continuous scan drones.
      </p>
      <div
        style={{
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          background: "#111",
          padding: "0.7rem",
          marginBottom: "0.8rem",
          fontSize: "0.76rem",
          color: "#ababab",
          lineHeight: 1.42,
        }}
      >
        <div style={{ color: "#ffc27a", fontWeight: 600, marginBottom: "0.3rem" }}>
          What is time in this demo?
        </div>
        <div>
          Time is a transport that steps through packed circles in sequence at a rate set by <code>BPM</code>.
          Each step triggers one circle (highlighted on the map), then that event decays using <code>Decay</code>.
          So rhythm is <strong>circle order + BPM</strong>, while timbre/pitch come from each circle&apos;s position and edge strength.
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

      <div style={{ border: "1px solid #222", borderRadius: 8, background: "#101010", padding: "0.55rem", marginBottom: "0.9rem" }}>
        <canvas
          ref={canvasRef}
          width={resolution}
          height={resolution}
          style={{
            width: "100%",
            maxWidth: 520,
            imageRendering: "auto",
            borderRadius: 4,
            border: "1px solid #1d1d1d",
            display: "block",
          }}
        />
        <div style={{ marginTop: "0.45rem", fontSize: "0.74rem", color: "#8f8f8f" }}>
          circles {packing.circles.length} / {maxCircles} - active {activeCircle + 1}
        </div>
      </div>

      <div className="controls">
        <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
        <Slider label="BPM" value={bpm} min={30} max={320} step={1} onChange={setBpm} />
        <Slider label="Resolution" value={resolution} min={96} max={1024} step={1} onChange={setResolution} />
        <Slider label="Max Iter" value={maxIter} min={40} max={500} step={1} onChange={setMaxIter} />
        <Slider label="Zoom" value={zoom} min={0} max={2} step={0.001} onChange={setZoom} />
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
        <Slider label="Max Circles" value={maxCircles} min={8} max={96} step={1} onChange={setMaxCircles} />
        <Slider label="Min Radius" value={minRadius} min={1} max={18} step={0.5} onChange={setMinRadius} />
        <Slider label="Max Radius" value={maxRadius} min={4} max={42} step={0.5} onChange={setMaxRadius} />
        <Slider label="Edge Th" value={edgeThreshold} min={0} max={1} step={0.01} onChange={setEdgeThreshold} />
        <Slider label="Decay" value={decayMs} min={20} max={600} step={1} unit="ms" onChange={setDecayMs} />
        <Slider label="Freq Min" value={minFreq} min={20} max={600} step={1} unit="Hz" onChange={setMinFreq} />
        <Slider label="Freq Max" value={maxFreq} min={300} max={16000} step={1} unit="Hz" onChange={setMaxFreq} />
      </div>
    </div>
  );
}
