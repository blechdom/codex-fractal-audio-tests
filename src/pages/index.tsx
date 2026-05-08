import Head from "next/head";
import Link from "next/link";

const ACCENT = "#90caf9";

export default function Home() {
  return (
    <>
      <Head>
        <title>mandelbrot codex</title>
        <meta name="description" content="WebGPU fractal explorer and archived fractal sonification labs" />
      </Head>
      <div className="page-wide">
        <h1 className="site-title">mandelbrot codex</h1>
        <h2 className="subtitle">New Version: GPU Fractal Explorer</h2>
        <p style={{ opacity: 0.76, maxWidth: 860, lineHeight: 1.5 }}>
          Fresh start from the WebGPU dual-viewport renderer: higher-resolution fractal rendering,
          richer coloring schemes, preset coefficients, and an unfurled view kept close to the main
          Mandelbrot/Julia viewport.
        </p>

        <div className="experiment-grid" style={{ marginTop: "1rem", marginBottom: "1.25rem" }}>
          <Link href="/fractal-explorer" className="experiment-card">
            <h3 style={{ color: ACCENT }}>WebGPU Fractal Explorer V1</h3>
            <p>
              Main fractal plus unfurled mapping on one WebGPU surface, with expanded colorizers,
              famous-area presets, higher iteration limits, and editable coefficients by the viewport.
            </p>
            <span className="tag">new v1</span>
          </Link>
          <Link href="/julia-boundary-sonification" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Julia Boundary Sonification</h3>
            <p>
              Design notes for turning an infinite closed Julia boundary into forward-moving musical
              time using marching squares, contour loops, external angle, and multiscale traversal.
            </p>
            <span className="tag">time on boundary</span>
          </Link>
          <Link href="/time-contour-visualizer" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Shared Time T Visualizer</h3>
            <p>
              A browser drawing of T as shared phase: onion-like paths, moving playheads, and lane
              strips that show what each layer would trigger over time.
            </p>
            <span className="tag">visual explainer</span>
          </Link>
          <Link href="/real-contour-paths" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Real Contour Path Techniques</h3>
            <p>
              Compare escape-time, equipotential, distance-estimator, boundary, and color-cycle
              contours as actual extracted playhead paths.
            </p>
            <span className="tag">real paths</span>
          </Link>
          <Link href="/stripe-time-flow" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Stripe Time Flow</h3>
            <p>
              Treat B/W stripe depth as time: black is sound, white is silence, and fixed contour
              shapes become the bodies that rhythm, thickness, pitch wiggle, and ornament fit into.
            </p>
            <span className="tag">depth as time</span>
          </Link>
          <Link href="/striped-staircase" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Striped Staircase</h3>
            <p>
              A discrete stripe-time pass where whole threshold intervals become black sounding
              chunks, then time steps to the next smaller escape-depth stripe.
            </p>
            <span className="tag">stripe-to-stripe</span>
          </Link>
          <Link href="/gradient-slide" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Gradient Slide</h3>
            <p>
              Preserves the previous staircase sketch: a continuous active band slides through
              iteration depth while contours outline the current sounding region.
            </p>
            <span className="tag">saved version</span>
          </Link>
          <Link href="/shape-signature-lab" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Shape Signature Lab</h3>
            <p>
              Normalize contours by arclength and compare relative-angle/curvature waveforms as
              scale-stable fingerprints for self-similar shapes.
            </p>
            <span className="tag">relative angle</span>
          </Link>
          <Link href="/stripe-time-flow-unfurled" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Stripe Time Flow: Unfurled</h3>
            <p>
              Straighten each contour into a left-to-right body while T drives depth and stripe
              phase, so black/silence patterns can be read along the shape.
            </p>
            <span className="tag">unfurled depth</span>
          </Link>
          <Link href="/real-contour-paths-unfurled" className="experiment-card">
            <h3 style={{ color: ACCENT }}>Real Contour Paths: Unfurled</h3>
            <p>
              Unwrap real contours into playable lanes and show shared playheads traversing each path
              by normalized arclength.
            </p>
            <span className="tag">unfurled traversal</span>
          </Link>
          <Link href="/archive" className="experiment-card">
            <h3 style={{ color: "#f7b267" }}>Archive</h3>
            <p>
              All previous demos and labs are preserved under archive routes so the new version can
              start clean without losing the earlier experiments.
            </p>
            <span className="tag">previous work</span>
          </Link>
        </div>
      </div>
    </>
  );
}
