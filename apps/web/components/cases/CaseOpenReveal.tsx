"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { candyTileBackgroundForLoot } from "@/components/cases/case-ui";
import type { CaseLootPreview } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";

/** How many prize tiles must fit fully in the roulette viewport. */
const VISIBLE_COUNT = 5;
const ITEM_GAP = 6;
/** Full cycles before the landing zone — more distance reads as a longer spin. */
const LOOPS = 10;
const IDLE_LOOPS = 3;
/** Items kept after the winner so the right side of the viewport never goes empty. */
const PAD_AFTER = 8;
const SPIN_MS = 8000;
const FALLBACK_ITEM_W = 56;

type RevealLayout = {
  itemW: number;
  /** Full viewport width — 5 tiles fill edge to edge under the fades. */
  stripW: number;
};

function layoutForViewport(viewportWidth: number): RevealLayout {
  if (viewportWidth <= 0) {
    const itemW = FALLBACK_ITEM_W;
    return {
      itemW,
      stripW: itemW * VISIBLE_COUNT + ITEM_GAP * (VISIBLE_COUNT - 1),
    };
  }

  const gaps = (VISIBLE_COUNT - 1) * ITEM_GAP;
  // Exact division so 5 tiles + gaps span the full viewport — no side gutters.
  const itemW = Math.max(36, (viewportWidth - gaps) / VISIBLE_COUNT);

  return { itemW, stripW: viewportWidth };
}

type CaseOpenRevealProps = {
  loot: CaseLootPreview[];
  /** When set with spinning, animates to this loot id. */
  winnerId?: string | null;
  accent?: string;
  /** Idle preview (no spin) vs active open animation. */
  mode?: "idle" | "spin";
  /** Render inside case hero card — no outer frame chrome. */
  embedded?: boolean;
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

export function CaseOpenReveal({
  loot,
  winnerId,
  accent,
  mode = "idle",
  embedded = false,
  onComplete,
}: CaseOpenRevealProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const [layout, setLayout] = useState<RevealLayout>(() => layoutForViewport(0));
  const completedRef = useRef(false);

  const isSpin = mode === "spin" && Boolean(winnerId);
  const { itemW, stripW } = layout;
  const stride = itemW + ITEM_GAP;

  const { items, targetIndex } = useMemo(() => {
    if (isSpin && winnerId) {
      return buildSpinStrip(loot, winnerId);
    }
    // Center the strip on an early tile so idle shows 2 + focus + 2.
    return {
      items: buildIdleStrip(loot),
      targetIndex: Math.min(2, Math.max(0, loot.length - 1)),
    };
  }, [loot, winnerId, isSpin]);

  const glow = accent || "#3390ec";

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      setLayout(layoutForViewport(viewport.clientWidth));
    };

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(viewport);
    return () => ro?.disconnect();
  }, []);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || items.length === 0 || stripW <= 0) return;

    completedRef.current = false;
    // Clip window is exactly stripW; center the target tile inside it.
    const center = stripW / 2;
    const targetX = targetIndex * stride + itemW / 2;
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
  }, [items, targetIndex, isSpin, itemW, stripW, stride]);

  if (items.length === 0) {
    return (
      <div className={cn("case-reveal case-reveal--empty", embedded && "case-reveal--embedded")}>
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
        embedded && "case-reveal--embedded",
        landed && "case-reveal--landed",
        !isSpin && "case-reveal--idle",
      )}
      style={
        {
          ["--case-glow"]: glow,
          ["--case-item"]: `${itemW}px`,
          ["--case-gap"]: `${ITEM_GAP}px`,
          ["--case-strip"]: `${stripW}px`,
        } as CSSProperties
      }
      role="status"
      aria-live={isSpin ? "polite" : "off"}
      aria-label={isSpin ? "Открытие кейса" : "Призы в рулетке"}
    >
      <div className="case-reveal__frame">
        <div className="case-reveal__fade case-reveal__fade--left" aria-hidden />
        <div className="case-reveal__fade case-reveal__fade--right" aria-hidden />
        <div className="case-reveal__pointer" aria-hidden />

        <div ref={viewportRef} className="case-reveal__viewport">
          <div className="case-reveal__clip">
            <div
              ref={trackRef}
              className={cn("case-reveal__track", spinning && "case-reveal__track--spinning")}
            >
              {items.map((item, idx) => {
                const isWinner = landed && idx === targetIndex;
                const nearCenter = !isSpin && Math.abs(idx - targetIndex) <= 1;
                const isFocus = nearCenter && idx === targetIndex;
                return (
                  <div
                    key={`${item.id}-${idx}`}
                    className={cn(
                      "case-reveal__item",
                      isWinner && "case-reveal__item--winner",
                      isFocus && "case-reveal__item--focus",
                      nearCenter && !isFocus && "case-reveal__item--near",
                    )}
                    style={{
                      width: itemW,
                      height: itemW,
                      flex: `0 0 ${itemW}px`,
                      background: candyTileBackgroundForLoot(item),
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
    </div>
  );
}
