import Head from "next/head";
import Link from "next/link";
import { STRATEGIES } from "@/lib/mandelbrot-sonification";

export default function Home() {
  return (
    <>
      <Head>
        <title>mandelbrot codex archive</title>
        <meta name="description" content="15 Mandelbrot sonification demos in Elementary Audio" />
      </Head>
      <div className="page-wide">

        <p style={{ marginBottom: "0.75rem" }}>
          <Link href="/" style={{ color: "#f4a261", textDecoration: "underline" }}>
            ← New WebGPU Explorer
          </Link>
        </p>
        <h1 className="site-title">mandelbrot codex archive</h1>
        <h2 className="subtitle">Fractal Sonification Strategies</h2>
        <p style={{ opacity: 0.72, maxWidth: 760, lineHeight: 1.5 }}>
          Each demo maps Mandelbrot dynamics to synthesis controls in a different way:
          scan order, smooth coloring, orbit traps, boundary gradients, distance estimators,
          multiresolution stacks, and entropy-driven tone/noise blending.
        </p>

        <h2 className="subtitle" style={{ marginTop: "1.4rem" }}>Core Building Blocks</h2>
        <p style={{ opacity: 0.72, maxWidth: 760, lineHeight: 1.5 }}>
          Shared modules you can combine: fractal data generation, playback/time application,
          and audio mapping engines.
        </p>
        <div className="experiment-grid" style={{ marginBottom: "1.2rem" }}>
          <Link href="/archive/models/fractal-data-generator" className="experiment-card">
            <h3 style={{ color: "#f4a261" }}>Fractal Data Generator</h3>
            <p>
              Generate 2D frames from Mandelbrot or Julia sets with shared viewport and point
              metrics.
            </p>
            <span className="tag">model 1</span>
          </Link>
          <Link href="/archive/models/fractal-playback-schemes" className="experiment-card">
            <h3 style={{ color: "#84a59d" }}>Fractal Playback Schemes</h3>
            <p>
              Apply time to frames using edge extraction, lane sampling, sequencers, and
              playhead patterns.
            </p>
            <span className="tag">model 2</span>
          </Link>
          <Link href="/archive/models/audio-engine" className="experiment-card">
            <h3 style={{ color: "#9d4edd" }}>Audio Engine</h3>
            <p>
              Map timed data to oscillators, filters, noise, panning, normalization, and soft
              limiting.
            </p>
            <span className="tag">model 3</span>
          </Link>
          <Link href="/archive/labs/recursive-sound/v1-plot-color-playheads" className="experiment-card">
            <h3 style={{ color: "#ff9f1c" }}>Recursive Sound V1</h3>
            <p>
              New lab inspired by recursive-sound: plotting methods, coloring transforms, and
              playhead geometry on one shared matrix.
            </p>
            <span className="tag">recursive-sound port</span>
          </Link>
          <Link href="/archive/labs/recursive-sound/v2-playhead-sonifier" className="experiment-card">
            <h3 style={{ color: "#72efdd" }}>Recursive Sound V2</h3>
            <p>
              Playhead-driven sonifier with outline/decomposition coloring modes and directional,
              radial, and rotational traversals.
            </p>
            <span className="tag">playhead sonifier</span>
          </Link>
          <Link href="/archive/labs/recursive-sound/v3-contour-tracer-sonifier" className="experiment-card">
            <h3 style={{ color: "#80ed99" }}>Recursive Sound V3</h3>
            <p>
              Marching-squares contour tracer with angle/duration contour controls mapped to
              synthesis.
            </p>
            <span className="tag">contour tracer</span>
          </Link>
          <Link href="/archive/labs/julia-boundary-lab" className="experiment-card">
            <h3 style={{ color: "#8ecae6" }}>Julia Boundary Lab</h3>
            <p>
              Dedicated Julia boundary extractor and sonifier focused on contour geometry and
              thresholded boundary motion.
            </p>
            <span className="tag">julia boundary</span>
          </Link>
          <Link href="/archive/labs/uncurled-fractal-explorer" className="experiment-card">
            <h3 style={{ color: "#f7b267" }}>Uncurled Fractal Explorer</h3>
            <p>
              Uncurl Mandelbrot or Julia structure via origin-polar and cardioid-perimeter mappings
              with branch-like color schemes for node similarity studies.
            </p>
            <span className="tag">uncurled mapping explorer</span>
          </Link>
        </div>

        <h2 className="subtitle" style={{ marginTop: "0.4rem" }}>Current Demos</h2>
        <div className="experiment-grid">
          <Link href="/archive/time-dilation" className="experiment-card">
            <h3 style={{ color: "#80ed99" }}>Time Dilation</h3>
            <p>
              Inception-inspired layered time zones: zoom migrates detail between faster and
              slower rhythmic layers.
            </p>
            <span className="tag">layered time zones</span>
          </Link>
          <Link href="/archive/time-dilation-v2" className="experiment-card">
            <h3 style={{ color: "#72efdd" }}>Time Dilation V2</h3>
            <p>
              Infinite layered playheads with crossfades per zone to mask loop seams while
              keeping zoom migration behavior.
            </p>
            <span className="tag">infinite layered playheads</span>
          </Link>
          <Link href="/archive/time-dilation-v3" className="experiment-card">
            <h3 style={{ color: "#64dfdf" }}>Time Dilation V3</h3>
            <p>
              Unfurled mapping default for left-right cyclic continuity, plus infinite layered
              playheads to reduce loop-point artifacts.
            </p>
            <span className="tag">unfurled + infinite</span>
          </Link>
          <Link href="/archive/fractal-circle-packing" className="experiment-card">
            <h3 style={{ color: "#ff9f1c" }}>Fractal Circle Packing</h3>
            <p>
              Fractal edge structures packed into circles and played as discrete onsets for
              clearer shape-to-rhythm translation.
            </p>
            <span className="tag">circle packing rhythm</span>
          </Link>
          <Link href="/archive/webgpu-sonification-lab" className="experiment-card">
            <h3 style={{ color: "#74c0fc" }}>WebGPU Sonification Lab</h3>
            <p>
              Isolated, versioned WebGPU sandbox for big changes you can track and
              recombine without touching stable demos.
            </p>
            <span className="tag">webgpu isolated</span>
          </Link>
          <Link href="/archive/edge-detection-sonification" className="experiment-card">
            <h3 style={{ color: "#90e0ef" }}>Edge Detection Sonification Lab</h3>
            <p>
              Dedicated edge-map listening demo with three playback modes: clocked, sweep,
              and burst-on-rise.
            </p>
            <span className="tag">edge sonification</span>
          </Link>
          <Link href="/archive/edge-detection-sonification-v2-clock" className="experiment-card">
            <h3 style={{ color: "#bde0fe" }}>Edge Detection Sonification V2 Clock</h3>
            <p>
              Clock-optimized edition using Elementary `train + seq` timing for steadier
              rhythmic triggering independent of UI load.
            </p>
            <span className="tag">edge sonification clock optimized</span>
          </Link>
          <Link href="/archive/stripe-edge-clocked-onsets" className="experiment-card">
            <h3 style={{ color: "#f9c74f" }}>Rhythm Demo: Stripe / Edge Clocked Onsets</h3>
            <p>
              Frozen frame turned into a transport-clock sequencer. Stripe and edge bits
              become discrete onsets over step time.
            </p>
            <span className="tag">clocked rhythm</span>
          </Link>
          <Link href="/archive/stripe-edge-clocked-onsets-v2" className="experiment-card">
            <h3 style={{ color: "#ffd166" }}>Rhythm Demo: Stripe / Edge Clocked Onsets V2</h3>
            <p>
              Cleaner baseline controls with explicit tone/noise balance and straightforward
              clocked sequencing.
            </p>
            <span className="tag">clocked rhythm v2</span>
          </Link>
          <Link href="/archive/stripe-edge-clocked-onsets-v3" className="experiment-card">
            <h3 style={{ color: "#ffe29a" }}>Rhythm Demo: Stripe / Edge Clocked Onsets V3</h3>
            <p>
              Advanced version with infinite layered playheads, crossfades, and extra
              loop-seam smoothing controls.
            </p>
            <span className="tag">clocked rhythm v3 advanced</span>
          </Link>
          <Link href="/archive/stripe-edge-clocked-onsets-v4" className="experiment-card">
            <h3 style={{ color: "#fff2b2" }}>Rhythm Demo: Stripe / Edge Clocked Onsets V4</h3>
            <p>
              Clock-optimized version that moves sequencer stepping fully into the Elementary
              graph via `train + seq`.
            </p>
            <span className="tag">clocked rhythm v4 audio-clocked</span>
          </Link>
          {STRATEGIES.map((strategy, index) => (
            <Link
              key={strategy.slug}
              href={`/archive/demos/${strategy.slug}`}
              className="experiment-card"
            >
              <h3 style={{ color: strategy.accent }}>
                {index + 1}. {strategy.title}
              </h3>
              <p>{strategy.description}</p>
              <span className="tag">mandelbrot mapping</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
