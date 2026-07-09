"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Copy, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTON, InventoryItem, MarketListing } from "@/lib/api";
import { depositBotMention, depositBotTelegramUrl } from "@/lib/bot";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatCollectionSlug, giftImageUrl, giftValuationNanoton, traitValue } from "@/lib/gifts";
import { inventoryItemSlug } from "@/components/inventory/InventoryGiftCard";
import { ModalOverlay } from "@/components/ui/ModalOverlay";

type Props = {
  item: InventoryItem;
  marketListing?: MarketListing;
  listError: string | null;
  liquidating: boolean;
  withdrawing: boolean;
  onClose: () => void;
  onLiquidate: () => void;
  onWithdraw: () => void;
  onCancelListing: () => void;
};

function TraitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 sm:py-3.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="truncate text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function InventoryGiftDetailSheet({
  item,
  marketListing,
  listError,
  liquidating,
  withdrawing,
  onClose,
  onLiquidate,
  onWithdraw,
  onCancelListing,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWithdrawHint, setShowWithdrawHint] = useState(false);

  const imageSrc = giftImageUrl(inventoryItemSlug(item), item.image_url);
  const valuation = giftValuationNanoton(item);
  const displayPrice = marketListing?.price_nanoton ?? valuation;

  useEffect(() => {
    setImgError(false);
    setCopied(false);
    setShowWithdrawHint(false);
  }, [item.id]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(item.name);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <ModalOverlay onClose={onClose} analyticsModalId="inventory_gift_detail">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Подарок в инвентаре"
        className="relative mx-auto flex w-full max-w-lg max-h-[min(92dvh,100%)] flex-col rounded-t-[1.75rem] bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
      >
        <div className="shrink-0 px-4 pt-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />

          <div className="relative flex items-center justify-center pb-2">
            <p className="text-[15px] font-semibold text-foreground">Подарок</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised text-muted transition-opacity active:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
          <div className="relative mx-auto mb-3 flex size-[min(100%,240px,34dvh)] max-w-full items-center justify-center">
            {!imgError ? (
              <img
                src={imageSrc}
                alt={item.name}
                className="h-full w-full rounded-[20px] object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <Gift className="h-14 w-14 text-muted/50" />
            )}
          </div>

          <div className="mb-3 flex items-start justify-between gap-3 px-3">
            <div className="flex min-w-0 items-start gap-1.5">
              <p className="min-w-0 text-[17px] font-semibold leading-tight">{item.name}</p>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Скопировать название"
                className="mt-0.5 shrink-0 text-muted transition-colors active:text-accent"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-raised px-2.5 py-1 text-[15px] font-semibold tabular-nums text-foreground">
              {formatTON(displayPrice)}
              <TonIcon variant="brand" className="h-4 w-4 shrink-0" />
            </span>
          </div>

          {copied && <p className="mb-2 text-xs text-accent">Скопировано</p>}

          <div className="mb-3 divide-y divide-[var(--border)] rounded-2xl bg-surface-raised/60 px-4">
            <TraitRow label="Коллекция" value={formatCollectionSlug(item.collection_slug)} />
            <TraitRow label="Узор" value={traitValue(item.backdrop)} />
            <TraitRow label="Символ" value={traitValue(item.symbol)} />
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          {listError && <p className="mb-3 text-center text-sm text-danger">{listError}</p>}

          {item.status === "available" && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowWithdrawHint((value) => !value)}
                aria-expanded={showWithdrawHint}
                className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors active:text-foreground"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-raised text-[10px] font-semibold">
                  i
                </span>
                Как вывести подарок?
              </button>

              {showWithdrawHint && (
                <div className="mt-2 rounded-2xl bg-surface-raised/60 px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-muted">
                    Перед выводом отправьте боту {depositBotMention()} любое сообщение — без этого Telegram не
                    сможет доставить подарок обратно вам.
                  </p>
                  <a
                    href={depositBotTelegramUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent"
                  >
                    Открыть {depositBotMention()}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {item.status === "available" && (
            <div className="mb-1 flex items-start justify-between gap-3">
              <Button
                className="h-12 min-w-0 flex-1 rounded-2xl px-2 text-[14px] font-semibold sm:text-[15px]"
                disabled={liquidating || withdrawing}
                onClick={onLiquidate}
              >
                {liquidating ? (
                  "Продажа…"
                ) : (
                  <span className="inline-flex items-center justify-center gap-1">
                    Продать
                  </span>
                )}
              </Button>

              <Button
                className="h-12 min-w-0 flex-1 rounded-2xl px-2 text-[14px] font-semibold sm:text-[15px]"
                variant="outline"
                disabled={liquidating || withdrawing}
                onClick={onWithdraw}
              >
                {withdrawing ? "Вывод…" : "Вывести"}
              </Button>
            </div>
          )}

          {item.status === "locked" && marketListing && (
            <Button
              className="h-12 w-full rounded-2xl text-[15px] font-semibold"
              variant="outline"
              onClick={onCancelListing}
            >
              Снять с маркета
            </Button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
