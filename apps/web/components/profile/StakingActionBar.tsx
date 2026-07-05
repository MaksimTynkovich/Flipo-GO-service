"use client";

import { Button } from "@/components/ui/button";
import { formatTON } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { pluralizeGifts } from "@/lib/staking-ui";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  disabled: boolean;
  giftCount: number;
  totalPriceNanoton: number;
  weeklyYieldNanoton: number;
  onStake: () => void;
};

export function StakingActionBar({
  label,
  disabled,
  giftCount,
  totalPriceNanoton,
  weeklyYieldNanoton,
  onStake,
}: Props) {
  const showMetrics = giftCount > 0;

  return (
    <>
      {/* Резервируем место под фиксированную панель, чтобы карточки не перекрывались */}
      <div className="h-[8.75rem] shrink-0" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-4">
        <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
          {showMetrics && (
            <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-b border-[var(--border)]">
              <div className="px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Сумма стейка
                </p>
                <p className="mt-1 text-base font-bold tabular-nums leading-none">
                  <TonAmount
                    amount={formatTON(totalPriceNanoton)}
                    variant="brand"
                    iconClassName="h-5 w-5"
                  />
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Доход за неделю
                </p>
                <p className="mt-1 text-base font-bold tabular-nums leading-none text-success">
                  <TonAmount
                    amount={`+${formatTON(weeklyYieldNanoton)}`}
                    variant="brand"
                    iconClassName="h-5 w-5"
                  />
                </p>
              </div>
            </div>
          )}

          <Button
            variant="accent"
            className={cn(
              "h-12 w-full text-sm font-bold",
              showMetrics ? "rounded-none rounded-b-2xl" : "rounded-2xl",
            )}
            disabled={disabled}
            onClick={onStake}
          >
            <span>{label}</span>
            {showMetrics && giftCount > 0 && (
              <span className="ml-1.5 font-medium opacity-80">· {pluralizeGifts(giftCount)}</span>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
