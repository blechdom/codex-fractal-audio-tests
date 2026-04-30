import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import * as engine from "@/audio/spectrum-engine";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import {
  MANDELBROT_LOCATION_PRESETS,
  type MandelbrotLocationPreset,
} from "@/lib/mandelbrot-presets";

const ACCENT = "#80ed99";
const UI_SCOPE_INTERVAL_MS = 80;
const UI_ZONE_INTERVAL_MS = 70;
const MAP_W = 260;
const MAP_H = 160;

interface ZoneSnapshot {
  amp: number;
  sourceIndex: number;
  rateHz: number;
  detail: number;
  phase: number;
  radiusVis: number;
  lowPattern: number[];
  highPattern: number[];
  sampleCx: number;
  sampleCy: number;
  lowScale: number;
  highScale: number;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mandelbrotSmooth(cx: number, cy: number, maxIter: number) {
  let zx = 0;
  let zy = 0;
  let iter = maxIter;
  for (let n = 0; n < maxIter; n += 1) {
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    const zxy = zx * zy;
    zx = zx2 - zy2 + cx;
    zy = 2 * zxy + cy;
    if (zx * zx + zy * zy > 16) {
      iter = n;
      break;
    }
  }
  if (iter >= maxIter) return 1;
  const mag = Math.hypot(zx, zy);
  const smooth = iter + 1 - Math.log2(Math.log2(Math.max(2, mag)));
  return clamp01(smooth / maxIter);
}

function sampleMetric(
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  maxIter: number
) {
  const c = mandelbrotSmooth(cx, cy, maxIter);
  const ex = radiusX * 0.01;
  const ey = radiusY * 0.01;
  const l = mandelbrotSmooth(cx - ex, cy, maxIter);
  const r = mandelbrotSmooth(cx + ex, cy, maxIter);
  const u = mandelbrotSmooth(cx, cy - ey, maxIter);
  const d = mandelbrotSmooth(cx, cy + ey, maxIter);
  const edge = clamp01(Math.hypot(r - l, d - u) * 4.2);
  const stripe = 0.5 + 0.5 * Math.sin(11 * Math.atan2(cy, cx) + c * 9);
  return { smooth: c, edge, stripe };
}

function samplePatternRing(
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  maxIter: number,
  sampleCount: number,
  ringScale: number
) {
  const values: number[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / Math.max(1, sampleCount);
    const theta = t * Math.PI * 2;
    const sx = cx + Math.cos(theta) * radiusX * ringScale;
    const sy = cy + Math.sin(theta) * radiusY * ringScale;
    const m = sampleMetric(sx, sy, radiusX, radiusY, maxIter);
    values.push(clamp01(0.55 * m.edge + 0.45 * m.stripe));
  }
  return values;
}

function buildGraph(zones: ZoneSnapshot[], output: number): NodeRepr_t {
  let mix: NodeRepr_t = el.const({ key: "td-zero", value: 0 });
  const n = Math.max(1, zones.length);
  for (let i = 0; i < zones.length; i += 1) {
    const z = zones[i];
    const zoneNorm = i / Math.max(1, zones.length - 1);
    const baseFreq = 55 * Math.pow(2, zoneNorm * 5.4);
    const detailTilt = 0.6 + 0.9 * z.detail;
    const freq = baseFreq * detailTilt;
    const tone = el.cycle(el.const({ key: `td-f-${i}`, value: freq }));
    const mod = el.cycle(el.const({ key: `td-mod-r-${i}`, value: 0.2 + z.rateHz * 0.2 }));
    const fmTone = el.cycle(
      el.add(
        el.const({ key: `td-fm-base-${i}`, value: freq }),
        el.mul(mod, el.const({ key: `td-fm-depth-${i}`, value: freq * 0.08 * z.detail }))
      )
    );
    const noise = el.bandpass(
      el.const({ key: `td-bp-${i}`, value: Math.min(12000, freq * 2.4) }),
      1.2 + z.detail * 2.2,
      el.noise()
    );
    const sig = el.add(
      el.mul(tone, el.const({ key: `td-gt-${i}`, value: z.amp * 0.2 })),
      el.mul(fmTone, el.const({ key: `td-gfm-${i}`, value: z.amp * 0.2 })),
      el.mul(noise, el.const({ key: `td-gn-${i}`, value: z.amp * 0.18 }))
    );
    const pan = zoneNorm * 2 - 1;
    const l = Math.sqrt((1 - pan) * 0.5);
    const r = Math.sqrt((1 + pan) * 0.5);
    mix = el.add(mix, el.add(el.mul(sig, l), el.mul(sig, r)));
  }
  return el.scope(
    { name: "scope" },
    el.mul(mix, el.sm(el.const({ key: "td-master", value: output / Math.sqrt(n) })))
  );
}

export function TimeDilationDemo() {
  const [playing, setPlaying] = useState(false);
  const [output, setOutput] = useState(0.8);
  const [zonesCount, setZonesCount] = useState(5);
  const [baseBpm, setBaseBpm] = useState(96);
  const [zoom, setZoom] = useState(1);
  const [migrationDepth, setMigrationDepth] = useState(1);
  const [maxIter, setMaxIter] = useState(220);
  const [centerX, setCenterX] = useState(-0.74364388703);
  const [centerY, setCenterY] = useState(0.13182590421);
  const [decayMs, setDecayMs] = useState(220);
  const [showSamplePoints, setShowSamplePoints] = useState(true);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [zoneUi, setZoneUi] = useState<ZoneSnapshot[]>([]);

  const rafRef = useRef<number>(0);
  const tickRef = useRef<() => void>(() => {});
  const playingRef = useRef(false);
  const t0Ref = useRef(0);
  const zoneAmpRef = useRef<number[]>([]);
  const lastScopeUiMsRef = useRef(0);
  const lastZoneUiMsRef = useRef(0);
  const lastTickSecRef = useRef(0);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    zoneAmpRef.current = Array.from({ length: zonesCount }, () => 0);
  }, [zonesCount]);

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

  const zoneRates = useMemo(() => {
    const base = (baseBpm / 60) / 4;
    return Array.from({ length: zonesCount }, (_, i) => base * Math.pow(2, i));
  }, [baseBpm, zonesCount]);

  const baseMap = useMemo(() => {
    const pixels = new Uint8ClampedArray(MAP_W * MAP_H * 4);
    const zoomScale = Math.pow(0.94, zoom * 120);
    const radiusX = 2.8 * zoomScale;
    const radiusY = 1.6 * zoomScale;
    for (let y = 0; y < MAP_H; y += 1) {
      const ny = y / Math.max(1, MAP_H - 1);
      const cy = centerY + lerp(-radiusY, radiusY, ny);
      for (let x = 0; x < MAP_W; x += 1) {
        const nx = x / Math.max(1, MAP_W - 1);
        const cx = centerX + lerp(-radiusX, radiusX, nx);
        const c = mandelbrotSmooth(cx, cy, maxIter);
        const p = (y * MAP_W + x) * 4;
        const v = Math.floor(255 * (0.1 + 0.9 * c));
        pixels[p] = Math.floor(v * 0.5);
        pixels[p + 1] = v;
        pixels[p + 2] = Math.floor(255 * (0.18 + 0.6 * (1 - c)));
        pixels[p + 3] = 255;
      }
    }
    return pixels;
  }, [centerX, centerY, maxIter, zoom]);

  const renderTick = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now();
    if (!t0Ref.current) t0Ref.current = now;
    const t = (now - t0Ref.current) * 0.001;
    const decaySec = Math.max(0.02, decayMs * 0.001);
    const dt = Math.max(1 / 240, t - (lastTickSecRef.current || t - 1 / 60));
    lastTickSecRef.current = t;
    const alpha = 1 - Math.exp(-dt / decaySec);

    const zoomScale = Math.pow(0.94, zoom * 120);
    const radiusX = 2.8 * zoomScale;
    const radiusY = 1.6 * zoomScale;

    const zones: ZoneSnapshot[] = [];
    const migration = clamp01(zoom) * migrationDepth * (zonesCount - 1);

    for (let zone = 0; zone < zonesCount; zone += 1) {
      const sourceFloat = Math.min(zonesCount - 1, zone + migration);
      const sourceIndex = Math.max(0, Math.min(zonesCount - 1, Math.round(sourceFloat)));
      const detail = sourceFloat / Math.max(1, zonesCount - 1);
      const rateHz = zoneRates[zone];
      const theta = 2 * Math.PI * (t * rateHz + zone / Math.max(1, zonesCount));
      // Keep sampling footprint in-bounds and monotonically scaled by detail.
      const travel = lerp(0.92, 0.14, detail);
      const cx = centerX + Math.cos(theta) * radiusX * travel;
      const cy = centerY + Math.sin(theta) * radiusY * travel;
      const lowScale = lerp(0.16, 0.04, detail);
      const highScale = lerp(0.04, 0.012, detail);
      const m = sampleMetric(cx, cy, radiusX, radiusY, maxIter);

      const gate = m.edge > 0.32 ? 1 : 0;
      const rhythmic = gate * (0.35 + 0.65 * Math.max(m.edge, m.stripe));
      const prev = zoneAmpRef.current[zone] ?? 0;
      const next = prev + (rhythmic - prev) * alpha;
      zoneAmpRef.current[zone] = next;
      zones.push({
        amp: next,
        sourceIndex,
        rateHz,
        detail,
        phase: theta,
        radiusVis: lerp(0.45, 0.16, detail),
        lowPattern: samplePatternRing(cx, cy, radiusX, radiusY, maxIter, 8, lowScale),
        highPattern: samplePatternRing(cx, cy, radiusX, radiusY, maxIter, 16, highScale),
        sampleCx: cx,
        sampleCy: cy,
        lowScale,
        highScale,
      });
    }

    const nowUi = performance.now();
    if (nowUi - lastZoneUiMsRef.current >= UI_ZONE_INTERVAL_MS) {
      lastZoneUiMsRef.current = nowUi;
      setZoneUi(zones);
      const canvas = mapCanvasRef.current;
      if (canvas && showSamplePoints) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.putImageData(new ImageData(new Uint8ClampedArray(baseMap), MAP_W, MAP_H), 0, 0);
          const worldToPx = (wx: number, wy: number) => {
            const nx = (wx - (centerX - radiusX)) / (2 * radiusX);
            const ny = (wy - (centerY - radiusY)) / (2 * radiusY);
            return { x: nx * MAP_W, y: ny * MAP_H };
          };
          zones.forEach((z, idx) => {
            const pt = worldToPx(z.sampleCx, z.sampleCy);
            const hue = (idx / Math.max(1, zones.length)) * 210;
            ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.75)`;
            ctx.lineWidth = 1;
            const lowRx = z.lowScale * MAP_W * 0.5;
            const lowRy = z.lowScale * MAP_H * 0.5;
            const highRx = z.highScale * MAP_W * 0.5;
            const highRy = z.highScale * MAP_H * 0.5;
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, lowRx, lowRy, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, highRx, highRy, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `hsla(${hue}, 90%, 70%, 0.95)`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
    }

    engine.render(buildGraph(zones, output));
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [
    centerX,
    centerY,
    decayMs,
    maxIter,
    migrationDepth,
    output,
    zoneRates,
    zonesCount,
    zoom,
    showSamplePoints,
    baseMap,
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
      lastTickSecRef.current = 0;
      lastScopeUiMsRef.current = 0;
      lastZoneUiMsRef.current = 0;
      tickRef.current();
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "td-silence", value: 0 }));
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
    <div className="time-dilation-demo">
      <style>{`
        .time-dilation-demo .play-btn { border-color: ${ACCENT}; color: ${ACCENT}; }
        .time-dilation-demo .play-btn:hover { background: ${ACCENT}; color: #111; }
        .time-dilation-demo input[type="range"]::-webkit-slider-thumb { background: ${ACCENT}; }
        .time-dilation-demo input[type="range"]::-moz-range-thumb { background: ${ACCENT}; }
      `}</style>
      <h1 className="site-title" style={{ color: ACCENT }}>Time Dilation</h1>
      <p style={{ opacity: 0.8, marginBottom: "0.8rem", lineHeight: 1.45 }}>
        Multiple time zones run simultaneously: slow zones listen to larger structure, fast
        zones listen to finer structure. Zoom causes detail migration from fast zones into
        slower zones (and vice versa), inspired by layered time in Inception.
      </p>

      <div className="transport">
        <button className="play-btn" onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="scope-wrap">
          <Oscilloscope data={scopeData} color={ACCENT} width={320} height={100} />
        </div>
      </div>

      <div style={{ border: "1px solid #222", borderRadius: 8, background: "#101010", padding: "0.6rem", marginBottom: "0.9rem" }}>
        <div style={{ fontSize: "0.74rem", color: "#8f8f8f", marginBottom: "0.4rem" }}>
          Fractal sample map (dots = zone sample points, rings = low/high pattern windows)
        </div>
        <canvas
          ref={mapCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{
            width: "100%",
            maxWidth: 520,
            imageRendering: "pixelated",
            border: "1px solid #1d1d1d",
            borderRadius: 4,
            display: "block",
            marginBottom: "0.6rem",
          }}
        />
        <div style={{ fontSize: "0.74rem", color: "#8f8f8f", marginBottom: "0.4rem" }}>
          Time zones (left = slow/coarse, right = fast/fine) with zoom-driven source migration
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, zoneUi.length)}, minmax(0, 1fr))`, gap: 4 }}>
          {zoneUi.map((z, i) => (
            <div key={i} style={{ border: "1px solid #2a2a2a", borderRadius: 4, padding: "0.35rem", background: "#121212" }}>
              <div style={{ height: 46, background: "#0f0f0f", borderRadius: 3, position: "relative", overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: `${Math.round(clamp01(z.amp) * 100)}%`,
                    background: `rgba(128, 237, 153, ${0.35 + 0.65 * clamp01(z.amp)})`,
                  }}
                />
              </div>
              <div style={{ fontSize: "0.68rem", color: "#a0a0a0", marginTop: "0.25rem" }}>
                z{i + 1} src {z.sourceIndex + 1}
              </div>
              <div style={{ fontSize: "0.66rem", color: "#7c7c7c" }}>
                {z.rateHz.toFixed(2)} Hz
              </div>
              <div style={{ marginTop: "0.26rem" }}>
                <div style={{ fontSize: "0.62rem", color: "#6f6f6f", marginBottom: "0.1rem" }}>low-res pattern</div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${z.lowPattern.length}, minmax(0, 1fr))`, gap: 1 }}>
                  {z.lowPattern.map((v, idx) => (
                    <div key={`l-${idx}`} style={{ height: 6, background: `rgba(128,237,153,${0.2 + 0.8 * v})`, borderRadius: 1 }} />
                  ))}
                </div>
                <div style={{ fontSize: "0.62rem", color: "#6f6f6f", marginTop: "0.18rem", marginBottom: "0.1rem" }}>high-res pattern</div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${z.highPattern.length}, minmax(0, 1fr))`, gap: 1 }}>
                  {z.highPattern.map((v, idx) => (
                    <div key={`h-${idx}`} style={{ height: 5, background: `rgba(165,255,198,${0.18 + 0.82 * v})`, borderRadius: 1 }} />
                  ))}
                </div>
              </div>
              <div
                style={{
                  marginTop: "0.25rem",
                  height: 36,
                  border: "1px solid #2a2a2a",
                  borderRadius: 999,
                  position: "relative",
                  background: "#0d0d0d",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "72%",
                    height: "72%",
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    border: "1px dashed #1f3e33",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `${50 + Math.cos(z.phase) * z.radiusVis * 48}%`,
                    top: `${50 + Math.sin(z.phase) * z.radiusVis * 48}%`,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    transform: "translate(-50%, -50%)",
                    background: "rgba(128, 237, 153, 0.95)",
                    boxShadow: "0 0 8px rgba(128, 237, 153, 0.55)",
                  }}
                />
              </div>
            </div>
          ))}
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
        <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
        <Slider label="Zones" value={zonesCount} min={2} max={10} step={1} onChange={setZonesCount} />
        <Slider label="Base BPM" value={baseBpm} min={20} max={240} step={1} onChange={setBaseBpm} />
        <Slider label="Zoom" value={zoom} min={0} max={1} step={0.001} onChange={setZoom} />
        <Slider label="Migrate" value={migrationDepth} min={0} max={1.6} step={0.01} onChange={setMigrationDepth} />
        <Slider label="Max Iter" value={maxIter} min={40} max={500} step={1} onChange={setMaxIter} />
        <Slider label="Center X" value={centerX} min={-2.2} max={1} step={0.00001} onChange={setCenterX} />
        <Slider label="Center Y" value={centerY} min={-1.4} max={1.4} step={0.00001} onChange={setCenterY} />
        <Slider label="Decay" value={decayMs} min={30} max={900} step={1} unit="ms" onChange={setDecayMs} />
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
            checked={showSamplePoints}
            onChange={(e) => setShowSamplePoints(e.target.checked)}
            style={{ accentColor: ACCENT }}
          />
          Show per-layer sample overlays
        </label>
      </div>
    </div>
  );
}
