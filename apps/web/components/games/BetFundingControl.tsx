"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Gift, Pencil } from "lucide-react";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { Button } from "@/components/ui/button";
import { BetFundingPanel } from "@/components/games/BetFundingPanel";
import { useBettableGifts } from "@/components/games/useBettableGifts";
import { BetFundingMode } from "@/lib/bet-funding";
import { formatTON } from "@/lib/api";
import { giftImageUrl, giftValuationNanoton } from "@/lib/gifts";
import { pluralizeGifts } from "@/lib/staking-ui";
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
  title?: string;
  subtitle?: string;
  className?: string;
};

export function BetFundingControl({
  mode,
  onModeChange,
  amountTon,
  onAmountTonChange,
  selectedGiftIds,
  onSelectGifts,
  disabled,
  quickAmounts,
  fixedStakeNanoton,
  excludedGiftIds = [],
  multiple = true,
  amountInputProps,
  title = "Ставка",
  subtitle = "TON с баланса или подарок из инвентаря",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const needsGifts = mode === "gift" || open;
  const { gifts, reload } = useBettableGifts(needsGifts);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const selectedGifts = useMemo(
    () => gifts.filter((item) => selectedGiftIds.includes(item.id)),
    [gifts, selectedGiftIds],
  );

  const giftTotalNanoton = useMemo(
    () => selectedGifts.reduce((sum, item) => sum + giftValuationNanoton(item), 0),
    [selectedGifts],
  );

  const summaryReady =
    mode === "balance"
      ? parseFloat(amountTon || "0") > 0 || (fixedStakeNanoton != null && fixedStakeNanoton > 0)
      : selectedGiftIds.length > 0;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "app-control group flex w-full items-center gap-3 rounded-2xl bg-surface-raised px-3.5 py-3 text-left",
          "transition-[background-color,filter,transform] duration-200",
          !disabled && "active:scale-[0.985] hover:brightness-[1.04]",
          disabled && "opacity-40",
          className,
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface">
          {mode === "gift" && selectedGifts.length > 0 ? (
            <GiftPreview gifts={selectedGifts} />
          ) : mode === "gift" ? (
            <Gift className="h-5 w-5 text-muted" />
          ) : (
            <TonIcon variant="brand" className="h-6 w-6" title="TON" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-muted">{title}</span>
          {mode === "balance" ? (
            <span className="mt-0.5 flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-foreground">
              <TonAmount
                amount={
                  fixedStakeNanoton != null && fixedStakeNanoton > 0
                    ? formatTON(fixedStakeNanoton)
                    : amountTon || "0"
                }
                iconSize="sm"
              />
            </span>
          ) : selectedGiftIds.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-semibold text-foreground">
              <span>
                {selectedGifts.length === 1
                  ? selectedGifts[0].name
                  : pluralizeGifts(selectedGiftIds.length)}
              </span>
              {giftTotalNanoton > 0 && (
                <span className="text-sm font-medium tabular-nums text-muted">
                  <TonAmount amount={formatTON(giftTotalNanoton)} iconSize="xs" />
                </span>
              )}
            </span>
          ) : (
            <span className="mt-0.5 block text-[15px] font-semibold text-muted">
              Выберите подарок
            </span>
          )}
        </span>

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            summaryReady
              ? "bg-accent/12 text-accent"
              : "bg-surface text-muted",
          )}
        >
          <Pencil className="h-3 w-3" />
          Изменить
          <ChevronRight className="h-3.5 w-3.5 opacity-70 transition-transform group-active:translate-x-0.5" />
        </span>
      </button>

      {open ? (
        <ModalOverlay onClose={() => setOpen(false)} analyticsModalId="bet_funding">
          {(close) => (
            <div className="sheet-panel relative mx-auto w-full max-w-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
              <div className="mb-4 text-center">
                <p className="text-[15px] font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted">{subtitle}</p>
              </div>

              <BetFundingPanel
                mode={mode}
                onModeChange={onModeChange}
                amountTon={amountTon}
                onAmountTonChange={onAmountTonChange}
                selectedGiftIds={selectedGiftIds}
                onSelectGifts={onSelectGifts}
                disabled={disabled}
                quickAmounts={quickAmounts}
                fixedStakeNanoton={fixedStakeNanoton}
                excludedGiftIds={excludedGiftIds}
                multiple={multiple}
                amountInputProps={amountInputProps}
                layout="sheet"
              />

              <Button
                variant="accent"
                className="mt-4 h-11 w-full rounded-xl"
                onClick={close}
              >
                Готово
              </Button>
            </div>
          )}
        </ModalOverlay>
      ) : null}
    </>
  );
}

function GiftPreview({
  gifts,
}: {
  gifts: { id: string; collection_slug: string; image_url?: string }[];
}) {
  const shown = gifts.slice(0, 3);
  const extra = gifts.length - shown.length;

  if (shown.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={giftImageUrl(shown[0].collection_slug, shown[0].image_url)}
        alt=""
        className="h-full w-full object-contain"
      />
    );
  }

  return (
    <span className="relative flex h-full w-full items-center justify-center">
      {shown.map((gift, index) => (
        <span
          key={gift.id}
          className="absolute flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-surface ring-1 ring-surface-raised"
          style={{
            left: `${10 + index * 10}px`,
            zIndex: shown.length - index,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={giftImageUrl(gift.collection_slug, gift.image_url)}
            alt=""
            className="h-full w-full object-contain"
          />
        </span>
      ))}
      {extra > 0 && (
        <span className="absolute bottom-1 right-1 rounded bg-surface px-1 text-[9px] font-bold text-muted">
          +{extra}
        </span>
      )}
    </span>
  );
}
