"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTON, ProfileGift, StakingStats } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";
import { Gift } from "lucide-react";

type Props = {
  gift: ProfileGift;
  stats: StakingStats;
  positionId?: string;
  unstaking: boolean;
  onClose: () => void;
  onUnstake?: () => void;
};

function StatCell({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-raised px-2 py-3 text-center">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={cn("mt-1 text-sm font-bold tabular-nums", accent && "text-success")}>{value}</p>
    </div>
  );
}

export function StakingGiftSheet({
  gift,
  stats,
  positionId,
  unstaking,
  onClose,
  onUnstake,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = giftImageUrl(gift.slug, gift.image_url);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/55 backdrop-blur-sm">
      <button type="button" aria-label="Закрыть" className="absolute inset-0" onClick={onClose} />

      <div className="relative mx-auto w-full max-w-lg rounded-t-[1.75rem] bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />

        <div className="relative mb-4 flex items-center justify-center">
          <p className="text-[15px] font-semibold text-foreground">
            {gift.is_staked ? "В стейке" : "Подарок"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-muted transition-opacity active:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mx-auto mb-4 flex aspect-square max-w-[220px] items-center justify-center">
          {!imgError ? (
            <img
              src={imageSrc}
              alt={gift.name}
              className="max-h-full max-w-full rounded-[20px] object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <Gift className="h-14 w-14 text-muted/50" />
          )}
        </div>

        <div className="mb-4 text-center">
          <p className="text-[17px] font-semibold leading-tight">{gift.name}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm tabular-nums text-muted">
            Стоимость <TonAmount amount={formatTON(gift.price_nanoton)} variant="brand" iconClassName="h-5 w-5" />
          </p>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2">
          {gift.is_staked && (
            <StatCell
              label="Заработано"
              value={`+${formatTON(gift.earned_nanoton)}`}
              accent
            />
          )}
          <StatCell label="В день" value={`+${formatTON(gift.daily_yield_nanoton)}`} />
          <StatCell
            label="В месяц"
            value={<TonAmount amount={`+${formatTON(gift.monthly_yield_nanoton)}`} variant="brand" iconClassName="h-5 w-5" />}
          />
        </div>

        {gift.is_staked && gift.can_unstake && positionId && onUnstake && (
          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl text-[15px] font-semibold"
            disabled={unstaking}
            onClick={onUnstake}
          >
            {unstaking ? "Снимаем…" : "Вернуть в инвентарь"}
          </Button>
        )}

        {gift.is_staked && !gift.can_unstake && (
          <p className="py-2 text-center text-xs leading-relaxed text-muted">
            Подарок в профиле Telegram — снять со стейка нельзя, он не на балансе бота
          </p>
        )}

        {!gift.is_staked && (
          <p className="py-2 text-center text-xs text-muted">
            Ставка {stats.monthly_rate_percent}%/мес от стоимости подарка
          </p>
        )}
      </div>
    </div>
  );
}
