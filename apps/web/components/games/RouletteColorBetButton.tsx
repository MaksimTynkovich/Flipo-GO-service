"use client";

import { formatTON } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { rouletteFillStyle } from "@/lib/roulette";
import { cn } from "@/lib/utils";

type Props = {
  color: "red" | "green" | "black";
  multiplier: string;
  roundTotal: number;
  disabled?: boolean;
  onClick: () => void;
};

export function RouletteColorBetButton({
  color,
  multiplier,
  roundTotal,
  disabled,
  onClick,
}: Props) {
  const hasTotal = roundTotal > 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={rouletteFillStyle(color)}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl text-white transition-all active:scale-[0.98]",
        hasTotal ? "h-14" : "h-11",
        color === "black" && "ring-1 ring-inset ring-white/10",
        disabled && "opacity-40",
      )}
    >
      <span className="flex flex-1 items-center justify-center text-sm font-semibold leading-none">
        {multiplier}
      </span>

      {hasTotal && (
        <span className="flex items-center justify-center gap-1 bg-black/30 px-1.5 py-1 text-[10px] font-medium tabular-nums leading-none">
          {formatTON(roundTotal)}
          <TonIcon variant="mono" size="xs" className="text-white/90" />
        </span>
      )}
    </button>
  );
}
