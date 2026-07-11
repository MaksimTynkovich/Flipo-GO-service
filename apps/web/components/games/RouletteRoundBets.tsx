"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BetGiftView,
  formatTON,
  RouletteBetEntry,
  RouletteRoundBets as RouletteRoundBetsData,
} from "@/lib/api";
import { BetStakeLabel, GiftStakeIcons } from "@/components/games/BetStakeLabel";
import { TonIcon } from "@/components/icons/TonIcon";
import { rouletteFillStyle, roulettePlayerName } from "@/lib/roulette";
import { cn } from "@/lib/utils";

type Props = {
  data: RouletteRoundBetsData | null;
  currentUserId?: string | null;
  /** Winning color once the round result is known (spinning / result). */
  resultColor?: string | null;
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

type Outcome = "pending" | "won" | "lost";

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

function betOutcome(color: string, resultColor?: string | null): Outcome {
  if (!resultColor) return "pending";
  return color === resultColor ? "won" : "lost";
}

function winMultiplier(color: string): number {
  return color === "green" ? 14 : 2;
}

function winProfitNanoton(amount: number, color: string, fundingType?: string): number {
  const payout = amount * winMultiplier(color);
  const isGift = fundingType === "gift" || fundingType === "mixed";
  return isGift ? payout : Math.max(0, payout - amount);
}

function BetRow({
  bet,
  mine,
  outcome,
  flash,
}: {
  bet: AggregatedBet;
  mine?: boolean;
  outcome: Outcome;
  flash?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const name = roulettePlayerName(bet);
  const initial = (bet.first_name?.[0] || bet.username?.[0] || "?").toUpperCase();
  const isWon = outcome === "won";
  const isLost = outcome === "lost";
  const profit = isWon
    ? winProfitNanoton(bet.amount_nanoton, bet.color, bet.funding_type)
    : 0;

  return (
    <div
      className={cn(
        "crash-player-row flex items-center gap-2.5 rounded-lg px-2 py-1.5",
        isWon && "crash-player-row--won",
        isWon && flash && "crash-bet-flash",
        isLost && "crash-player-row--lost",
        mine && !isWon && !isLost && "roulette-player-row--mine",
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

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground/90">
          {name}
          {mine ? <span className="ml-1.5 text-[10px] font-medium text-accent">вы</span> : null}
        </p>
        {isWon || isLost ? (
          <p className="text-[11px] tabular-nums text-muted">
            {bet.gifts.length > 1 ? (
              <GiftStakeIcons gifts={bet.gifts} size="xs" amountNanoton={bet.amount_nanoton} />
            ) : (
              <BetStakeLabel
                amountNanoton={bet.amount_nanoton}
                fundingType={bet.funding_type === "mixed" ? "gift" : bet.funding_type}
                gift={bet.gift}
              />
            )}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          style={rouletteFillStyle(bet.color)}
          className="h-2 w-2 rounded-full ring-1 ring-inset ring-white/10"
          aria-hidden
        />

        {isWon ? (
          <div className="crash-cashout-result">
            {profit > 0 ? (
              <p className="crash-cashout-result__profit">
                <span className="tabular-nums">+{formatTON(profit)}</span>
                <TonIcon variant="brand" size="xs" className="text-success" />
              </p>
            ) : (
              <p className="crash-cashout-result__mult">Победа</p>
            )}
          </div>
        ) : isLost ? (
          <div className="crash-crash-result">
            <p className="crash-crash-result__loss">
              <span className="tabular-nums">−{formatTON(bet.amount_nanoton)}</span>
              <TonIcon variant="brand" size="xs" className="text-danger" />
            </p>
          </div>
        ) : bet.gifts.length > 1 ? (
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

export function RouletteRoundBets({ data, currentUserId, resultColor = null }: Props) {
  const rows = useMemo(() => aggregateBets(data?.bets ?? []), [data?.bets]);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(() => new Set());
  const seenResultRef = useRef<string | null>(null);
  const flashTimers = useRef<Map<string, number>>(new Map());

  const orderedRows = useMemo(() => {
    const withOutcome = rows.map((row) => ({
      row,
      outcome: betOutcome(row.color, resultColor),
    }));

    // Winners first, then pending, then losses — mirrors crash “settled feel”.
    if (resultColor) {
      withOutcome.sort((a, b) => {
        const rank = (o: Outcome) => (o === "won" ? 0 : o === "pending" ? 1 : 2);
        const d = rank(a.outcome) - rank(b.outcome);
        if (d !== 0) return d;
        return b.row.amount_nanoton - a.row.amount_nanoton;
      });
    }

    if (!currentUserId) return withOutcome;
    const mine = withOutcome.filter((item) => item.row.user_id === currentUserId);
    const others = withOutcome.filter((item) => item.row.user_id !== currentUserId);
    return [...mine, ...others];
  }, [rows, currentUserId, resultColor]);

  useEffect(() => {
    return () => {
      for (const timer of Array.from(flashTimers.current.values())) {
        window.clearTimeout(timer);
      }
      flashTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    const roundId = data?.round_id ?? null;
    const resultKey = resultColor && roundId ? `${roundId}:${resultColor}` : null;
    if (!resultKey || resultKey === seenResultRef.current) return;
    seenResultRef.current = resultKey;

    const winners = rows.filter((row) => row.color === resultColor).map((row) => row.key);
    if (winners.length === 0) return;

    setFlashKeys(new Set(winners));
    for (const key of winners) {
      const prev = flashTimers.current.get(key);
      if (prev) window.clearTimeout(prev);
      flashTimers.current.set(
        key,
        window.setTimeout(() => {
          flashTimers.current.delete(key);
          setFlashKeys((prevSet) => {
            if (!prevSet.has(key)) return prevSet;
            const next = new Set(prevSet);
            next.delete(key);
            return next;
          });
        }, 950),
      );
    }
  }, [data?.round_id, resultColor, rows]);

  useEffect(() => {
    if (resultColor) return;
    seenResultRef.current = null;
    setFlashKeys(new Set());
  }, [resultColor, data?.round_id]);

  if (orderedRows.length === 0) {
    return <p className="text-center text-xs text-muted">Пока нет ставок</p>;
  }

  return (
    <div className="space-y-2">
      <p className="section-label">Игроки</p>
      <div className="space-y-0.5">
        {orderedRows.map(({ row, outcome }) => (
          <BetRow
            key={row.key}
            bet={row}
            mine={!!currentUserId && row.user_id === currentUserId}
            outcome={outcome}
            flash={flashKeys.has(row.key)}
          />
        ))}
      </div>
    </div>
  );
}
