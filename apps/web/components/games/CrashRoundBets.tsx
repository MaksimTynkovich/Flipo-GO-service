"use client";

import { useEffect, useRef, useState } from "react";
import { formatTON, CrashRoundBets as CrashRoundBetsData } from "@/lib/api";
import { BetStakeLabel } from "@/components/games/BetStakeLabel";
import { TonAmount } from "@/components/icons/TonIcon";
import { crashPlayerName, formatMultiplier, isCrashBigBet } from "@/lib/crash";
import { cn } from "@/lib/utils";

type Props = {
  data: CrashRoundBetsData | null;
};

function BetRow({
  bet,
  flash,
}: {
  bet: CrashRoundBetsData["bets"][number];
  flash?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const name = crashPlayerName(bet);
  const initial = (bet.first_name?.[0] || bet.username?.[0] || "?").toUpperCase();
  const isCashedOut = bet.status === "cashed_out";
  const isLost = bet.status === "lost";
  const isGift = bet.funding_type === "gift" || !!bet.gift;
  const big = isCrashBigBet(bet.amount_nanoton);
  const profit =
    isCashedOut && bet.payout_nanoton != null
      ? isGift
        ? bet.payout_nanoton
        : bet.payout_nanoton - bet.amount_nanoton
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
        big && "bg-accent/[0.07]",
        flash && "crash-bet-flash",
        isLost && "opacity-55",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-[10px] font-medium text-muted",
          big && "ring-1 ring-accent/50",
        )}
      >
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
        <p className="flex items-center gap-1.5 truncate text-sm text-foreground/90">
          <span className="truncate">{name}</span>
          {big ? (
            <span className="shrink-0 rounded bg-accent/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
              Big
            </span>
          ) : null}
        </p>
        <p className="text-[11px] tabular-nums text-muted">
          <BetStakeLabel
            amountNanoton={bet.amount_nanoton}
            fundingType={bet.funding_type}
            gift={bet.gift}
          />
          {bet.status === "pending" && bet.auto_cashout_multiplier != null ? (
            <span className="ml-1.5 text-accent/80">
              авто {formatMultiplier(bet.auto_cashout_multiplier)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {isCashedOut && bet.cashout_multiplier != null ? (
          <>
            <p className="text-[11px] font-semibold tabular-nums text-success">
              {formatMultiplier(bet.cashout_multiplier)}
            </p>
            {profit != null && profit > 0 && (
              <p className="text-[10px] font-medium tabular-nums text-success/90">
                +
                <TonAmount
                  amount={formatTON(profit)}
                  iconSize="xs"
                  iconClassName="text-success/90"
                />
              </p>
            )}
          </>
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
  const [flashIds, setFlashIds] = useState<Set<string>>(() => new Set());
  const seenCashed = useRef<Set<string>>(new Set());
  const roundRef = useRef<string | null>(null);

  useEffect(() => {
    const roundId = data?.round_id ?? null;
    if (roundId !== roundRef.current) {
      roundRef.current = roundId;
      seenCashed.current = new Set();
      setFlashIds(new Set());
    }

    const newly: string[] = [];
    for (const bet of bets) {
      if (bet.status !== "cashed_out") continue;
      if (seenCashed.current.has(bet.id)) continue;
      seenCashed.current.add(bet.id);
      newly.push(bet.id);
    }
    if (newly.length === 0) return;

    setFlashIds((prev) => {
      const next = new Set(prev);
      for (const id of newly) next.add(id);
      return next;
    });
    const timer = window.setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        for (const id of newly) next.delete(id);
        return next;
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [bets, data?.round_id]);

  if (bets.length === 0) {
    return <p className="py-2 text-center text-xs text-muted">Пока нет ставок</p>;
  }

  const sorted = [...bets].sort((a, b) => {
    const aBig = isCrashBigBet(a.amount_nanoton) ? 1 : 0;
    const bBig = isCrashBigBet(b.amount_nanoton) ? 1 : 0;
    if (aBig !== bBig) return bBig - aBig;
    return b.amount_nanoton - a.amount_nanoton;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">Игроки</p>
        <span className="text-[10px] tabular-nums text-muted">{bets.length}</span>
      </div>

      <div className="max-h-52 space-y-0.5 overflow-y-auto">
        {sorted.map((bet) => (
          <BetRow key={bet.id} bet={bet} flash={flashIds.has(bet.id)} />
        ))}
      </div>
    </div>
  );
}
