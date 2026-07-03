"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  alignRotationToIndex,
  numberColor,
  ROULETTE_SEGMENTS,
  RouletteRoundState,
  resolveWheelIndex,
  SEGMENT_ANGLE,
  SPIN_DURATION_MS,
  spinTargetRotation,
  WHEEL_ORDER,
} from "@/lib/roulette";

const COLORS = {
  green: "#27ae60",
  red: "#c0392b",
  black: "#3d4450",
};

const YELLOW = "#f1c40f";

function easeSpinFriction(t: number): number {
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  const k = 5.2;
  const denom = 1 - Math.exp(-k);
  return (1 - Math.exp(-k * t)) / denom;
}

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
    if (t >= 1) {
      onUpdate(to);
      onComplete?.();
      return;
    }
    onUpdate(from + totalDistance * easeSpinFriction(t));
    frame = requestAnimationFrame(tick);
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
  const [rotation, setRotation] = useState(0);
  const lastSpinRound = useRef<string | null>(null);
  const rotationRef = useRef(0);
  const cancelSpin = useRef<(() => void) | null>(null);

  const phase = state?.phase;
  const countdown = Math.ceil(useCountdown(state?.ends_at, phase === "betting"));

  const applyRotation = useCallback((value: number) => {
    rotationRef.current = value;
    setRotation(value);
  }, []);

  const snapToIndex = useCallback(
    (index: number) => {
      const aligned = alignRotationToIndex(rotationRef.current, index);
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
      return;
    }

    if (wheelIndex === undefined) return;

    if (state.phase === "result") {
      cancelSpin.current?.();
      snapToIndex(wheelIndex);
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

    const fromMod = ((rotationRef.current % 360) + 360) % 360;
    const target = spinTargetRotation(rotationRef.current, wheelIndex, 8);
    const progress = spinProgress(state);
    const from =
      progress > 0 && progress < 1
        ? fromMod + (target - fromMod) * easeSpinFriction(progress)
        : fromMod;

    cancelSpin.current?.();
    applyRotation(from);

    if (remaining <= 0 || progress >= 1) {
      applyRotation(target);
      return;
    }

    cancelSpin.current = animateSpin(from, target, Math.max(300, remaining), applyRotation, () => {
      applyRotation(target);
    });
  }, [state, applyRotation, snapToIndex]);

  const size = 300;
  const cx = 110;
  const cy = 110;
  const rOuter = 100;
  const rInner = 52;
  const hubSize = rInner * 2 * (size / 220);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute left-1/2 top-[-1px] z-30 -translate-x-1/2">
        <div
          className="mx-auto h-0 w-0"
          style={{
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: `12px solid ${YELLOW}`,
          }}
        />
      </div>

      <div className="relative h-full w-full rounded-full border-[3px] border-[#1a1f26]">
        <div
          className="relative h-full w-full overflow-hidden rounded-full will-change-transform"
          style={{
            transform: `rotate(${rotation}deg) translateZ(0)`,
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
                    fill={COLORS[color]}
                    stroke="#1a1f26"
                    strokeWidth="1"
                  />
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#ffffff"
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

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        style={{
          width: hubSize,
          height: hubSize,
          background: YELLOW,
        }}
      >
        {phase === "betting" && (
          <span
            className="font-bold tabular-nums leading-none text-[#1a1f26]"
            style={{ fontSize: "2rem" }}
          >
            {countdown.toString().padStart(2, "0")}
          </span>
        )}
        {phase === "spinning" && (
          <span className="px-2 text-center text-[13px] font-bold uppercase leading-tight tracking-wide text-[#1a1f26]">
            Розыгрыш
          </span>
        )}
        {phase === "result" && state?.result_number != null && (
          <span className="text-3xl font-bold tabular-nums leading-none text-[#1a1f26]">
            {state.result_number}
          </span>
        )}
      </div>
    </div>
  );
}
