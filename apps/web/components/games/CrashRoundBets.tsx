"use client";

import { useState } from "react";
import { formatTON, CrashRoundBets as CrashRoundBetsData } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { crashPlayerName, formatMultiplier } from "@/lib/crash";

type Props = {
  data: CrashRoundBetsData | null;
};

function BetRow({ bet }: { bet: CrashRoundBetsData["bets"][number] }) {
  const [imgError, setImgError] = useState(false);
  const name = crashPlayerName(bet);
  const initial = (bet.first_name?.[0] || bet.username?.[0] || "?").toUpperCase();
  const isCashedOut = bet.status === "cashed_out";
  const isLost = bet.status === "lost";
  const profit =
    isCashedOut && bet.payout_nanoton != null
      ? bet.payout_nanoton - bet.amount_nanoton
      : null;

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

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground/90">{name}</p>
        <p className="text-[11px] tabular-nums text-muted">
          <TonAmount amount={formatTON(bet.amount_nanoton)} iconSize="xs" />
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
                +<TonAmount amount={formatTON(profit)} iconSize="xs" iconClassName="text-success/90" />
              </p>
            )}
          </>
        ) : isLost ? (
          <p className="text-[11px] font-medium text-danger">Проигрыш</p>
        ) : (
          <p className="text-[11px] font-medium text-muted">В игре</p>
        )}
      </div>
    </div>
  );
}

export function CrashRoundBets({ data }: Props) {
  const bets = data?.bets ?? [];

  if (bets.length === 0) {
    return <p className="text-center text-xs text-muted">Пока нет ставок в раунде</p>;
  }

  const cashed = bets.filter((b) => b.status === "cashed_out").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">Игроки</p>
        <span className="text-[10px] tabular-nums text-muted">
          {bets.length}
          {cashed > 0 ? ` · ${cashed} забрали` : ""}
        </span>
      </div>

      <div className="surface-inset space-y-0.5 px-2.5 py-1">
        {bets.map((bet) => (
          <BetRow key={bet.id} bet={bet} />
        ))}
      </div>
    </div>
  );
}
