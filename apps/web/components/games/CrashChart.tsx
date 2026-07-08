"use client";

import { useEffect, useRef, useState } from "react";
import {
  CrashRoundState,
  calibrateClockOffsetMs,
  chartProgress,
  computeRunningMultiplier,
  elapsedMsForMultiplier,
  formatMultiplier,
  formatMultiplierLive,
  multiplierAtElapsedMs,
  resolveRunStartMs,
  statusSubtext,
} from "@/lib/crash";
import { cn } from "@/lib/utils";

const W = 360;
const H = 200;
const PAD = 14;
const TIP_X = W - PAD - 6;
const TIP_Y = PAD + 22;
const START_X = PAD + 4;
const CLOCK_SYNC_BLEND = 0.28;

type Tip = { x: number; y: number };

type Props = {
  state: CrashRoundState | null;
  onLiveMultiplier?: (mult: number) => void;
};

function buildCurve(
  elapsedMs: number,
  tipMult: number,
): { area: string; line: string; tip: Tip } {
  const mult = Math.max(1, tipMult);
  const bottomY = H - PAD;

  if (mult <= 1.001 || elapsedMs <= 8) {
    return {
      area: "",
      line: `M ${START_X.toFixed(1)} ${bottomY.toFixed(1)}`,
      tip: { x: START_X, y: bottomY },
    };
  }

  const tipProgress = chartProgress(mult);
  const tipX = START_X + (TIP_X - START_X) * tipProgress;
  const tipY = bottomY - (bottomY - TIP_Y) * tipProgress;

  const steps = Math.min(100, Math.max(24, Math.floor(elapsedMs / 35)));
  const pts: Tip[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = (elapsedMs * i) / steps;
    const m = Math.max(1, Math.min(multiplierAtElapsedMs(t), mult));
    const p = chartProgress(m);
    const x = START_X + (TIP_X - START_X) * p;
    const y = bottomY - (bottomY - TIP_Y) * p;
    pts.push({ x, y });
  }

  const tip: Tip = { x: tipX, y: tipY };
  pts[pts.length - 1] = tip;

  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const area = `${line} L ${tip.x.toFixed(1)} ${bottomY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${bottomY.toFixed(1)} Z`;

  return { area, line, tip };
}

function applyCurve(
  built: ReturnType<typeof buildCurve>,
  refs: {
    area: React.RefObject<SVGPathElement | null>;
    line: React.RefObject<SVGPathElement | null>;
    tip: React.RefObject<SVGCircleElement | null>;
  },
) {
  refs.area.current?.setAttribute("d", built.area);
  refs.line.current?.setAttribute("d", built.line);
  refs.tip.current?.setAttribute("cx", built.tip.x.toFixed(1));
  refs.tip.current?.setAttribute("cy", built.tip.y.toFixed(1));
}

export function CrashChart({ state, onLiveMultiplier }: Props) {
  const phase = state?.phase;
  const crashed = phase === "crashed";
  const running = phase === "running";
  const betting = phase === "betting";

  const [countdown, setCountdown] = useState(0);
  const [staticMult, setStaticMult] = useState("1.00×");

  const roundRef = useRef<string | null>(null);
  const runStartMs = useRef(0);
  const clockOffsetMs = useRef(0);
  const lastServerMult = useRef(1);
  const lastTickAtMs = useRef(0);
  const runningReadyRef = useRef(false);
  const stateRef = useRef(state);
  const onLiveRef = useRef(onLiveMultiplier);
  const areaRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const tipRef = useRef<SVGCircleElement>(null);
  const multLabelRef = useRef<HTMLSpanElement>(null);

  const curveRefs = { area: areaRef, line: lineRef, tip: tipRef };

  stateRef.current = state;
  onLiveRef.current = onLiveMultiplier;

  useEffect(() => {
    if (!betting || !state?.ends_at) {
      setCountdown(0);
      return;
    }
    const deadline = new Date(state.ends_at).getTime();
    let frame: number;
    function tick() {
      setCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      if (Date.now() < deadline) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [betting, state?.ends_at, state?.round_id]);

  useEffect(() => {
    if (!state) return;

    if (state.round_id !== roundRef.current) {
      roundRef.current = state.round_id;
      runningReadyRef.current = false;
      runStartMs.current = 0;
      clockOffsetMs.current = 0;
      lastServerMult.current = 1;
      lastTickAtMs.current = 0;
    }

    if (state.phase === "running") {
      const serverMult = Math.max(1, state.multiplier ?? 1);
      const now = Date.now();

      if (!runningReadyRef.current) {
        runningReadyRef.current = true;
        runStartMs.current = resolveRunStartMs(state);
        clockOffsetMs.current = calibrateClockOffsetMs(runStartMs.current, serverMult, now);
        lastServerMult.current = serverMult;
        lastTickAtMs.current = now;
      } else if (serverMult !== lastServerMult.current) {
        const targetOffset = calibrateClockOffsetMs(runStartMs.current, serverMult, now);
        clockOffsetMs.current +=
          (targetOffset - clockOffsetMs.current) * CLOCK_SYNC_BLEND;
        lastServerMult.current = serverMult;
        lastTickAtMs.current = now;
      }
    }

    if (state.phase === "crashed" && state.crash_point) {
      runningReadyRef.current = false;
      const crashMult = state.crash_point;
      const elapsedMs = elapsedMsForMultiplier(crashMult);
      applyCurve(buildCurve(elapsedMs, crashMult), curveRefs);
      setStaticMult(formatMultiplier(crashMult));
      onLiveRef.current?.(crashMult);
    } else if (!running) {
      runningReadyRef.current = false;
      const mult = betting ? 1 : Math.max(1, state.multiplier ?? 1);
      setStaticMult(formatMultiplier(mult));
    }
  }, [state, running, betting]);

  useEffect(() => {
    if (!running) return;

    let frame: number;

    function tick() {
      const s = stateRef.current;
      if (!s || s.phase !== "running" || !runStartMs.current) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      const mult = computeRunningMultiplier({
        runStartMs: runStartMs.current,
        clockOffsetMs: clockOffsetMs.current,
        serverMultiplier: lastServerMult.current,
        lastTickAtMs: lastTickAtMs.current,
        nowMs: now,
      });
      const elapsedMs = Math.max(0, now - clockOffsetMs.current - runStartMs.current);

      applyCurve(buildCurve(elapsedMs, mult), curveRefs);

      const label = formatMultiplierLive(mult);
      if (multLabelRef.current) {
        multLabelRef.current.textContent = label;
      }
      onLiveRef.current?.(mult);

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const showCurve = running || crashed;
  const lineColor = crashed ? "var(--danger)" : "var(--success)";
  const fillColor = crashed ? "var(--danger)" : "var(--success)";

  return (
    <div
      className={cn(
        "glass relative mx-auto aspect-[5/3] w-full max-w-md overflow-hidden rounded-2xl",
        crashed && "animate-[crash-flash_0.45s_ease-out]",
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="crash-fill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0.22" />
          </linearGradient>
          <clipPath id="crash-clip">
            <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} />
          </clipPath>
        </defs>

        {[0.33, 0.66].map((ratio) => (
          <line
            key={ratio}
            x1={PAD}
            y1={PAD + (H - PAD * 2) * ratio}
            x2={W - PAD}
            y2={PAD + (H - PAD * 2) * ratio}
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}

        {showCurve && (
          <g clipPath="url(#crash-clip)">
            <path ref={areaRef} fill="url(#crash-fill)" />
            <path
              ref={lineRef}
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              ref={tipRef}
              r="4.5"
              fill={lineColor}
              opacity={crashed ? 0.9 : 1}
            />
          </g>
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1">
        {betting ? (
          <>
            <span className="text-5xl font-bold tabular-nums tracking-tight text-accent">
              {countdown.toString().padStart(2, "0")}
            </span>
            <span className="text-xs font-medium text-muted">До старта</span>
          </>
        ) : (
          <>
            <span
              ref={running ? multLabelRef : undefined}
              className={cn(
                "text-5xl font-bold tabular-nums tracking-tight",
                crashed ? "text-danger" : "text-foreground",
              )}
            >
              {running ? null : staticMult}
            </span>
            <span className={cn("text-xs font-medium", crashed ? "text-danger/80" : "text-muted")}>
              {statusSubtext(phase)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
