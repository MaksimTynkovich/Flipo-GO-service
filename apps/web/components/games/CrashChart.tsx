"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
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
  /** Auto-cashout progress toward target while holding. */
  autoScale?: CrashAutoScale | null;
  /** Throttled (~10Hz). Do not setState every frame in parent. */
  onLiveMultiplier?: (mult: number) => void;
  /** Every animation frame while running — DOM-only updates (no setState). */
  onLiveFrame?: (mult: number) => void;
  onMilestone?: (mult: number) => void;
};

export type CrashStakeHud = {
  stakeTon: string;
  betCount: number;
  /** Pending bets — used to paint live win every frame without React churn. */
  bets: { amount_nanoton: number; funding_type?: string }[];
  gifts?: { id: string; image_url: string }[];
};

export type CrashAutoScale = {
  target: number;
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

function liveCreditNanoton(
  bets: { amount_nanoton: number; funding_type?: string }[],
  mult: number,
): number {
  if (mult < 1 || bets.length === 0) return 0;
  let sum = 0;
  for (const bet of bets) {
    const gross = bet.amount_nanoton * mult;
    sum += bet.funding_type === "gift" ? Math.max(0, gross - bet.amount_nanoton) : gross;
  }
  return sum;
}

function formatLiveWinTon(nanoton: number): string {
  const ton = nanoton / 1_000_000_000;
  if (ton >= 100) return ton.toFixed(1);
  return ton.toFixed(2);
}

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

type SmokePuff = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  growth: number;
  heat: number;
  wobble: number;
  phase: number;
};

function emitSmoke(
  list: SmokePuff[],
  pos: Pt,
  angle: number,
  heat: keyof typeof HEAT,
  count = 2,
) {
  const back = angle + Math.PI;
  const heatAmt = heat === "blaze" ? 0.95 : heat === "hot" ? 0.75 : heat === "warm" ? 0.45 : 0.25;
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 0.7;
    const dir = back + spread;
    const dist = 6 + Math.random() * 10;
    list.push({
      x: pos.x + Math.cos(dir) * dist + (Math.random() - 0.5) * 3,
      y: pos.y + Math.sin(dir) * dist + (Math.random() - 0.5) * 3,
      vx: Math.cos(dir) * (0.15 + Math.random() * 0.45) + (Math.random() - 0.5) * 0.25,
      vy: Math.sin(dir) * (0.15 + Math.random() * 0.45) + (Math.random() - 0.5) * 0.25,
      life: 1,
      decay: 0.008 + Math.random() * 0.01,
      size: 3.5 + Math.random() * 5,
      growth: 0.08 + Math.random() * 0.14,
      heat: heatAmt * (0.55 + Math.random() * 0.45),
      wobble: 0.4 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
    });
  }
  if (list.length > 90) list.splice(0, list.length - 90);
}

function drawEngineFlame(
  ctx: CanvasRenderingContext2D,
  pos: Pt,
  angle: number,
  color: HeatTone,
  nowPerf: number,
) {
  const back = angle + Math.PI;
  const flicker = 0.75 + Math.sin(nowPerf * 0.04) * 0.25;
  const ex = pos.x + Math.cos(back) * 9;
  const ey = pos.y + Math.sin(back) * 9;
  const grd = ctx.createRadialGradient(ex, ey, 0, ex, ey, 14 * flicker);
  grd.addColorStop(0, "rgba(255,255,255,0.75)");
  grd.addColorStop(0.25, color.flame);
  grd.addColorStop(0.6, color.glow);
  grd.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(ex, ey, 14 * flicker, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Persistent flight path across the whole stage — soft, under the smoke. */
function drawFlightPathLine(
  ctx: CanvasRenderingContext2D,
  path: Pt[],
  color: HeatTone,
  alphaScale = 1,
) {
  if (path.length < 2 || alphaScale <= 0.02) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Soft underglow
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const mx = (prev.x + curr.x) * 0.5;
    const my = (prev.y + curr.y) * 0.5;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
  ctx.strokeStyle = color.stroke;
  ctx.globalAlpha = 0.22 * alphaScale;
  ctx.lineWidth = 4.5;
  ctx.stroke();

  // Crisp core line
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const mx = (prev.x + curr.x) * 0.5;
    const my = (prev.y + curr.y) * 0.5;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
  ctx.strokeStyle = color.flame;
  ctx.globalAlpha = 0.7 * alphaScale;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Bright tip near the rocket
  const tipFrom = Math.max(0, path.length - 12);
  ctx.beginPath();
  ctx.moveTo(path[tipFrom].x, path[tipFrom].y);
  for (let i = tipFrom + 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.55 * alphaScale;
  ctx.lineWidth = 1.15;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSmokeTrail(
  ctx: CanvasRenderingContext2D,
  smoke: SmokePuff[],
  color: HeatTone,
  nowPerf: number,
  dissipate = false,
) {
  for (let i = 0; i < smoke.length; i++) {
    const p = smoke[i];
    const age = 1 - p.life;
    p.life -= p.decay * (dissipate ? 2.4 : 1);
    if (p.life <= 0) continue;

    p.x += p.vx + Math.sin(nowPerf * 0.003 + p.phase) * p.wobble * 0.04;
    p.y += p.vy + Math.cos(nowPerf * 0.0025 + p.phase) * p.wobble * 0.04;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.size += p.growth;
    p.heat *= 0.965;

    const alpha = Math.pow(p.life, 1.35) * (0.22 + 0.3 * (1 - age * 0.45));
    if (alpha < 0.01) continue;

    const r = p.size;
    const hot = p.heat;

    // Cool expanding smoke body
    const smokeA = alpha * (0.5 + (1 - hot) * 0.5);
    const body = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    body.addColorStop(0, `rgba(170,188,208,${smokeA})`);
    body.addColorStop(0.42, `rgba(108,128,152,${smokeA * 0.48})`);
    body.addColorStop(1, "rgba(80,100,125,0)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Warm core while the puff is still fresh exhaust
    if (hot > 0.3) {
      const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.55);
      core.addColorStop(0, `rgba(255,248,230,${alpha * hot * 0.7})`);
      core.addColorStop(0.4, color.glow);
      core.addColorStop(1, "transparent");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let w = 0;
  for (let i = 0; i < smoke.length; i++) {
    if (smoke[i].life > 0) smoke[w++] = smoke[i];
  }
  smoke.length = w;
}

export function CrashChart({
  state,
  fx = null,
  stakeHud = null,
  autoScale = null,
  onLiveMultiplier,
  onLiveFrame,
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
  const winAmountRef = useRef<HTMLSpanElement>(null);
  const potLabelRef = useRef<HTMLSpanElement>(null);
  const countdownRingRef = useRef<HTMLDivElement>(null);
  const autoFillRef = useRef<HTMLDivElement>(null);
  const autoRemainRef = useRef<HTMLSpanElement>(null);

  const stateRef = useRef(state);
  const onLiveRef = useRef(onLiveMultiplier);
  const onLiveFrameRef = useRef(onLiveFrame);
  const onMilestoneRef = useRef(onMilestone);
  const fxRef = useRef(fx);
  const autoScaleRef = useRef(autoScale);
  const stakeHudRef = useRef(stakeHud);

  const roundRef = useRef<string | null>(null);
  const runStartMs = useRef(0);
  const clockOffsetMs = useRef(0);
  const lastServerMult = useRef(1);
  const lastTickAtMs = useRef(0);
  const runningReadyRef = useRef(false);
  const milestoneRef = useRef(1);
  const lastEmitMs = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const smokeRef = useRef<SmokePuff[]>([]);
  const prevPosRef = useRef<Pt | null>(null);
  const crashAnimRef = useRef<{
    t0: number;
    pos: Pt;
    angle: number;
    path: Pt[];
    mult: number;
  } | null>(null);
  const starsRef = useRef<Star[]>([]);
  const prevCamRef = useRef<Cam>({ x: 0, y: 0 });

  stateRef.current = state;
  onLiveRef.current = onLiveMultiplier;
  onLiveFrameRef.current = onLiveFrame;
  onMilestoneRef.current = onMilestone;
  fxRef.current = fx;
  autoScaleRef.current = autoScale;
  stakeHudRef.current = stakeHud;

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
      smokeRef.current = [];
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
        smokeRef.current = [];
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
      // Extra smoke burst on crash
      for (let i = 0; i < 14; i++) {
        emitSmoke(smokeRef.current, pos, angleOf(prev, pos), "crash", 1);
      }
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
        smokeRef.current = [];
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
      if ((dCamX !== 0 || dCamY !== 0)) {
        if (particlesRef.current.length) {
          for (const p of particlesRef.current) {
            p.x -= dCamX;
            p.y += dCamY;
          }
        }
        if (smokeRef.current.length) {
          for (const p of smokeRef.current) {
            p.x -= dCamX;
            p.y += dCamY;
          }
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

        // Rocket exhaust smoke wake
        emitSmoke(smokeRef.current, pos, angle, heat, heat === "blaze" || heat === "hot" ? 3 : 2);
        if (Math.random() < 0.55) {
          emitSmoke(smokeRef.current, pos, angle, heat, 1);
        }

        // Small spark flecks near the engine
        if (Math.random() < 0.45) {
          const back = angle + Math.PI;
          particlesRef.current.push({
            x: pos.x + Math.cos(back) * 8,
            y: pos.y + Math.sin(back) * 8,
            vx: Math.cos(back) * (0.5 + Math.random()) + (Math.random() - 0.5) * 0.4,
            vy: Math.sin(back) * (0.5 + Math.random()) + (Math.random() - 0.5) * 0.4,
            life: 1,
            max: 0.22 + Math.random() * 0.2,
            size: 0.8 + Math.random() * 1.4,
            hue: heat === "blaze" ? 25 : heat === "hot" ? 42 : 145,
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

        const hud = stakeHudRef.current;
        if (winAmountRef.current && hud?.bets?.length) {
          winAmountRef.current.textContent = formatLiveWinTon(
            liveCreditNanoton(hud.bets, mult),
          );
        }

        onLiveFrameRef.current?.(mult);

        const auto = autoScaleRef.current;
        if (auto?.target && auto.target > 1) {
          const progress = Math.max(0, Math.min(1, (mult - 1) / (auto.target - 1)));
          const remain = Math.max(0, auto.target - mult);
          if (autoFillRef.current) {
            autoFillRef.current.style.width = `${(progress * 100).toFixed(2)}%`;
          }
          if (autoRemainRef.current) {
            autoRemainRef.current.textContent =
              remain < 0.005 ? "цель" : `−${remain.toFixed(2)}×`;
          }
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
        smokeRef.current = [];
      }

      // Persistent path + smoke wake + engine flame
      if (phaseNow === "running" && showRocket && mult > 1.01) {
        const c = HEAT[heat];
        const path = buildFlightPath(mult, w, h);
        drawFlightPathLine(ctx, path, c);
        drawSmokeTrail(ctx, smokeRef.current, c, nowPerf, false);
        drawEngineFlame(ctx, pos, angle, c, nowPerf);
      } else if (phaseNow === "crashed") {
        const anim = crashAnimRef.current;
        if (anim) {
          const t = Math.min(1, (nowPerf - anim.t0) / 900);
          drawFlightPathLine(ctx, anim.path, HEAT.crash, Math.max(0, 1 - t * 1.15));
        }
        drawSmokeTrail(ctx, smokeRef.current, HEAT.crash, nowPerf, true);
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

      {autoScale && autoScale.target > 1 && !winFx && !loseFx ? (
        <div className="crash-auto-scale pointer-events-none absolute inset-x-0 top-0 z-[13]">
          <div className="crash-auto-scale__track" aria-hidden>
            <div
              ref={autoFillRef}
              className="crash-auto-scale__fill"
              style={{ width: "0%" }}
            />
          </div>
          <div className="crash-auto-scale__meta">
            <span ref={autoRemainRef} className="crash-auto-scale__remain">
              −{(autoScale.target - 1).toFixed(2)}×
            </span>
            <span className="crash-auto-scale__goal">
              {formatMultiplier(autoScale.target)}
            </span>
          </div>
        </div>
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
                <span className="inline-flex items-center gap-1">
                  <span ref={winAmountRef} className="tabular-nums">
                    {formatLiveWinTon(liveCreditNanoton(stakeHud.bets, 1))}
                  </span>
                  <TonIcon variant="brand" size="xs" className="text-success" />
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <span ref={potLabelRef} className="sr-only" />
    </div>
  );
}
