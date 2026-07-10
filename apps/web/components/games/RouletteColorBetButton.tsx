"use client";

import { formatTON } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { ROULETTE_COLOR_STYLES, rouletteFillStyle } from "@/lib/roulette";
import { cn } from "@/lib/utils";
import { trackDisabledClick } from "@/lib/analytics";

type Props = {
  color: "red" | "green" | "black";
  multiplier: string;
  roundTotal: number;
  disabled?: boolean;
  /** User already has a stake on this color in the round. */
  active?: boolean;
  onClick: () => void;
};

export function RouletteColorBetButton({
  color,
  multiplier,
  roundTotal,
  disabled,
  active,
  onClick,
}: Props) {
  const style = ROULETTE_COLOR_STYLES[color];
  const hasTotal = roundTotal > 0;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${style.label} ${multiplier}`}
      onPointerDown={() => {
        if (disabled) {
          trackDisabledClick(`roulette_bet_${color}`, "round_not_betting");
        }
      }}
      onClick={onClick}
      style={rouletteFillStyle(color)}
      className={cn(
        "roulette-bet-btn app-control transition-[filter,transform,opacity] duration-200",
        color === "black" && "ring-1 ring-inset ring-white/10",
        active && "roulette-bet-btn--active",
        disabled ? "cursor-default saturate-[0.55] brightness-[0.72]" : "hover:brightness-110",
      )}
    >
      <span className="roulette-bet-btn__mult">{multiplier}</span>

      {hasTotal ? (
        <span className="roulette-bet-btn__pool">
          {formatTON(roundTotal)}
          <TonIcon variant="mono" size="xs" className="text-white/90" />
        </span>
      ) : null}
    </button>
  );
}
