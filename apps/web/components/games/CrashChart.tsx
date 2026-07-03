"use client";

import { useEffect, useRef, useState } from "react";
import { CrashHistoryEntry } from "@/lib/api";
import { CrashHistory } from "@/components/games/CrashHistory";
import { CrashStatsBar } from "@/components/games/CrashStatsBar";
import {
  CRASH_GROWTH_PER_MS,
  ChartViewport,
  CrashRoundState,
  chartElapsedMs,
  chartViewportFor,
  elapsedMsForMultiplier,
  fitChartViewport,
  formatMultiplier,
  formatMultiplierLive,
  initialChartViewport,
  liveMultiplier,
  multiplierAtElapsedMsPrecise,
  multToY,
  statusSubtext,
  timeToX,
} from "@/lib/crash";
import { cn } from "@/lib/utils";

const W = 360;
const H = 210;
const PAD = 8;

type Tip = { x: number; y: number; mult: number };

type Props = {
  state: CrashRoundState | null;
  history: CrashHistoryEntry[];
  balanceNanoton?: number;
  onLiveMultiplier?: (mult: number) => void;
};

function resolveRunStartMs(state: CrashRoundState): number {
  if (state.running_since) {
    const t = new Date(state.running_since).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (state.multiplier > 1 && CRASH_GROWTH_PER_MS > 0) {
    return Date.now() - Math.log(state.multiplier) / CRASH_GROWTH_PER_MS;
  }
  return Date.now();
}

function buildCurve(
  chartMs: number,
  tipMult: number,
  viewport: ChartViewport,
): { area: string; line: string; tip: Tip } {
  const { yMax, xMaxMs } = viewport;
  const bottomY = H - PAD;
  const mult = Math.max(1, tipMult);

  if (mult <= 1.001 || chartMs <= 0) {
    const y = multToY(1, yMax, H, PAD);
    const x = timeToX(0, xMaxMs, W, PAD);
    return { area: "", line: `M ${x.toFixed(2)} ${y.toFixed(2)}`, tip: { x, y, mult: 1 } };
  }

  const steps = Math.min(160, Math.max(64, Math.floor(chartMs / 25)));
  const pts: { x: number; y: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = (chartMs * i) / steps;
    const m = Math.min(multiplierAtElapsedMsPrecise(t), mult);
    pts.push({
      x: timeToX(t, xMaxMs, W, PAD),
      y: multToY(m, yMax, H, PAD),
    });
  }

  const tip = {
    x: timeToX(chartMs, xMaxMs, W, PAD),
    y: multToY(mult, yMax, H, PAD),
    mult,
  };

  pts[pts.length - 1] = { x: tip.x, y: tip.y };

  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const area = `${line} L ${tip.x.toFixed(2)} ${bottomY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${bottomY.toFixed(2)} Z`;

  return { area, line, tip };
}

function applyCurve(
  built: ReturnType<typeof buildCurve>,
  refs: {
    area: React.RefObject<SVGPathElement | null>;
    areaStripe: React.RefObject<SVGPathElement | null>;
    line: React.RefObject<SVGPathElement | null>;
    glowLine: React.RefObject<SVGPathElement | null>;
    beam: React.RefObject<SVGLineElement | null>;
    tip: React.RefObject<SVGGElement | null>;
  },
) {
  refs.area.current?.setAttribute("d", built.area);
  refs.areaStripe.current?.setAttribute("d", built.area);
  refs.line.current?.setAttribute("d", built.line);
  refs.glowLine.current?.setAttribute("d", built.line);
  refs.beam.current?.setAttribute("x1", built.tip.x.toFixed(2));
  refs.beam.current?.setAttribute("y1", built.tip.y.toFixed(2));
  refs.beam.current?.setAttribute("x2", built.tip.x.toFixed(2));
  refs.beam.current?.setAttribute("y2", String(H - PAD));
  refs.tip.current?.setAttribute(
    "transform",
    `translate(${built.tip.x.toFixed(2)}, ${built.tip.y.toFixed(2)})`,
  );
}

function EndpointDot({ crashed }: { crashed: boolean }) {
  const core = crashed ? "#e74c3c" : "#2ecc71";
  const glow = crashed ? "#c0392b" : "#27ae60";

  if (crashed) {
    return (
      <>
        <circle r="11" fill={glow} opacity="0.3" />
        <circle r="5.5" fill={core} />
      </>
    );
  }

  return (
    <>
      <circle r="10" fill={glow} opacity="0.35">
        <animate attributeName="r" values="8;17;8" dur="1.35s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.35s" repeatCount="indefinite" />
      </circle>
      <circle r="5.5" fill={core}>
        <animate attributeName="opacity" values="1;0.55;1" dur="1.35s" repeatCount="indefinite" />
      </circle>
    </>
  );
}

export function CrashChart({ state, history, balanceNanoton, onLiveMultiplier }: Props) {
  const phase = state?.phase;
  const crashed = phase === "crashed";
  const running = phase === "running";
  const betting = phase === "betting";

  const [countdown, setCountdown] = useState(0);

  const roundRef = useRef<string | null>(null);
  const runStartMs = useRef(0);
  const viewportRef = useRef<ChartViewport>(initialChartViewport());
  const liveMultRef = useRef(1);
  const stateRef = useRef(state);
  const onLiveRef = useRef(onLiveMultiplier);
  const areaRef = useRef<SVGPathElement>(null);
  const areaStripeRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const glowLineRef = useRef<SVGPathElement>(null);
  const beamRef = useRef<SVGLineElement>(null);
  const tipRef = useRef<SVGGElement>(null);
  const multLabelRef = useRef<HTMLSpanElement>(null);
  const statusLabelRef = useRef<HTMLSpanElement>(null);

  const curveRefs = {
    area: areaRef,
    areaStripe: areaStripeRef,
    line: lineRef,
    glowLine: glowLineRef,
    beam: beamRef,
    tip: tipRef,
  };

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
      runStartMs.current = 0;
      viewportRef.current = initialChartViewport();
      liveMultRef.current = 1;
    }

    if (state.phase === "running" || state.phase === "crashed") {
      if (!runStartMs.current) runStartMs.current = resolveRunStartMs(state);
    }

    if (state.phase === "crashed" && state.crash_point) {
      const chartMs = elapsedMsForMultiplier(state.crash_point);
      const viewport = fitChartViewport(state.crash_point, chartMs);
      viewportRef.current = viewport;
      applyCurve(buildCurve(chartMs, state.crash_point, viewport), curveRefs);
      liveMultRef.current = state.crash_point;
      onLiveRef.current?.(state.crash_point);
    }
  }, [state]);

  useEffect(() => {
    if (!running) return;
    if (!runStartMs.current && stateRef.current) {
      runStartMs.current = resolveRunStartMs(stateRef.current);
    }

    let frame: number;

    function tick() {
      const s = stateRef.current;
      if (!s || s.phase !== "running" || !runStartMs.current) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const elapsedMs = Math.max(0, Date.now() - runStartMs.current);
      const mult = liveMultiplier(elapsedMs, s.multiplier);
      const chartMs = chartElapsedMs(elapsedMs, mult);

      liveMultRef.current = mult;
      if (multLabelRef.current) {
        multLabelRef.current.textContent = formatMultiplierLive(mult);
      }
      if (statusLabelRef.current) {
        statusLabelRef.current.textContent = statusSubtext("running");
      }
      onLiveRef.current?.(mult);

      viewportRef.current = chartViewportFor(mult, chartMs);

      applyCurve(buildCurve(chartMs, mult, viewportRef.current), curveRefs);

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const displayMult =
    crashed && state?.crash_point
      ? state.crash_point
      : running
        ? liveMultRef.current
        : betting
          ? 1
          : Math.max(1, state?.multiplier ?? 1);

  const showCurve = running || crashed;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/[0.08]",
        "bg-gradient-to-b from-[#121a28] via-[#0f1520] to-[#0c1018]",
        "shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
        crashed && "animate-[crash-flash_0.45s_ease-out]",
      )}
    >
      <div className="relative" style={{ height: H + 8 }}>
        <div className="pointer-events-none absolute left-4 top-4 z-20">
          {betting ? (
            <>
              <span className="text-4xl font-bold tabular-nums tracking-tight text-accent">
                {countdown.toString().padStart(2, "0")}
              </span>
              <p className="mt-0.5 text-xs font-medium text-muted">До старта</p>
            </>
          ) : (
            <>
              <span
                ref={running ? multLabelRef : undefined}
                className={cn(
                  "text-4xl font-bold tabular-nums tracking-tight text-foreground",
                  crashed && "text-danger",
                  running && "text-foreground",
                )}
              >
                {running
                  ? formatMultiplierLive(liveMultRef.current)
                  : formatMultiplier(displayMult)}
              </span>
              <span
                ref={running ? statusLabelRef : undefined}
                className={cn(
                  "mt-0.5 block text-xs font-medium",
                  crashed ? "text-danger/80" : "text-muted",
                )}
              >
                {statusSubtext(phase)}
              </span>
            </>
          )}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ height: H }}
          aria-hidden
        >
          <defs>
            <pattern
              id="crash-dots"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1.5" cy="1.5" r="0.8" fill="#fff" opacity="0.07" />
            </pattern>
            <pattern
              id="crash-stripes"
              width="10"
              height="100%"
              patternUnits="userSpaceOnUse"
            >
              <rect width="5" height="100%" fill="rgba(93,173,226,0.06)" />
              <rect x="5" width="5" height="100%" fill="rgba(93,173,226,0.02)" />
            </pattern>
            <linearGradient id="crash-fill-grad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={crashed ? "#922b21" : "#1a5276"} stopOpacity="0.05" />
              <stop offset="100%" stopColor={crashed ? "#e74c3c" : "#5dade2"} stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="crash-line-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={crashed ? "#e74c3c" : "#5dade2"} />
              <stop offset="100%" stopColor={crashed ? "#c0392b" : "#85c1e9"} />
            </linearGradient>
            <linearGradient id="crash-beam-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={crashed ? "#e74c3c" : "#2ecc71"} stopOpacity="0.35" />
              <stop offset="100%" stopColor={crashed ? "#e74c3c" : "#5dade2"} stopOpacity="0" />
            </linearGradient>
            <filter id="crash-line-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="crash-area-clip">
              <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} />
            </clipPath>
          </defs>

          <rect x={0} y={0} width={W} height={H} fill="url(#crash-dots)" />

          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={PAD}
              y1={PAD + (H - PAD * 2) * ratio}
              x2={W - PAD}
              y2={PAD + (H - PAD * 2) * ratio}
              stroke="#fff"
              strokeOpacity="0.04"
              strokeWidth="1"
            />
          ))}

          {showCurve && (
            <g clipPath="url(#crash-area-clip)">
              <path ref={areaStripeRef} fill="url(#crash-stripes)" opacity="0.95" />
              <path ref={areaRef} fill="url(#crash-fill-grad)" />
              <line
                ref={beamRef}
                x1={PAD}
                y1={H - PAD}
                x2={PAD}
                y2={H - PAD}
                stroke="url(#crash-beam-grad)"
                strokeWidth="2"
                strokeLinecap="round"
                opacity={crashed ? 0.2 : 0.55}
              />
              <path
                ref={glowLineRef}
                fill="none"
                stroke={crashed ? "#e74c3c" : "#5dade2"}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.22"
                filter="url(#crash-line-glow)"
              />
              <path
                ref={lineRef}
                fill="none"
                stroke="url(#crash-line-grad)"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g ref={tipRef}>
                <EndpointDot crashed={crashed} />
              </g>
            </g>
          )}
        </svg>
      </div>

      <CrashStatsBar
        balanceNanoton={balanceNanoton}
        roundNumber={state?.round_number}
        serverSeedHash={state?.server_seed_hash}
      />

      <CrashHistory history={history} embedded />
    </div>
  );
}
