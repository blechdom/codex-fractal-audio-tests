import { clamp01 } from "@/lib/fractal-core";

export interface ContourSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angleDeg: number;
  length: number;
}

export interface ContourControl {
  angle: number;
  duration: number;
  cx: number;
  cy: number;
}

export function marchingSquaresSegments(
  field: Float32Array,
  width: number,
  height: number,
  threshold: number,
  maxSegments = 6000
) {
  const segments: ContourSegment[] = [];
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const nw = field[y * width + x] >= threshold ? 1 : 0;
      const ne = field[y * width + (x + 1)] >= threshold ? 1 : 0;
      const se = field[(y + 1) * width + (x + 1)] >= threshold ? 1 : 0;
      const sw = field[(y + 1) * width + x] >= threshold ? 1 : 0;
      const code = (nw << 3) | (ne << 2) | (se << 1) | sw;
      if (code === 0 || code === 15) continue;

      const a = { x: x + 0.5, y };
      const b = { x: x + 1, y: y + 0.5 };
      const c = { x: x + 0.5, y: y + 1 };
      const d = { x, y: y + 0.5 };

      switch (code) {
        case 1:
        case 14:
          pushSeg(segments, d.x, d.y, c.x, c.y);
          break;
        case 2:
        case 13:
          pushSeg(segments, c.x, c.y, b.x, b.y);
          break;
        case 3:
        case 12:
          pushSeg(segments, d.x, d.y, b.x, b.y);
          break;
        case 4:
        case 11:
          pushSeg(segments, b.x, b.y, a.x, a.y);
          break;
        case 6:
        case 9:
          pushSeg(segments, c.x, c.y, a.x, a.y);
          break;
        case 7:
        case 8:
          pushSeg(segments, d.x, d.y, a.x, a.y);
          break;
        case 5:
          pushSeg(segments, d.x, d.y, a.x, a.y);
          pushSeg(segments, b.x, b.y, c.x, c.y);
          break;
        case 10:
          pushSeg(segments, a.x, a.y, b.x, b.y);
          pushSeg(segments, c.x, c.y, d.x, d.y);
          break;
      }
    }
  }

  if (segments.length <= maxSegments) return segments;
  const stride = Math.ceil(segments.length / maxSegments);
  return segments.filter((_, i) => i % stride === 0);
}

export function contourControlsFromSegments(
  segments: ContourSegment[],
  width: number,
  height: number,
  maxControls = 1024
) {
  if (segments.length === 0) return [];
  const stride = Math.max(1, Math.floor(segments.length / Math.max(1, maxControls)));
  const controls: ContourControl[] = [];
  for (let i = 0; i < segments.length; i += stride) {
    const s = segments[i];
    controls.push({
      angle: s.angleDeg,
      duration: s.length,
      cx: clamp01(((s.x1 + s.x2) * 0.5) / Math.max(1, width - 1)),
      cy: clamp01(((s.y1 + s.y2) * 0.5) / Math.max(1, height - 1)),
    });
  }
  return controls;
}

function pushSeg(
  segments: ContourSegment[],
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const radians = Math.atan2(dy, dx);
  const angleDeg = ((radians * 180) / Math.PI + 360) % 360;
  segments.push({ x1, y1, x2, y2, angleDeg, length });
}
