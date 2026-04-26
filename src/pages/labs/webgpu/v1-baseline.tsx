import { useMemo } from "react";
import Head from "next/head";
import Link from "next/link";

export default function WebGpuV1BaselinePage() {
  const webGpuAvailable = useMemo(
    () => typeof navigator !== "undefined" && "gpu" in navigator,
    []
  );

  return (
    <>
      <Head>
        <title>{`WebGPU Lab v1 - Baseline`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/webgpu-sonification-lab" className="back-link">
          ← webgpu sonification lab
        </Link>
        <h1 className="site-title" style={{ color: "#74c0fc" }}>
          WebGPU Lab v1: Baseline
        </h1>
        <p style={{ opacity: 0.8, marginBottom: "0.8rem", lineHeight: 1.45 }}>
          Stable checkpoint for isolated routing + capability checks. No DSP path changes.
        </p>
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
          WebGPU support:{" "}
          <strong style={{ color: webGpuAvailable ? "#7bd88f" : "#ff8787" }}>
            {webGpuAvailable ? "available" : "not detected"}
          </strong>
        </div>
      </div>
    </>
  );
}
