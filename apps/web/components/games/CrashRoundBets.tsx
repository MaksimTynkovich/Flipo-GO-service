"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CrashBetEntry,
  CrashRoundBets as CrashRoundBetsData,
  BetGiftView,
} from "@/lib/api";
import { BetStakeLabel, GiftStakeIcons } from "@/components/games/BetStakeLabel";
import { crashPlayerName, formatMultiplier, isCrashBigBet } from "@/lib/crash";
import { cn } from "@/lib/utils";

type Props = {
  data: CrashRoundBetsData | null;
};

type AggregatedPlayer = {
  key: string;
  user_id: string;
  username: string;
  first_name: string;
  photo_url?: string;
  amount_nanoton: number;
  bet_count: number;
  funding_type?: string;
  gift?: BetGiftView;
  gifts: BetGiftView[];
  status: "pending" | "cashed_out" | "lost";
  cashout_multiplier?: number;
  auto_cashout_multiplier?: number;
  bet_ids: string[];
};

function aggregateBets(bets: CrashBetEntry[]): AggregatedPlayer[] {
  const byUser = new Map<string, CrashBetEntry[]>();
  for (const bet of bets) {
    const list = byUser.get(bet.user_id) ?? [];
    list.push(bet);
    byUser.set(bet.user_id, list);
  }

  const rows: AggregatedPlayer[] = [];
  for (const [userId, list] of Array.from(byUser.entries())) {
    const head = list[0];
    const amount = list.reduce((sum, bet) => sum + bet.amount_nanoton, 0);
    const gifts = list
      .map((bet) => bet.gift)
      .filter((gift): gift is BetGiftView => !!gift);
    const uniqueGifts = Array.from(
      new Map(gifts.map((gift) => [gift.id, gift])).values(),
    );

    const hasPending = list.some((bet) => bet.status === "pending");
    const hasCashed = list.some((bet) => bet.status === "cashed_out");
    const status: AggregatedPlayer["status"] = hasPending
      ? "pending"
      : hasCashed
        ? "cashed_out"
        : "lost";

    const cashed = list.filter((bet) => bet.status === "cashed_out");
    let cashoutMultiplier: number | undefined;

    if (cashed.length > 0) {
      let weighted = 0;
      let weight = 0;
      for (const bet of cashed) {
        const mult = bet.cashout_multiplier ?? 0;
        weighted += mult * bet.amount_nanoton;
        weight += bet.amount_nanoton;
      }
      if (weight > 0) cashoutMultiplier = weighted / weight;
    }

    const pendingAutos = list
      .filter((bet) => bet.status === "pending" && bet.auto_cashout_multiplier != null)
      .map((bet) => bet.auto_cashout_multiplier!);
    const autoCashout =
      pendingAutos.length > 0 ? Math.min(...pendingAutos) : undefined;

    const allGift = list.every((bet) => bet.funding_type === "gift" || !!bet.gift);
    const anyGift = list.some((bet) => bet.funding_type === "gift" || !!bet.gift);

    rows.push({
      key: userId,
      user_id: userId,
      username: head.username,
      first_name: head.first_name,
      photo_url: head.photo_url,
      amount_nanoton: amount,
      bet_count: list.length,
      funding_type: allGift ? "gift" : anyGift ? "mixed" : "balance",
      gift: uniqueGifts[0],
      gifts: uniqueGifts,
      status,
      cashout_multiplier: cashoutMultiplier,
      auto_cashout_multiplier: autoCashout,
      bet_ids: list.map((bet) => bet.id),
    });
  }

  return rows.sort((a, b) => {
    const aBig = isCrashBigBet(a.amount_nanoton) ? 1 : 0;
    const bBig = isCrashBigBet(b.amount_nanoton) ? 1 : 0;
    if (aBig !== bBig) return bBig - aBig;
    return b.amount_nanoton - a.amount_nanoton;
  });
}

function PlayerRow({
  player,
  flash,
}: {
  player: AggregatedPlayer;
  flash?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const name = crashPlayerName(player);
  const initial = (player.first_name?.[0] || player.username?.[0] || "?").toUpperCase();
  const isCashedOut = player.status === "cashed_out";
  const isLost = player.status === "lost";
  const big = isCrashBigBet(player.amount_nanoton);

  return (
    <div
      className={cn(
        "crash-player-row flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-[background,opacity] duration-200",
        big && !isCashedOut && !isLost && "bg-accent/[0.07]",
        flash && "crash-bet-flash",
        isCashedOut && "crash-player-row--won",
        isLost && "crash-player-row--lost",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-[10px] font-medium text-muted",
          big && !isCashedOut && !isLost && "ring-1 ring-accent/50",
        )}
      >
        {player.photo_url && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photo_url}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          initial
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm text-foreground/90">
          <span className="truncate">{name}</span>
          {big ? (
            <span className="shrink-0 rounded bg-accent/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
              Big
            </span>
          ) : null}
        </p>
        <p className="text-[11px] tabular-nums text-muted">
          {player.gifts.length > 1 ? (
            <GiftStakeIcons gifts={player.gifts} size="xs" amountNanoton={player.amount_nanoton} />
          ) : (
            <BetStakeLabel
              amountNanoton={player.amount_nanoton}
              fundingType={player.funding_type === "mixed" ? "gift" : player.funding_type}
              gift={player.gift}
            />
          )}
          {player.status === "pending" && player.auto_cashout_multiplier != null ? (
            <span className="ml-1.5 text-accent/80">
              авто {formatMultiplier(player.auto_cashout_multiplier)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {isCashedOut && player.cashout_multiplier != null ? (
          <p className="text-[11px] font-semibold tabular-nums text-success">
            {formatMultiplier(player.cashout_multiplier)}
          </p>
        ) : isLost ? (
          <p className="text-[11px] font-medium text-danger">Краш</p>
        ) : (
          <p className="text-[11px] font-medium text-muted">В игре</p>
        )}
      </div>
    </div>
  );
}

export function CrashRoundBets({ data }: Props) {
  const bets = data?.bets ?? [];
  const players = useMemo(() => aggregateBets(bets), [bets]);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(() => new Set());
  const seenCashed = useRef<Set<string>>(new Set());
  const roundRef = useRef<string | null>(null);

  useEffect(() => {
    const roundId = data?.round_id ?? null;
    if (roundId !== roundRef.current) {
      roundRef.current = roundId;
      seenCashed.current = new Set();
      setFlashKeys(new Set());
    }

    const newly: string[] = [];
    for (const player of players) {
      if (player.status !== "cashed_out") continue;
      // Flash when any of the player's bets newly cashes out
      const fresh = player.bet_ids.filter((id) => !seenCashed.current.has(id));
      if (fresh.length === 0) continue;
      for (const id of player.bet_ids) seenCashed.current.add(id);
      newly.push(player.key);
    }
    if (newly.length === 0) return;

    setFlashKeys((prev) => {
      const next = new Set(prev);
      for (const key of newly) next.add(key);
      return next;
    });
    const timer = window.setTimeout(() => {
      setFlashKeys((prev) => {
        const next = new Set(prev);
        for (const key of newly) next.delete(key);
        return next;
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [players, data?.round_id]);

  if (bets.length === 0) {
    return <p className="py-2 text-center text-xs text-muted">Пока нет ставок</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">Игроки</p>
        <span className="text-[10px] tabular-nums text-muted">{players.length}</span>
      </div>

      <div className="max-h-52 space-y-0.5 overflow-y-auto">
        {players.map((player) => (
          <PlayerRow key={player.key} player={player} flash={flashKeys.has(player.key)} />
        ))}
      </div>
    </div>
  );
}
