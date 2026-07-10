"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  CrashRoundState,
  calibrateClockOffsetMs,
  computeRunningMultiplier,
  crashHeatTone,
  elapsedMsForMultiplier,
  flightProgress,
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
  /** Throttled (~10Hz). Do not setState every frame in parent. */
  onLiveMultiplier?: (mult: number) => void;
  onMilestone?: (mult: number) => void;
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

function rocketPos(mult: number, w: number, h: number): Pt {
  const padX = w * 0.08;
  const padBottom = h * 0.14;
  const padTop = h * 0.16;
  const t = flightProgress(Math.max(1, mult));
  return {
    x: padX + (w - padX * 1.9) * t,
    y: h - padBottom - (h - padBottom - padTop) * t,
  };
}

/** Rebuild a smooth path from 1× to current multiplier every frame. */
function buildFlightPath(mult: number, w: number, h: number): Pt[] {
  const tip = Math.max(1.001, mult);
  const steps = Math.min(64, Math.max(16, Math.floor(12 + tip * 10)));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    // Log-space from 1 → tip so density matches growth
    const m = Math.exp(Math.log(tip) * u);
    pts.push(rocketPos(m, w, h));
  }
  return pts;
}

function angleOf(from: Pt, to: Pt): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function CrashChart({ state, fx = null, onLiveMultiplier, onMilestone }: Props) {
  const phase = state?.phase;
  const crashed = phase === "crashed";
  const running = phase === "running";
  const betting = phase === "betting";

  const [countdown, setCountdown] = useState(0);
  const [staticMult, setStaticMult] = useState("1.00×");
  const [milestoneFlash, setMilestoneFlash] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multLabelRef = useRef<HTMLSpanElement>(null);
  const potLabelRef = useRef<HTMLSpanElement>(null);

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
  const crashAnimRef = useRef<{ t0: number; pos: Pt; angle: number } | null>(null);
  const starsRef = useRef<{ x: number; y: number; r: number; a: number; s: number }[]>([]);

  stateRef.current = state;
  onLiveRef.current = onLiveMultiplier;
  onMilestoneRef.current = onMilestone;
  fxRef.current = fx;

  // Countdown — 1Hz-ish via rAF but only setState when second changes
  useEffect(() => {
    if (!betting || !state?.ends_at) {
      setCountdown(0);
      return;
    }
    const deadline = new Date(state.ends_at).getTime();
    let frame = 0;
    let lastShown = -1;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (left !== lastShown) {
        lastShown = left;
        setCountdown(left);
      }
      if (Date.now() < deadline) frame = requestAnimationFrame(tick);
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
      crashAnimRef.current = null;
      setMilestoneFlash(null);
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
      crashAnimRef.current = {
        t0: performance.now(),
        pos,
        angle: angleOf(prev, pos),
      };
      // Explosion burst
      for (let i = 0; i < 28; i++) {
        const a = (Math.PI * 2 * i) / 28 + Math.random() * 0.2;
        const sp = 1.2 + Math.random() * 3.4;
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
        starsRef.current = Array.from({ length: 42 }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.4 + Math.random() * 1.4,
          a: 0.15 + Math.random() * 0.55,
          s: 0.15 + Math.random() * 0.45,
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

      // Stars
      for (const star of starsRef.current) {
        star.x -= star.s * (phaseNow === "running" ? 1.6 : 0.35);
        if (star.x < 0) star.x = w;
        ctx.globalAlpha = star.a * (0.7 + 0.3 * Math.sin(nowPerf * 0.004 + star.x));
        ctx.fillStyle = "#d7e6f7";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Horizon grid
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const y = h * (0.28 + i * 0.18);
        ctx.beginPath();
        ctx.moveTo(w * 0.04, y);
        ctx.lineTo(w * 0.96, y);
        ctx.stroke();
      }

      let mult = 1;
      let heat: keyof typeof HEAT = "calm";
      let pos = rocketPos(1, w, h);
      let angle = -0.55;
      let showRocket = phaseNow === "running" || phaseNow === "crashed";

      if (phaseNow === "running" && runStartMs.current) {
        mult = computeRunningMultiplier({
          runStartMs: runStartMs.current,
          clockOffsetMs: clockOffsetMs.current,
          serverMultiplier: lastServerMult.current,
          lastTickAtMs: lastTickAtMs.current,
          nowMs: now,
        });
        heat = crashHeatTone(mult);
        pos = rocketPos(mult, w, h);

        const prev = prevPosRef.current;
        if (prev) {
          const dx = pos.x - prev.x;
          const dy = pos.y - prev.y;
          if (dx * dx + dy * dy > 0.2) angle = Math.atan2(dy, dx);
          else angle = angleOf(prev, pos);
        } else {
          angle = -0.65;
        }
        prevPosRef.current = pos;

        // Exhaust particles
        if (Math.random() < 0.55) {
          const back = angle + Math.PI;
          particlesRef.current.push({
            x: pos.x + Math.cos(back) * 10,
            y: pos.y + Math.sin(back) * 10,
            vx: Math.cos(back) * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.4,
            vy: Math.sin(back) * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.4,
            life: 1,
            max: 0.35 + Math.random() * 0.35,
            size: 1 + Math.random() * 2,
            hue: heat === "blaze" ? 25 : heat === "hot" ? 42 : 145,
          });
        }

        // Milestones
        for (const m of [2, 5, 10, 25, 50]) {
          if (mult >= m && milestoneRef.current < m) {
            milestoneRef.current = m;
            onMilestoneRef.current?.(m);
            setMilestoneFlash(m);
            window.setTimeout(() => setMilestoneFlash(null), 650);
            for (let i = 0; i < 12; i++) {
              const a = (Math.PI * 2 * i) / 12;
              particlesRef.current.push({
                x: pos.x,
                y: pos.y,
                vx: Math.cos(a) * 2.2,
                vy: Math.sin(a) * 2.2,
                life: 1,
                max: 0.55,
                size: 2,
                hue: 200,
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
          pos = {
            x: anim.pos.x + t * 18,
            y: anim.pos.y + t * t * 70,
          };
          angle = anim.angle + t * 2.8;
          showRocket = t < 0.92;
        } else {
          pos = rocketPos(mult, w, h);
        }
      } else if (phaseNow === "betting") {
        // Idle rocket on pad
        showRocket = true;
        pos = { x: w * 0.14, y: h * 0.78 };
        angle = -Math.PI / 2;
        heat = "calm";
        // Soft idle flame
        if (Math.random() < 0.25) {
          particlesRef.current.push({
            x: pos.x,
            y: pos.y + 10,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 0.4 + Math.random() * 0.5,
            life: 1,
            max: 0.4,
            size: 1.2,
            hue: 145,
          });
        }
      }

      // Flight path ribbon — rebuilt from 1× → current every frame
      if ((phaseNow === "running" || phaseNow === "crashed") && mult > 1.01) {
        const path = buildFlightPath(mult, w, h);
        const c = HEAT[heat];
        if (path.length > 1) {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          const strokePath = () => {
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
              ctx.lineTo(path[i].x, path[i].y);
            }
          };

          // Outer glow
          strokePath();
          ctx.strokeStyle = c.glow;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 16;
          ctx.stroke();

          // Neon band
          strokePath();
          ctx.strokeStyle = c.stroke;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 5.5;
          ctx.stroke();

          // Bright core
          strokePath();
          ctx.strokeStyle = "#ffffff";
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Area under curve
          let minY = path[0].y;
          for (const p of path) if (p.y < minY) minY = p.y;
          ctx.beginPath();
          ctx.moveTo(path[0].x, h);
          for (const p of path) ctx.lineTo(p.x, p.y);
          ctx.lineTo(path[path.length - 1].x, h);
          ctx.closePath();
          const fill = ctx.createLinearGradient(0, minY, 0, h);
          fill.addColorStop(0, c.glow);
          fill.addColorStop(1, "transparent");
          ctx.fillStyle = fill;
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Particles
      const next: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life -= 0.016 / p.max;
        if (p.life <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += phaseNow === "crashed" ? 0.06 : 0.01;
        ctx.globalAlpha = Math.max(0, p.life) * 0.9;
        ctx.fillStyle = `hsl(${p.hue} 90% 62%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        next.push(p);
      }
      particlesRef.current = next.length > 90 ? next.slice(-90) : next;
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

      // Crash shock ring
      if (crashAnimRef.current && phaseNow === "crashed") {
        const t = Math.min(1, (nowPerf - crashAnimRef.current.t0) / 650);
        if (t < 1) {
          ctx.strokeStyle = `rgba(229,101,85,${1 - t})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(
            crashAnimRef.current.pos.x,
            crashAnimRef.current.pos.y,
            8 + t * 70,
            0,
            Math.PI * 2,
          );
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

      {milestoneFlash != null ? (
        <div className="crash-milestone pointer-events-none absolute inset-0 z-[8]" aria-hidden>
          <span className="crash-milestone__label">{milestoneFlash}×</span>
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
          <div className="crash-outcome__crack" aria-hidden />
          <p className="crash-outcome__title">Краш</p>
          <p className="crash-outcome__mult">{formatMultiplier(loseFx.multiplier)}</p>
          <p className="crash-outcome__sub">Ставка сгорела</p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1">
        {betting ? (
          <>
            <span className="crash-countdown text-5xl font-bold tabular-nums tracking-tight text-accent">
              {countdown.toString().padStart(2, "0")}
            </span>
            <span className="text-xs font-medium text-muted/90">До старта</span>
          </>
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

      <span ref={potLabelRef} className="sr-only" />
    </div>
  );
}
