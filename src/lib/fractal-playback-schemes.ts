import { clamp01 } from "@/lib/fractal-core";

export function computeEdgeField(
  smoothField: Float32Array,
  width: number,
  height: number,
  gain = 4.2
) {
  const edges = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const l = smoothField[y * width + Math.max(0, x - 1)];
      const r = smoothField[y * width + Math.min(width - 1, x + 1)];
      const u = smoothField[Math.max(0, y - 1) * width + x];
      const d = smoothField[Math.min(height - 1, y + 1) * width + x];
      edges[y * width + x] = clamp01(Math.hypot(r - l, d - u) * gain);
    }
  }
  return edges;
}

export function sampleLaneColumnEnergy(
  field: Float32Array,
  width: number,
  height: number,
  lane: number,
  laneCount: number,
  xNorm: number
) {
  const x = Math.floor(clamp01(xNorm) * (width - 1));
  const y0 = Math.floor((lane / laneCount) * (height - 1));
  const y1 = Math.floor(((lane + 1) / laneCount) * (height - 1));
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= Math.max(y0, y1); y += 1) {
    sum += field[y * width + x];
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}
