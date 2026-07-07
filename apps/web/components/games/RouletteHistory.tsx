"use client";

import { RouletteHistoryEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHIP = {
  green: "bg-success",
  red: "bg-danger",
  black: "bg-surface-raised ring-1 ring-inset ring-white/[0.08]",
};

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
          {recent.map((entry, i) => (
            <div
              key={entry.round_number}
              title={`#${entry.round_number}`}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                i === 0 && "ring-1 ring-accent/40",
                CHIP[entry.color as keyof typeof CHIP] ?? "bg-surface-raised",
              )}
            >
              {entry.number}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
