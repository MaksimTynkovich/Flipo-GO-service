"use client";

import { useEffect, useRef, useState } from "react";
import {
  CrashRoundState,
  calibrateClockOffsetMs,
  chartProgress,
  computeRunningMultiplier,
  crashHeatTone,
  elapsedMsForMultiplier,
  formatMultiplier,
  formatMultiplierLive,
  multiplierAtElapsedMs,
  resolveRunStartMs,
  statusSubtext,
} from "@/lib/crash";
import { cn } from "@/lib/utils";

const W = 360;
const H = 216;
const PAD = 16;
const TIP_X = W - PAD - 8;
const TIP_Y = PAD + 18;
const START_X = PAD + 6;
const CLOCK_SYNC_BLEND = 0.28;

type Tip = { x: number; y: number };

type Props = {
  state: CrashRoundState | null;
  onLiveMultiplier?: (mult: number) => void;
  onMilestone?: (mult: number) => void;
};

const HEAT_COLORS = {
  calm: { line: "var(--success)", fill: "var(--success)" },
  warm: { line: "#7dd3a0", fill: "#7dd3a0" },
  hot: { line: "#f0b429", fill: "#f0b429" },
  blaze: { line: "#ff8a4c", fill: "#ff8a4c" },
  crash: { line: "var(--danger)", fill: "var(--danger)" },
} as const;

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

  const steps = Math.min(120, Math.max(28, Math.floor(elapsedMs / 28)));
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
    glow: React.RefObject<SVGCircleElement | null>;
  },
) {
  refs.area.current?.setAttribute("d", built.area);
  refs.line.current?.setAttribute("d", built.line);
  refs.tip.current?.setAttribute("cx", built.tip.x.toFixed(1));
  refs.tip.current?.setAttribute("cy", built.tip.y.toFixed(1));
  refs.glow.current?.setAttribute("cx", built.tip.x.toFixed(1));
  refs.glow.current?.setAttribute("cy", built.tip.y.toFixed(1));
}

export function CrashChart({ state, onLiveMultiplier, onMilestone }: Props) {
  const phase = state?.phase;
  const crashed = phase === "crashed";
  const running = phase === "running";
  const betting = phase === "betting";

  const [countdown, setCountdown] = useState(0);
  const [staticMult, setStaticMult] = useState("1.00×");
  const [heat, setHeat] = useState<keyof typeof HEAT_COLORS>("calm");
  const [burst, setBurst] = useState(false);

  const roundRef = useRef<string | null>(null);
  const runStartMs = useRef(0);
  const clockOffsetMs = useRef(0);
  const lastServerMult = useRef(1);
  const lastTickAtMs = useRef(0);
  const runningReadyRef = useRef(false);
  const milestoneRef = useRef(1);
  const stateRef = useRef(state);
  const onLiveRef = useRef(onLiveMultiplier);
  const onMilestoneRef = useRef(onMilestone);
  const areaRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const tipRef = useRef<SVGCircleElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const fillStopRef = useRef<SVGStopElement>(null);
  const tipGlowStopRef = useRef<SVGStopElement>(null);
  const tipGlowStopOuterRef = useRef<SVGStopElement>(null);
  const multLabelRef = useRef<HTMLSpanElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);

  const curveRefs = { area: areaRef, line: lineRef, tip: tipRef, glow: glowRef };

  stateRef.current = state;
  onLiveRef.current = onLiveMultiplier;
  onMilestoneRef.current = onMilestone;

  function paintHeat(tone: keyof typeof HEAT_COLORS) {
    const c = HEAT_COLORS[tone];
    lineRef.current?.setAttribute("stroke", c.line);
    tipRef.current?.setAttribute("fill", c.line);
    fillStopRef.current?.setAttribute("stop-color", c.fill);
    tipGlowStopRef.current?.setAttribute("stop-color", c.line);
    tipGlowStopOuterRef.current?.setAttribute("stop-color", c.line);
    if (heatRef.current) heatRef.current.dataset.heat = tone;
  }

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
      milestoneRef.current = 1;
      setHeat("calm");
      setBurst(false);
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
      setHeat("crash");
      paintHeat("crash");
      setBurst(true);
      onLiveRef.current?.(crashMult);
      const t = window.setTimeout(() => setBurst(false), 700);
      return () => window.clearTimeout(t);
    }

    if (!running) {
      runningReadyRef.current = false;
      const mult = betting ? 1 : Math.max(1, state.multiplier ?? 1);
      setStaticMult(formatMultiplier(mult));
      if (!crashed) setHeat("calm");
    }
  }, [state, running, betting, crashed]);

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

      const tone = crashHeatTone(mult);
      paintHeat(tone);

      const milestones = [2, 5, 10, 25, 50];
      for (const m of milestones) {
        if (mult >= m && milestoneRef.current < m) {
          milestoneRef.current = m;
          onMilestoneRef.current?.(m);
          setHeat(tone);
        }
      }

      if (multLabelRef.current) {
        multLabelRef.current.textContent = formatMultiplierLive(mult);
        multLabelRef.current.dataset.heat = tone;
      }
      onLiveRef.current?.(mult);

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const showCurve = running || crashed;
  const colors = HEAT_COLORS[crashed ? "crash" : heat];

  return (
    <div
      ref={heatRef}
      data-heat={heat}
      className={cn(
        "crash-stage relative mx-auto aspect-[5/3] w-full max-w-md overflow-hidden rounded-2xl",
        crashed && "crash-stage--crashed",
        burst && "crash-stage--burst",
      )}
    >
      <div className="crash-stage__glow pointer-events-none absolute inset-0" />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="crash-fill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={colors.fill} stopOpacity="0" />
            <stop ref={fillStopRef} offset="100%" stopColor={colors.fill} stopOpacity="0.28" />
          </linearGradient>
          <radialGradient id="crash-tip-glow" cx="50%" cy="50%" r="50%">
            <stop ref={tipGlowStopRef} offset="0%" stopColor={colors.line} stopOpacity="0.55" />
            <stop ref={tipGlowStopOuterRef} offset="100%" stopColor={colors.line} stopOpacity="0" />
          </radialGradient>
          <clipPath id="crash-clip">
            <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} />
          </clipPath>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={PAD}
            y1={PAD + (H - PAD * 2) * ratio}
            x2={W - PAD}
            y2={PAD + (H - PAD * 2) * ratio}
            stroke="var(--border)"
            strokeWidth="1"
            opacity="0.55"
          />
        ))}

        {showCurve && (
          <g clipPath="url(#crash-clip)">
            <path ref={areaRef} fill="url(#crash-fill)" />
            <path
              ref={lineRef}
              fill="none"
              stroke={colors.line}
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle ref={glowRef} r="14" fill="url(#crash-tip-glow)" />
            <circle
              ref={tipRef}
              r="5"
              fill={colors.line}
              opacity={crashed ? 0.85 : 1}
            />
          </g>
        )}
      </svg>

      {burst ? (
        <div className="crash-burst pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="crash-burst__particle" style={{ "--i": i } as React.CSSProperties} />
          ))}
        </div>
      ) : null}

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
              data-heat={heat}
              className={cn(
                "crash-mult text-5xl font-bold tabular-nums tracking-tight",
                crashed && "text-danger",
              )}
            >
              {running ? "1.00×" : staticMult}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                crashed ? "text-danger/80" : "text-muted",
              )}
            >
              {statusSubtext(phase)}
            </span>
          </>
        )}
      </div>

      {state?.round_number != null ? (
        <span className="pointer-events-none absolute left-3 top-3 z-10 text-[10px] font-medium tabular-nums text-muted/80">
          #{state.round_number}
        </span>
      ) : null}
    </div>
  );
}
