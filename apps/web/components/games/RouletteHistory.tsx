"use client";

import { RouletteHistoryEntry } from "@/lib/api";
import { rouletteFillStyle } from "@/lib/roulette";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 10;

type Props = {
  history: RouletteHistoryEntry[];
  roundNumber?: number | null;
  onSelectRound?: (entry: RouletteHistoryEntry) => void;
};

export function RouletteHistory({ history, roundNumber, onSelectRound }: Props) {
  const recent = history.slice(0, HISTORY_LIMIT);

  return (
    <div className="roulette-history">
      <p className="shrink-0 text-[11px] font-medium tabular-nums text-muted">
        Раунд #{roundNumber ?? "—"}
      </p>

      {history.length === 0 ? (
        <span className="ml-auto text-[11px] text-muted">Нет игр</span>
      ) : (
        <div className="roulette-history__chips">
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
