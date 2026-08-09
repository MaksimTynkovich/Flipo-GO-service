"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  alignRotationToIndex,
  easeSpinRoulette,
  isLandingPause,
  jitterForRound,
  numberColor,
  pointerSampleAtRotation,
  ROULETTE_SEGMENTS,
  RouletteColor,
  RouletteRoundState,
  resolveWheelIndex,
  ROULETTE_WHEEL_COLORS,
  SEGMENT_ANGLE,
  SPIN_DURATION_MS,
  spinTargetRotation,
  WHEEL_COLORS,
} from "@/lib/roulette";
import { cn } from "@/lib/utils";

const CATCHUP_MS = 250;
const RESULT_HOLD_MS = 2500;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const tt = Math.min(1, Math.max(0, t));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * tt);
  const g = Math.round(ag + (bg - ag) * tt);
  const bl = Math.round(ab + (bb - ab) * tt);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Color under the top pointer — solid in segment center, soft blend near edges. */
function pointerColorForRotation(rotationDeg: number): string {
  const { index, t } = pointerSampleAtRotation(rotationDeg);
  const cur = ROULETTE_WHEEL_COLORS[WHEEL_COLORS[index]];
  const edge = 0.18;
  if (t < edge) {
    const prev = (index - 1 + ROULETTE_SEGMENTS) % ROULETTE_SEGMENTS;
    return mixHex(ROULETTE_WHEEL_COLORS[WHEEL_COLORS[prev]], cur, 0.5 + t / (2 * edge));
  }
  if (t > 1 - edge) {
    const next = (index + 1) % ROULETTE_SEGMENTS;
    return mixHex(cur, ROULETTE_WHEEL_COLORS[WHEEL_COLORS[next]], (t - (1 - edge)) / (2 * edge));
  }
  return cur;
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
  const pointerRef = useRef<SVGPathElement>(null);
  const lastSpinRound = useRef<string | null>(null);
  const roundJitter = useRef(0);
  const rotationRef = useRef(0);
  const pointerColorRef = useRef(pointerColorForRotation(0));
  const cancelSpin = useRef<(() => void) | null>(null);
  const resultHoldTimer = useRef<number | null>(null);
  const landTimer = useRef<number | null>(null);
  const [spinLanded, setSpinLanded] = useState(false);
  const [heldResult, setHeldResult] = useState<{
    number: number;
    color: RouletteColor;
  } | null>(null);

  const phase = state?.phase;
  const rawCountdown = useCountdown(state?.ends_at, phase === "betting");
  const countdown = Math.max(1, Math.ceil(rawCountdown));
  const awaitingStart = phase === "betting" && rawCountdown <= 0;
  const winIndex = state ? resolveWheelIndex(state) : undefined;
  const landingDone =
    spinLanded ||
    (!!state && phase === "spinning" && isLandingPause(state) && state.result_number != null);
  const showHeldResult = heldResult != null && phase !== "betting" && phase !== "spinning";
  const highlightWin =
    !!state &&
    winIndex !== undefined &&
    (phase === "result" || landingDone || isLandingPause(state) || showHeldResult);

  const applyPointerColor = useCallback((hex: string) => {
    if (pointerColorRef.current === hex) return;
    pointerColorRef.current = hex;
    const pin = pointerRef.current;
    if (pin) pin.setAttribute("fill", hex);
  }, []);

  const applyRotation = useCallback(
    (value: number) => {
      rotationRef.current = value;
      const el = wheelRef.current;
      if (el) {
        el.style.transform = `rotate3d(0, 0, 1, ${value}deg)`;
      }
      applyPointerColor(pointerColorForRotation(value));
    },
    [applyPointerColor],
  );

  const markLanded = useCallback(() => {
    setSpinLanded(true);
  }, []);

  const runSpinAnimation = useCallback(
    (from: number, to: number, durationMs: number, onComplete?: () => void) => {
      if (Math.abs(to - from) < 0.01) {
        applyRotation(to);
        onComplete?.();
        return;
      }
      cancelSpin.current?.();
      cancelSpin.current = animateSpin(from, to, Math.max(50, durationMs), applyRotation, onComplete);
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
    applyRotation(rotationRef.current);
  }, [applyRotation]);

  useEffect(() => {
    return () => {
      cancelSpin.current?.();
      if (resultHoldTimer.current) window.clearTimeout(resultHoldTimer.current);
      if (landTimer.current) window.clearTimeout(landTimer.current);
    };
  }, []);

  useEffect(() => {
    if (state?.phase === "result" && state.result_number != null) {
      setSpinLanded(true);
      setHeldResult({
        number: state.result_number,
        color: numberColor(state.result_number),
      });
      if (resultHoldTimer.current) window.clearTimeout(resultHoldTimer.current);
      resultHoldTimer.current = window.setTimeout(() => {
        setHeldResult(null);
        resultHoldTimer.current = null;
      }, RESULT_HOLD_MS);
      return;
    }

    if (state?.phase === "betting") {
      setSpinLanded(false);
      if (resultHoldTimer.current) {
        window.clearTimeout(resultHoldTimer.current);
        resultHoldTimer.current = null;
      }
      setHeldResult(null);
    }
  }, [state?.phase, state?.result_number, state?.round_id]);

  useEffect(() => {
    if (!state) return;

    const wheelIndex = resolveWheelIndex(state);

    if (state.phase === "betting") {
      cancelSpin.current?.();
      if (landTimer.current) {
        window.clearTimeout(landTimer.current);
        landTimer.current = null;
      }
      lastSpinRound.current = null;
      return;
    }

    if (wheelIndex === undefined || !state.round_id) return;

    if (state.phase === "result") {
      cancelSpin.current?.();
      snapToIndex(wheelIndex, state.round_id);
      return;
    }

    if (state.phase !== "spinning") return;

    if (lastSpinRound.current === state.round_id) {
      if (isLandingPause(state)) {
        snapToIndex(wheelIndex, state.round_id);
        markLanded();
      }
      return;
    }
    lastSpinRound.current = state.round_id;

    const jitter = jitterForRound(state.round_id);
    roundJitter.current = jitter;
    const from = rotationRef.current;
    const target = spinTargetRotation(from, wheelIndex, 8, jitter);
    const progress = spinProgress(state);
    const remaining = Math.round(SPIN_DURATION_MS * (1 - progress));

    if (remaining <= 0 || progress >= 1) {
      const diff = Math.abs(target - from);
      if (diff < 0.05) {
        applyRotation(target);
        markLanded();
      } else {
        runSpinAnimation(from, target, CATCHUP_MS, markLanded);
      }
      return;
    }

    runSpinAnimation(from, target, remaining, markLanded);
  }, [state, applyRotation, snapToIndex, runSpinAnimation, markLanded]);

  const cx = 110;
  const cy = 110;
  // Tangential dashes along the ring (not radial spokes), with gaps between colors.
  const r = 96;
  const dashHalf = ((SEGMENT_ANGLE * Math.PI) / 180) * r * 0.34;
  const stroke = 3;
  const strokeWin = 3.8;

  return (
    <div
      className={cn(
        "roulette-stage roulette-stage--x50",
        phase === "betting" && "roulette-stage--betting",
        phase === "spinning" && "roulette-stage--spinning",
        phase === "result" && "roulette-stage--result",
        phase === "waiting" && "roulette-stage--waiting",
      )}
    >
      <div className="roulette-wheel relative mx-auto aspect-square w-[min(86%,360px)]">
        <div className="roulette-pointer roulette-pointer--x50" aria-hidden>
          <svg
            className="roulette-pointer__svg"
            width="26"
            height="30"
            viewBox="0 0 32 36"
            overflow="visible"
          >
            <path
              ref={pointerRef}
              className="roulette-pointer__pin"
              d="M1.5 1.5 L16 12 L30.5 1.5 L16 34.5 Z"
              fill={pointerColorRef.current}
            />
          </svg>
        </div>

        <div
          ref={wheelRef}
          className="roulette-wheel__disk absolute inset-0 will-change-transform"
          style={{
            transform: "rotate3d(0, 0, 1, 0deg)",
            backfaceVisibility: "hidden",
          }}
        >
          <svg viewBox="0 0 220 220" className="h-full w-full overflow-visible">
            {Array.from({ length: ROULETTE_SEGMENTS }).map((_, i) => {
              const color = WHEEL_COLORS[i];
              const mid = ((i + 0.5) * SEGMENT_ANGLE - 90) * (Math.PI / 180);
              const tx = -Math.sin(mid);
              const ty = Math.cos(mid);
              const mx = cx + r * Math.cos(mid);
              const my = cy + r * Math.sin(mid);
              const x1 = mx - tx * dashHalf;
              const y1 = my - ty * dashHalf;
              const x2 = mx + tx * dashHalf;
              const y2 = my + ty * dashHalf;
              const isWin = highlightWin && i === winIndex;

              return (
                <line
                  key={i}
                  className={cn(
                    "roulette-seg",
                    highlightWin && !isWin && "roulette-seg--dim",
                    isWin && "roulette-seg--win",
                  )}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={ROULETTE_WHEEL_COLORS[color]}
                  strokeWidth={isWin ? strokeWin : stroke}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </div>

        <div
          className={cn(
            "roulette-hub roulette-hub--minimal pointer-events-none absolute left-1/2 top-1/2 z-20 flex w-[56%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center",
            phase === "betting" && countdown <= 3 && countdown > 0 && "roulette-hub--urgent",
          )}
        >
          {phase === "betting" && !awaitingStart ? (
            <div
              key={countdown}
              className={cn(
                "roulette-countdown",
                countdown <= 3 && "roulette-countdown--urgent",
              )}
            >
              <span className="roulette-countdown__value tabular-nums">
                {countdown.toString().padStart(2, "0")}
              </span>
            </div>
          ) : null}
          {phase === "waiting" && !showHeldResult && !awaitingStart ? (
            <span className="roulette-hub__idle">Скоро</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
