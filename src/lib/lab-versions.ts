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
    route: "/labs/webgpu/v1-baseline",
    status: "stable",
    goal: "Establish isolated WebGPU route and capability checks.",
    ingredients: ["isolation", "feature-detect", "safety"],
  },
  {
    id: "webgpu-v2-metrics-pipeline",
    family: "webgpu",
    version: "v2",
    title: "WebGPU Metrics Pipeline",
    route: "/labs/webgpu/v2-metrics-pipeline",
    status: "experimental",
    goal: "Prototype GPU-computed fractal metrics for sonification inputs.",
    ingredients: ["compute pass", "texture metrics", "CPU readback"],
  },
];
