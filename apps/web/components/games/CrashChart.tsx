"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { TonAmount } from "@/components/icons/TonIcon";
import {
  CrashRoundState,
  CRASH_FLIGHT_VISUAL_MAX,
  calibrateClockOffsetMs,
  computeRunningMultiplier,
  crashHeatTone,
  elapsedMsForMultiplier,
  flightProgressWorld,
  formatMultiplier,
  formatMultiplierLive,
  resolveRunStartMs,
  statusSubtext,
} from "@/lib/crash";
import { cn } from "@/lib/utils";

export type CrashStageFx =
  | { kind: "win"; amountTon: string; multiplier: number }
  | { kind: "lose"; multiplier: number }
  | null;

type Props = {
  state: CrashRoundState | null;
  fx?: CrashStageFx;
  /** Active stake overlay on the stage while the player is in the round. */
  stakeHud?: CrashStakeHud | null;
  /** Throttled (~10Hz). Do not setState every frame in parent. */
  onLiveMultiplier?: (mult: number) => void;
  onMilestone?: (mult: number) => void;
};

export type CrashStakeHud = {
  stakeTon: string;
  winTon: string;
  betCount: number;
  gifts?: { id: string; image_url: string }[];
};

type Star = {
  x: number;
  y: number;
  r: number;
  a: number;
  s: number;
  depth: number;
};

type Pt = { x: number; y: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
};

const CLOCK_SYNC_BLEND = 0.22;
const LIVE_EMIT_MS = 100;

const HEAT = {
  calm: { stroke: "#3ecf8e", glow: "rgba(62,207,142,0.45)", flame: "#7dffb2" },
  warm: { stroke: "#6ee7a8", glow: "rgba(110,231,168,0.5)", flame: "#a8ffd0" },
  hot: { stroke: "#f5c84c", glow: "rgba(245,200,76,0.55)", flame: "#ffe08a" },
  blaze: { stroke: "#ff9a5c", glow: "rgba(255,154,92,0.6)", flame: "#ffc39a" },
  crash: { stroke: "#e56555", glow: "rgba(229,101,85,0.55)", flame: "#ff8f7a" },
} as const;

function stagePads(w: number, h: number) {
  const padX = w * 0.09;
  const padBottom = h * 0.14;
  const padTop = h * 0.22;
  return {
    padX,
    padBottom,
    padTop,
    spanX: w - padX * 2.15,
    spanY: h - padBottom - padTop,
  };
}

type Cam = { x: number; y: number };

/**
 * World-space rocket position — X and Y share the same progress so the
 * trail stays diagonal forever (camera follows once we leave the frame).
 */
function rocketWorldPos(mult: number, w: number, h: number): Pt {
  const { padX, padBottom, spanX, spanY } = stagePads(w, h);
  const t = flightProgressWorld(Math.max(1, mult));
  return {
    x: padX + spanX * t,
    y: h - padBottom - spanY * t,
  };
}

/** Keep the rocket in an upper-right comfort zone without bending the path. */
function cameraForRocket(world: Pt, w: number, h: number): Cam {
  const focusX = w * 0.78;
  const focusY = h * 0.3;
  return {
    x: world.x > focusX ? world.x - focusX : 0,
    y: world.y < focusY ? focusY - world.y : 0,
  };
}

function withCamera(p: Pt, cam: Cam): Pt {
  return { x: p.x - cam.x, y: p.y + cam.y };
}

function rocketPos(mult: number, w: number, h: number): Pt {
  const world = rocketWorldPos(mult, w, h);
  return withCamera(world, cameraForRocket(world, w, h));
}

/**
 * Recent flight ribbon in screen space.
 * Sliding window keeps only ~one screen of trail behind the rocket.
 */
function buildFlightPath(mult: number, w: number, h: number): Pt[] {
  const tip = Math.max(1.001, mult);
  const tipWorld = rocketWorldPos(tip, w, h);
  const cam = cameraForRocket(tipWorld, w, h);
  const tipT = flightProgressWorld(tip);

  // Show roughly one screen of climb behind the rocket.
  const windowT = 1.05;
  const startT = Math.max(0, tipT - windowT);
  const startMult =
    startT <= 0
      ? 1
      : Math.exp(Math.log(CRASH_FLIGHT_VISUAL_MAX) * Math.pow(startT, 1 / 0.78));

  const steps = Math.min(80, Math.max(20, Math.floor(18 + Math.log(tip) * 12)));
  const pts: Pt[] = [];
  const logStart = Math.log(Math.max(1.0001, startMult));
  const logTip = Math.log(tip);

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const m = Math.exp(logStart + (logTip - logStart) * u);
    const screen = withCamera(rocketWorldPos(m, w, h), cam);
    // Keep a short lead-in below/left of the fold, drop the rest.
    if ((screen.y > h + h * 0.08 || screen.x < -w * 0.08) && pts.length === 0) continue;
    pts.push(screen);
  }

  if (pts.length < 2) {
    pts.length = 0;
    pts.push(withCamera(rocketWorldPos(Math.max(1, tip * 0.85), w, h), cam));
    pts.push(withCamera(tipWorld, cam));
  }

  return pts;
}

function angleOf(from: Pt, to: Pt): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

type HeatTone = (typeof HEAT)[keyof typeof HEAT];

function pathPointAt(path: Pt[], u: number): Pt {
  const t = Math.max(0, Math.min(1, u)) * (path.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = path[i];
  const b = path[Math.min(path.length - 1, i + 1)];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Soft tapering comet ribbon — denser and brighter toward the rocket. */
function drawLiveTrail(
  ctx: CanvasRenderingContext2D,
  path: Pt[],
  color: HeatTone,
  phase: number,
  nowPerf: number,
  viewH: number,
) {
  if (path.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const n = path.length - 1;
  const tip = path[path.length - 1];
  const topFade = viewH * 0.06;
  const bottomFade = viewH * 0.92;

  const edgeFade = (y: number) => {
    if (y < topFade) return Math.max(0, y / topFade);
    if (y > bottomFade) return Math.max(0, 1 - (y - bottomFade) / (viewH * 0.12));
    return 1;
  };

  // Wide atmospheric wash (very soft)
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const ease = u * u;
    const midY = (path[i].y + path[i + 1].y) * 0.5;
    const fade = edgeFade(midY);
    if (fade <= 0.02) continue;
    ctx.beginPath();
    ctx.moveTo(path[i].x, path[i].y);
    ctx.lineTo(path[i + 1].x, path[i + 1].y);
    ctx.strokeStyle = color.stroke;
    ctx.globalAlpha = (0.03 + 0.14 * ease) * fade;
    ctx.lineWidth = 2 + 9 * ease;
    ctx.stroke();
  }

  // Colored body — tapers from hairline at pad to a solid ribbon at tip
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const ease = Math.pow(u, 1.15);
    const midY = (path[i].y + path[i + 1].y) * 0.5;
    const fade = edgeFade(midY);
    if (fade <= 0.02) continue;
    ctx.beginPath();
    ctx.moveTo(path[i].x, path[i].y);
    ctx.lineTo(path[i + 1].x, path[i + 1].y);
    ctx.strokeStyle = color.stroke;
    ctx.globalAlpha = (0.12 + 0.78 * ease) * fade;
    ctx.lineWidth = 0.7 + 2.8 * ease;
    ctx.stroke();
  }

  // Hot inner core (rear half → tip)
  const coreFrom = Math.floor(n * 0.42);
  for (let i = coreFrom; i < n; i++) {
    const u = (i - coreFrom) / Math.max(1, n - coreFrom);
    const midY = (path[i].y + path[i + 1].y) * 0.5;
    const fade = edgeFade(midY);
    if (fade <= 0.02) continue;
    ctx.beginPath();
    ctx.moveTo(path[i].x, path[i].y);
    ctx.lineTo(path[i + 1].x, path[i + 1].y);
    ctx.strokeStyle = color.flame;
    ctx.globalAlpha = (0.2 + 0.55 * u) * fade;
    ctx.lineWidth = 0.5 + 1.5 * u;
    ctx.stroke();
  }

  // Bright white edge near the rocket
  const edgeFrom = Math.floor(n * 0.72);
  for (let i = edgeFrom; i < n; i++) {
    const u = (i - edgeFrom) / Math.max(1, n - edgeFrom);
    const midY = (path[i].y + path[i + 1].y) * 0.5;
    const fade = edgeFade(midY);
    if (fade <= 0.02) continue;
    ctx.beginPath();
    ctx.moveTo(path[i].x, path[i].y);
    ctx.lineTo(path[i + 1].x, path[i + 1].y);
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = (0.25 + 0.65 * u) * fade;
    ctx.lineWidth = 0.6 + 0.9 * u;
    ctx.stroke();
  }

  // Flowing energy ticks traveling toward the tip
  const ticks = 6;
  for (let i = 0; i < ticks; i++) {
    const u = (phase * 0.07 + i / ticks) % 1;
    if (u < 0.08) continue;
    const a = pathPointAt(path, Math.max(0, u - 0.035));
    const b = pathPointAt(path, u);
    const fade = edgeFade((a.y + b.y) * 0.5);
    if (fade <= 0.02) continue;
    const pulse = 0.4 + 0.6 * Math.sin(nowPerf * 0.012 + i * 1.3);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = (0.15 + 0.35 * pulse) * Math.pow(u, 0.7) * fade;
    ctx.lineWidth = 1.2 + pulse * 0.8;
    ctx.stroke();
  }

  // Tip bloom behind the rocket
  const bloom = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 16);
  bloom.addColorStop(0, color.flame);
  bloom.addColorStop(0.35, color.glow);
  bloom.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 16, 0, Math.PI * 2);
  ctx.fill();

  // Tiny spark beads on the last third
  for (let i = 0; i < 4; i++) {
    const u = 0.55 + ((phase * 0.11 + i * 0.12) % 0.45);
    const p = pathPointAt(path, u);
    const fade = edgeFade(p.y);
    if (fade <= 0.02) continue;
    const pulse = 0.5 + 0.5 * Math.sin(nowPerf * 0.014 + i * 2);
    ctx.globalAlpha = (0.25 + pulse * 0.4) * fade;
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : color.flame;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.9 + pulse * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/**
 * Crash: trail snaps at the tip, then retracts and fully fades out.
 */
function drawBrokenTrail(
  ctx: CanvasRenderingContext2D,
  path: Pt[],
  breakPos: Pt,
  t: number,
  nowPerf: number,
) {
  if (path.length < 2 || t >= 1) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const breakPhase = Math.min(1, t / 0.2);
  const dissolve = Math.max(0, (t - 0.15) / 0.85);
  const fade = Math.max(0, 1 - dissolve);
  if (fade <= 0.02) return;

  const visibleRatio = Math.max(0, 1 - dissolve * 1.05);
  const keepUntil = Math.max(1, Math.floor((path.length - 1) * visibleRatio));
  const n = keepUntil;

  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / Math.max(1, path.length - 1);
    const ease = Math.pow(u, 1.1);
    ctx.beginPath();
    ctx.moveTo(path[i].x, path[i].y);
    ctx.lineTo(path[i + 1].x, path[i + 1].y);
    ctx.strokeStyle = "#e56555";
    ctx.globalAlpha = (0.1 + 0.65 * ease) * fade;
    ctx.lineWidth = 0.8 + 2.6 * ease;
    ctx.stroke();
  }

  const coreFrom = Math.floor(n * 0.5);
  for (let i = coreFrom; i < n; i++) {
    const u = (i - coreFrom) / Math.max(1, n - coreFrom);
    ctx.beginPath();
    ctx.moveTo(path[i].x, path[i].y);
    ctx.lineTo(path[i + 1].x, path[i + 1].y);
    ctx.strokeStyle = "#ffc2b4";
    ctx.globalAlpha = (0.2 + 0.5 * u) * fade;
    ctx.lineWidth = 0.6 + u;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (breakPhase < 1) {
    const tipFrom = Math.max(0, path.length - 12);
    const drift = breakPhase * 14;
    ctx.save();
    ctx.translate(drift * 0.6, drift);
    for (let i = tipFrom; i < path.length - 1; i++) {
      const u = (i - tipFrom) / Math.max(1, path.length - 1 - tipFrom);
      ctx.beginPath();
      ctx.moveTo(path[i].x, path[i].y);
      ctx.lineTo(path[i + 1].x, path[i + 1].y);
      ctx.strokeStyle = "#ff8f7a";
      ctx.globalAlpha = (1 - breakPhase) * (0.4 + 0.6 * u);
      ctx.lineWidth = 1.2 + u;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (t < 0.35) {
    const a = 1 - t / 0.35;
    const bloom = ctx.createRadialGradient(
      breakPos.x,
      breakPos.y,
      0,
      breakPos.x,
      breakPos.y,
      8 + t * 30,
    );
    bloom.addColorStop(0, `rgba(255,180,160,${0.7 * a})`);
    bloom.addColorStop(0.45, `rgba(229,101,85,${0.35 * a})`);
    bloom.addColorStop(1, "transparent");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(breakPos.x, breakPos.y, 8 + t * 30, 0, Math.PI * 2);
    ctx.fill();
  }

  if (dissolve > 0 && dissolve < 0.9 && keepUntil > 1) {
    const tip = path[keepUntil];
    ctx.globalAlpha = fade * 0.7;
    ctx.fillStyle = "#ff9a7a";
    for (let i = 0; i < 4; i++) {
      const ox = Math.sin(nowPerf * 0.02 + i * 1.7) * 3;
      const oy = Math.cos(nowPerf * 0.025 + i) * 3 + dissolve * 8;
      ctx.beginPath();
      ctx.arc(tip.x + ox, tip.y + oy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function CrashChart({
  state,
  fx = null,
  stakeHud = null,
  onLiveMultiplier,
  onMilestone,
}: Props) {
  const phase = state?.phase;
  const crashed = phase === "crashed";
  const running = phase === "running";
  const betting = phase === "betting";

  const [countdown, setCountdown] = useState(0);
  const [staticMult, setStaticMult] = useState("1.00×");
  const [milestoneFx, setMilestoneFx] = useState<{
    value: number;
    tier: "soft" | "mid" | "high" | "moon";
    id: number;
  } | null>(null);
  const milestoneTimerRef = useRef<number | null>(null);
  const milestoneAnimId = useRef(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multLabelRef = useRef<HTMLSpanElement>(null);
  const potLabelRef = useRef<HTMLSpanElement>(null);
  const countdownRingRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef(state);
  const onLiveRef = useRef(onLiveMultiplier);
  const onMilestoneRef = useRef(onMilestone);
  const fxRef = useRef(fx);

  const roundRef = useRef<string | null>(null);
  const runStartMs = useRef(0);
  const clockOffsetMs = useRef(0);
  const lastServerMult = useRef(1);
  const lastTickAtMs = useRef(0);
  const runningReadyRef = useRef(false);
  const milestoneRef = useRef(1);
  const lastEmitMs = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const prevPosRef = useRef<Pt | null>(null);
  const crashAnimRef = useRef<{
    t0: number;
    pos: Pt;
    angle: number;
    path: Pt[];
    mult: number;
  } | null>(null);
  const starsRef = useRef<Star[]>([]);
  const sparkPhaseRef = useRef(0);
  const prevCamRef = useRef<Cam>({ x: 0, y: 0 });

  stateRef.current = state;
  onLiveRef.current = onLiveMultiplier;
  onMilestoneRef.current = onMilestone;
  fxRef.current = fx;

  // Whole-second countdown + smooth ring progress via rAF
  useEffect(() => {
    if (!betting || !state?.ends_at) {
      setCountdown(0);
      if (countdownRingRef.current) {
        countdownRingRef.current.style.setProperty("--cd-p", "0");
      }
      return;
    }
    const deadline = new Date(state.ends_at).getTime();
    const duration = Math.max(1, deadline - Date.now());
    let frame = 0;
    let lastSec = -1;
    const tick = () => {
      const leftMs = Math.max(0, deadline - Date.now());
      const sec = Math.max(0, Math.ceil(leftMs / 1000));
      if (sec !== lastSec) {
        lastSec = sec;
        setCountdown(sec);
      }
      if (countdownRingRef.current) {
        countdownRingRef.current.style.setProperty("--cd-p", String(leftMs / duration));
      }
      if (leftMs > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [betting, state?.ends_at, state?.round_id]);

  // Sync round / crash static state (no per-frame React)
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
      particlesRef.current = [];
      prevPosRef.current = null;
      prevCamRef.current = { x: 0, y: 0 };
      crashAnimRef.current = null;
      setMilestoneFx(null);
      if (milestoneTimerRef.current != null) {
        window.clearTimeout(milestoneTimerRef.current);
        milestoneTimerRef.current = null;
      }
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
        particlesRef.current = [];
        prevPosRef.current = null;
        crashAnimRef.current = null;
      } else if (serverMult !== lastServerMult.current) {
        const targetOffset = calibrateClockOffsetMs(runStartMs.current, serverMult, now);
        clockOffsetMs.current += (targetOffset - clockOffsetMs.current) * CLOCK_SYNC_BLEND;
        lastServerMult.current = serverMult;
        lastTickAtMs.current = now;
      }
    }

    if (state.phase === "crashed" && state.crash_point) {
      runningReadyRef.current = false;
      const crashMult = state.crash_point;
      setStaticMult(formatMultiplier(crashMult));
      onLiveRef.current?.(crashMult);
      const canvas = canvasRef.current;
      const w = canvas?.clientWidth || 360;
      const h = canvas?.clientHeight || 220;
      const pos = rocketPos(crashMult, w, h);
      const prev = prevPosRef.current ?? { x: pos.x - 8, y: pos.y + 6 };
      const path = buildFlightPath(crashMult, w, h);
      crashAnimRef.current = {
        t0: performance.now(),
        pos,
        angle: angleOf(prev, pos),
        path,
        mult: crashMult,
      };
      // Break shards from the tip
      for (let i = 0; i < 18; i++) {
        const a = angleOf(prev, pos) + Math.PI + (Math.random() - 0.5) * 1.8;
        const sp = 1.5 + Math.random() * 4;
        particlesRef.current.push({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          max: 0.55 + Math.random() * 0.45,
          size: 1.2 + Math.random() * 2.2,
          hue: 12 + Math.random() * 20,
        });
      }
      // Explosion burst
      for (let i = 0; i < 22; i++) {
        const a = (Math.PI * 2 * i) / 22 + Math.random() * 0.2;
        const sp = 1.4 + Math.random() * 3.6;
        particlesRef.current.push({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          max: 0.7 + Math.random() * 0.5,
          size: 1.5 + Math.random() * 2.5,
          hue: 8 + Math.random() * 25,
        });
      }
    } else if (!running) {
      runningReadyRef.current = false;
      const mult = betting ? 1 : Math.max(1, state.multiplier ?? 1);
      setStaticMult(formatMultiplier(mult));
      if (betting) {
        particlesRef.current = [];
        crashAnimRef.current = null;
      }
    }
  }, [state, running, betting]);

  // Main canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let disposed = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (starsRef.current.length === 0) {
        starsRef.current = Array.from({ length: 56 }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.35 + Math.random() * 1.5,
          a: 0.12 + Math.random() * 0.55,
          s: 0.12 + Math.random() * 0.5,
          depth: 0.25 + Math.random() * 0.75,
        }));
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const drawRocket = (
      x: number,
      y: number,
      angle: number,
      heat: keyof typeof HEAT,
      flame: number,
      crashedRocket: boolean,
    ) => {
      const c = HEAT[heat];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + (crashedRocket ? 0.8 : 0));

      // Engine glow
      if (!crashedRocket) {
        const flicker = 0.75 + Math.sin(flame * 28) * 0.25;
        const grd = ctx.createRadialGradient(-16, 0, 0, -16, 0, 22 * flicker);
        grd.addColorStop(0, c.flame);
        grd.addColorStop(0.45, c.glow);
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(-14, 0, 18 * flicker, 0, Math.PI * 2);
        ctx.fill();

        // Flame tongues
        ctx.fillStyle = c.flame;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(-8, -5);
        ctx.quadraticCurveTo(-22 - flicker * 10, 0, -8, 5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#fff6d5";
        ctx.beginPath();
        ctx.moveTo(-8, -2.5);
        ctx.quadraticCurveTo(-16 - flicker * 5, 0, -8, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Body
      ctx.fillStyle = crashedRocket ? "#c45a4e" : "#f3f7fb";
      ctx.strokeStyle = crashedRocket ? "#8f3a32" : "#7f97b3";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.quadraticCurveTo(10, -8, -2, -7.5);
      ctx.lineTo(-11, -6);
      ctx.lineTo(-11, 6);
      ctx.lineTo(-2, 7.5);
      ctx.quadraticCurveTo(10, 8, 18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Stripe
      if (!crashedRocket) {
        ctx.fillStyle = "#3390EC";
        ctx.fillRect(-6, -2.2, 12, 4.4);
      }

      // Window
      ctx.fillStyle = crashedRocket ? "#6b2e2a" : "#1b4f86";
      ctx.beginPath();
      ctx.arc(6, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(5, -1, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Fins
      ctx.fillStyle = crashedRocket ? "#a34840" : "#3390EC";
      ctx.beginPath();
      ctx.moveTo(-1, -7.5);
      ctx.lineTo(-13, -15);
      ctx.lineTo(-8, -5.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1, 7.5);
      ctx.lineTo(-13, 15);
      ctx.lineTo(-8, 5.5);
      ctx.closePath();
      ctx.fill();

      // Nose tip
      ctx.fillStyle = crashedRocket ? "#d07066" : "#ffb454";
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(12, -3.2);
      ctx.lineTo(12, 3.2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const frame = (nowPerf: number) => {
      if (disposed) return;
      const s = stateRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const now = Date.now();

      ctx.clearRect(0, 0, w, h);

      // Atmosphere
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0a121c");
      g.addColorStop(0.55, "#0e1824");
      g.addColorStop(1, "#121f2e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Soft vignette accent
      const vg = ctx.createRadialGradient(w * 0.65, h * 0.35, 10, w * 0.5, h * 0.6, w * 0.75);
      const phaseNow = s?.phase;
      if (phaseNow === "crashed" || fxRef.current?.kind === "lose") {
        vg.addColorStop(0, "rgba(229,101,85,0.16)");
      } else if (fxRef.current?.kind === "win") {
        vg.addColorStop(0, "rgba(62,207,142,0.18)");
      } else if (phaseNow === "running") {
        vg.addColorStop(0, "rgba(51,144,236,0.10)");
      } else {
        vg.addColorStop(0, "rgba(51,144,236,0.06)");
      }
      vg.addColorStop(1, "transparent");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      // Stars (parallax scroll while climbing)
      let cam: Cam = { x: 0, y: 0 };
      let climbMult = 1;
      if (phaseNow === "running" && runStartMs.current) {
        climbMult = computeRunningMultiplier({
          runStartMs: runStartMs.current,
          clockOffsetMs: clockOffsetMs.current,
          serverMultiplier: lastServerMult.current,
          lastTickAtMs: lastTickAtMs.current,
          nowMs: now,
        });
        const tipWorld = rocketWorldPos(climbMult, w, h);
        cam = cameraForRocket(tipWorld, w, h);
      } else if (phaseNow === "crashed" && s?.crash_point) {
        climbMult = s.crash_point;
        const tipWorld = rocketWorldPos(climbMult, w, h);
        cam = cameraForRocket(tipWorld, w, h);
      }

      const dCamX = cam.x - prevCamRef.current.x;
      const dCamY = cam.y - prevCamRef.current.y;
      prevCamRef.current = cam;
      if ((dCamX !== 0 || dCamY !== 0) && particlesRef.current.length) {
        for (const p of particlesRef.current) {
          p.x -= dCamX;
          p.y += dCamY;
        }
      }

      const climbing = phaseNow === "running" && (cam.x > 0 || cam.y > 0);
      const starDrift = phaseNow === "running" ? (climbing ? 3.2 : 1.5) : 0.35;
      const ascentPush = climbing
        ? Math.min(4.2, 0.8 + Math.log10(Math.max(1, climbMult)) * 1.35)
        : phaseNow === "running"
          ? 0.15
          : 0;

      for (const star of starsRef.current) {
        star.x -= star.s * starDrift * (0.55 + star.depth) + dCamX * star.depth * 0.35;
        star.y += ascentPush * (0.35 + star.depth) + dCamY * star.depth * 0.35;
        if (star.x < -2) star.x = w + 2;
        if (star.x > w + 2) star.x = -2;
        if (star.y > h + 2) star.y = -2;
        if (star.y < -2) star.y = h + 2;

        let sx = ((star.x % w) + w) % w;
        let sy = ((star.y % h) + h) % h;

        ctx.globalAlpha = star.a * (0.65 + 0.35 * Math.sin(nowPerf * 0.004 + sx));
        ctx.fillStyle = "#d7e6f7";
        ctx.beginPath();
        ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      let mult = 1;
      let heat: keyof typeof HEAT = "calm";
      let pos = rocketPos(1, w, h);
      let angle = -0.55;
      let showRocket = phaseNow === "running" || phaseNow === "crashed";

      if (phaseNow === "running" && runStartMs.current) {
        mult = climbMult;
        heat = crashHeatTone(mult);
        pos = rocketPos(mult, w, h);

        const prev = prevPosRef.current;
        if (prev) {
          const dx = pos.x - prev.x;
          const dy = pos.y - prev.y;
          if (dx * dx + dy * dy > 0.15) {
            angle = Math.atan2(dy, dx);
          } else if (climbing) {
            // Camera-locked: keep the natural diagonal climb angle
            angle = -0.65;
          } else {
            angle = angleOf(prev, pos);
          }
        } else {
          angle = -0.65;
        }
        if (climbing) {
          // Stay on the diagonal — never tip into a vertical climb
          angle = Math.max(-0.85, Math.min(-0.45, angle));
        }
        prevPosRef.current = pos;

        // Exhaust + speed sparks
        if (Math.random() < 0.7) {
          const back = angle + Math.PI;
          particlesRef.current.push({
            x: pos.x + Math.cos(back) * 10,
            y: pos.y + Math.sin(back) * 10,
            vx: Math.cos(back) * (0.7 + Math.random()) + (Math.random() - 0.5) * 0.5,
            vy: Math.sin(back) * (0.7 + Math.random()) + (Math.random() - 0.5) * 0.5,
            life: 1,
            max: 0.28 + Math.random() * 0.28,
            size: 1 + Math.random() * 1.8,
            hue: heat === "blaze" ? 25 : heat === "hot" ? 42 : 145,
          });
        }
        if (Math.random() < 0.35) {
          particlesRef.current.push({
            x: pos.x - Math.cos(angle) * (8 + Math.random() * 20),
            y: pos.y - Math.sin(angle) * (8 + Math.random() * 20),
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            life: 1,
            max: 0.4,
            size: 0.8 + Math.random(),
            hue: heat === "blaze" ? 30 : 160,
          });
        }

        // Milestones — soft celebration, not a harsh pop
        for (const m of [2, 5, 10, 25, 50]) {
          if (mult >= m && milestoneRef.current < m) {
            milestoneRef.current = m;
            onMilestoneRef.current?.(m);
            const tier =
              m >= 50 ? "moon" : m >= 10 ? "high" : m >= 5 ? "mid" : "soft";
            milestoneAnimId.current += 1;
            const id = milestoneAnimId.current;
            setMilestoneFx({ value: m, tier, id });
            if (milestoneTimerRef.current != null) {
              window.clearTimeout(milestoneTimerRef.current);
            }
            milestoneTimerRef.current = window.setTimeout(() => {
              setMilestoneFx((prev) => (prev?.id === id ? null : prev));
              milestoneTimerRef.current = null;
            }, 1300);

            const burst = m >= 10 ? 16 : 10;
            for (let i = 0; i < burst; i++) {
              const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
              const sp = 0.8 + Math.random() * 2.2;
              particlesRef.current.push({
                x: pos.x + (Math.random() - 0.5) * 8,
                y: pos.y + (Math.random() - 0.5) * 8,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 0.6,
                life: 1,
                max: 0.55 + Math.random() * 0.35,
                size: 1.2 + Math.random() * 1.8,
                hue: m >= 10 ? 35 : m >= 5 ? 48 : 155,
              });
            }
          }
        }

        if (multLabelRef.current) {
          multLabelRef.current.textContent = formatMultiplierLive(mult);
          multLabelRef.current.dataset.heat = heat;
        }

        if (now - lastEmitMs.current >= LIVE_EMIT_MS) {
          lastEmitMs.current = now;
          onLiveRef.current?.(mult);
        }
      } else if (phaseNow === "crashed" && s?.crash_point) {
        mult = s.crash_point;
        heat = "crash";
        const anim = crashAnimRef.current;
        if (anim) {
          const t = Math.min(1, (nowPerf - anim.t0) / 900);
          // Rocket tumbles away from the break point
          pos = {
            x: anim.pos.x + t * 28,
            y: anim.pos.y + t * t * 95,
          };
          angle = anim.angle + t * 3.4;
          showRocket = t < 0.85;
        } else {
          pos = rocketPos(mult, w, h);
        }
      } else if (phaseNow === "betting") {
        // Keep the stage clear during countdown — rocket appears at launch.
        showRocket = false;
        particlesRef.current = [];
      }

      // Flight path — live energy ribbon (no heavy shadow), breaks on crash
      if (phaseNow === "running" && mult > 1.01) {
        const path = buildFlightPath(mult, w, h);
        const c = HEAT[heat];
        sparkPhaseRef.current += 0.1;
        drawLiveTrail(ctx, path, c, sparkPhaseRef.current, nowPerf, h);
      } else if (phaseNow === "crashed" && crashAnimRef.current) {
        const anim = crashAnimRef.current;
        const t = Math.min(1, (nowPerf - anim.t0) / 900);
        drawBrokenTrail(ctx, anim.path, anim.pos, t, nowPerf);
      }

      // Particles
      const next: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life -= 0.016 / p.max;
        if (p.life <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += phaseNow === "crashed" ? 0.08 : 0.012;
        ctx.globalAlpha = Math.max(0, p.life) * 0.9;
        ctx.fillStyle = `hsl(${p.hue} 90% 62%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        next.push(p);
      }
      particlesRef.current = next.length > 100 ? next.slice(-100) : next;
      ctx.globalAlpha = 1;

      if (showRocket) {
        drawRocket(
          pos.x,
          pos.y,
          angle,
          heat,
          nowPerf / 1000,
          phaseNow === "crashed",
        );
      }

      // Crash shock + break flash
      if (crashAnimRef.current && phaseNow === "crashed") {
        const anim = crashAnimRef.current;
        const t = Math.min(1, (nowPerf - anim.t0) / 700);
        if (t < 1) {
          ctx.strokeStyle = `rgba(229,101,85,${(1 - t) * 0.85})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(anim.pos.x, anim.pos.y, 6 + t * 78, 0, Math.PI * 2);
          ctx.stroke();

          // Second ring
          ctx.strokeStyle = `rgba(255,180,120,${(1 - t) * 0.45})`;
          ctx.beginPath();
          ctx.arc(anim.pos.x, anim.pos.y, 3 + t * 48, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const winFx = fx?.kind === "win" ? fx : null;
  const loseFx = fx?.kind === "lose" ? fx : null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "crash-stage relative mx-auto aspect-[16/10] w-full max-w-md overflow-hidden rounded-2xl",
        running && "crash-stage--running",
        crashed && "crash-stage--crashed",
        winFx && "crash-stage--win",
        loseFx && "crash-stage--lose",
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {milestoneFx ? (
        <div
          key={milestoneFx.id}
          className={cn(
            "crash-milestone pointer-events-none absolute inset-x-0 top-2 z-[8]",
            `crash-milestone--${milestoneFx.tier}`,
          )}
          aria-hidden
        >
          <div className="crash-milestone__bloom" />
          <div className="crash-milestone__row">
            <span className="crash-milestone__flare crash-milestone__flare--left" />
            <div className="crash-milestone__core">
              <span className="crash-milestone__echo" aria-hidden>
                {milestoneFx.value}×
              </span>
              <span className="crash-milestone__value">{milestoneFx.value}×</span>
            </div>
            <span className="crash-milestone__flare crash-milestone__flare--right" />
          </div>
          <div className="crash-milestone__sparks" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </div>
        </div>
      ) : null}

      {winFx ? (
        <div className="crash-outcome crash-outcome--win pointer-events-none absolute inset-0 z-20">
          <div className="crash-outcome__burst" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </div>
          <p className="crash-outcome__title">Забрано</p>
          <p className="crash-outcome__amount">+{winFx.amountTon} TON</p>
          <p className="crash-outcome__mult">{formatMultiplier(winFx.multiplier)}</p>
        </div>
      ) : null}

      {loseFx ? (
        <div className="crash-outcome crash-outcome--lose pointer-events-none absolute inset-0 z-20">
          <p className="crash-outcome__mult">{formatMultiplier(loseFx.multiplier)}</p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1">
        {betting ? (
          <div
            className={cn(
              "crash-countdown",
              countdown <= 3 && countdown > 0 && "crash-countdown--urgent",
              countdown === 1 && "crash-countdown--final",
              countdown === 0 && "crash-countdown--go",
            )}
          >
            <div ref={countdownRingRef} className="crash-countdown__ring" aria-hidden>
              <span className="crash-countdown__orbit" />
              <span className="crash-countdown__orbit crash-countdown__orbit--delayed" />
            </div>
            <div className="crash-countdown__bloom" aria-hidden />
            <span key={countdown} className="crash-countdown__value">
              {countdown.toString().padStart(2, "0")}
            </span>
            <span className="crash-countdown__label">
              {countdown === 0 ? "Старт" : "До старта"}
            </span>
          </div>
        ) : !winFx && !loseFx ? (
          <>
            <span
              ref={running ? multLabelRef : undefined}
              className={cn(
                "crash-mult text-5xl font-bold tabular-nums tracking-tight",
                crashed && "text-danger crash-mult--crashed",
                running && "crash-mult--live",
              )}
            >
              {running ? "1.00×" : staticMult}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                crashed ? "text-danger/80" : "text-white/45",
              )}
            >
              {statusSubtext(phase)}
            </span>
          </>
        ) : null}
      </div>

      {state?.round_number != null ? (
        <span className="pointer-events-none absolute left-3 top-3 z-10 text-[10px] font-medium tabular-nums text-white/35">
          #{state.round_number}
        </span>
      ) : null}

      {stakeHud && !winFx && !loseFx ? (
        <div className="crash-stake-hud pointer-events-none absolute inset-x-0 bottom-0 z-[12]">
          <div className="crash-stake-hud__inner">
            <div className="crash-stake-hud__side">
              <span className="crash-stake-hud__label">Ставка</span>
              <span className="crash-stake-hud__value">
                {stakeHud.gifts && stakeHud.gifts.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    {stakeHud.gifts.slice(0, 3).map((gift) => (
                      <span
                        key={gift.id}
                        className="flex h-4 w-4 shrink-0 overflow-hidden rounded bg-white/10"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={gift.image_url} alt="" className="h-full w-full object-cover" />
                      </span>
                    ))}
                    <TonAmount amount={stakeHud.stakeTon} iconSize="xs" />
                  </span>
                ) : (
                  <TonAmount amount={stakeHud.stakeTon} iconSize="xs" />
                )}
                {stakeHud.betCount > 1 ? (
                  <span className="ml-1 text-[10px] text-white/45">×{stakeHud.betCount}</span>
                ) : null}
              </span>
            </div>
            <div className="crash-stake-hud__side crash-stake-hud__side--win">
              <span className="crash-stake-hud__label">Сейчас</span>
              <span className="crash-stake-hud__value crash-stake-hud__value--win">
                <TonAmount
                  amount={stakeHud.winTon}
                  iconSize="xs"
                  iconClassName="text-success"
                />
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <span ref={potLabelRef} className="sr-only" />
    </div>
  );
}
