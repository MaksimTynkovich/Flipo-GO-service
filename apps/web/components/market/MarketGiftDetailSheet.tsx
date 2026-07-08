"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { formatTON, MarketListing } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatCollectionSlug, giftImageUrl, traitValue } from "@/lib/gifts";

type Props = {
  listing: MarketListing;
  buying: boolean;
  error: string | null;
  canBuy: boolean;
  isOwnListing: boolean;
  isLoggedIn: boolean;
  insufficientFunds: boolean;
  promoRestricted?: boolean;
  onClose: () => void;
  onBuy: () => void;
};

function displayTitle(item: MarketListing["item"]) {
  if (item.sub_name) {
    return `${item.name} ${item.sub_name}`;
  }
  return item.name;
}

function TraitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 sm:py-3.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="truncate text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function MarketGiftDetailSheet({
  listing,
  buying,
  error,
  canBuy,
  isOwnListing,
  isLoggedIn,
  insufficientFunds,
  promoRestricted = false,
  onClose,
  onBuy,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);

  const slug = `${listing.item.collection_slug}-${listing.item.sub_name?.replace("#", "") || ""}`;
  const imageSrc = giftImageUrl(slug, listing.item.image_url);
  const title = displayTitle(listing.item);

  useEffect(() => {
    setImgError(false);
    setCopied(false);
  }, [listing.id]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(title);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Покупка подарка"
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
                alt={listing.item.name}
                className="h-full w-full rounded-[20px] object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <Gift className="h-14 w-14 text-muted/50" />
            )}
          </div>

          <div className="mb-3 flex items-start justify-between gap-3 px-3">
            <div className="flex min-w-0 items-start gap-1.5">
              <p className="min-w-0 text-[17px] font-semibold leading-tight">{title}</p>
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
              {formatTON(listing.price_nanoton)}
              <TonIcon variant="brand" className="h-4 w-4 shrink-0" />
            </span>
          </div>

          {copied && <p className="mb-2 text-xs text-accent">Скопировано</p>}

          <div className="mb-3 divide-y divide-[var(--border)] rounded-2xl bg-surface-raised/60 px-4">
            <TraitRow label="Коллекция" value={formatCollectionSlug(listing.item.collection_slug)} />
            <TraitRow label="Узор" value={traitValue(listing.item.backdrop)} />
            <TraitRow label="Символ" value={traitValue(listing.item.symbol)} />
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

          {!isLoggedIn ? (
            <p className="py-2 text-center text-sm text-muted">Войдите, чтобы купить</p>
          ) : isOwnListing ? (
            <p className="py-2 text-center text-sm text-muted">Это ваш лот</p>
          ) : (
            <Button
              className="h-12 w-full rounded-2xl text-[15px] font-semibold"
              disabled={!canBuy || buying}
              onClick={onBuy}
            >
              {buying
                ? "Покупка…"
                : promoRestricted
                  ? "Бонус нельзя тратить"
                  : insufficientFunds
                    ? "Недостаточно средств"
                    : (
                      <span className="inline-flex items-center justify-center gap-1">
                        Купить · {formatTON(listing.price_nanoton)}
                        <TonIcon variant="brand" className="h-5 w-5" />
                      </span>
                    )}
            </Button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
