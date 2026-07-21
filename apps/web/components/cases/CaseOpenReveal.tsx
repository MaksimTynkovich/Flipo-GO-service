"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CaseLootPreview } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";

const ITEM_W = 68;
const ITEM_GAP = 8;
const STRIDE = ITEM_W + ITEM_GAP;
/** Full cycles before the landing zone — more distance reads as a longer spin. */
const LOOPS = 10;
const IDLE_LOOPS = 3;
/** Items kept after the winner so the right side of the viewport never goes empty. */
const PAD_AFTER = 8;
const SPIN_MS = 8000;

type CaseOpenRevealProps = {
  loot: CaseLootPreview[];
  /** When set with spinning, animates to this loot id. */
  winnerId?: string | null;
  accent?: string;
  /** Idle preview (no spin) vs active open animation. */
  mode?: "idle" | "spin";
  onComplete?: () => void;
};

function shuffleCopy<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildIdleStrip(loot: CaseLootPreview[]): CaseLootPreview[] {
  if (loot.length === 0) return [];
  const items: CaseLootPreview[] = [];
  for (let i = 0; i < IDLE_LOOPS; i += 1) {
    items.push(...loot);
  }
  return items;
}

function buildSpinStrip(
  loot: CaseLootPreview[],
  winnerId: string,
): { items: CaseLootPreview[]; targetIndex: number } {
  if (loot.length === 0) return { items: [], targetIndex: 0 };
  const base = shuffleCopy(loot);
  const items: CaseLootPreview[] = [];
  for (let i = 0; i < LOOPS; i += 1) {
    items.push(...base);
  }
  // Land in the second-to-last loop so a full loop remains after the winner.
  const landLoopStart = (LOOPS - 2) * base.length;
  const landLoopEnd = landLoopStart + base.length;
  let targetIndex = items.findIndex(
    (item, idx) => idx >= landLoopStart && idx < landLoopEnd && item.id === winnerId,
  );
  if (targetIndex < 0) {
    const winner = loot.find((l) => l.id === winnerId) || loot[0];
    targetIndex = landLoopStart + Math.floor(base.length / 2);
    items.splice(targetIndex, 0, winner);
  }
  // Guarantee enough tiles past the pointer so the strip never blanks on the right.
  while (items.length - targetIndex - 1 < PAD_AFTER) {
    items.push(...base);
  }
  return { items, targetIndex };
}

/** Ease-out quartic: fast reel-up, then a long soft brake into the winner. */
function easeOutQuartic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const inv = 1 - x;
  return 1 - inv * inv * inv * inv;
}

function tileBackground(slug: string, index: number): string {
  const hues = [210, 160, 45, 280, 190, 25];
  const hue = hues[Math.abs(index + slug.length) % hues.length];
  return `linear-gradient(160deg, hsl(${hue} 55% 32%) 0%, hsl(${hue} 40% 14%) 100%)`;
}

export function CaseOpenReveal({
  loot,
  winnerId,
  accent,
  mode = "idle",
  onComplete,
}: CaseOpenRevealProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const completedRef = useRef(false);

  const isSpin = mode === "spin" && Boolean(winnerId);

  const { items, targetIndex } = useMemo(() => {
    if (isSpin && winnerId) {
      return buildSpinStrip(loot, winnerId);
    }
    return { items: buildIdleStrip(loot), targetIndex: Math.min(1, Math.max(0, loot.length - 1)) };
  }, [loot, winnerId, isSpin]);

  const glow = accent || "#3390ec";

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || items.length === 0) return;

    completedRef.current = false;
    const center = viewport.clientWidth / 2;
    const targetX = targetIndex * STRIDE + ITEM_W / 2;
    const finalOffset = Math.max(0, targetX - center);

    const paint = (x: number) => {
      track.style.transform = `translate3d(${-x}px, 0, 0)`;
    };

    if (!isSpin) {
      paint(finalOffset);
      setSpinning(false);
      setLanded(false);
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      paint(finalOffset);
      setSpinning(false);
      setLanded(true);
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => onCompleteRef.current?.(), 120);
      }
      return;
    }

    paint(0);
    setSpinning(true);
    setLanded(false);

    let raf = 0;
    let startAt = 0;
    let cancelled = false;
    const from = 0;
    const travel = finalOffset - from;

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      paint(finalOffset);
      setSpinning(false);
      setLanded(true);
      window.setTimeout(() => onCompleteRef.current?.(), 520);
    };

    const frame = (now: number) => {
      if (cancelled) return;
      if (!startAt) startAt = now;
      const t = Math.min(1, (now - startAt) / SPIN_MS);
      paint(from + travel * easeOutQuartic(t));
      if (t < 1) {
        raf = window.requestAnimationFrame(frame);
      } else {
        finish();
      }
    };

    raf = window.requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [items, targetIndex, isSpin]);

  if (items.length === 0) {
    return (
      <div className="case-reveal case-reveal--empty">
        <div className="case-reveal__frame case-reveal__frame--empty">
          <p className="text-sm text-white/40">Нет призов</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "case-reveal",
        landed && "case-reveal--landed",
        !isSpin && "case-reveal--idle",
      )}
      style={{ ["--case-glow" as string]: glow }}
      role="status"
      aria-live={isSpin ? "polite" : "off"}
      aria-label={isSpin ? "Открытие кейса" : "Призы в рулетке"}
    >
      <div className="case-reveal__frame">
        <div className="case-reveal__fade case-reveal__fade--left" aria-hidden />
        <div className="case-reveal__fade case-reveal__fade--right" aria-hidden />
        <div className="case-reveal__pointer" aria-hidden />

        <div ref={viewportRef} className="case-reveal__viewport">
          <div
            ref={trackRef}
            className={cn("case-reveal__track", spinning && "case-reveal__track--spinning")}
          >
            {items.map((item, idx) => {
              const isWinner = landed && idx === targetIndex;
              const nearCenter = !isSpin && Math.abs(idx - targetIndex) <= 1;
              return (
                <div
                  key={`${item.id}-${idx}`}
                  className={cn(
                    "case-reveal__item",
                    isWinner && "case-reveal__item--winner",
                    nearCenter && "case-reveal__item--focus",
                  )}
                  style={{
                    width: ITEM_W,
                    background: tileBackground(item.collection_slug, idx),
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={giftImageUrl(item.collection_slug, item.image_url)}
                    alt=""
                    className="case-reveal__img"
                    draggable={false}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
