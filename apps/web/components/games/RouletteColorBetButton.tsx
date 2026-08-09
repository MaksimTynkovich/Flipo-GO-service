"use client";

import { formatTON } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import {
  ROULETTE_COLOR_STYLES,
  RouletteColor,
  rouletteFillStyle,
} from "@/lib/roulette";
import { cn } from "@/lib/utils";
import { trackDisabledClick } from "@/lib/analytics";

type Props = {
  color: RouletteColor;
  multiplier: string;
  roundTotal: number;
  myStake?: number;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
};

export function RouletteColorBetButton({
  color,
  multiplier,
  roundTotal,
  myStake = 0,
  disabled,
  active,
  onClick,
}: Props) {
  const style = ROULETTE_COLOR_STYLES[color];
  const hasMine = myStake > 0;
  const hasTotal = roundTotal > 0;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={
        hasMine
          ? `${style.label}, ваша ставка ${formatTON(myStake)} TON`
          : `${style.label} ${multiplier}`
      }
      onPointerDown={() => {
        if (disabled) {
          trackDisabledClick(`roulette_bet_${color}`, "round_not_betting");
        }
      }}
      onClick={onClick}
      style={rouletteFillStyle(color)}
      className={cn(
        "roulette-bet-btn app-control transition-[filter,transform,opacity] duration-200",
        (color === "green" || color === "yellow") && "ring-1 ring-inset ring-white/10",
        active && "roulette-bet-btn--active",
        disabled ? "cursor-default saturate-[0.55] brightness-[0.72]" : "hover:brightness-110",
      )}
    >
      {hasMine ? (
        <span className="roulette-bet-btn__mult roulette-bet-btn__mult--stake">
          {formatTON(myStake)}
          <TonIcon variant="mono" size="sm" className="text-white/95" />
        </span>
      ) : (
        <span className="roulette-bet-btn__mult">{multiplier}</span>
      )}

      {hasTotal ? (
        <span className="roulette-bet-btn__pool">
          {formatTON(roundTotal)}
          <TonIcon variant="mono" size="xs" className="text-white/90" />
        </span>
      ) : null}
    </button>
  );
}
