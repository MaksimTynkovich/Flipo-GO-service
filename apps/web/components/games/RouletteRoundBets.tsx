"use client";

import { useState } from "react";
import { formatTON, RouletteRoundBets as RouletteRoundBetsData } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import {
  ROULETTE_COLOR_STYLES,
  rouletteFillStyle,
  roulettePlayerName,
} from "@/lib/roulette";
import { cn } from "@/lib/utils";

const COLORS = ["red", "green", "black"] as const;

type Props = {
  data: RouletteRoundBetsData | null;
};

function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      style={rouletteFillStyle(color)}
      className={cn("inline-block shrink-0 rounded-full", className)}
    />
  );
}

function BetRow({ bet }: { bet: RouletteRoundBetsData["bets"][number] }) {
  const [imgError, setImgError] = useState(false);
  const name = roulettePlayerName(bet);
  const initial = (bet.first_name?.[0] || bet.username?.[0] || "?").toUpperCase();

  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised text-[11px] font-medium text-muted">
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

      <p className="min-w-0 flex-1 truncate text-sm">{name}</p>

      <ColorDot color={bet.color} className="h-2 w-2" />

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

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-raised/70 px-3 py-2.5">
        {COLORS.map((color) => {
          const style = ROULETTE_COLOR_STYLES[color];
          return (
            <div key={color} className="min-w-0 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <ColorDot color={color} className="h-2 w-2" />
                <span className="truncate text-[10px] text-muted">{style.label}</span>
              </div>
              <p className="mt-1 text-sm font-semibold tabular-nums leading-none">
                {totals[color] > 0 ? (
                  <TonAmount amount={formatTON(totals[color])} iconSize="sm" />
                ) : (
                  "0"
                )}
              </p>
              {counts[color] > 0 && (
                <p className="mt-0.5 text-[10px] text-muted">{counts[color]}</p>
              )}
            </div>
          );
        })}
      </div>

      {bets.length === 0 ? (
        <p className="py-1 text-center text-xs text-muted">Пока нет ставок</p>
      ) : (
        <div className="scrollbar-none max-h-36 space-y-0.5 overflow-y-auto">
          {bets.map((bet) => (
            <BetRow key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </div>
  );
}
