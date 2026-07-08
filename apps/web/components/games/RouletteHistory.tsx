"use client";

import { RouletteHistoryEntry } from "@/lib/api";
import { rouletteFillStyle } from "@/lib/roulette";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 8;

type Props = {
  history: RouletteHistoryEntry[];
  roundNumber?: number | null;
  onSelectRound?: (entry: RouletteHistoryEntry) => void;
};

export function RouletteHistory({ history, roundNumber, onSelectRound }: Props) {
  const recent = history.slice(0, HISTORY_LIMIT);

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="shrink-0 text-[11px] font-medium tabular-nums text-muted">
        Раунд #{roundNumber ?? "—"}
      </p>

      {recent.length === 0 ? (
        <span className="text-[11px] text-muted">Нет игр</span>
      ) : (
        <div className="flex min-w-0 items-center justify-end gap-1">
          {recent.map((entry) => {
            const fill = rouletteFillStyle(entry.color);
            const clickable = !!entry.round_id && !!onSelectRound;
            return (
              <button
                key={entry.round_id || entry.round_number}
                type="button"
                title={`#${entry.round_number} — проверить честность`}
                onClick={() => onSelectRound?.(entry)}
                disabled={!clickable}
                style={fill}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                  !fill && "bg-surface-raised",
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
