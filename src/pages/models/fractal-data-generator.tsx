import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  type DataSourceKind,
  type FractalKind,
  clamp01,
  computeViewport,
  fractalPointMetrics,
  lerp,
} from "@/lib/fractal-core";
import { computeEdgeField } from "@/lib/fractal-playback-schemes";
import { MANDELBROT_LOCATION_PRESETS } from "@/lib/mandelbrot-presets";

type ColorScheme = "hybrid" | "smooth" | "edge" | "stripe" | "trap";

const ACCENT = "#f4a261";

export default function FractalDataGeneratorModelPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resolution, setResolution] = useState(240);
  const [zoom, setZoom] = useState(0.38);
  const [maxIter, setMaxIter] = useState(220);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [dataSource, setDataSource] = useState<DataSourceKind>("fractal");
  const [fractalType, setFractalType] = useState<FractalKind>("mandelbrot");
  const [juliaCx, setJuliaCx] = useState(-0.8);
  const [juliaCy, setJuliaCy] = useState(0.156);
  const [patternScale, setPatternScale] = useState(5.5);
  const [colorize, setColorize] = useState(true);
  const [colorScheme, setColorScheme] = useState<ColorScheme>("hybrid");

  const applyPreset = (preset: (typeof MANDELBROT_LOCATION_PRESETS)[number]) => {
    setCenterX(preset.centerX);
    setCenterY(preset.centerY);
    setZoom(preset.zoom);
    setMaxIter(preset.maxIter);
  };

  const frame = useMemo(() => {
    const width = resolution;
    const height = Math.round(resolution * 0.6);
    const viewport = computeViewport({ zoom, time: 0, centerX, centerY });
    const smooth = new Float32Array(width * height);
    const stripe = new Float32Array(width * height);
    const trap = new Float32Array(width * height);

    for (let y = 0; y < height; y += 1) {
      const ny = y / Math.max(1, height - 1);
      const cy = viewport.centerY + lerp(-viewport.radiusY, viewport.radiusY, ny);
      for (let x = 0; x < width; x += 1) {
        const nx = x / Math.max(1, width - 1);
        const cx = viewport.centerX + lerp(-viewport.radiusX, viewport.radiusX, nx);
        const p = fractalPointMetrics(cx, cy, maxIter, {
          dataSource,
          patternScale,
          fractalType,
          juliaCx,
          juliaCy,
        });
        const i = y * width + x;
        smooth[i] = p.smoothNorm;
        stripe[i] = p.stripe;
        trap[i] = p.trap;
      }
    }

    const edge = computeEdgeField(smooth, width, height, 4.2);
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < smooth.length; i += 1) {
      const s = smooth[i];
      const e = edge[i];
      const st = stripe[i];
      const tp = trap[i];
      let r = 0;
      let g = 0;
      let b = 0;

      if (colorize) {
        if (colorScheme === "smooth") {
          r = 0.1 + 0.9 * s;
          g = 0.12 + 0.88 * s;
          b = 0.16 + 0.84 * (1 - s);
        } else if (colorScheme === "edge") {
          r = 0.12 + 0.88 * e;
          g = 0.08 + 0.45 * e;
          b = 0.2 + 0.8 * (1 - e);
        } else if (colorScheme === "stripe") {
          r = 0.1 + 0.9 * st;
          g = 0.1 + 0.9 * (1 - st);
          b = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(st * Math.PI * 2));
        } else if (colorScheme === "trap") {
          r = 0.14 + 0.86 * tp;
          g = 0.08 + 0.7 * (1 - tp);
          b = 0.16 + 0.84 * (0.4 + 0.6 * tp);
        } else {
          r = clamp01(0.58 * s + 0.28 * e + 0.14 * tp);
          g = clamp01(0.48 * st + 0.34 * s + 0.18 * e);
          b = clamp01(0.46 * (1 - e) + 0.35 * (1 - s) + 0.19 * tp);
        }
      } else {
        const mono = clamp01(0.55 * s + 0.45 * e);
        r = mono;
        g = mono;
        b = mono;
      }

      const p = i * 4;
      pixels[p] = Math.floor(255 * r);
      pixels[p + 1] = Math.floor(255 * g);
      pixels[p + 2] = Math.floor(255 * b);
      pixels[p + 3] = 255;
    }

    return { width, height, pixels, viewport };
  }, [
    centerX,
    centerY,
    colorScheme,
    colorize,
    dataSource,
    fractalType,
    juliaCx,
    juliaCy,
    maxIter,
    patternScale,
    resolution,
    zoom,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0);
  }, [frame]);

  return (
    <>
      <Head>
        <title>Fractal Data Generator | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>
        <h1 className="site-title">Fractal Data Generator</h1>
        <p style={{ opacity: 0.78, maxWidth: 760, lineHeight: 1.5 }}>
          Interactive source-stage lab: configure viewport and generation parameters, then inspect
          the raw 2D data frame before playback/time mapping.
        </p>

        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            background: "#101010",
            padding: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <canvas
            ref={canvasRef}
            width={frame.width}
            height={frame.height}
            style={{
              width: "100%",
              maxWidth: 820,
              imageRendering: "pixelated",
              borderRadius: 4,
              border: "1px solid #202020",
              background: "#090909",
              display: "block",
            }}
          />
          <div className="info-row" style={{ marginTop: "0.5rem" }}>
            <span className="info-label">Viewport</span>
            <span className="info-value">
              center ({frame.viewport.centerX.toFixed(6)}, {frame.viewport.centerY.toFixed(6)})
            </span>
            <span className="info-value">
              radius ({frame.viewport.radiusX.toFixed(4)}, {frame.viewport.radiusY.toFixed(4)})
            </span>
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
            {(["fractal", "stripes", "checkerboard", "polka-dots"] as DataSourceKind[]).map((source) => (
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
          <Slider label="Resolution" value={resolution} min={96} max={420} step={1} onChange={setResolution} />
          <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
          <Slider label="Max Iter" value={maxIter} min={40} max={500} step={1} onChange={setMaxIter} />
          <Slider label="Center X" value={centerX} min={-2.2} max={1} step={0.00001} onChange={setCenterX} />
          <Slider label="Center Y" value={centerY} min={-1.4} max={1.4} step={0.00001} onChange={setCenterY} />

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

          {dataSource === "fractal" && fractalType === "julia" && (
            <>
              <Slider label="Julia Cx" value={juliaCx} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCx} />
              <Slider label="Julia Cy" value={juliaCy} min={-1.6} max={1.6} step={0.00001} onChange={setJuliaCy} />
            </>
          )}

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
              checked={colorize}
              onChange={(e) => setColorize(e.target.checked)}
              style={{ accentColor: ACCENT }}
            />
            Colorize pixels
          </label>

          {colorize && (
            <div className="presets">
              <span className="presets-label">Color Scheme</span>
              {(["hybrid", "smooth", "edge", "stripe", "trap"] as ColorScheme[]).map((scheme) => (
                <button
                  key={scheme}
                  className="preset-btn"
                  onClick={() => setColorScheme(scheme)}
                  style={scheme === colorScheme ? { borderColor: ACCENT, color: ACCENT } : undefined}
                >
                  {scheme}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
