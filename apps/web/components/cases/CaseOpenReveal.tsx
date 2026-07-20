"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CaseLootPreview } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";

const ITEM_W = 88;
const ITEM_GAP = 10;
const STRIDE = ITEM_W + ITEM_GAP;
const LOOPS = 6;
const SPIN_MS = 4200;

type CaseOpenRevealProps = {
  loot: CaseLootPreview[];
  winnerId: string;
  accent?: string;
  onComplete: () => void;
};

function shuffleCopy<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildStrip(loot: CaseLootPreview[], winnerId: string): {
  items: CaseLootPreview[];
  targetIndex: number;
} {
  if (loot.length === 0) return { items: [], targetIndex: 0 };
  const base = shuffleCopy(loot);
  const items: CaseLootPreview[] = [];
  for (let i = 0; i < LOOPS; i += 1) {
    items.push(...base);
  }
  // Land in the last loop so the spin has travel distance.
  const lastLoopStart = (LOOPS - 1) * base.length;
  let targetIndex = items.findIndex(
    (item, idx) => idx >= lastLoopStart && item.id === winnerId,
  );
  if (targetIndex < 0) {
    const winner = loot.find((l) => l.id === winnerId) || loot[0];
    targetIndex = items.length;
    items.push(winner);
  }
  return { items, targetIndex };
}

export function CaseOpenReveal({ loot, winnerId, accent, onComplete }: CaseOpenRevealProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [offset, setOffset] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const completedRef = useRef(false);

  const { items, targetIndex } = useMemo(
    () => buildStrip(loot, winnerId),
    [loot, winnerId],
  );

  const glow = accent || "#3b82f6";

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || items.length === 0) return;

    completedRef.current = false;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const center = viewport.clientWidth / 2;
    const targetX = targetIndex * STRIDE + ITEM_W / 2;
    const finalOffset = Math.max(0, targetX - center);

    if (reduce) {
      setOffset(finalOffset);
      setLanded(true);
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => onCompleteRef.current(), 120);
      }
      return;
    }

    setOffset(0);
    setSpinning(false);
    setLanded(false);

    let startRaf = 0;
    let spinRaf = 0;
    startRaf = window.requestAnimationFrame(() => {
      spinRaf = window.requestAnimationFrame(() => {
        setSpinning(true);
        setOffset(finalOffset);
      });
    });

    return () => {
      window.cancelAnimationFrame(startRaf);
      window.cancelAnimationFrame(spinRaf);
    };
  }, [items, targetIndex]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !spinning) return;

    function finish() {
      if (completedRef.current) return;
      completedRef.current = true;
      setLanded(true);
      setSpinning(false);
      window.setTimeout(() => onCompleteRef.current(), 520);
    }

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      finish();
    };

    track.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finish, SPIN_MS + 400);
    return () => {
      track.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [spinning]);

  if (items.length === 0) return null;

  return (
    <div
      className={cn("case-reveal", landed && "case-reveal--landed")}
      style={{ ["--case-glow" as string]: glow }}
      role="status"
      aria-live="polite"
      aria-label="Открытие кейса"
    >
      <p className="case-reveal__hint">{landed ? "Поздравляем!" : "Крутим…"}</p>

      <div className="case-reveal__frame">
        <div className="case-reveal__fade case-reveal__fade--left" aria-hidden />
        <div className="case-reveal__fade case-reveal__fade--right" aria-hidden />
        <div className="case-reveal__pointer" aria-hidden />

        <div ref={viewportRef} className="case-reveal__viewport">
          <div
            ref={trackRef}
            className={cn("case-reveal__track", spinning && "case-reveal__track--spin")}
            style={{ transform: `translate3d(${-offset}px, 0, 0)` }}
          >
            {items.map((item, idx) => {
              const isWinner = landed && idx === targetIndex;
              return (
                <div
                  key={`${item.id}-${idx}`}
                  className={cn(
                    "case-reveal__item",
                    isWinner && "case-reveal__item--winner",
                  )}
                  style={{ width: ITEM_W }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={giftImageUrl(item.collection_slug, item.image_url)}
                    alt=""
                    className="case-reveal__img"
                    draggable={false}
                  />
                  <span className="case-reveal__name">{item.display_name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
