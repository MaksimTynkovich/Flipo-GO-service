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
  /** Crash / Roulette: prepare TON + gifts in one sheet. */
  combined?: boolean;
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
  subtitle,
  className,
  combined = false,
}: Props) {
  const [open, setOpen] = useState(false);
  // Prefetch gifts while the control is on screen so the sheet opens at full height.
  const { gifts, reload } = useBettableGifts(true);

  useEffect(() => {
    if (open) void reload({ silent: true });
  }, [open, reload]);

  const selectedGifts = useMemo(
    () => gifts.filter((item) => selectedGiftIds.includes(item.id)),
    [gifts, selectedGiftIds],
  );

  const giftTotalNanoton = useMemo(
    () => selectedGifts.reduce((sum, item) => sum + giftValuationNanoton(item), 0),
    [selectedGifts],
  );

  const amountNanoton =
    fixedStakeNanoton != null && fixedStakeNanoton > 0
      ? fixedStakeNanoton
      : Math.floor(parseFloat(amountTon || "0") * 1_000_000_000);
  const hasTon = amountNanoton > 0;
  const hasGifts = selectedGiftIds.length > 0;

  const summaryReady = combined
    ? hasTon || hasGifts
    : mode === "balance"
      ? hasTon
      : hasGifts;

  const resolvedSubtitle = subtitle ?? null;

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
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface">
          <SummaryThumb
            hasTon={hasTon}
            hasGifts={hasGifts}
            gifts={selectedGifts}
            giftCount={selectedGiftIds.length}
            combined={combined}
            mode={mode}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-muted">{title}</span>
          {combined ? (
            summaryReady ? (
              <CombinedSummary
                hasTon={hasTon}
                hasGifts={hasGifts}
                amountTon={
                  fixedStakeNanoton != null && fixedStakeNanoton > 0
                    ? formatTON(fixedStakeNanoton)
                    : amountTon || "0"
                }
                amountNanoton={amountNanoton}
                giftCount={selectedGiftIds.length}
                giftName={selectedGifts.length === 1 ? selectedGifts[0].name : null}
                giftTotalNanoton={giftTotalNanoton}
              />
            ) : (
              <span className="mt-0.5 block text-[15px] font-semibold text-muted">
                Настроить
              </span>
            )
          ) : mode === "balance" ? (
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
            <span className="mt-0.5 flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold text-foreground">
                {selectedGifts.length === 1
                  ? selectedGifts[0].name
                  : pluralizeGifts(selectedGiftIds.length)}
              </span>
              {giftTotalNanoton > 0 ? (
                <span className="text-[12px] font-medium tabular-nums text-muted">
                  <TonAmount amount={formatTON(giftTotalNanoton)} iconSize="xs" />
                </span>
              ) : null}
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
                {resolvedSubtitle ? (
                  <p className="mt-1 text-xs text-muted">{resolvedSubtitle}</p>
                ) : null}
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
                combined={combined}
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

function CombinedSummary({
  hasTon,
  hasGifts,
  amountTon,
  amountNanoton,
  giftCount,
  giftName,
  giftTotalNanoton,
}: {
  hasTon: boolean;
  hasGifts: boolean;
  amountTon: string;
  amountNanoton: number;
  giftCount: number;
  giftName: string | null;
  giftTotalNanoton: number;
}) {
  const totalNanoton = amountNanoton + giftTotalNanoton;
  const parts: string[] = [];
  if (hasTon) parts.push(`${amountTon} TON`);
  if (hasGifts) {
    parts.push(
      giftCount === 1 && giftName ? giftName : pluralizeGifts(giftCount),
    );
  }

  return (
    <span className="mt-0.5 flex min-w-0 flex-col gap-0.5">
      <span className="text-[15px] font-semibold tabular-nums text-foreground">
        <TonAmount amount={formatTON(totalNanoton)} iconSize="sm" />
      </span>
      {hasTon && hasGifts ? (
        <span className="truncate text-[11px] font-medium text-muted">
          {parts.join(" · ")}
        </span>
      ) : hasGifts && giftCount === 1 && giftName ? (
        <span className="truncate text-[11px] font-medium text-muted">{giftName}</span>
      ) : null}
    </span>
  );
}

function SummaryThumb({
  hasTon,
  hasGifts,
  gifts,
  giftCount,
  combined,
  mode,
}: {
  hasTon: boolean;
  hasGifts: boolean;
  gifts: { id: string; collection_slug: string; image_url?: string }[];
  giftCount: number;
  combined: boolean;
  mode: BetFundingMode;
}) {
  // Mixed stake or several gifts → abstract mark, not a cramped collage.
  if (hasGifts && (giftCount > 1 || (combined && hasTon))) {
    return (
      <>
        {hasTon ? (
          <TonIcon variant="brand" className="h-6 w-6" title="TON" />
        ) : (
          <Gift className="h-5 w-5 text-foreground/80" />
        )}
        {giftCount > 0 ? (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-foreground ring-2 ring-surface-raised">
            {hasTon ? `+${giftCount}` : giftCount}
          </span>
        ) : null}
      </>
    );
  }

  if (hasGifts && gifts[0]) {
    return (
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={giftImageUrl(gifts[0].collection_slug, gifts[0].image_url)}
          alt=""
          className="h-full w-full object-contain p-0.5"
        />
      </span>
    );
  }

  if (hasTon || (!combined && mode === "balance")) {
    return <TonIcon variant="brand" className="h-6 w-6" title="TON" />;
  }

  return <Gift className="h-5 w-5 text-muted" />;
}
