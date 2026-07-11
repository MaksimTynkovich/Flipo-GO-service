"use client";

import { useMemo, useState } from "react";
import {
  BetGiftView,
  RouletteBetEntry,
  RouletteRoundBets as RouletteRoundBetsData,
} from "@/lib/api";
import { BetStakeLabel, GiftStakeIcons } from "@/components/games/BetStakeLabel";
import { rouletteFillStyle, roulettePlayerName } from "@/lib/roulette";
import { cn } from "@/lib/utils";

type Props = {
  data: RouletteRoundBetsData | null;
  currentUserId?: string | null;
};

type AggregatedBet = {
  key: string;
  user_id: string;
  username: string;
  first_name: string;
  photo_url?: string;
  color: string;
  amount_nanoton: number;
  funding_type?: string;
  gift?: BetGiftView;
  gifts: BetGiftView[];
};

function aggregateBets(bets: RouletteBetEntry[]): AggregatedBet[] {
  const map = new Map<string, AggregatedBet>();

  for (const bet of bets) {
    const key = `${bet.user_id}:${bet.color}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        user_id: bet.user_id,
        username: bet.username,
        first_name: bet.first_name,
        photo_url: bet.photo_url,
        color: bet.color,
        amount_nanoton: bet.amount_nanoton,
        funding_type: bet.funding_type,
        gift: bet.gift,
        gifts: bet.gift ? [bet.gift] : [],
      });
      continue;
    }

    existing.amount_nanoton += bet.amount_nanoton;
    if (bet.gift && !existing.gifts.some((g) => g.id === bet.gift!.id)) {
      existing.gifts.push(bet.gift);
    }
    const allGift =
      (existing.funding_type === "gift" || !!existing.gift) &&
      (bet.funding_type === "gift" || !!bet.gift);
    const anyGift =
      existing.funding_type === "gift" ||
      !!existing.gift ||
      bet.funding_type === "gift" ||
      !!bet.gift;
    existing.funding_type = allGift ? "gift" : anyGift ? "mixed" : "balance";
    existing.gift = existing.gifts[0];
  }

  return Array.from(map.values()).sort((a, b) => b.amount_nanoton - a.amount_nanoton);
}

function BetRow({
  bet,
  mine,
}: {
  bet: AggregatedBet;
  mine?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const name = roulettePlayerName(bet);
  const initial = (bet.first_name?.[0] || bet.username?.[0] || "?").toUpperCase();

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5",
        mine && "roulette-player-row--mine",
      )}
    >
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

      <p className="min-w-0 flex-1 truncate text-sm text-foreground/90">
        {name}
        {mine ? <span className="ml-1.5 text-[10px] font-medium text-accent">вы</span> : null}
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        <span
          style={rouletteFillStyle(bet.color)}
          className="h-2 w-2 rounded-full ring-1 ring-inset ring-white/10"
          aria-hidden
        />
        {bet.gifts.length > 1 ? (
          <GiftStakeIcons gifts={bet.gifts} size="xs" amountNanoton={bet.amount_nanoton} />
        ) : (
          <BetStakeLabel
            amountNanoton={bet.amount_nanoton}
            fundingType={bet.funding_type === "mixed" ? "gift" : bet.funding_type}
            gift={bet.gift}
            iconSize="sm"
            className="text-sm font-medium"
          />
        )}
      </div>
    </div>
  );
}

export function RouletteRoundBets({ data, currentUserId }: Props) {
  const rows = useMemo(() => aggregateBets(data?.bets ?? []), [data?.bets]);

  if (rows.length === 0) {
    return <p className="text-center text-xs text-muted">Пока нет ставок</p>;
  }

  return (
    <div className="space-y-2">
      <p className="section-label">Игроки</p>

      <div className="max-h-52 space-y-0.5 overflow-y-auto">
        {rows.map((bet) => (
          <BetRow
            key={bet.key}
            bet={bet}
            mine={!!currentUserId && bet.user_id === currentUserId}
          />
        ))}
      </div>
    </div>
  );
}
