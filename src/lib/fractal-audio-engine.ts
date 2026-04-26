import { type NodeRepr_t, el } from "@elemaudio/core";

export function equalPowerPan(pan: number) {
  return {
    left: Math.sqrt((1 - pan) * 0.5),
    right: Math.sqrt((1 + pan) * 0.5),
  };
}

export function normalizedSoftLimitedMono(
  signal: NodeRepr_t,
  voiceCount: number,
  drive: number
) {
  const norm = 1 / Math.sqrt(Math.max(1, voiceCount));
  return el.tanh(el.mul(signal, norm * drive));
}
