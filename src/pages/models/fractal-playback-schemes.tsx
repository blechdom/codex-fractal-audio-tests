import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  type RecursiveColoringMode,
  type RecursivePlayheadType,
  type RecursivePlottingMode,
  generateRecursiveFrame,
  samplePlayhead,
} from "@/lib/recursive-sound-chunks";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";
import { MANDELBROT_LOCATION_PRESETS } from "@/lib/mandelbrot-presets";

export default function FractalPlaybackSchemesModelPage() {
  const ACCENT = "#84a59d";
  type OrganizationMode = "row-major" | "serpentine" | "column-major" | "playhead";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);

  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [patternScale, setPatternScale] = useState(5.5);

  const [resolution, setResolution] = useState(420);
  const [zoom, setZoom] = useState(1);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [maxIter, setMaxIter] = useState(220);

  const [plottingMode, setPlottingMode] = useState<RecursivePlottingMode>("escape");
  const [coloringMode, setColoringMode] = useState<RecursiveColoringMode>("outlines");
  const [threshold, setThreshold] = useState(0.5);
  const [organizationMode, setOrganizationMode] = useState<OrganizationMode>("playhead");
  const [playheadType, setPlayheadType] = useState<RecursivePlayheadType>("cw");
  const [steps, setSteps] = useState(24);
  const [lanes, setLanes] = useState(24);
  const [phase, setPhase] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [scanHz, setScanHz] = useState(0.2);

  const applyPreset = (preset: (typeof MANDELBROT_LOCATION_PRESETS)[number]) => {
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(preset.zoom);
    setMaxIter(preset.maxIter);
  };

  const frame = useMemo(
    () =>
      generateRecursiveFrame({
        width: resolution,
        height: Math.round(resolution * 0.62),
        zoom,
        centerX,
        centerY,
        maxIter,
        plottingMode,
        coloringMode,
        colorScheme: "color",
        paletteIndex: 4,
        numShades: 12,
        shadeOffset: 0,
        dataSource,
        patternScale,
        fractalType,
        juliaCx,
        juliaCy,
      }),
    [
      centerX,
      centerY,
      coloringMode,
      dataSource,
      fractalType,
      juliaCx,
      juliaCy,
      maxIter,
      patternScale,
      plottingMode,
      resolution,
      zoom,
    ]
  );

  const sequencer = useMemo(() => {
    const patterns = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));
    const accents = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));
    const pointsByLane: Array<Array<{ x: number; y: number }>> = Array.from(
      { length: lanes },
      () => []
    );

    for (let lane = 0; lane < lanes; lane += 1) {
      const laneNorm = (lane + 0.5) / lanes;
      let playheadPoints: Array<{ x: number; y: number }> = [];
      let playheadValues: number[] = [];
      if (organizationMode === "playhead") {
        const sampled = samplePlayhead(
          frame,
          playheadType,
          (phase + lane / Math.max(1, lanes)) % 1,
          steps
        );
        playheadPoints = sampled.points;
        playheadValues = sampled.values;
      }

      for (let step = 0; step < steps; step += 1) {
        const stepNorm = step / Math.max(1, steps - 1);
        let x = 0;
        let y = 0;
        let value = 0;

        if (organizationMode === "row-major") {
          x = Math.round(stepNorm * (frame.width - 1));
          y = Math.round(laneNorm * (frame.height - 1));
          value = frame.values[y * frame.width + x];
        } else if (organizationMode === "serpentine") {
          const sx = lane % 2 === 0 ? stepNorm : 1 - stepNorm;
          x = Math.round(sx * (frame.width - 1));
          y = Math.round(laneNorm * (frame.height - 1));
          value = frame.values[y * frame.width + x];
        } else if (organizationMode === "column-major") {
          x = Math.round(laneNorm * (frame.width - 1));
          y = Math.round(stepNorm * (frame.height - 1));
          value = frame.values[y * frame.width + x];
        } else {
          const p = playheadPoints[step] ?? { x: 0, y: 0 };
          x = p.x;
          y = p.y;
          value = playheadValues[step] ?? 0;
        }

        pointsByLane[lane][step] = { x, y };
        accents[lane][step] = value;
        patterns[lane][step] = value >= threshold ? 1 : 0;
      }
    }

    let sum = 0;
    let activeCount = 0;
    for (let l = 0; l < lanes; l += 1) {
      for (let s = 0; s < steps; s += 1) {
        sum += accents[l][s];
        activeCount += patterns[l][s];
      }
    }
    return {
      patterns,
      accents,
      pointsByLane,
      meanValue: sum / Math.max(1, lanes * steps),
      density: activeCount / Math.max(1, lanes * steps),
    };
  }, [frame, lanes, organizationMode, phase, playheadType, steps, threshold]);

  const activeStep = useMemo(
    () => Math.floor(phase * Math.max(1, steps)) % Math.max(1, steps),
    [phase, steps]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0);

    for (let lane = 0; lane < lanes; lane += 1) {
      const p = sequencer.pointsByLane[lane]?.[activeStep];
      if (!p) continue;
      const active = sequencer.patterns[lane][activeStep] > 0;
      ctx.fillStyle = active ? "rgba(255, 241, 118, 0.95)" : "rgba(220, 220, 220, 0.45)";
      ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
    }
  }, [activeStep, frame, lanes, sequencer.patterns, sequencer.pointsByLane]);

  useEffect(() => {
    if (!autoplay) return;
    const tick = () => {
      const now = performance.now();
      if (!t0Ref.current) t0Ref.current = now;
      const t = (now - t0Ref.current) * 0.001;
      setPhase((t * scanHz) % 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      t0Ref.current = 0;
    };
  }, [autoplay, scanHz]);

  return (
    <>
      <Head>
        <title>Fractal Playback Schemes | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: "#84a59d", textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>
        <h1 className="site-title">Fractal Playback Schemes</h1>
        <p style={{ opacity: 0.78, maxWidth: 760, lineHeight: 1.5 }}>
          Interactive playback lab: choose input variables, see organized sequencer output, and test
          different scan/playhead/data-ordering schemes over a live viewport.
        </p>

        <canvas
          ref={canvasRef}
          width={frame.width}
          height={frame.height}
          style={{
            width: "100%",
            maxWidth: 900,
            imageRendering: "pixelated",
            border: "1px solid #222",
            borderRadius: 6,
            background: "#090909",
            marginBottom: "0.9rem",
          }}
        />

        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            background: "#111",
            padding: "0.65rem",
            marginBottom: "0.9rem",
            fontSize: "0.8rem",
            color: "#b8c3cc",
          }}
        >
          <div className="info-row">
            <span className="info-label">Input Variables</span>
            <span className="info-value">
              data={dataSource}, organization={organizationMode}, steps={steps}, lanes={lanes}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Output Variables</span>
            <span className="info-value">
              mean={sequencer.meanValue.toFixed(3)}, density={sequencer.density.toFixed(3)}, active
              step={activeStep + 1}/{steps}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Viewport</span>
            <span className="info-value">
              {frame.width}x{frame.height} at zoom {zoom.toFixed(3)}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Phase Auto Rate</span>
            <span className="info-value">
              {autoplay
                ? `${scanHz.toFixed(2)} loops/sec (${(1 / Math.max(0.001, scanHz)).toFixed(2)} sec per full cycle)`
                : "paused (manual phase control)"}
            </span>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #2a2a2a",
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
                const active = sequencer.patterns[lane][step] > 0;
                const accent = sequencer.accents[lane][step];
                return (
                  <div
                    key={`${lane}-${step}`}
                    style={{
                      height: 10,
                      borderRadius: 2,
                      background: active
                        ? `rgba(132, 165, 157, ${0.18 + 0.82 * accent})`
                        : "rgba(72,72,72,0.32)",
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
                <button
                  key={preset.id}
                  className="preset-btn"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}
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
          {dataSource === "fractal" && (
            <div className="presets">
              <span className="presets-label">Fractal</span>
              {(["mandelbrot", "julia"] as FractalKind[]).map((s) => (
                <button
                  key={s}
                  className="preset-btn"
                  onClick={() => setFractalType(s)}
                  style={s === fractalType ? { borderColor: ACCENT, color: ACCENT } : undefined}
                >
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
          {dataSource !== "fractal" && (
            <Slider label="Pattern Scale" value={patternScale} min={1} max={14} step={0.1} onChange={setPatternScale} />
          )}

          <div className="presets">
            <span className="presets-label">Organization</span>
            {(["row-major", "serpentine", "column-major", "playhead"] as OrganizationMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setOrganizationMode(m)}
                style={m === organizationMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          {organizationMode === "playhead" && (
            <div className="presets">
              <span className="presets-label">Playhead</span>
              {(["down", "up", "right", "left", "in", "out", "cw", "ccw"] as RecursivePlayheadType[]).map((m) => (
                <button
                  key={m}
                  className="preset-btn"
                  onClick={() => setPlayheadType(m)}
                  style={m === playheadType ? { borderColor: ACCENT, color: ACCENT } : undefined}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="presets">
            <span className="presets-label">Plotting</span>
            {(["escape", "distance"] as RecursivePlottingMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setPlottingMode(m)}
                style={m === plottingMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="presets">
            <span className="presets-label">Coloring</span>
            {(["modulo", "raw", "outline", "outlines", "decomp1", "decomp2"] as RecursiveColoringMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setColoringMode(m)}
                style={m === coloringMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>

          <Slider label="Resolution" value={resolution} min={120} max={420} step={1} onChange={setResolution} />
          <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
          <Slider label="Center X" value={centerX} min={-2.2} max={2.2} step={0.00001} onChange={setCenterX} />
          <Slider label="Center Y" value={centerY} min={-2.2} max={2.2} step={0.00001} onChange={setCenterY} />
          <Slider label="Max Iter" value={maxIter} min={40} max={600} step={1} onChange={setMaxIter} />
          <Slider label="Threshold" value={threshold} min={0} max={1} step={0.001} onChange={setThreshold} />
          <Slider label="Steps" value={steps} min={4} max={64} step={1} onChange={setSteps} />
          <Slider label="Lanes" value={lanes} min={4} max={64} step={1} onChange={setLanes} />
          <Slider label="Phase" value={phase} min={0} max={1} step={0.001} onChange={setPhase} />
          <Slider
            label={autoplay ? "Phase Auto Hz" : "Phase Auto Hz (inactive)"}
            value={scanHz}
            min={0.02}
            max={1.5}
            step={0.01}
            onChange={setScanHz}
          />
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
              checked={autoplay}
              onChange={(e) => setAutoplay(e.target.checked)}
              style={{ accentColor: ACCENT }}
            />
            Autoplay phase
          </label>
        </div>
      </div>
    </>
  );
}
