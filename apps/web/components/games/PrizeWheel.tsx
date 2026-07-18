"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { WheelSegment } from "@/lib/api";
import { formatTON } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import {
  maxPrizeNanoton,
  prizeTierForAmount,
  type PrizeTier,
} from "@/lib/wheel-tiers";

const CELL_W = 76;
const GAP = 8;
const STRIDE = CELL_W + GAP;
/** Fewer loops so the opening rush stays readable, not a blur. */
const LOOPS = 6;
/** Full spin duration. */
const SPIN_MS = 8000;

/**
 * Ease-out quartic: brief opening (readable cells), then most of the
 * 8s is a long soft landing into the needle.
 */
function easeReelSpin(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const inv = 1 - x;
  return 1 - inv * inv * inv * inv;
}

type PrizeWheelProps = {
  segments: WheelSegment[];
  targetSegmentId?: string | null;
  spinning: boolean;
  ready?: boolean;
  onSpinEnd?: () => void;
  onTick?: () => void;
  className?: string;
};

function focusIndexFromScroll(scrollX: number, viewportW: number, cellCount: number): number {
  if (cellCount === 0 || viewportW <= 0) return -1;
  const center = scrollX + viewportW / 2;
  const idx = Math.round((center - CELL_W / 2) / STRIDE);
  if (idx < 0 || idx >= cellCount) return -1;
  return idx;
}

export function PrizeWheel({
  segments,
  targetSegmentId,
  spinning,
  ready = false,
  onSpinEnd,
  onTick,
  className,
}: PrizeWheelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const animatingRef = useRef(false);
  const [animating, setAnimating] = useState(false);
  const [landed, setLanded] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [flybyTier, setFlybyTier] = useState<PrizeTier | null>(null);
  const lastTickRef = useRef(0);
  const lastFlybyKeyRef = useRef("");
  const flybyClearRef = useRef(0);
  const focusIndexRef = useRef(-1);
  const lastPaintAtRef = useRef(0);
  const onTickRef = useRef(onTick);
  const onSpinEndRef = useRef(onSpinEnd);
  onTickRef.current = onTick;
  onSpinEndRef.current = onSpinEnd;
  animatingRef.current = animating;

  const sorted = useMemo(
    () =>
      [...segments].sort(
        (a, b) => a.sort_order - b.sort_order || a.amount_nanoton - b.amount_nanoton,
      ),
    [segments],
  );

  const maxAmount = useMemo(
    () => maxPrizeNanoton(sorted.map((s) => s.amount_nanoton)),
    [sorted],
  );

  const strip = useMemo(() => {
    if (sorted.length === 0) return [];
    const out: WheelSegment[] = [];
    for (let i = 0; i < LOOPS; i++) out.push(...sorted);
    return out;
  }, [sorted]);

  /** Paint transform directly — avoids React re-render jank during spin. */
  function paintOffset(next: number) {
    offsetRef.current = next;
    const track = trackRef.current;
    if (track) {
      track.style.transform = `translate3d(${-next}px, 0, 0)`;
    }
  }

  // Keep DOM transform in sync after strip remounts / first paint.
  useEffect(() => {
    paintOffset(offsetRef.current);
  }, [strip.length]);

  function triggerFlyby(tier: PrizeTier, key: string) {
    if (!animatingRef.current) return;
    if (tier !== "mythic" && tier !== "immortal") return;
    if (lastFlybyKeyRef.current === key) return;
    lastFlybyKeyRef.current = key;
    setFlybyTier(tier);
    window.clearTimeout(flybyClearRef.current);
    flybyClearRef.current = window.setTimeout(() => {
      setFlybyTier(null);
    }, tier === "immortal" ? 420 : 320);
  }

  /**
   * Continuous highlight by distance to the needle.
   * Focus is exponentially smoothed so glow/shadows don't jump on fast frames.
   */
  function paintCellProximity(scrollX: number, opts?: { instant?: boolean; now?: number }) {
    const track = trackRef.current;
    const viewportW = viewportRef.current?.clientWidth ?? 0;
    if (!track || viewportW <= 0) return;

    const now = opts?.now ?? performance.now();
    const lastAt = lastPaintAtRef.current;
    lastPaintAtRef.current = now;
    const dt = lastAt > 0 ? Math.min(48, Math.max(0, now - lastAt)) : 16;
    // ~70ms time constant — soft during rush, still tracks the needle.
    const alpha = opts?.instant ? 1 : 1 - Math.exp(-dt / 70);

    const center = scrollX + viewportW / 2;
    const falloff = STRIDE * 1.7;
    const children = track.children;
    const first = Math.max(0, Math.floor((scrollX - STRIDE * 3) / STRIDE));
    const last = Math.min(
      children.length - 1,
      Math.ceil((scrollX + viewportW + STRIDE * 3) / STRIDE),
    );

    for (let i = first; i <= last; i++) {
      const el = children[i] as HTMLElement | undefined;
      if (!el) continue;
      const cellCenter = i * STRIDE + CELL_W / 2;
      const dist = Math.abs(cellCenter - center);
      const raw = 1 - Math.min(1, dist / falloff);
      // Smootherstep — softer shoulders than classic smoothstep.
      const s = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
      const prev =
        Number.parseFloat(el.style.getPropertyValue("--reel-focus") || "0") || 0;
      const focus = prev + (s - prev) * alpha;
      el.style.setProperty("--reel-focus", focus.toFixed(3));
      el.style.opacity = (0.4 + 0.6 * focus).toFixed(3);
      el.style.transform = `scale(${(1 + 0.08 * focus).toFixed(4)})`;
      // Avoid filter:brightness — it boxes box-shadow into a hard rectangle.
      el.style.removeProperty("filter");
      el.style.zIndex = String(Math.round(focus * 3));
    }
  }

  function syncFocus(scrollX: number, opts?: { instant?: boolean; now?: number }) {
    paintCellProximity(scrollX, opts);
    const viewportW = viewportRef.current?.clientWidth ?? 0;
    const next = focusIndexFromScroll(scrollX, viewportW, strip.length);
    if (focusIndexRef.current === next) return;
    focusIndexRef.current = next;
    setFocusIndex(next);
    if (next < 0 || next >= strip.length) return;
    const seg = strip[next]!;
    const tier = prizeTierForAmount(
      seg.amount_nanoton,
      maxAmount > 0 && seg.amount_nanoton === maxAmount,
    );
    triggerFlyby(tier, `${seg.id}-${next}`);
  }

  // Idle drift when ready
  useEffect(() => {
    if (spinning || animating || !ready || sorted.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const cycle = sorted.length * STRIDE;
      const next = (offsetRef.current + dt * 0.018) % cycle;
      paintOffset(next);
      syncFocus(next, { now });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinning, animating, ready, sorted.length, strip.length, maxAmount]);

  // Keep focus in sync on layout changes when not spinning
  useEffect(() => {
    if (animating) return;
    syncFocus(offsetRef.current, { instant: true });
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      syncFocus(offsetRef.current, { instant: true }),
    );
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [animating, strip.length, maxAmount]);

  useEffect(() => {
    return () => window.clearTimeout(flybyClearRef.current);
  }, []);

  useEffect(() => {
    if (!spinning || !targetSegmentId || sorted.length === 0) return;

    setLanded(false);
    setFlybyTier(null);
    lastFlybyKeyRef.current = "";
    const idx = sorted.findIndex((s) => s.id === targetSegmentId);
    if (idx < 0) {
      onSpinEndRef.current?.();
      return;
    }

    const cycle = sorted.length * STRIDE;
    const viewport = viewportRef.current?.clientWidth ?? 320;
    const landLoop = LOOPS - 2;
    const targetIndex = landLoop * sorted.length + idx;
    const targetOffset = targetIndex * STRIDE - viewport / 2 + CELL_W / 2;

    const from = ((offsetRef.current % cycle) + cycle) % cycle;
    setAnimating(false);
    paintOffset(from);

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const durationMs = reducedMotion ? 900 : SPIN_MS;
    const ease = reducedMotion ? (t: number) => t : easeReelSpin;
    const travel = targetOffset - from;

    let cancelled = false;
    let raf = 0;
    let startAt = 0;
    let prevPos = from;

    const finish = () => {
      setAnimating(false);
      setLanded(true);
      setFlybyTier(null);
      // Snap into first cycle — same cell under pointer, no jump on next idle
      const normalized = ((targetOffset % cycle) + cycle) % cycle;
      paintOffset(normalized);
      syncFocus(normalized, { instant: true });
      onSpinEndRef.current?.();
    };

    const frame = (now: number) => {
      if (cancelled) return;
      if (!startAt) startAt = now;
      const elapsed = now - startAt;
      const t = Math.min(1, elapsed / durationMs);
      const current = from + travel * ease(t);
      paintOffset(current);
      syncFocus(current, { now });

      // Haptics follow perceived speed (dense while fast, sparse near stop).
      const speed = Math.abs(current - prevPos);
      prevPos = current;
      const minGap = speed > 4.5 ? 55 : speed > 1.2 ? 110 : 190;
      if (!reducedMotion && now - lastTickRef.current > minGap) {
        lastTickRef.current = now;
        onTickRef.current?.();
      }

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        finish();
      }
    };

    const startId = requestAnimationFrame(() => {
      if (cancelled) return;
      setAnimating(true);
      raf = requestAnimationFrame(frame);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(startId);
      cancelAnimationFrame(raf);
    };
  }, [spinning, targetSegmentId, sorted]);

  return (
    <div
      className={cn(
        "prize-reel",
        spinning && "prize-reel--spinning",
        ready && !spinning && "prize-reel--ready",
        landed && "prize-reel--landed",
        focusIndex >= 0 && "prize-reel--has-focus",
        flybyTier && `prize-reel--flyby prize-reel--flyby-${flybyTier}`,
        className,
      )}
    >
      <div className="prize-reel__flash" aria-hidden />

      <div className="prize-reel__needle" aria-hidden>
        <span className="prize-reel__needle-glow" />
        <span className="prize-reel__needle-line" />
      </div>

      <div className="prize-reel__viewport" ref={viewportRef}>
        <div className="prize-reel__fade prize-reel__fade--left" aria-hidden />
        <div className="prize-reel__fade prize-reel__fade--right" aria-hidden />

        <div
          ref={trackRef}
          className="prize-reel__track"
          style={{ gap: GAP }}
        >
          {strip.map((seg, i) => {
            const isMax = maxAmount > 0 && seg.amount_nanoton === maxAmount;
            const tier = prizeTierForAmount(seg.amount_nanoton, isMax);
            const focused = i === focusIndex;
            return (
              <div
                key={`${seg.id}-${i}`}
                className={cn(
                  "reel-cell",
                  `reel-cell--${tier}`,
                  focused && "reel-cell--focus",
                )}
                style={{ width: CELL_W, minWidth: CELL_W }}
              >
                <span className="reel-cell__amount">{formatTON(seg.amount_nanoton)}</span>
                <span className="reel-cell__unit">
                  <TonIcon variant="brand" className="h-3 w-3" />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
