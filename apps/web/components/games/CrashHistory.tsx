"use client";

import { CrashHistoryEntry } from "@/lib/api";
import { formatMultiplierCompact, historyTierStyle } from "@/lib/crash";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 14;

type Props = {
  history: CrashHistoryEntry[];
};

export function CrashHistory({ history }: Props) {
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
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {recent.map((entry, index) => {
          const tier = historyTierStyle(entry.crash_point);
          return (
            <span
              key={entry.round_number}
              title={`Раунд #${entry.round_number}`}
              className={cn(
                "flex h-8 min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-lg px-2",
                tier.chip,
                index === 0 && "ring-1 ring-inset ring-white/12",
              )}
            >
              <span className={cn("text-[11px] font-bold tabular-nums leading-none", tier.value)}>
                {formatMultiplierCompact(entry.crash_point)}×
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
