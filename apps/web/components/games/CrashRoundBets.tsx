"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CrashBetEntry,
  CrashRoundBets as CrashRoundBetsData,
  BetGiftView,
} from "@/lib/api";
import { BetStakeLabel, GiftStakeIcons } from "@/components/games/BetStakeLabel";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { crashPlayerName, formatMultiplier } from "@/lib/crash";
import { cn } from "@/lib/utils";

type Props = {
  data: CrashRoundBetsData | null;
  /** Live round multiplier while running — drives the growing gain plaque. */
  liveMultiplier?: number | null;
};

type AggregatedPlayer = {
  key: string;
  user_id: string;
  username: string;
  first_name: string;
  photo_url?: string;
  amount_nanoton: number;
  /** Stake still at risk (pending bets only). */
  pending_nanoton: number;
  funding_type?: string;
  gift?: BetGiftView;
  gifts: BetGiftView[];
  status: "pending" | "cashed_out" | "lost";
  cashout_multiplier?: number;
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
    const pendingNanoton = list
      .filter((bet) => bet.status === "pending")
      .reduce((sum, bet) => sum + bet.amount_nanoton, 0);
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

    const allGift = list.every((bet) => bet.funding_type === "gift" || !!bet.gift);
    const anyGift = list.some((bet) => bet.funding_type === "gift" || !!bet.gift);

    rows.push({
      key: userId,
      user_id: userId,
      username: head.username,
      first_name: head.first_name,
      photo_url: head.photo_url,
      amount_nanoton: amount,
      pending_nanoton: pendingNanoton,
      funding_type: allGift ? "gift" : anyGift ? "mixed" : "balance",
      gift: uniqueGifts[0],
      gifts: uniqueGifts,
      status,
      cashout_multiplier: cashoutMultiplier,
      bet_ids: list.map((bet) => bet.id),
    });
  }

  // Biggest stake first
  return rows.sort((a, b) => b.amount_nanoton - a.amount_nanoton);
}

function liveGainNanoton(
  pendingNanoton: number,
  mult: number,
  fundingType?: string,
): number {
  if (pendingNanoton <= 0 || mult < 1) return 0;
  const gross = pendingNanoton * mult;
  // Gift bets pay profit only; balance bets show full cashout value.
  if (fundingType === "gift") return Math.max(0, gross - pendingNanoton);
  return gross;
}

function formatLiveGain(nanoton: number): string {
  const ton = nanoton / 1_000_000_000;
  if (ton >= 100) return ton.toFixed(1);
  return ton.toFixed(2);
}

/** Smoothly lerps the displayed gain toward the live target — no bump/jitter. */
function LiveGainPlaque({
  valueNanoton,
  hot,
}: {
  valueNanoton: number;
  hot?: boolean;
}) {
  const displayRef = useRef(valueNanoton);
  const targetRef = useRef(valueNanoton);
  const labelRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);

  targetRef.current = valueNanoton;

  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const target = targetRef.current;
      const cur = displayRef.current;
      const next = cur + (target - cur) * 0.22;
      const settled = Math.abs(target - next) < Math.max(1_000, Math.abs(target) * 0.0004);
      displayRef.current = settled ? target : next;
      if (labelRef.current) {
        labelRef.current.textContent = formatLiveGain(displayRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className={cn("crash-live-gain", hot && "crash-live-gain--hot")}>
      <span className="crash-live-gain__value inline-flex items-center gap-1">
        <span ref={labelRef} className="tabular-nums">
          {formatLiveGain(valueNanoton)}
        </span>
        <TonIcon variant="brand" size="xs" className="text-success" />
      </span>
    </div>
  );
}

function PlayerRow({
  player,
  flash,
  liveMultiplier,
}: {
  player: AggregatedPlayer;
  flash?: boolean;
  liveMultiplier?: number | null;
}) {
  const [imgError, setImgError] = useState(false);
  const name = crashPlayerName(player);
  const initial = (player.first_name?.[0] || player.username?.[0] || "?").toUpperCase();
  const isCashedOut = player.status === "cashed_out";
  const isLost = player.status === "lost";
  const isPending = player.status === "pending";
  const showLiveGain =
    isPending && liveMultiplier != null && liveMultiplier >= 1 && player.pending_nanoton > 0;
  const liveGain = showLiveGain
    ? liveGainNanoton(player.pending_nanoton, liveMultiplier!, player.funding_type)
    : 0;
  const hotGain = showLiveGain && liveMultiplier! >= 2;

  return (
    <div
      className={cn(
        "crash-player-row flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-[background,opacity] duration-200",
        flash && "crash-bet-flash",
        isCashedOut && "crash-player-row--won",
        isLost && "crash-player-row--lost",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-[10px] font-medium text-muted">
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
        <p className="truncate text-sm text-foreground/90">{name}</p>
        <p className="text-[11px] tabular-nums text-muted">
          {player.gifts.length > 1 ? (
            <GiftStakeIcons
              gifts={player.gifts}
              size="xs"
              amountNanoton={isPending ? player.pending_nanoton : player.amount_nanoton}
            />
          ) : (
            <BetStakeLabel
              amountNanoton={isPending ? player.pending_nanoton : player.amount_nanoton}
              fundingType={player.funding_type === "mixed" ? "gift" : player.funding_type}
              gift={player.gift}
            />
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {isCashedOut && player.cashout_multiplier != null ? (
          <p className="text-[11px] font-semibold tabular-nums text-success">
            {formatMultiplier(player.cashout_multiplier)}
          </p>
        ) : isLost ? (
          <p className="text-[11px] font-medium text-danger">Краш</p>
        ) : showLiveGain ? (
          <LiveGainPlaque valueNanoton={liveGain} hot={hotGain} />
        ) : (
          <p className="text-[11px] font-medium text-muted">В игре</p>
        )}
      </div>
    </div>
  );
}

export function CrashRoundBets({ data, liveMultiplier = null }: Props) {
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
      <p className="section-label">Игроки</p>
      <div className="max-h-52 space-y-0.5 overflow-y-auto overscroll-contain">
        {players.map((player) => (
          <PlayerRow
            key={player.key}
            player={player}
            flash={flashKeys.has(player.key)}
            liveMultiplier={liveMultiplier}
          />
        ))}
      </div>
    </div>
  );
}
