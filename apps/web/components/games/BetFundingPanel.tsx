"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift } from "lucide-react";
import { TonIcon, TonAmount } from "@/components/icons/TonIcon";
import { formatTON, getInventory, InventoryItem } from "@/lib/api";
import { BetFundingMode } from "@/lib/bet-funding";
import { giftImageUrl, giftValuationNanoton } from "@/lib/gifts";
import { cn } from "@/lib/utils";

type AmountInputProps = {
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
};

type Props = {
  mode: BetFundingMode;
  onModeChange: (mode: BetFundingMode) => void;
  amountTon: string;
  onAmountTonChange: (value: string) => void;
  selectedGiftIds: string[];
  onSelectGifts: (ids: string[]) => void;
  disabled?: boolean;
  quickAmounts?: string[];
  fixedStakeNanoton?: number;
  excludedGiftIds?: string[];
  multiple?: boolean;
  amountInputProps?: AmountInputProps;
};

function bettableGifts(items: InventoryItem[]): InventoryItem[] {
  return items.filter(
    (item) => item.status === "available" && giftValuationNanoton(item) > 0,
  );
}

export function BetFundingPanel({
  mode,
  onModeChange,
  amountTon,
  onAmountTonChange,
  selectedGiftIds,
  onSelectGifts,
  disabled,
  quickAmounts = ["0.1", "0.5", "1", "5"],
  fixedStakeNanoton,
  excludedGiftIds = [],
  multiple = true,
  amountInputProps,
}: Props) {
  const [gifts, setGifts] = useState<InventoryItem[]>([]);
  const [loadingGifts, setLoadingGifts] = useState(false);

  const loadGifts = useCallback(async () => {
    setLoadingGifts(true);
    try {
      const items = await getInventory();
      setGifts(bettableGifts(items));
    } catch {
      setGifts([]);
    } finally {
      setLoadingGifts(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "gift") {
      void loadGifts();
    }
  }, [mode, loadGifts]);

  const excluded = useMemo(() => new Set(excludedGiftIds), [excludedGiftIds]);

  const availableGifts = useMemo(() => {
    let list = gifts.filter((item) => !excluded.has(item.id));
    if (fixedStakeNanoton) {
      list = list.filter((item) => giftValuationNanoton(item) === fixedStakeNanoton);
    }
    return list;
  }, [gifts, fixedStakeNanoton, excluded]);

  const selectedGifts = availableGifts.filter((item) => selectedGiftIds.includes(item.id));

  function toggleGift(id: string) {
    if (multiple) {
      if (selectedGiftIds.includes(id)) {
        onSelectGifts(selectedGiftIds.filter((itemId) => itemId !== id));
      } else {
        onSelectGifts([...selectedGiftIds, id]);
      }
      return;
    }
    onSelectGifts(selectedGiftIds.includes(id) ? [] : [id]);
  }

  const fixedStakeTon =
    fixedStakeNanoton != null && fixedStakeNanoton > 0
      ? (fixedStakeNanoton / 1_000_000_000).toFixed(2)
      : null;

  return (
    <div className="space-y-3">
      <div className="segment-control">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onModeChange("balance")}
          className={cn("segment-item gap-1.5", mode === "balance" && "segment-item-active")}
        >
          <TonIcon variant="brand" className="h-4 w-4" title="TON" />
          TON
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onModeChange("gift")}
          className={cn("segment-item gap-1.5", mode === "gift" && "segment-item-active")}
        >
          <Gift className="h-4 w-4" />
          Подарок
        </button>
      </div>

      {mode === "balance" ? (
        <>
          <div className="input-inset py-2.5">
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={disabled || !!fixedStakeNanoton}
              value={fixedStakeTon ?? amountTon}
              onChange={(e) => onAmountTonChange(e.target.value)}
              {...amountInputProps}
              className="w-full bg-transparent text-center text-lg font-bold tabular-nums text-foreground outline-none disabled:opacity-40"
              placeholder="0.00"
            />
            <TonIcon variant="brand" size="lg" title="TON" />
          </div>

          {!fixedStakeNanoton && (
            <div className="flex gap-2">
              {quickAmounts.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAmountTonChange(v)}
                  className={cn(
                    "quick-amount",
                    amountTon === v && "quick-amount-active",
                    disabled && "opacity-40",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {multiple && selectedGiftIds.length > 0 && (
            <p className="text-center text-[11px] text-muted">
              Выбрано: {selectedGiftIds.length}
            </p>
          )}

          {loadingGifts ? (
            <p className="text-center text-xs text-muted">Загружаем подарки…</p>
          ) : availableGifts.length === 0 ? (
            <p className="rounded-xl bg-surface-raised px-3 py-4 text-center text-xs text-muted">
              {fixedStakeNanoton
                ? "Нет подарка с нужной стоимостью для этой комнаты"
                : excludedGiftIds.length > 0
                  ? "Все доступные подарки уже в ставках"
                  : "Нет доступных подарков в инвентаре"}
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {availableGifts.map((item) => {
                const active = selectedGiftIds.includes(item.id);
                const value = giftValuationNanoton(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleGift(item.id)}
                    className={cn(
                      "flex w-[72px] shrink-0 flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors",
                      active
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface-raised/60",
                      disabled && "opacity-40",
                    )}
                  >
                    <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={giftImageUrl(item.collection_slug, item.image_url)}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-muted">
                      <TonAmount amount={formatTON(value)} iconSize="xs" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedGifts.length > 0 && (
            <div className="surface-inset flex flex-wrap items-center justify-center gap-2 px-3 py-2.5">
              {selectedGifts.map((item) => (
                <span
                  key={item.id}
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-surface"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={giftImageUrl(item.collection_slug, item.image_url)}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
