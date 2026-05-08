import { useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { LAB_VERSIONS } from "@/lib/lab-versions";

export default function WebGpuSonificationLabPage() {
  const webGpuAvailable = useMemo(
    () => typeof navigator !== "undefined" && "gpu" in navigator,
    []
  );

  return (
    <>
      <Head>
        <title>{`WebGPU Sonification Lab - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>

        <h1 className="site-title" style={{ color: "#74c0fc" }}>
          WebGPU Sonification Lab
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45, marginBottom: "0.9rem" }}>
          This route is intentionally isolated for WebGPU experiments so existing
          CPU/Elementary demos stay unchanged and stable.
        </p>

        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: "0.8rem",
            background: "#111",
            marginBottom: "0.9rem",
            fontSize: "0.8rem",
            color: "#aaa",
            lineHeight: 1.45,
          }}
        >
          <div style={{ marginBottom: "0.4rem", color: "#9ed0ff", fontWeight: 600 }}>
            Isolation guarantees
          </div>
          <div>- No shared WebGPU path is injected into existing demos.</div>
          <div>- This page is where compute/texture/audio experiments will land.</div>
          <div>- We can iterate aggressively here without risking regressions elsewhere.</div>
        </div>

        <div
          style={{
            border: "1px solid #223",
            borderRadius: 8,
            padding: "0.8rem",
            background: "#0d1118",
            fontSize: "0.8rem",
            color: "#a7b1c2",
          }}
        >
          WebGPU support in this browser:{" "}
          <strong style={{ color: webGpuAvailable ? "#7bd88f" : "#ff8787" }}>
            {webGpuAvailable ? "available" : "not detected"}
          </strong>
        </div>

        <div style={{ marginTop: "1rem" }} className="experiment-grid">
          {LAB_VERSIONS.filter((v) => v.family === "webgpu").map((entry) => (
            <Link key={entry.id} href={entry.route} className="experiment-card">
              <h3 style={{ color: "#8ecae6" }}>
                {entry.version.toUpperCase()} - {entry.title}
              </h3>
              <p>{entry.goal}</p>
              <span className="tag">{entry.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
