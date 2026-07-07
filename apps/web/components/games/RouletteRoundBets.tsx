"use client";

import { useState } from "react";
import { formatTON, RouletteRoundBets as RouletteRoundBetsData } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { ROULETTE_COLOR_STYLES, roulettePlayerName } from "@/lib/roulette";
import { cn } from "@/lib/utils";

const COLORS = ["red", "green", "black"] as const;

type Props = {
  data: RouletteRoundBetsData | null;
};

function BetRow({ bet }: { bet: RouletteRoundBetsData["bets"][number] }) {
  const [imgError, setImgError] = useState(false);
  const style = ROULETTE_COLOR_STYLES[bet.color as keyof typeof ROULETTE_COLOR_STYLES];
  const name = roulettePlayerName(bet);
  const initial = (bet.first_name?.[0] || bet.username?.[0] || "?").toUpperCase();

  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised text-[10px] font-medium text-muted">
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
        <p className="truncate text-sm leading-tight">{name}</p>
      </div>

      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white",
          style?.bg ?? "bg-surface-raised",
        )}
      >
        {style?.label ?? bet.color}
      </span>

      <p className="shrink-0 text-sm font-medium tabular-nums">
        <TonAmount amount={formatTON(bet.amount_nanoton)} iconSize="sm" />
      </p>
    </div>
  );
}

export function RouletteRoundBets({ data }: Props) {
  const bets = data?.bets ?? [];
  const totals = data?.totals ?? { red: 0, green: 0, black: 0 };
  const counts = data?.counts ?? { red: 0, green: 0, black: 0 };
  const grandTotal = totals.red + totals.green + totals.black;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">Ставки раунда</p>
        {grandTotal > 0 && (
          <p className="text-[11px] tabular-nums text-muted">
            <TonAmount amount={formatTON(grandTotal)} iconSize="sm" />
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {COLORS.map((color) => {
          const style = ROULETTE_COLOR_STYLES[color];
          return (
            <div key={color} className={cn("rounded-xl px-2.5 py-2", style.tile)}>
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                <span className={cn("truncate text-[10px] font-medium", style.text)}>
                  {style.label}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold tabular-nums leading-none text-foreground">
                {totals[color] > 0 ? (
                  <TonAmount amount={formatTON(totals[color])} iconSize="sm" />
                ) : (
                  "0"
                )}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">
                {counts[color] > 0 ? counts[color] : "—"}
              </p>
            </div>
          );
        })}
      </div>

      {bets.length === 0 ? (
        <p className="py-1 text-center text-xs text-muted">Пока нет ставок</p>
      ) : (
        <div className="scrollbar-none max-h-36 divide-y divide-border overflow-y-auto">
          {bets.map((bet) => (
            <BetRow key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </div>
  );
}
