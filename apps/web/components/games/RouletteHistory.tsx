"use client";

import { RouletteHistoryEntry } from "@/lib/api";
import { ROULETTE_COLOR_STYLES } from "@/lib/roulette";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 8;

type Props = {
  history: RouletteHistoryEntry[];
  roundNumber?: number | null;
};

export function RouletteHistory({ history, roundNumber }: Props) {
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
          {recent.map((entry, i) => {
            const style = ROULETTE_COLOR_STYLES[entry.color as keyof typeof ROULETTE_COLOR_STYLES];
            return (
              <div
                key={entry.round_number}
                title={`#${entry.round_number}`}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white/90",
                  style?.bg ?? "bg-surface-raised",
                  i === 0 && "ring-1 ring-white/15",
                )}
              >
                {entry.number}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
