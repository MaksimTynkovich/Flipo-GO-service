"use client";

import { useState } from "react";
import { RouletteRoundBets as RouletteRoundBetsData } from "@/lib/api";
import { BetStakeLabel } from "@/components/games/BetStakeLabel";
import { rouletteFillStyle, roulettePlayerName } from "@/lib/roulette";

type Props = {
  data: RouletteRoundBetsData | null;
};

function BetRow({ bet }: { bet: RouletteRoundBetsData["bets"][number] }) {
  const [imgError, setImgError] = useState(false);
  const name = roulettePlayerName(bet);
  const initial = (bet.first_name?.[0] || bet.username?.[0] || "?").toUpperCase();

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-[10px] font-medium text-muted">
        {bet.photo_url && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bet.photo_url}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          initial
        )}
      </span>

      <p className="min-w-0 flex-1 truncate text-sm text-foreground/90">{name}</p>

      <div className="flex shrink-0 items-center gap-1.5">
        <span
          style={rouletteFillStyle(bet.color)}
          className="h-2 w-2 rounded-full"
          aria-hidden
        />
        <BetStakeLabel
          amountNanoton={bet.amount_nanoton}
          fundingType={bet.funding_type}
          gift={bet.gift}
          iconSize="sm"
          className="text-sm font-medium"
        />
      </div>
    </div>
  );
}

export function RouletteRoundBets({ data }: Props) {
  const bets = data?.bets ?? [];

  if (bets.length === 0) {
    return <p className="text-center text-xs text-muted">Пока нет ставок в раунде</p>;
  }

  return (
    <div className="space-y-2">
      <p className="section-label">Игроки</p>

      <div className="surface-inset space-y-0.5 px-2.5 py-1">
        {bets.map((bet) => (
          <BetRow key={bet.id} bet={bet} />
        ))}
      </div>
    </div>
  );
}
