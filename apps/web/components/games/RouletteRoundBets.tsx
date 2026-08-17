"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  BetGiftView,
  formatTON,
  RouletteBetEntry,
  RouletteRoundBets as RouletteRoundBetsData,
} from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import {
  ROULETTE_COLORS,
  ROULETTE_COLOR_STYLES,
  RouletteColor,
  colorLabel,
  rouletteMultiplier,
  roulettePlayerName,
} from "@/lib/roulette";
import { useT } from "@/components/providers/I18nProvider";
import { cn } from "@/lib/utils";

type Props = {
  data: RouletteRoundBetsData | null;
  currentUserId?: string | null;
  resultColor?: string | null;
  onBetColor?: (color: RouletteColor) => void;
  canBet?: boolean;
  myStakeByColor?: Record<RouletteColor, number>;
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

const VISIBLE_PER_COL = 3;

const ACCENT: Record<RouletteColor, string> = {
  blue: "#3390ec",
  red: "#e56555",
  green: "#3ecf8e",
  yellow: "#f0d060",
};

function IconPlayers({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("h-3.5 w-3.5 shrink-0", className)}
    >
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3.5 19c.5-2.8 2.8-4.5 5.5-4.5s5 1.7 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M14.5 19c.4-1.8 1.8-3 3.5-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

function winProfitNanoton(amount: number, color: string, fundingType?: string): number {
  const payout = amount * rouletteMultiplier(color);
  const isGift = fundingType === "gift" || fundingType === "mixed";
  return isGift ? payout : Math.max(0, payout - amount);
}

function initialsOf(bet: AggregatedBet): string {
  const name = (bet.first_name || bet.username || "").trim();
  if (!name) return "?";
  return name[0]!.toUpperCase();
}

function PlayerRow({
  bet,
  mine,
  outcome,
  flash,
  accent,
  featured,
}: {
  bet: AggregatedBet;
  mine?: boolean;
  outcome: Outcome;
  flash?: boolean;
  accent: string;
  featured?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const name = roulettePlayerName(bet);
  const initials = initialsOf(bet);
  const isWon = outcome === "won";
  const isLost = outcome === "lost";
  const profit = isWon ? winProfitNanoton(bet.amount_nanoton, bet.color, bet.funding_type) : 0;
  const amountText =
    isWon && profit > 0
      ? `+${formatTON(profit)}`
      : isLost
        ? `−${formatTON(bet.amount_nanoton)}`
        : formatTON(bet.amount_nanoton);

  return (
    <div
      className={cn(
        "roulette-col-row flex min-w-0 items-center gap-1 overflow-hidden",
        featured ? "mx-0.5 rounded-md px-1 py-1" : "px-0.5 py-1",
        isWon && flash && "crash-bet-flash",
        isLost && "opacity-50",
        mine && !featured && !isWon && !isLost && "rounded-md bg-white/[0.04]",
      )}
      style={featured ? { backgroundColor: accent } : undefined}
      title={`${name}: ${amountText} TON`}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-[8px] font-semibold",
          featured ? "bg-black/20 text-white" : "bg-surface text-muted ring-1 ring-white/10",
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
          initials
        )}
      </span>

      <span
        className={cn(
          "min-w-0 flex-1 whitespace-nowrap text-[10px] font-bold leading-none tabular-nums tracking-tight",
          featured && "text-white",
          isWon && !featured && "text-success",
          isLost && "text-danger",
        )}
        style={!featured && !isWon && !isLost ? { color: accent } : undefined}
      >
        {amountText}
      </span>
    </div>
  );
}

function colorStat(
  color: RouletteColor,
  bag: Record<string, number> | undefined,
  fallback: number,
): number {
  if (!bag) return fallback;
  return bag[color] ?? fallback;
}

export const RouletteRoundBets = memo(function RouletteRoundBets({
  data,
  currentUserId,
  resultColor = null,
  onBetColor,
  canBet = false,
}: Props) {
  const t = useT();
  const rows = useMemo(() => aggregateBets(data?.bets ?? []), [data?.bets]);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<RouletteColor | null>(null);
  const seenResultRef = useRef<string | null>(null);
  const flashTimers = useRef<Map<string, number>>(new Map());

  const byColor = useMemo(() => {
    const map = Object.fromEntries(ROULETTE_COLORS.map((c) => [c, [] as AggregatedBet[]])) as Record<
      RouletteColor,
      AggregatedBet[]
    >;
    for (const row of rows) {
      if (row.color in map) {
        map[row.color as RouletteColor].push(row);
      }
    }
    return map;
  }, [rows]);

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

  useEffect(() => {
    setExpanded(null);
  }, [data?.round_id]);

  const totals = data?.totals as Record<string, number> | undefined;
  const counts = data?.counts as Record<string, number> | undefined;

  return (
    <div className="roulette-cols grid grid-cols-4 gap-1.5">
      {ROULETTE_COLORS.map((color) => {
        const style = ROULETTE_COLOR_STYLES[color];
        const accent = ACCENT[color];
        const list = byColor[color];
        const count = colorStat(color, counts, list.length);
        const total = colorStat(color, totals, 0);
        const won = resultColor === color;
        const lost = !!resultColor && resultColor !== color;
        const isOpen = expanded === color;
        const visible = isOpen ? list : list.slice(0, VISIBLE_PER_COL);
        const hidden = Math.max(0, list.length - VISIBLE_PER_COL);

        return (
          <div
            key={color}
            className={cn(
              "roulette-col flex min-w-0 flex-col overflow-hidden rounded-lg",
              won && "roulette-col--won",
              lost && "roulette-col--lost",
            )}
            style={{
              backgroundColor: "rgba(255,255,255,0.035)",
              boxShadow: won
                ? `inset 0 0 0 1.5px ${accent}`
                : "inset 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            <button
              type="button"
              disabled={!canBet || !onBetColor}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onBetColor?.(color)}
              className={cn(
                "roulette-col__head flex flex-col gap-1.5 px-2 py-2.5 text-left outline-none ring-0",
                canBet && onBetColor && "hover:brightness-110",
                !canBet && "cursor-default",
              )}
              style={{ backgroundColor: `${accent}20` }}
              aria-label={`${colorLabel(color)} ${style.multiplier}`}
            >
              <span
                className="flex min-w-0 items-center gap-0.5 text-[11px] font-bold tabular-nums"
                style={{ color: accent }}
              >
                <IconPlayers className="opacity-90" />
                <span className="shrink-0">{count}</span>
                <span className="ml-auto shrink-0 text-[10px] font-extrabold">{style.multiplier}</span>
              </span>
              <span
                className="flex min-w-0 items-center gap-0.5 text-[11px] font-bold tabular-nums"
                style={{ color: accent }}
              >
                <TonIcon variant="mono" size="xs" className="shrink-0" />
                <span className="min-w-0 truncate">{formatTON(total)}</span>
              </span>
            </button>

            <div className="hairline-top mx-1.5" />

            <div className="roulette-col__body flex flex-col px-0.5 pb-1 pt-0.5">
              {visible.map((bet, index) => (
                <PlayerRow
                  key={bet.key}
                  bet={bet}
                  mine={!!currentUserId && bet.user_id === currentUserId}
                  outcome={betOutcome(bet.color, resultColor)}
                  flash={flashKeys.has(bet.key)}
                  accent={accent}
                  featured={index === 0}
                />
              ))}

              {list.length === 0 ? (
                <p className="flex flex-1 items-center justify-center text-[12px] text-muted/45">—</p>
              ) : null}

              {hidden > 0 || isOpen ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setExpanded(isOpen ? null : color)}
                  className="mt-auto px-1 py-1.5 text-center text-[10px] font-semibold outline-none"
                  style={{ color: accent }}
                >
                  {isOpen ? t("common.collapse") : t("common.allCount", { count: list.length })}
                </button>
              ) : (
                <div className="mt-auto h-[1.75rem]" aria-hidden />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
