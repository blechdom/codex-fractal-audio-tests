import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import {
  buildMandelbrotFields,
  buildPotentialContours,
  curvatureSignature,
  relativeAngleSignature,
  samplePath,
  TAU,
} from "@/lib/fractalContourUtils";

const ACCENT = "#90caf9";

export default function ShapeSignatureLabPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pathCount, setPathCount] = useState(8);
  const [contourLevels, setContourLevels] = useState(18);
  const [maxIter, setMaxIter] = useState(560);
  const [samples, setSamples] = useState(160);
  const [windowSize, setWindowSize] = useState(0.018);
  const [t, setT] = useState(0.12);

  const scene = useMemo(() => {
    if (typeof document === "undefined") return null;
    const grid = 220;
    const { potential } = buildMandelbrotFields(grid, Math.round(maxIter));
    const paths = buildPotentialContours(potential, grid, contourLevels, pathCount);

    const fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = grid;
    fieldCanvas.height = grid;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) return null;
    const image = fieldCtx.createImageData(grid, grid);
    for (let i = 0; i < potential.length; i += 1) {
      const shade = Math.round(18 + potential[i] * 220);
      image.data[i * 4] = shade;
      image.data[i * 4 + 1] = shade;
      image.data[i * 4 + 2] = shade;
      image.data[i * 4 + 3] = 255;
    }
    fieldCtx.putImageData(image, 0, 0);

    const signatures = paths.map((path) => ({
      angle: relativeAngleSignature(path, samples, windowSize),
      curvature: curvatureSignature(path, samples, windowSize),
      path,
    }));

    return { fieldCanvas, paths, signatures };
  }, [contourLevels, maxIter, pathCount, samples, windowSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1080;
    const h = 790;
    const viewX = 24;
    const viewY = 98;
    const viewSize = 520;
    const sigX = 590;
    const sigY = 98;
    const sigW = 440;
    const rowH = 54;
    const rowGap = 14;
    const laneCount = scene.signatures.length;

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ACCENT;
    ctx.font = "24px sans-serif";
    ctx.fillText("Shape Signature Lab: Relative Angle As Self-Similarity", 24, 38);
    ctx.fillStyle = "#b9c7d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("Contours are normalized by arclength. The waveform ignores position and scale, then listens to how the path turns.", 24, 66);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene.fieldCanvas, viewX, viewY, viewSize, viewSize);
    ctx.strokeStyle = "#334055";
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewSize, viewSize);
    ctx.fillStyle = "#dce8f7";
    ctx.font = "13px sans-serif";
    ctx.fillText("Extracted contours", viewX, viewY - 12);
    ctx.fillText("Relative angle and curvature signatures", sigX, sigY - 12);

    scene.signatures.forEach(({ path, angle, curvature }, index) => {
      const hue = (index * 360) / Math.max(1, laneCount);
      ctx.strokeStyle = `hsla(${hue}, 90%, 64%, 0.78)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      path.points.forEach((point, pointIndex) => {
        const sx = viewX + point.x * viewSize;
        const sy = viewY + point.y * viewSize;
        if (pointIndex === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      const marker = samplePath(path, t);
      ctx.fillStyle = `hsl(${hue}, 95%, 66%)`;
      ctx.beginPath();
      ctx.arc(viewX + marker.x * viewSize, viewY + marker.y * viewSize, 4, 0, TAU);
      ctx.fill();

      const rowY = sigY + index * (rowH + rowGap);
      ctx.fillStyle = "#101722";
      ctx.fillRect(sigX, rowY, sigW, rowH);
      ctx.strokeStyle = "#273347";
      ctx.strokeRect(sigX, rowY, sigW, rowH);
      ctx.strokeStyle = "#405069";
      ctx.beginPath();
      ctx.moveTo(sigX, rowY + rowH / 2);
      ctx.lineTo(sigX + sigW, rowY + rowH / 2);
      ctx.stroke();

      ctx.strokeStyle = `hsl(${hue}, 94%, 67%)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      angle.forEach((value, i) => {
        const x = sigX + (i / Math.max(1, angle.length - 1)) * sigW;
        const y = rowY + rowH * 0.5 - value * rowH * 0.42;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.58)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      curvature.forEach((value, i) => {
        const x = sigX + (i / Math.max(1, curvature.length - 1)) * sigW;
        const y = rowY + rowH * 0.5 - value * rowH * 0.42;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      const cursorX = sigX + t * sigW;
      ctx.strokeStyle = "#00e5ff";
      ctx.beginPath();
      ctx.moveTo(cursorX, rowY - 2);
      ctx.lineTo(cursorX, rowY + rowH + 2);
      ctx.stroke();

      ctx.fillStyle = `hsl(${hue}, 95%, 70%)`;
      ctx.font = "11px sans-serif";
      ctx.fillText(String(index + 1).padStart(2, "0"), sigX - 24, rowY + 32);
    });

    ctx.fillStyle = "#93a4b9";
    ctx.font = "13px sans-serif";
    ctx.fillText("Color trace = relative tangent angle. White trace = curvature / local turning change.", sigX, sigY + laneCount * (rowH + rowGap) + 14);
  }, [scene, t]);

  return (
    <>
      <Head>
        <title>Shape Signature Lab | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>
        <h1 className="site-title" style={{ color: ACCENT }}>
          Shape Signature Lab
        </h1>
        <p style={{ maxWidth: 980, opacity: 0.82, lineHeight: 1.5 }}>
          Relative angle is a candidate for scale-stable shape. A small curl and a large curl can have different coordinates and lengths, but if their tangent direction changes in the same order over normalized arclength, they share a shape fingerprint.
        </p>

        <div className="controls" style={{ marginBottom: "1rem" }}>
          <Slider label="Signature T" value={t} min={0} max={1} step={0.001} onChange={setT} />
          <Slider label="Paths Shown" value={pathCount} min={1} max={12} step={1} onChange={setPathCount} />
          <Slider label="Contour Levels" value={contourLevels} min={3} max={36} step={1} onChange={setContourLevels} />
          <Slider label="Max Iter" value={maxIter} min={120} max={900} step={1} onChange={setMaxIter} />
          <Slider label="Samples" value={samples} min={32} max={320} step={1} onChange={setSamples} />
          <Slider label="Angle Window" value={windowSize} min={0.003} max={0.08} step={0.001} onChange={setWindowSize} />
        </div>

        <canvas
          ref={canvasRef}
          width={1080}
          height={790}
          style={{ width: "100%", maxWidth: 1080, height: "auto", border: "1px solid #263244", borderRadius: 10, background: "#07090d" }}
        />

        <section style={{ marginTop: "1rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>Sampling Window And Scale</h3>
          <p style={{ opacity: 0.84, lineHeight: 1.55 }}>
            Yes, sampling size changes the sequence. If the window is tiny, the signature catches microscopic jitter and pixel-level contour noise. If the window is large, the signature hears only broad turns. The trick is to measure angle over normalized arclength, then choose one or more windows as musical scale bands.
          </p>
          <p style={{ opacity: 0.84, lineHeight: 1.55, marginBottom: 0 }}>
            Vectorizing helps because it gives a clean path and arclength parameter. It does not remove the window question. The better approach is multiscale: compare the same contour with small, medium, and large windows, so self-similarity can show up as repeated turning patterns at different resolutions.
          </p>
        </section>
      </div>
    </>
  );
}
