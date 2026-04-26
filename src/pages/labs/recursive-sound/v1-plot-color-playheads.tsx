import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  type RecursiveColorScheme,
  type RecursiveColoringMode,
  type RecursivePlayheadType,
  type RecursivePlottingMode,
  generateRecursiveFrame,
  samplePlayhead,
} from "@/lib/recursive-sound-chunks";
import { type DataSourceKind, type FractalKind } from "@/lib/fractal-core";

const ACCENT = "#ff9f1c";

export default function RecursivePlotColorPlayheadsV1Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resolution, setResolution] = useState(260);
  const [zoom, setZoom] = useState(0.42);
  const [maxIter, setMaxIter] = useState(220);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [plottingMode, setPlottingMode] = useState<RecursivePlottingMode>("escape");
  const [coloringMode, setColoringMode] = useState<RecursiveColoringMode>("modulo");
  const [colorScheme, setColorScheme] = useState<RecursiveColorScheme>("color");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [numShades, setNumShades] = useState(8);
  const [shadeOffset, setShadeOffset] = useState(0);
  const [playheadType, setPlayheadType] = useState<RecursivePlayheadType>("down");
  const [playheadPhase, setPlayheadPhase] = useState(0);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [patternScale, setPatternScale] = useState(5.5);
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);

  const frame = useMemo(
    () =>
      generateRecursiveFrame({
        width: resolution,
        height: Math.round(resolution * 0.6),
        zoom,
        centerX,
        centerY,
        maxIter,
        plottingMode,
        coloringMode,
        colorScheme,
        paletteIndex,
        numShades,
        shadeOffset,
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
      colorScheme,
      dataSource,
      fractalType,
      juliaCx,
      juliaCy,
      maxIter,
      numShades,
      paletteIndex,
      patternScale,
      plottingMode,
      resolution,
      shadeOffset,
      zoom,
    ]
  );

  const sample = useMemo(
    () => samplePlayhead(frame, playheadType, playheadPhase, 96),
    [frame, playheadPhase, playheadType]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0);
    ctx.fillStyle = "rgba(255, 220, 180, 0.9)";
    sample.points.forEach((p) => {
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    });
  }, [frame, sample.points]);

  return (
    <>
      <Head>
        <title>Recursive Sound V1 | Plot + Color + Playheads</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Recursive Sound V1: Plot + Color + Playheads
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45, maxWidth: 900 }}>
          New page inspired by `recursive-sound`: separate plotting mode, coloring transform, and
          playhead geometry over one 2D field. This is a visual inspection lab before sound mapping.
        </p>

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
            marginBottom: "0.8rem",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${sample.values.length}, minmax(0,1fr))`,
            gap: 1,
            width: "100%",
            maxWidth: 840,
            height: 54,
            marginBottom: "1rem",
          }}
        >
          {sample.values.map((v, i) => (
            <div
              key={i}
              style={{
                alignSelf: "end",
                height: `${8 + v * 46}px`,
                background: `rgba(255,159,28,${0.2 + 0.8 * v})`,
              }}
            />
          ))}
        </div>

        <div className="controls">
          <div className="presets">
            <span className="presets-label">Data</span>
            {(["fractal", "stripes", "checkerboard", "polka-dots"] as DataSourceKind[]).map((s) => (
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
          <div className="presets">
            <span className="presets-label">Scheme</span>
            {(["color", "grayscale"] as RecursiveColorScheme[]).map((s) => (
              <button
                key={s}
                className="preset-btn"
                onClick={() => setColorScheme(s)}
                style={s === colorScheme ? { borderColor: ACCENT, color: ACCENT } : undefined}
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

          <Slider label="Resolution" value={resolution} min={120} max={420} step={1} onChange={setResolution} />
          <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
          <Slider label="Center X" value={centerX} min={-2.4} max={1.2} step={0.00001} onChange={setCenterX} />
          <Slider label="Center Y" value={centerY} min={-1.6} max={1.6} step={0.00001} onChange={setCenterY} />
          <Slider label="Max Iter" value={maxIter} min={40} max={500} step={1} onChange={setMaxIter} />
          <Slider label="Palette" value={paletteIndex} min={0} max={5} step={1} onChange={setPaletteIndex} />
          <Slider label="Shades" value={numShades} min={2} max={24} step={1} onChange={setNumShades} />
          <Slider label="Shade Offset" value={shadeOffset} min={0} max={24} step={1} onChange={setShadeOffset} />
          <Slider label="Playhead Phase" value={playheadPhase} min={0} max={1} step={0.001} onChange={setPlayheadPhase} />
        </div>
      </div>
    </>
  );
}
