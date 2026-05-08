export interface LabVersionEntry {
  id: string;
  family: "webgpu" | "sequencer" | "edge-lab";
  version: string;
  title: string;
  route: string;
  status: "stable" | "experimental" | "draft";
  goal: string;
  ingredients: string[];
}

export const LAB_VERSIONS: LabVersionEntry[] = [
  {
    id: "webgpu-v1-baseline",
    family: "webgpu",
    version: "v1",
    title: "WebGPU Baseline",
    route: "/archive/labs/webgpu/v1-baseline",
    status: "stable",
    goal: "Establish isolated WebGPU route and capability checks.",
    ingredients: ["isolation", "feature-detect", "safety"],
  },
  {
    id: "webgpu-v2-metrics-pipeline",
    family: "webgpu",
    version: "v2",
    title: "WebGPU Metrics Pipeline",
    route: "/archive/labs/webgpu/v2-metrics-pipeline",
    status: "experimental",
    goal: "Prototype GPU-computed fractal metrics for sonification inputs.",
    ingredients: ["compute pass", "texture metrics", "CPU readback"],
  },
  {
    id: "webgpu-v3-dual-viewport-fractal",
    family: "webgpu",
    version: "v3",
    title: "Dual Viewport Fractal Explorer",
    route: "/archive/labs/webgpu/v3-dual-viewport-fractal",
    status: "experimental",
    goal: "Render main fractal and unfurled views fully on GPU with shared controls.",
    ingredients: ["fragment shader", "dual canvas", "uniform controls", "color modes"],
  },
  {
    id: "webgpu-v4-surface-smoke",
    family: "webgpu",
    version: "v4",
    title: "Surface Smoke Test",
    route: "/archive/labs/webgpu/v4-surface-smoke",
    status: "experimental",
    goal: "Verify the browser can allocate and clear a tiny WebGPU canvas before adding shaders.",
    ingredients: ["single canvas", "clear pass", "no shader", "adapter diagnostics"],
  },
];
