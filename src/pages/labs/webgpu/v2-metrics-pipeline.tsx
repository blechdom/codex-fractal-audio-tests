import Head from "next/head";
import Link from "next/link";

export default function WebGpuV2MetricsPipelinePage() {
  return (
    <>
      <Head>
        <title>{`WebGPU Lab v2 - Metrics Pipeline`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/webgpu-sonification-lab" className="back-link">
          ← webgpu sonification lab
        </Link>
        <h1 className="site-title" style={{ color: "#8ecae6" }}>
          WebGPU Lab v2: Metrics Pipeline
        </h1>
        <p style={{ opacity: 0.8, marginBottom: "0.8rem", lineHeight: 1.45 }}>
          Experimental branch for big changes: GPU-computed fractal metrics intended for
          sequencer and sonification recombination.
        </p>
        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: "0.8rem",
            background: "#111",
            color: "#aab",
            fontSize: "0.8rem",
            lineHeight: 1.45,
          }}
        >
          <div style={{ color: "#9ed0ff", marginBottom: "0.35rem", fontWeight: 600 }}>
            Planned pipeline stages
          </div>
          <div>- GPU compute: smooth escape + stripe + edge + density textures</div>
          <div>- Sampling adapters: raster, circular, spiral, multi-head playheads</div>
          <div>- Audio bridge: metric buffers mapped to rhythm/timbre layers</div>
          <div>- Recombine checkpoints: exportable parameter snapshots per stage</div>
        </div>
      </div>
    </>
  );
}
