"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  alignRotationToIndex,
  easeSpinRoulette,
  jitterForRound,
  numberColor,
  ROULETTE_SEGMENTS,
  RouletteRoundState,
  resolveWheelIndex,
  ROULETTE_WHEEL_COLORS,
  SEGMENT_ANGLE,
  SPIN_DURATION_MS,
  spinTargetRotation,
  WHEEL_ORDER,
} from "@/lib/roulette";

const SEGMENT_COLORS: Record<"green" | "red" | "black", string> = ROULETTE_WHEEL_COLORS;

const CATCHUP_MS = 250;

function animateSpin(
  from: number,
  to: number,
  durationMs: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): () => void {
  const totalDistance = to - from;
  const start = performance.now();
  let frame = 0;

  function tick(now: number) {
    const t = Math.min(1, (now - start) / durationMs);
    onUpdate(from + totalDistance * easeSpinRoulette(t));
    if (t < 1) {
      frame = requestAnimationFrame(tick);
    } else {
      onComplete?.();
    }
  }

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function spinProgress(state: RouletteRoundState): number {
  const endRaw = state.spin_ends_at || state.ends_at;
  if (!endRaw) return 0;
  const endMs = new Date(endRaw).getTime();
  if (Number.isNaN(endMs)) return 0;
  const remaining = Math.min(SPIN_DURATION_MS, Math.max(0, endMs - Date.now()));
  return Math.min(1, Math.max(0, (SPIN_DURATION_MS - remaining) / SPIN_DURATION_MS));
}

function useCountdown(endsAt: string | undefined, active: boolean) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active || !endsAt) {
      setSeconds(0);
      return;
    }
    const deadline = new Date(endsAt).getTime();
    let frame: number;

    function tick() {
      const left = Math.max(0, (deadline - Date.now()) / 1000);
      setSeconds(left);
      if (left > 0) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [endsAt, active]);

  return seconds;
}

type Props = {
  state: RouletteRoundState | null;
};

export function RouletteWheel({ state }: Props) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const lastSpinRound = useRef<string | null>(null);
  const roundJitter = useRef(0);
  const rotationRef = useRef(0);
  const cancelSpin = useRef<(() => void) | null>(null);

  const phase = state?.phase;
  const countdown = Math.ceil(useCountdown(state?.ends_at, phase === "betting"));

  const applyRotation = useCallback((value: number) => {
    rotationRef.current = value;
    const el = wheelRef.current;
    if (el) {
      el.style.transform = `rotate3d(0, 0, 1, ${value}deg)`;
    }
  }, []);

  const runSpinAnimation = useCallback(
    (from: number, to: number, durationMs: number) => {
      if (Math.abs(to - from) < 0.01) {
        applyRotation(to);
        return;
      }
      cancelSpin.current?.();
      cancelSpin.current = animateSpin(from, to, Math.max(50, durationMs), applyRotation);
    },
    [applyRotation],
  );

  const snapToIndex = useCallback(
    (index: number, roundId: string) => {
      const jitter = jitterForRound(roundId);
      roundJitter.current = jitter;
      const aligned = alignRotationToIndex(rotationRef.current, index, jitter);
      if (Math.abs(aligned - rotationRef.current) < 0.05) return;
      applyRotation(aligned);
    },
    [applyRotation],
  );

  useEffect(() => {
    return () => cancelSpin.current?.();
  }, []);

  useEffect(() => {
    if (!state) return;

    const wheelIndex = resolveWheelIndex(state);

    if (state.phase === "betting") {
      cancelSpin.current?.();
      lastSpinRound.current = null;
      roundJitter.current = 0;
      return;
    }

    if (wheelIndex === undefined) return;

    if (state.phase === "result") {
      cancelSpin.current?.();
      snapToIndex(wheelIndex, state.round_id);
      return;
    }

    if (state.phase !== "spinning") return;

    const spinEndRaw = state.spin_ends_at || state.ends_at;
    const spinEndMs = spinEndRaw ? new Date(spinEndRaw).getTime() : NaN;
    const remaining = Number.isNaN(spinEndMs)
      ? SPIN_DURATION_MS
      : Math.min(SPIN_DURATION_MS, Math.max(0, spinEndMs - Date.now()));

    if (lastSpinRound.current === state.round_id) {
      return;
    }

    lastSpinRound.current = state.round_id;
    roundJitter.current = jitterForRound(state.round_id);

    const fromMod = ((rotationRef.current % 360) + 360) % 360;
    const target = spinTargetRotation(
      rotationRef.current,
      wheelIndex,
      10,
      roundJitter.current,
    );
    const progress = spinProgress(state);
    const from =
      progress > 0 && progress < 1
        ? fromMod + (target - fromMod) * easeSpinRoulette(progress)
        : fromMod;

    if (remaining <= 0 || progress >= 1) {
      const diff = Math.abs(target - from);
      if (diff < 0.05) {
        applyRotation(target);
      } else {
        runSpinAnimation(from, target, CATCHUP_MS);
      }
      return;
    }

    runSpinAnimation(from, target, remaining);
  }, [state, applyRotation, snapToIndex, runSpinAnimation]);

  const cx = 110;
  const cy = 110;
  const rOuter = 100;
  const rInner = 52;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(68vw,252px)]">
      <div className="absolute left-1/2 top-0 z-30 -translate-x-1/2">
        <div
          className="mx-auto h-0 w-0"
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "10px solid rgba(245, 245, 245, 0.7)",
          }}
        />
      </div>

      <div className="glass relative h-full w-full rounded-full p-[3px] shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
        <div className="relative h-full w-full rounded-full bg-surface/40 p-[2px]">
          <div
            ref={wheelRef}
            className="relative h-full w-full overflow-hidden rounded-full will-change-transform"
            style={{
              transform: "rotate3d(0, 0, 1, 0deg)",
              backfaceVisibility: "hidden",
            }}
          >
            <svg viewBox="0 0 220 220" className="h-full w-full">
              {Array.from({ length: ROULETTE_SEGMENTS }).map((_, i) => {
                const num = WHEEL_ORDER[i];
                const color = numberColor(num);
                const startAngle = (i * SEGMENT_ANGLE - 90) * (Math.PI / 180);
                const endAngle = ((i + 1) * SEGMENT_ANGLE - 90) * (Math.PI / 180);
                const x1 = cx + rOuter * Math.cos(startAngle);
                const y1 = cy + rOuter * Math.sin(startAngle);
                const x2 = cx + rOuter * Math.cos(endAngle);
                const y2 = cy + rOuter * Math.sin(endAngle);
                const ix1 = cx + rInner * Math.cos(startAngle);
                const iy1 = cy + rInner * Math.sin(startAngle);
                const ix2 = cx + rInner * Math.cos(endAngle);
                const iy2 = cy + rInner * Math.sin(endAngle);
                const largeArc = SEGMENT_ANGLE > 180 ? 1 : 0;

                const midAngle = ((i + 0.5) * SEGMENT_ANGLE - 90) * (Math.PI / 180);
                const tx = cx + 76 * Math.cos(midAngle);
                const ty = cy + 76 * Math.sin(midAngle);
                const textRotate = (i + 0.5) * SEGMENT_ANGLE;

                return (
                  <g key={`${num}-${i}`}>
                    <path
                      d={`M ${ix1} ${iy1} L ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${rInner} ${rInner} 0 ${largeArc} 0 ${ix1} ${iy1} Z`}
                      fill={SEGMENT_COLORS[color]}
                      stroke="var(--background)"
                      strokeWidth="0.75"
                    />
                    <text
                      x={tx}
                      y={ty}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="rgba(255,255,255,0.95)"
                      fontSize="11"
                      fontWeight="700"
                      fontFamily="system-ui, -apple-system, sans-serif"
                      transform={`rotate(${textRotate}, ${tx}, ${ty})`}
                    >
                      {num}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="glass-inset pointer-events-none absolute left-1/2 top-1/2 z-20 flex aspect-square w-[44%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-foreground shadow-[0_0_0_3px_color-mix(in_srgb,var(--surface)_90%,transparent)]">
        {phase === "betting" && (
          <span className="text-[1.65rem] font-semibold tabular-nums leading-none tracking-tight">
            {countdown.toString().padStart(2, "0")}
          </span>
        )}
        {phase === "spinning" && (
          <span className="px-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted">
            Крутим
          </span>
        )}
        {phase === "result" && state?.result_number != null && (
          <span className="text-[1.5rem] font-semibold tabular-nums leading-none">
            {state.result_number}
          </span>
        )}
      </div>
    </div>
  );
}
