"use client";

import { useEffect, useRef, useState } from "react";
import { RouletteHistoryEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHIP = {
  green: "bg-[#27ae60]",
  red: "bg-[#c0392b]",
  black: "bg-[#3d4450]",
};

const CHIP_W = 26;
const CHIP_GAP = 5;
const ELLIPSIS_W = 16;

type Props = {
  history: RouletteHistoryEntry[];
};

export function RouletteHistory({ history }: Props) {
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
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        Последние игры
      </p>
      {history.length === 0 ? (
        <div className="flex h-7 items-center">
          <span className="text-xs text-zinc-600">Пока нет результатов</span>
        </div>
      ) : (
        <div ref={rowRef} className="flex h-7 w-full items-center gap-[5px] overflow-hidden">
          {history.slice(0, visible).map((entry) => (
            <div
              key={entry.round_number}
              title={`#${entry.round_number}`}
              style={{ width: CHIP_W, minWidth: CHIP_W }}
              className={cn(
                "flex h-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                CHIP[entry.color as keyof typeof CHIP] ?? "bg-zinc-700",
              )}
            >
              {entry.number}
            </div>
          ))}
          {visible < history.length && (
            <span className="shrink-0 text-sm text-zinc-500">…</span>
          )}
        </div>
      )}
    </div>
  );
}
