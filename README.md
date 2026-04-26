# Mandelbrot Codex

Interactive fractal sonification playground built with [Next.js](https://nextjs.org) and [Elementary Audio](https://www.elementary.audio/).

The project explores how 2D structure (Mandelbrot, Julia, and synthetic pattern fields) can be mapped into perceivable audio time using sequencers, playheads, contour tracing, and edge-driven rhythm strategies.

## What Is In This Repo

- **Core Building Blocks**
  - `Fractal Data Generator` (`/models/fractal-data-generator`)
  - `Fractal Playback Schemes` (`/models/fractal-playback-schemes`)
  - `Audio Engine` (`/models/audio-engine`)
- **Fractal Rhythm + Sonification Demos**
  - Stripe/edge clocked onsets (including versioned variants)
  - Edge detection sonification lab (including clock-optimized variant)
  - Time Dilation labs (v1-v3)
  - Fractal Circle Packing
  - 15 baseline Mandelbrot sonification strategy demos
- **Recursive Sound Labs**
  - Plot + color + playheads (`/labs/recursive-sound/v1-plot-color-playheads`)
  - Playhead sonifier (`/labs/recursive-sound/v2-playhead-sonifier`)
  - Contour tracer sonifier (`/labs/recursive-sound/v3-contour-tracer-sonifier`)
- **Julia Boundary Lab**
  - Dedicated Julia contour extraction and boundary sonification workflow

## Highlights

- Modular architecture in `src/lib`:
  - `fractal-core.ts` (Mandelbrot/Julia + synthetic data sources)
  - `fractal-playback-schemes.ts` (edge fields and lane/column sampling)
  - `fractal-audio-engine.ts` (audio utility functions, gain/pan/limiting helpers)
- Multiple data sources for sonification testing:
  - `fractal`, `stripes`, `checkerboard`, `polka-dots`
- Versioned labs to preserve stable demos while iterating on new ideas
- Clock-optimized sequencer variants that use Elementary timing (`train + seq`) for steadier playback

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm run export
```

## Stack

- Next.js 16 / React 19 / TypeScript
- Elementary Audio (`@elemaudio/core` + `@elemaudio/web-renderer`)
