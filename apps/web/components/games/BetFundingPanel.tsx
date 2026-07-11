"use client";

import { useMemo } from "react";
import { Check, Gift } from "lucide-react";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatTON, InventoryItem } from "@/lib/api";
import { BetFundingMode } from "@/lib/bet-funding";
import { giftImageUrl, giftValuationNanoton } from "@/lib/gifts";
import { cn } from "@/lib/utils";
import { useBettableGifts } from "@/components/games/useBettableGifts";

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
  /** Lock amount field without filtering gifts by exact value (e.g. PvP join). */
  amountLocked?: boolean;
  excludedGiftIds?: string[];
  multiple?: boolean;
  amountInputProps?: AmountInputProps;
  /** sheet = denser gift grid for popups */
  layout?: "inline" | "sheet";
  /**
   * Crash / Roulette: prepare TON and gifts together (no exclusive toggle).
   * PvP keeps exclusive TON | gift segments when false.
   */
  combined?: boolean;
};

function BetGiftCard({
  item,
  active,
  disabled,
  onToggle,
  className,
}: {
  item: InventoryItem;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const value = giftValuationNanoton(item);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "gift-card app-control",
        !active && "gift-card--dimmed",
        disabled && "opacity-40",
        className,
      )}
    >
      <div className="gift-card__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={giftImageUrl(item.collection_slug, item.image_url)}
          alt={item.name}
          className="gift-card__img"
        />
        {active ? (
          <span className="gift-card__check">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : null}
      </div>
      <div className="gift-card__meta">
        <p className="gift-card__title">{item.name}</p>
        <span className="gift-card__price">
          {formatTON(value)}
          <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
        </span>
      </div>
    </button>
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
  amountLocked = false,
  excludedGiftIds = [],
  multiple = true,
  amountInputProps,
  layout = "inline",
  combined = false,
}: Props) {
  const showGifts = combined || mode === "gift";
  const showBalance = combined || mode === "balance";
  const { gifts, loading: loadingGifts } = useBettableGifts(showGifts);

  const excluded = useMemo(() => new Set(excludedGiftIds), [excludedGiftIds]);

  const availableGifts = useMemo(() => {
    let list = gifts.filter((item) => !excluded.has(item.id));
    if (fixedStakeNanoton) {
      list = list.filter((item) => giftValuationNanoton(item) === fixedStakeNanoton);
    }
    return list;
  }, [gifts, fixedStakeNanoton, excluded]);

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

  const isSheet = layout === "sheet";

  return (
    <div className="space-y-3">
      {!combined ? (
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
      ) : null}

      {showBalance ? (
        <div className="space-y-2">
          {combined ? (
            <p className="text-[11px] font-medium text-muted">TON</p>
          ) : null}
          <div className={cn(!combined && "segment-panel", "space-y-3")}>
            <div className="input-inset py-2.5">
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={disabled || !!fixedStakeNanoton || amountLocked}
                value={fixedStakeTon ?? amountTon}
                onChange={(e) => onAmountTonChange(e.target.value)}
                {...amountInputProps}
                className="w-full bg-transparent text-center text-lg font-bold tabular-nums text-foreground outline-none disabled:opacity-40"
                placeholder="0.00"
              />
              <TonIcon variant="brand" size="lg" title="TON" />
            </div>

            {!fixedStakeNanoton && !amountLocked && (
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
          </div>
        </div>
      ) : null}

      {showGifts ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-muted">Подарки</p>
            {multiple && selectedGiftIds.length > 0 ? (
              <p className="text-[11px] tabular-nums text-muted">
                Выбрано: {selectedGiftIds.length}
              </p>
            ) : null}
          </div>
          <div className={cn(!combined && "segment-panel", "space-y-2.5")}>
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
            ) : isSheet ? (
              <div className="grid max-h-[min(42dvh,340px)] grid-cols-3 gap-x-2.5 gap-y-3 overflow-y-auto overscroll-contain pr-0.5">
                {availableGifts.map((item) => (
                  <BetGiftCard
                    key={item.id}
                    item={item}
                    active={selectedGiftIds.includes(item.id)}
                    disabled={disabled}
                    onToggle={() => toggleGift(item.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {availableGifts.map((item) => (
                  <BetGiftCard
                    key={item.id}
                    item={item}
                    active={selectedGiftIds.includes(item.id)}
                    disabled={disabled}
                    onToggle={() => toggleGift(item.id)}
                    className="w-[6.75rem] shrink-0"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
