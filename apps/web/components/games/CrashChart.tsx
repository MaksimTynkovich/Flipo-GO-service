"use client";

import { useEffect, useRef, useState } from "react";
import {
  CrashRoundState,
  chartYMax,
  formatMultiplier,
  multToY,
} from "@/lib/crash";
import { cn } from "@/lib/utils";

const W = 340;
const H = 200;
const PAD = 28;

type Point = { t: number; mult: number };

type Props = {
  state: CrashRoundState | null;
};

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

function buildPath(points: Point[], yMax: number): string {
  if (points.length === 0) return "";
  const innerW = W - PAD * 2;
  const tMax = Math.max(points[points.length - 1].t, 0.01);

  const coords = points.map((p) => {
    const x = PAD + (p.t / tMax) * innerW;
    const y = multToY(p.mult, yMax, H, PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const firstY = multToY(1, yMax, H, PAD);
  const area = `M ${PAD},${firstY} L ${coords.join(" L ")} L ${PAD + innerW},${H - PAD} L ${PAD},${H - PAD} Z`;
  const line = `M ${coords.join(" L ")}`;
  return `${area}|${line}`;
}

export function CrashChart({ state }: Props) {
  const phase = state?.phase;
  const crashed = phase === "crashed";
  const running = phase === "running";
  const betting = phase === "betting";

  const countdown = Math.ceil(useCountdown(state?.ends_at, betting));
  const [points, setPoints] = useState<Point[]>([{ t: 0, mult: 1 }]);
  const roundRef = useRef<string | null>(null);
  const runStartRef = useRef<number>(0);
  const pointsRef = useRef<Point[]>([{ t: 0, mult: 1 }]);

  useEffect(() => {
    if (!state) return;

    if (state.round_id !== roundRef.current) {
      roundRef.current = state.round_id;
      pointsRef.current = [{ t: 0, mult: 1 }];
      setPoints([{ t: 0, mult: 1 }]);
      runStartRef.current = 0;
    }

    if (state.phase === "running") {
      if (runStartRef.current === 0) {
        runStartRef.current = performance.now();
      }
      const last = pointsRef.current[pointsRef.current.length - 1];
      if (!last || last.mult !== state.multiplier) {
        const t = (performance.now() - runStartRef.current) / 1000;
        const next = [...pointsRef.current, { t, mult: state.multiplier }];
        pointsRef.current = next;
        setPoints(next);
      }
    }

    if (state.phase === "crashed" && state.crash_point) {
      const last = pointsRef.current[pointsRef.current.length - 1];
      if (!last || last.mult !== state.crash_point) {
        const t = runStartRef.current
          ? (performance.now() - runStartRef.current) / 1000
          : 1;
        const next = [...pointsRef.current, { t, mult: state.crash_point }];
        pointsRef.current = next;
        setPoints(next);
      }
    }
  }, [state]);

  const mult =
    state?.phase === "crashed" && state.crash_point
      ? state.crash_point
      : Math.max(1, state?.multiplier ?? 1);
  const yMax = chartYMax(mult, state?.crash_point);
  const [areaPath, linePath] = buildPath(points, yMax).split("|");
  const innerW = W - PAD * 2;
  const tMax = Math.max(points[points.length - 1]?.t ?? 0.01, 0.01);
  const tip = points[points.length - 1];
  const tipX = PAD + (tip.t / tMax) * innerW;
  const tipY = multToY(tip.mult, yMax, H, PAD);

  const gridLines = [1.5, 2, 3, 5].filter((g) => g < yMax);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border",
        "bg-gradient-to-b from-[#1e2530] to-[#14181f]",
        crashed && "animate-[crash-flash_0.4s_ease-out]",
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ height: H }}
        aria-hidden
      >
        <defs>
          <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={crashed ? "#c0392b" : "#27ae60"}
              stopOpacity="0.35"
            />
            <stop offset="100%" stopColor={crashed ? "#c0392b" : "#27ae60"} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="crash-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={crashed ? "#e74c3c" : "#2ecc71"} />
            <stop offset="100%" stopColor={crashed ? "#c0392b" : "#f1c40f"} />
          </linearGradient>
          <filter id="crash-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {gridLines.map((g) => {
          const y = multToY(g, yMax, H, PAD);
          return (
            <g key={g}>
              <line
                x1={PAD}
                y1={y}
                x2={W - PAD}
                y2={y}
                stroke="#2a3038"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={PAD - 6}
                y={y + 4}
                textAnchor="end"
                fill="#71717a"
                fontSize="9"
                fontFamily="system-ui, sans-serif"
              >
                {g}×
              </text>
            </g>
          );
        })}

        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="#2a3038"
          strokeWidth="1"
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={H - PAD}
          stroke="#2a3038"
          strokeWidth="1"
        />

        {areaPath && (
          <>
            <path d={areaPath} fill="url(#crash-fill)" />
            <path
              d={linePath}
              fill="none"
              stroke="url(#crash-line)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#crash-glow)"
            />
          </>
        )}

        {(running || crashed) && tip && (
          <g transform={`translate(${tipX}, ${tipY})`}>
            <circle r="5" fill={crashed ? "#e74c3c" : "#f1c40f"} opacity="0.5" />
            <path
              d="M -6 4 L 0 -8 L 6 4 Z"
              fill={crashed ? "#e74c3c" : "#f1c40f"}
              transform={`rotate(${Math.min(45, tip.t * 8)})`}
            />
          </g>
        )}

        {betting && (
          <>
            {Array.from({ length: 12 }).map((_, i) => (
              <circle
                key={i}
                cx={PAD + ((i * 47) % (W - PAD * 2))}
                cy={PAD + 20 + ((i * 31) % (H - PAD * 2 - 40))}
                r="1"
                fill="#f1c40f"
                opacity={0.15 + (i % 3) * 0.1}
              />
            ))}
          </>
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {betting ? (
          <>
            <span className="text-5xl font-bold tabular-nums text-accent">
              {countdown.toString().padStart(2, "0")}
            </span>
            <span className="mt-1 text-xs font-medium uppercase tracking-wider text-muted">
              До старта
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "text-5xl font-bold tabular-nums transition-colors duration-300",
                crashed ? "text-danger" : "text-success",
              )}
            >
              {formatMultiplier(mult)}
            </span>
            {crashed && state?.crash_point && (
              <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-danger/80">
                Упал на {formatMultiplier(state.crash_point)}
              </span>
            )}
            {running && (
              <span className="mt-1 text-xs font-medium uppercase tracking-wider text-muted">
                Забирай вовремя
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
