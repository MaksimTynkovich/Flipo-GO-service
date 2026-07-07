"use client";

import { useState } from "react";
import { formatTON, RouletteRoundBets as RouletteRoundBetsData } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { rouletteFillStyle, roulettePlayerName } from "@/lib/roulette";
import { cn } from "@/lib/utils";

type Props = {
  data: RouletteRoundBetsData | null;
};

function ColorSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      style={rouletteFillStyle(color)}
      className={cn(
        "inline-block shrink-0 rounded-md",
        color === "black" && "ring-1 ring-inset ring-white/12",
        className,
      )}
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

      <p className="min-w-0 flex-1 truncate text-sm text-foreground/90">{name}</p>

      <ColorSwatch color={bet.color} className="h-5 w-5" />

      <p className="shrink-0 text-sm font-medium tabular-nums">
        <TonAmount amount={formatTON(bet.amount_nanoton)} iconSize="sm" />
      </p>
    </div>
  );
}

export function RouletteRoundBets({ data }: Props) {
  const bets = data?.bets ?? [];
  const totals = data?.totals ?? { red: 0, green: 0, black: 0 };
  const grandTotal = totals.red + totals.green + totals.black;

  if (bets.length === 0) {
    return (
      <p className="pt-1 text-center text-xs text-muted">Пока нет ставок в раунде</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">Игроки</p>
        {grandTotal > 0 && (
          <p className="text-[11px] tabular-nums text-muted">
            <TonAmount amount={formatTON(grandTotal)} iconSize="sm" />
          </p>
        )}
      </div>

      <div className="scrollbar-none max-h-36 divide-y divide-border/40 overflow-y-auto">
        {bets.map((bet) => (
          <BetRow key={bet.id} bet={bet} />
        ))}
      </div>
    </div>
  );
}
