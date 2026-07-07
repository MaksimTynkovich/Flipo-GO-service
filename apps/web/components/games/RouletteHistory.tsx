"use client";

import { useEffect, useRef, useState } from "react";
import { RouletteHistoryEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHIP = {
  green: "bg-success",
  red: "bg-danger",
  black: "bg-surface-raised ring-1 ring-inset ring-white/[0.08]",
};

const CHIP_W = 24;
const CHIP_GAP = 4;
const ELLIPSIS_W = 14;

type Props = {
  history: RouletteHistoryEntry[];
  embedded?: boolean;
};

export function RouletteHistory({ history, embedded }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(history.length);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      const width = el.clientWidth;
      if (width <= 0) return;
      const maxFit = Math.floor((width - ELLIPSIS_W) / (CHIP_W + CHIP_GAP));
      setVisible(Math.max(0, Math.min(history.length, maxFit)));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [history.length]);

  return (
    <div className={cn(!embedded && "space-y-2")}>
      <p className={cn("section-label", embedded && "text-[10px]")}>Последние игры</p>
      {history.length === 0 ? (
        <div className="flex h-6 items-center">
          <span className="text-xs text-muted">Пока нет результатов</span>
        </div>
      ) : (
        <div ref={rowRef} className="flex h-6 w-full items-center gap-1 overflow-hidden">
          {history.slice(0, visible).map((entry, i) => (
            <div
              key={entry.round_number}
              title={`#${entry.round_number}`}
              style={{ width: CHIP_W, minWidth: CHIP_W }}
              className={cn(
                "flex h-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                i === 0 && "ring-1 ring-accent/40",
                CHIP[entry.color as keyof typeof CHIP] ?? "bg-surface-raised",
              )}
            >
              {entry.number}
            </div>
          ))}
          {visible < history.length && (
            <span className="shrink-0 text-xs text-muted">…</span>
          )}
        </div>
      )}
    </div>
  );
}
