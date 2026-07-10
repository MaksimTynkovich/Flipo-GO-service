"use client";

import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { RouletteHistoryEntry } from "@/lib/api";
import { rouletteFillStyle } from "@/lib/roulette";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 12;
/** Must match .roulette-history__chip size + gap in CSS (1.55rem + 0.3rem). */
const CHIP_SLOT_PX = 29.6;

type Props = {
  history: RouletteHistoryEntry[];
  roundNumber?: number | null;
  onSelectRound?: (entry: RouletteHistoryEntry) => void;
};

function useVisibleChipCount(containerRef: RefObject<HTMLDivElement | null>) {
  const [count, setCount] = useState(8);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const next = Math.max(1, Math.min(HISTORY_LIMIT, Math.floor(width / CHIP_SLOT_PX)));
      setCount(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return count;
}

export function RouletteHistory({ history, roundNumber, onSelectRound }: Props) {
  const chipsRef = useRef<HTMLDivElement>(null);
  const visibleCount = useVisibleChipCount(chipsRef);

  // Newest first from API — take only what fits, show oldest→newest left to right.
  const recent = useMemo(() => {
    return history.slice(0, visibleCount).slice().reverse();
  }, [history, visibleCount]);

  return (
    <div className="roulette-history">
      <p className="shrink-0 text-[11px] font-medium tabular-nums text-muted">
        Раунд #{roundNumber ?? "—"}
      </p>

      {history.length === 0 ? (
        <span className="ml-auto text-[11px] text-muted">Нет игр</span>
      ) : (
        <div ref={chipsRef} className="roulette-history__chips">
          {recent.map((entry, index) => {
            const fill = rouletteFillStyle(entry.color);
            const clickable = !!entry.round_id && !!onSelectRound;
            return (
              <button
                key={entry.round_id || `${entry.round_number}-${index}`}
                type="button"
                title={`#${entry.round_number} — проверить честность`}
                onClick={() => onSelectRound?.(entry)}
                disabled={!clickable}
                style={fill}
                className={cn(
                  "roulette-history__chip",
                  !fill && "bg-surface-raised",
                  entry.color === "green" && "roulette-history__chip--green",
                  clickable && "transition active:scale-95",
                )}
              >
                {entry.number}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
