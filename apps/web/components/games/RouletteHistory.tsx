"use client";

import { useEffect, useRef, useState } from "react";
import { RouletteHistoryEntry } from "@/lib/api";
import { colorLabel, normalizeRouletteColor, rouletteFillStyle } from "@/lib/roulette";
import { useT } from "@/components/providers/I18nProvider";
import { cn } from "@/lib/utils";

/** Half of previous dense packing (~2+2px). */
const HISTORY_LIMIT = 40;
const DASH_SLOT_PX = 10;

type Props = {
  history: RouletteHistoryEntry[];
  onSelectRound?: (entry: RouletteHistoryEntry) => void;
  className?: string;
};

export function RouletteHistory({ history, onSelectRound, className }: Props) {
  const t = useT();
  const rowRef = useRef<HTMLDivElement>(null);
  const [fitCount, setFitCount] = useState(24);
  const recent = history.slice(0, HISTORY_LIMIT);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    function recalc() {
      const el = rowRef.current;
      if (!el) return;
      const width = el.clientWidth;
      const next = Math.max(8, Math.floor(width / DASH_SLOT_PX));
      setFitCount((prev) => (prev === next ? prev : next));
    }

    recalc();
    const ro = new ResizeObserver(() => recalc());
    ro.observe(row);
    return () => ro.disconnect();
  }, [recent.length]);

  const visible = recent.slice(0, Math.min(fitCount, HISTORY_LIMIT));

  return (
    <div className={cn("roulette-history", className)}>
      <div ref={rowRef} className="roulette-history__row roulette-history__row--dashes">
        {visible.length === 0 ? (
          <span className="roulette-history__empty">{t("roulette.noGames")}</span>
        ) : (
          visible.map((entry, index) => {
            const color = normalizeRouletteColor(entry.color);
            if (!color) return null;
            const fill = rouletteFillStyle(color);
            const clickable = !!entry.round_id && !!onSelectRound;
            return (
              <button
                key={entry.round_id || `${entry.round_number}-${index}`}
                type="button"
                title={t("roulette.historyFairness", { number: entry.round_number })}
                disabled={!clickable}
                onClick={() => clickable && onSelectRound?.(entry)}
                style={fill}
                aria-label={t("roulette.resultAria", { color: colorLabel(color) })}
                className={cn(
                  "roulette-history__dash",
                  index === 0 && "roulette-history__dash--latest",
                  !fill && "bg-surface-raised",
                  clickable && "transition active:scale-95",
                  !clickable && "opacity-50",
                )}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
