"use client";

import { useState } from "react";
import { formatTON, InventoryItem } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatCollectionSlug, giftImageUrl, giftValuationNanoton } from "@/lib/gifts";
import { Gift } from "lucide-react";

export function inventoryItemSlug(item: InventoryItem): string {
  return item.telegram_gift_id || item.collection_slug;
}

type Props = {
  item: InventoryItem;
  listingPrice?: number;
  onClick?: (item: InventoryItem) => void;
};

const STATUS_LABEL: Record<string, string> = {
  locked: "На маркете",
};

export function InventoryGiftCard({ item, listingPrice, onClick }: Props) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = giftImageUrl(inventoryItemSlug(item), item.image_url);
  const price = listingPrice ?? giftValuationNanoton(item);
  const statusLabel = STATUS_LABEL[item.status];
  const collection = formatCollectionSlug(item.collection_slug);

  return (
    <button
      type="button"
      onClick={() => onClick?.(item)}
      className="panel flex flex-col gap-2 p-2 text-left transition-opacity active:opacity-80"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-raised">
        {!imgError ? (
          <img
            src={imageSrc}
            alt={item.name}
            loading="lazy"
            className="h-full w-full rounded-[20px] object-contain p-2"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gift className="h-6 w-6 text-muted/50" />
          </div>
        )}
        {statusLabel && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-accent/90 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
            {statusLabel}
          </span>
        )}
      </div>

      <div className="min-w-0 space-y-1">
        <p className="truncate text-xs font-semibold leading-tight">{item.name}</p>
        <p className="truncate text-[10px] capitalize text-muted">{collection}</p>
        <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-surface-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
          {formatTON(price)}
          <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
        </span>
      </div>
    </button>
  );
}

export function InventoryGiftCardSkeleton() {
  return (
    <div className="panel space-y-2 p-2">
      <div className="aspect-square animate-pulse rounded-xl bg-surface-raised" />
      <div className="space-y-1">
        <div className="h-3 w-3/4 animate-pulse rounded-md bg-surface-raised" />
        <div className="h-2.5 w-1/2 animate-pulse rounded-md bg-surface-raised" />
        <div className="h-5 w-14 animate-pulse rounded-lg bg-surface-raised" />
      </div>
    </div>
  );
}
