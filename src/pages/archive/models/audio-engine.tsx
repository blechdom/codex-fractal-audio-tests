import Head from "next/head";
import Link from "next/link";
import { el, type NodeRepr_t } from "@elemaudio/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/Slider";
import { Oscilloscope } from "@/components/Oscilloscope";
import * as engine from "@/audio/spectrum-engine";
import { equalPowerPan, normalizedSoftLimitedMono } from "@/lib/fractal-audio-engine";

type InputMode = "checker-pulses" | "ramp-scan" | "chaotic-bits" | "manual";

function buildGraph(
  source: { patterns: number[][]; values: number[][] },
  bpm: number,
  steps: number,
  lanes: number,
  output: number,
  toneMix: number,
  noiseMix: number,
  cutoff: number,
  resonance: number,
  attackMs: number,
  decayMs: number
): NodeRepr_t {
  const stepRate = Math.max(0.001, (bpm / 60) * (steps / 4));
  const metro = el.train(el.const({ key: "ae-metro-rate", value: stepRate }));
  const reset = el.const({ key: "ae-metro-reset", value: 0 });
  const attackSec = Math.max(0.001, attackMs * 0.001);
  const decaySec = Math.max(0.02, decayMs * 0.001);
  const releaseSec = Math.max(0.02, decaySec * 0.85);

  let left: NodeRepr_t = el.const({ key: "ae-zero-l", value: 0 });
  let right: NodeRepr_t = el.const({ key: "ae-zero-r", value: 0 });

  for (let lane = 0; lane < lanes; lane += 1) {
    const laneNorm = lane / Math.max(1, lanes - 1);
    const valueSeq = el.seq(
      { key: `ae-v-seq-${lane}`, seq: source.values[lane] ?? Array(steps).fill(0), hold: true, loop: true },
      metro,
      reset
    );
    const gateSeq = el.seq(
      { key: `ae-g-seq-${lane}`, seq: source.patterns[lane] ?? Array(steps).fill(0), hold: true, loop: true },
      metro,
      reset
    );

    const env = el.adsr(attackSec, decaySec, 0, releaseSec, gateSeq);
    const ampSeq = el.mul(env, el.add(0.2, el.mul(0.8, valueSeq)));
    const freq = 55 * Math.pow(2, laneNorm * 6.4);
    const freqNode = el.mul(el.const({ key: `ae-f-${lane}`, value: freq }), el.add(0.7, el.mul(0.7, valueSeq)));

    const tone = el.cycle(freqNode);
    const noisy = el.bandpass(
      el.mul(el.const({ key: `ae-nf-${lane}`, value: Math.min(12000, freq * 3.4) }), el.add(0.4, valueSeq)),
      1 + resonance * 2.5,
      el.noise()
    );
    const laneSig = el.add(
      el.mul(tone, el.mul(ampSeq, el.const({ key: `ae-tg-${lane}`, value: toneMix }))),
      el.mul(noisy, el.mul(ampSeq, el.const({ key: `ae-ng-${lane}`, value: noiseMix })))
    );

    const pan = laneNorm * 2 - 1;
    const { left: lGain, right: rGain } = equalPowerPan(pan);
    left = el.add(left, el.mul(laneSig, lGain));
    right = el.add(right, el.mul(laneSig, rGain));
  }

  const mono = el.mul(el.add(left, right), 0.5);
  const filtered = el.lowpass(
    el.const({ key: "ae-master-cut", value: cutoff }),
    el.const({ key: "ae-master-q", value: 0.6 + resonance * 7 }),
    mono
  );
  const limited = normalizedSoftLimitedMono(filtered, lanes, 1.55);
  return el.scope({ name: "scope" }, el.mul(limited, el.sm(el.const({ key: "ae-master", value: output }))));
}

export default function AudioEngineModelPage() {
  const ACCENT = "#9d4edd";
  const UI_SCOPE_INTERVAL_MS = 100;
  const UI_STEP_INTERVAL_MS = 90;

  const [playing, setPlaying] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("checker-pulses");
  const [output, setOutput] = useState(0.62);
  const [bpm, setBpm] = useState(112);
  const [steps, setSteps] = useState(24);
  const [lanes, setLanes] = useState(16);
  const [threshold, setThreshold] = useState(0.45);
  const [manualInput, setManualInput] = useState(0.7);
  const [toneMix, setToneMix] = useState(0.62);
  const [noiseMix, setNoiseMix] = useState(0.22);
  const [cutoff, setCutoff] = useState(4200);
  const [resonance, setResonance] = useState(0.4);
  const [attackMs, setAttackMs] = useState(7);
  const [decayMs, setDecayMs] = useState(140);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [activeStep, setActiveStep] = useState(0);

  const rafRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const playingRef = useRef(false);
  const lastScopeUiMsRef = useRef(0);
  const lastStepUiMsRef = useRef(0);

  const source = useMemo(() => {
    const patterns = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));
    const values = Array.from({ length: lanes }, () => Array<number>(steps).fill(0));
    for (let lane = 0; lane < lanes; lane += 1) {
      const laneNorm = lane / Math.max(1, lanes - 1);
      for (let step = 0; step < steps; step += 1) {
        const stepNorm = step / Math.max(1, steps - 1);
        let v = 0;
        if (inputMode === "checker-pulses") {
          v = ((lane + step) & 1) === 0 ? 0.92 : 0.18;
        } else if (inputMode === "ramp-scan") {
          v = stepNorm * (0.45 + 0.55 * (1 - laneNorm));
        } else if (inputMode === "chaotic-bits") {
          v = 0.5 + 0.5 * Math.sin(step * 0.73 + lane * 1.11 + stepNorm * laneNorm * 11.4);
        } else {
          v = manualInput;
        }
        values[lane][step] = v;
        patterns[lane][step] = v >= threshold ? 1 : 0;
      }
    }
    return { patterns, values };
  }, [inputMode, lanes, manualInput, steps, threshold]);

  useEffect(() => {
    engine.onScope((data) => {
      if (!playingRef.current) return;
      const now = performance.now();
      if (now - lastScopeUiMsRef.current < UI_SCOPE_INTERVAL_MS) return;
      lastScopeUiMsRef.current = now;
      setScopeData(data);
    });
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      engine.suspend();
    },
    []
  );

  useEffect(() => {
    if (!playing) return;
    engine.render(
      buildGraph(
        source,
        bpm,
        steps,
        lanes,
        output,
        toneMix,
        noiseMix,
        cutoff,
        resonance,
        attackMs,
        decayMs
      )
    );
  }, [attackMs, bpm, cutoff, decayMs, lanes, noiseMix, output, playing, resonance, source, steps, toneMix]);

  useEffect(() => {
    if (!playing) return;
    const tickUi = () => {
      const now = performance.now();
      if (!t0Ref.current) t0Ref.current = now;
      const t = (now - t0Ref.current) * 0.001;
      const sps = (bpm / 60) * (steps / 4);
      const stepIdx = Math.floor(t * sps) % Math.max(1, steps);
      if (now - lastStepUiMsRef.current >= UI_STEP_INTERVAL_MS) {
        lastStepUiMsRef.current = now;
        setActiveStep(stepIdx);
      }
      rafRef.current = requestAnimationFrame(tickUi);
    };
    rafRef.current = requestAnimationFrame(tickUi);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bpm, playing, steps]);

  const togglePlay = async () => {
    if (!playingRef.current) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
      playingRef.current = true;
      t0Ref.current = 0;
      lastScopeUiMsRef.current = 0;
      lastStepUiMsRef.current = 0;
      engine.render(
        buildGraph(
          source,
          bpm,
          steps,
          lanes,
          output,
          toneMix,
          noiseMix,
          cutoff,
          resonance,
          attackMs,
          decayMs
        )
      );
      return;
    }
    cancelAnimationFrame(rafRef.current);
    engine.render(el.const({ key: "ae-silence", value: 0 }));
    engine.suspend();
    setPlaying(false);
    setScopeData([]);
    playingRef.current = false;
  };

  return (
    <>
      <Head>
        <title>Audio Engine | mandelbrot codex</title>
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            ← Home
          </Link>
        </p>
        <h1 className="site-title">Audio Engine</h1>
        <p style={{ opacity: 0.78, maxWidth: 760, lineHeight: 1.5 }}>
          Playable engine sandbox: feed a time-varying input stream into oscillators/noise/filtering
          and tweak synthesis parameters to hear how the same input maps to different timbres.
        </p>

        <div className="transport">
          <button className="play-btn" style={{ borderColor: ACCENT, color: ACCENT }} onClick={togglePlay}>
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <div className="scope-wrap">
            <Oscilloscope data={scopeData} color={ACCENT} width={360} height={100} />
          </div>
        </div>

        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            background: "#101010",
            padding: "0.6rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${steps}, minmax(0,1fr))`,
              gap: 2,
            }}
          >
            {Array.from({ length: lanes }, (_, lane) =>
              Array.from({ length: steps }, (_, step) => {
                const v = source.values[lane][step];
                const on = source.patterns[lane][step] > 0;
                return (
                  <div
                    key={`${lane}-${step}`}
                    style={{
                      height: 10,
                      borderRadius: 2,
                      background: on
                        ? `rgba(157, 78, 221, ${0.18 + 0.82 * v})`
                        : "rgba(70,70,70,0.28)",
                      outline: step === activeStep ? `1px solid ${ACCENT}` : "none",
                      outlineOffset: -1,
                    }}
                  />
                );
              })
            )}
          </div>
          <div className="info-row" style={{ marginTop: "0.5rem" }}>
            <span className="info-label">Active Step</span>
            <span className="info-value">
              {activeStep + 1}/{steps}
            </span>
            <span className="info-value">input: {inputMode}</span>
          </div>
        </div>

        <div className="controls">
          <div className="presets">
            <span className="presets-label">Input Source</span>
            {(["checker-pulses", "ramp-scan", "chaotic-bits", "manual"] as InputMode[]).map((m) => (
              <button
                key={m}
                className="preset-btn"
                onClick={() => setInputMode(m)}
                style={m === inputMode ? { borderColor: ACCENT, color: ACCENT } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          {inputMode === "manual" && (
            <Slider label="Manual Input" value={manualInput} min={0} max={1} step={0.01} onChange={setManualInput} />
          )}
          <Slider label="BPM" value={bpm} min={40} max={260} step={1} onChange={setBpm} />
          <Slider label="Steps" value={steps} min={4} max={64} step={1} onChange={setSteps} />
          <Slider label="Lanes" value={lanes} min={4} max={32} step={1} onChange={setLanes} />
          <Slider label="Input Th" value={threshold} min={0} max={1} step={0.01} onChange={setThreshold} />
          <Slider label="Tone Mix" value={toneMix} min={0} max={1} step={0.01} onChange={setToneMix} />
          <Slider label="Noise Mix" value={noiseMix} min={0} max={1} step={0.01} onChange={setNoiseMix} />
          <Slider label="Cutoff" value={cutoff} min={120} max={12000} step={1} unit="Hz" onChange={setCutoff} />
          <Slider label="Resonance" value={resonance} min={0} max={1} step={0.01} onChange={setResonance} />
          <Slider label="Attack" value={attackMs} min={1} max={40} step={1} unit="ms" onChange={setAttackMs} />
          <Slider label="Decay" value={decayMs} min={20} max={500} step={1} unit="ms" onChange={setDecayMs} />
          <Slider label="Output" value={output} min={0} max={1} step={0.01} onChange={setOutput} />
        </div>
      </div>
    </>
  );
}
