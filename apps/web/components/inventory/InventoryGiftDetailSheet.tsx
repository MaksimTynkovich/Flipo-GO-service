"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTON, InventoryItem, MarketListing } from "@/lib/api";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { giftImageUrl } from "@/lib/gifts";
import { inventoryItemSlug } from "@/components/inventory/InventoryGiftCard";
import { cn } from "@/lib/utils";

type Props = {
  item: InventoryItem;
  marketListing?: MarketListing;
  listPrice: string;
  listError: string | null;
  isListing: boolean;
  liquidating: boolean;
  onListPriceChange: (value: string) => void;
  onClose: () => void;
  onList: () => void;
  onLiquidate: () => void;
  onCancelListing: () => void;
};

function statusLabel(status: string): string {
  if (status === "locked") return "На маркете";
  if (status === "staked") return "В стейке";
  if (status === "available") return "Доступен";
  return status;
}

export function InventoryGiftDetailSheet({
  item,
  marketListing,
  listPrice,
  listError,
  isListing,
  liquidating,
  onListPriceChange,
  onClose,
  onList,
  onLiquidate,
  onCancelListing,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);

  const imageSrc = giftImageUrl(inventoryItemSlug(item), item.image_url);
  const displayPrice = marketListing?.price_nanoton ?? item.floor_price_nanoton;

  useEffect(() => {
    setImgError(false);
    setCopied(false);
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

        <div className="relative mx-auto mb-4 flex aspect-square max-w-[240px] items-center justify-center">
          {!imgError ? (
            <img
              src={imageSrc}
              alt={item.name}
              className="max-h-full max-w-full rounded-[20px] object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <Gift className="h-14 w-14 text-muted/50" />
          )}
        </div>

        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-1.5">
            <p className="min-w-0 truncate text-[17px] font-semibold leading-tight">{item.name}</p>
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
            <TonAmount amount={formatTON(displayPrice)} variant="brand" iconClassName="h-7 w-7" />
          </p>
        </div>

        {copied && <p className="mb-2 text-xs text-accent">Скопировано</p>}

        <div className="mb-5 divide-y divide-[var(--border)] rounded-2xl bg-surface-raised/60 px-4">
          <div className="flex items-center justify-between gap-4 py-3.5">
            <span className="text-sm text-muted">Статус</span>
            <span className="text-sm font-medium">{statusLabel(item.status)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3.5">
            <span className="text-sm text-muted">Коллекция</span>
            <span className="truncate text-right text-sm font-medium">{item.collection_slug}</span>
          </div>
          {!marketListing && (
            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="text-sm text-muted">Floor</span>
              <span className="text-sm font-medium tabular-nums">
                <TonAmount amount={formatTON(item.floor_price_nanoton)} variant="brand" iconClassName="h-5 w-5" />
              </span>
            </div>
          )}
        </div>

        {listError && <p className="mb-3 text-center text-sm text-danger">{listError}</p>}

        {item.status === "available" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="section-label inline-flex items-center gap-1">
                Цена на маркете (<TonIcon variant="brand" className="h-4 w-4" />)
              </label>
              <input
                className="input-field"
                type="text"
                inputMode="decimal"
                placeholder={formatTON(item.floor_price_nanoton)}
                value={listPrice}
                onChange={(e) => onListPriceChange(e.target.value)}
              />
            </div>
            <Button
              className={cn("h-12 w-full rounded-2xl text-[15px] font-semibold")}
              variant="accent"
              disabled={isListing}
              onClick={onList}
            >
              {isListing ? "Выставляем…" : "Выставить на маркет"}
            </Button>
            <Button
              className="h-12 w-full rounded-2xl text-[15px] font-semibold"
              variant="outline"
              disabled={liquidating}
              onClick={onLiquidate}
            >
              {liquidating ? "Продажа…" : "Продать боту"}
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
  );
}
