"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { WheelSegment } from "@/lib/api";
import { formatTON } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { maxPrizeNanoton, prizeTierForAmount } from "@/lib/wheel-tiers";

const CELL_W = 72;
const GAP = 10;
const STRIDE = CELL_W + GAP;
/** Fewer loops so the opening rush stays readable, not a blur. */
const LOOPS = 6;
/** Full spin duration. */
const SPIN_MS = 8000;
/** Distance (px) at which focus falls to 0 — soft crossfade between neighbors. */
const FOCUS_FALLOFF = CELL_W * 0.72;

/**
 * Ease-out quartic: brief opening (readable cells), then most of the
 * 8s is a long soft landing into the selection marker.
 */
function easeReelSpin(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const inv = 1 - x;
  return 1 - inv * inv * inv * inv;
}

function focusStrength(dist: number): number {
  const t = Math.max(0, 1 - dist / FOCUS_FALLOFF);
  // Smoothstep — soft in/out between neighbors instead of a hard switch.
  return t * t * (3 - 2 * t);
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
  const [hasFocus, setHasFocus] = useState(false);
  const hasFocusRef = useRef(false);
  const lastTickRef = useRef(0);
  const focusIndexRef = useRef(-1);
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

  /**
   * Continuous focus by proximity to the marker — paints CSS vars on cells
   * so scale/glow crossfade between neighbors instead of snapping.
   */
  function paintFocus(scrollX: number) {
    const track = trackRef.current;
    const viewportW = viewportRef.current?.clientWidth ?? 0;
    if (!track || viewportW <= 0) return;

    const center = scrollX + viewportW / 2;
    const cells = track.children;
    let bestIdx = -1;
    let bestStrength = 0;

    for (let i = 0; i < cells.length; i++) {
      const cellCenter = i * STRIDE + CELL_W / 2;
      const strength = focusStrength(Math.abs(center - cellCenter));
      const el = cells[i] as HTMLElement;
      el.style.setProperty("--reel-focus", strength.toFixed(3));
      if (strength > bestStrength) {
        bestStrength = strength;
        bestIdx = i;
      }
    }

    const prev = focusIndexRef.current;
    if (prev !== bestIdx) {
      if (prev >= 0 && prev < cells.length) {
        cells[prev].classList.remove("reel-cell--focus");
      }
      if (bestIdx >= 0 && bestIdx < cells.length) {
        cells[bestIdx].classList.add("reel-cell--focus");
      }
      focusIndexRef.current = bestIdx;
    }

    if (bestIdx >= 0 && !hasFocusRef.current) {
      hasFocusRef.current = true;
      setHasFocus(true);
    }
  }

  // Keep DOM transform in sync after strip remounts / first paint.
  useEffect(() => {
    paintOffset(offsetRef.current);
    paintFocus(offsetRef.current);
  }, [strip.length]);

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
      paintFocus(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinning, animating, ready, sorted.length, strip.length]);

  // Keep focus in sync on layout changes when not spinning
  useEffect(() => {
    if (animating) return;
    paintFocus(offsetRef.current);
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paintFocus(offsetRef.current));
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [animating, strip.length]);

  useEffect(() => {
    if (!spinning || !targetSegmentId || sorted.length === 0) return;

    setLanded(false);
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
      // Snap into first cycle — same cell under pointer, no jump on next idle
      const normalized = ((targetOffset % cycle) + cycle) % cycle;
      paintOffset(normalized);
      paintFocus(normalized);
      onSpinEndRef.current?.();
    };

    const frame = (now: number) => {
      if (cancelled) return;
      if (!startAt) startAt = now;
      const elapsed = now - startAt;
      const t = Math.min(1, elapsed / durationMs);
      const current = from + travel * ease(t);
      paintOffset(current);
      paintFocus(current);

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
        hasFocus && "prize-reel--has-focus",
        className,
      )}
    >
      <div className="prize-reel__tray">
        <div className="prize-reel__viewport" ref={viewportRef}>
          <div
            ref={trackRef}
            className="prize-reel__track"
            style={{ gap: GAP }}
          >
            {strip.map((seg, i) => {
              const isMax = maxAmount > 0 && seg.amount_nanoton === maxAmount;
              const tier = prizeTierForAmount(seg.amount_nanoton, isMax);
              return (
                <div
                  key={`${seg.id}-${i}`}
                  className={cn("reel-cell", `reel-cell--${tier}`)}
                  style={{
                    width: CELL_W,
                    minWidth: CELL_W,
                    ["--reel-focus" as string]: 0,
                  }}
                  aria-label={`${formatTON(seg.amount_nanoton)} TON`}
                >
                  <span className="reel-cell__spark reel-cell__spark--a" aria-hidden />
                  <span className="reel-cell__spark reel-cell__spark--b" aria-hidden />
                  <span className="reel-cell__amount">
                    {formatTON(seg.amount_nanoton)}
                  </span>
                  <span className="reel-cell__gem" aria-hidden>
                    <TonIcon variant="brand" className="reel-cell__gem-icon" title="" />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="prize-reel__marker" aria-hidden>
          <span className="prize-reel__marker-line" />
        </div>
      </div>
    </div>
  );
}
