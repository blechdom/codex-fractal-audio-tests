import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ACCENT = "#bde0fe";

type SmokeSize = 32 | 64 | 128 | 256;

export default function WebGpuV4SurfaceSmokePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<SmokeSize>(64);
  const [status, setStatus] = useState("initializing");

  useEffect(() => {
    let cancelled = false;

    async function drawSmokeTest() {
      const canvas = canvasRef.current;
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      if (!canvas || !nav?.gpu) {
        setStatus("WebGPU not available: navigator.gpu is missing");
        return;
      }

      try {
        setStatus(`requesting adapter for ${size}x${size} clear test`);
        const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) throw new Error("No WebGPU adapter found");
        const adapterInfo = adapter.info;

        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu") as any;
        if (!context) throw new Error("Could not get webgpu canvas context");

        const format = nav.gpu.getPreferredCanvasFormat();
        canvas.width = size;
        canvas.height = size;
        context.configure({
          device,
          format,
          alphaMode: "opaque",
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0.02, g: 0.16, b: 0.28, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        pass.end();
        device.queue.submit([encoder.finish()]);

        if (!cancelled) {
          const adapterLabel = adapterInfo?.device
            ? `${adapterInfo.vendor ?? "unknown vendor"} ${adapterInfo.device}`
            : "high-performance adapter";
          setStatus(`success: cleared ${size}x${size} WebGPU surface on ${adapterLabel}`);
        }
      } catch (err: any) {
        if (!cancelled) {
          setStatus(`failed: ${err?.message ?? "unknown WebGPU error"}`);
        }
      }
    }

    drawSmokeTest();
    return () => {
      cancelled = true;
    };
  }, [size]);

  return (
    <>
      <Head>
        <title>WebGPU Lab v4 - Surface Smoke Test</title>
      </Head>
      <div className="page-narrow">
        <Link href="/archive/webgpu-sonification-lab" className="back-link">
          ← webgpu sonification lab
        </Link>
        <h1 className="site-title" style={{ color: ACCENT }}>
          WebGPU Lab v4: Surface Smoke Test
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.45 }}>
          Minimal WebGPU test: request adapter/device, configure one tiny canvas, and clear it.
          No shaders, no fractal math, no uniforms. If this fails, the issue is the browser/GPU
          presentation path rather than our fractal renderer.
        </p>

        <div style={{ fontSize: "0.8rem", color: status.startsWith("success") ? "#91e6ad" : "#ffcf99", marginBottom: "0.75rem" }}>
          Status: {status}
        </div>

        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          style={{
            width: 256,
            height: 256,
            imageRendering: "pixelated",
            display: "block",
            border: "1px solid #2a3442",
            borderRadius: 8,
            background: "#05070a",
            marginBottom: "0.9rem",
          }}
        />

        <div className="presets">
          <span className="presets-label">Surface Size</span>
          {([32, 64, 128, 256] as SmokeSize[]).map((next) => (
            <button
              key={next}
              className="preset-btn"
              onClick={() => setSize(next)}
              style={next === size ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              {next}x{next}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

