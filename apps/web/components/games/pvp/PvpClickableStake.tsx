"use client";

import { GiftStakeIcons } from "@/components/games/BetStakeLabel";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON } from "@/lib/api";
import { PvpPlayer, pvpPlayerGifts } from "@/lib/pvp";
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
  const gifts = pvpPlayerGifts(player);
  const hasGifts = gifts.length > 0;

  const content = hasGifts ? (
    <GiftStakeIcons gifts={gifts} size={iconSize} amountNanoton={amountNanoton} />
  ) : (
    <TonAmount
      amount={formatTON(amountNanoton)}
      variant="brand"
      iconSize={iconSize}
      iconClassName={iconSize === "sm" ? "h-3.5 w-3.5" : undefined}
    />
  );

  if (!hasGifts || !onOpen) {
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
