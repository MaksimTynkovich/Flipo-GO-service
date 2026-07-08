"use client";

import { CrashHistoryEntry } from "@/lib/api";
import { formatMultiplierCompact, historyTierStyle } from "@/lib/crash";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 14;

type Props = {
  history: CrashHistoryEntry[];
  onSelectRound?: (entry: CrashHistoryEntry) => void;
};

export function CrashHistory({ history, onSelectRound }: Props) {
  const recent = history.slice(0, HISTORY_LIMIT);

  if (recent.length === 0) {
    return (
      <div className="surface-inset flex h-10 items-center justify-center rounded-xl">
        <span className="text-[11px] text-muted">История пуста</span>
      </div>
    );
  }

  return (
    <div className="surface-inset rounded-xl px-2 py-2">
      <div className="scrollbar-none flex gap-2.5 overflow-x-auto">
        {recent.map((entry) => {
          const tier = historyTierStyle(entry.crash_point);
          const clickable = !!entry.round_id && !!onSelectRound;
          return (
            <button
              key={entry.round_id || entry.round_number}
              type="button"
              title={`Раунд #${entry.round_number} — проверить честность`}
              onClick={() => onSelectRound?.(entry)}
              disabled={!clickable}
              className={cn(
                "shrink-0 text-[11px] font-bold tabular-nums leading-none",
                tier.value,
                clickable && "transition active:opacity-70",
              )}
            >
              {formatMultiplierCompact(entry.crash_point)}×
            </button>
          );
        })}
      </div>
    </div>
  );
}
