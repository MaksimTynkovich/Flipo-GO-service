"use client";

import { BetStakeLabel } from "@/components/games/BetStakeLabel";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON } from "@/lib/api";
import { PvpPlayer } from "@/lib/pvp";
import { cn } from "@/lib/utils";

type Props = {
  player: PvpPlayer;
  amountNanoton: number;
  iconSize?: "xs" | "sm";
  className?: string;
  onOpen?: (player: PvpPlayer, amountNanoton: number) => void;
};

export function PvpClickableStake({
  player,
  amountNanoton,
  iconSize = "sm",
  className,
  onOpen,
}: Props) {
  const isGift = player.funding_type === "gift" && !!player.gift;

  const content =
    isGift && player.gift ? (
      <BetStakeLabel
        amountNanoton={amountNanoton}
        fundingType={player.funding_type}
        gift={player.gift}
        iconSize={iconSize}
      />
    ) : (
      <TonAmount
        amount={formatTON(amountNanoton)}
        variant="brand"
        iconSize={iconSize}
        iconClassName={iconSize === "sm" ? "h-3.5 w-3.5" : undefined}
      />
    );

  if (!isGift || !onOpen) {
    return <span className={cn("inline-flex", className)}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(player, amountNanoton)}
      className={cn(
        "inline-flex rounded-lg px-0.5 -mx-0.5 transition-opacity active:opacity-70",
        className,
      )}
      aria-label="Подробнее о ставке"
    >
      {content}
    </button>
  );
}
