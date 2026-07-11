"use client";

import { useEffect, useRef, useState } from "react";
import { RouletteHistoryEntry } from "@/lib/api";
import { rouletteFillStyle } from "@/lib/roulette";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 14;

type Props = {
  history: RouletteHistoryEntry[];
  onSelectRound?: (entry: RouletteHistoryEntry) => void;
  className?: string;
};

export function RouletteHistory({ history, onSelectRound, className }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [fitCount, setFitCount] = useState(10);
  const recent = history.slice(0, HISTORY_LIMIT);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    function recalc() {
      const el = rowRef.current;
      if (!el) return;
      const styles = getComputedStyle(el);
      const pad =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 6;
      const width = el.clientWidth - pad;
      const chip = 28;
      const next = Math.max(1, Math.floor((width + gap) / (chip + gap)));
      setFitCount((prev) => (prev === next ? prev : next));
    }

    recalc();
    const ro = new ResizeObserver(() => recalc());
    ro.observe(row);
    return () => ro.disconnect();
  }, [recent.length]);

  const visible = recent.slice(0, fitCount);

  return (
    <div className={cn("roulette-history", className)}>
      <div ref={rowRef} className="roulette-history__row">
        {visible.length === 0 ? (
          <span className="roulette-history__empty">Нет игр</span>
        ) : (
          visible.map((entry, index) => {
            const fill = rouletteFillStyle(entry.color);
            const clickable = !!entry.round_id && !!onSelectRound;
            return (
              <button
                key={entry.round_id || `${entry.round_number}-${index}`}
                type="button"
                title={`#${entry.round_number} — проверить честность`}
                disabled={!clickable}
                onClick={() => clickable && onSelectRound?.(entry)}
                style={fill}
                className={cn(
                  "roulette-history__chip",
                  index === 0 && "roulette-history__chip--latest",
                  !fill && "bg-surface-raised",
                  entry.color === "green" && "roulette-history__chip--green",
                  clickable && "transition active:scale-95",
                  !clickable && "opacity-50",
                )}
              >
                {entry.number}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
