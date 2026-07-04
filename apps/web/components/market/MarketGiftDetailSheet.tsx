"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTON, MarketListing } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";

type Props = {
  listing: MarketListing;
  buying: boolean;
  error: string | null;
  canBuy: boolean;
  isOwnListing: boolean;
  isLoggedIn: boolean;
  insufficientFunds: boolean;
  onClose: () => void;
  onBuy: () => void;
};

function traitValue(value?: string) {
  return value?.trim() || "—";
}

function displayTitle(item: MarketListing["item"]) {
  if (item.sub_name) {
    return `${item.name} ${item.sub_name}`;
  }
  return item.name;
}

function TraitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
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
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/55 backdrop-blur-sm">
      <button type="button" aria-label="Закрыть" className="absolute inset-0" onClick={onClose} />

      <div className="relative mx-auto w-full max-w-lg rounded-t-[1.75rem] bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />

        <div className="relative mb-4 flex items-center justify-center">
          <p className="text-[15px] font-semibold text-foreground">Подарок</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-muted transition-opacity active:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mb-4 flex aspect-square items-center justify-center overflow-hidden rounded-[1.25rem]">
          {!imgError ? (
            <img
              src={imageSrc}
              alt={listing.item.name}
              className="max-h-full max-w-full object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <Gift className="h-14 w-14 text-muted/50" />
          )}
        </div>

        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-1.5">
            <p className="min-w-0 truncate text-[17px] font-semibold leading-tight">{title}</p>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Скопировать название"
              className="mt-0.5 shrink-0 text-muted transition-colors active:text-accent"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="shrink-0 text-[17px] font-semibold tabular-nums text-accent">
            {formatTON(listing.price_nanoton)}
            <span className="ml-1 text-xs font-medium text-muted">TON</span>
          </p>
        </div>

        {copied && <p className="mb-2 text-xs text-accent">Скопировано</p>}

        <div className="mb-5 divide-y divide-[var(--border)] rounded-2xl bg-surface-raised/60 px-4">
          <TraitRow label="Model" value={traitValue(listing.item.model)} />
          <TraitRow label="Symbol" value={traitValue(listing.item.symbol)} />
          <TraitRow label="Backdrop" value={traitValue(listing.item.backdrop)} />
        </div>

        {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

        {!isLoggedIn ? (
          <p className="py-2 text-center text-sm text-muted">Войдите, чтобы купить</p>
        ) : isOwnListing ? (
          <p className="py-2 text-center text-sm text-muted">Это ваш лот</p>
        ) : (
          <Button
            className={cn("h-12 w-full rounded-2xl text-[15px] font-semibold")}
            variant="accent"
            disabled={!canBuy || buying}
            onClick={onBuy}
          >
            {buying
              ? "Покупка…"
              : insufficientFunds
                ? "Недостаточно средств"
                : `Купить · ${formatTON(listing.price_nanoton)} TON`}
          </Button>
        )}
      </div>
    </div>
  );
}
