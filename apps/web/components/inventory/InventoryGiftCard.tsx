"use client";

import { useState } from "react";
import { formatTON, InventoryItem } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { giftBuyPriceNanoton, giftImageUrl } from "@/lib/gifts";
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
  const price = listingPrice ?? giftBuyPriceNanoton(item);
  const statusLabel = STATUS_LABEL[item.status];

  return (
    <button
      type="button"
      onClick={() => onClick?.(item)}
      className="gift-card app-control"
    >
      <div className="gift-card__media">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={item.name}
            loading="lazy"
            className="gift-card__img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="gift-card__fallback">
            <Gift className="h-5 w-5 text-muted/40" strokeWidth={1.5} />
          </div>
        )}
        {statusLabel ? <span className="gift-card__badge">{statusLabel}</span> : null}
      </div>

      <div className="gift-card__meta">
        <p className="gift-card__title">{item.name}</p>
        <span className="gift-card__price">
          {formatTON(price)}
          <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
        </span>
      </div>
    </button>
  );
}

export function InventoryGiftCardSkeleton() {
  return (
    <div className="gift-card gift-card--skeleton">
      <div className="gift-card__media gift-card__media--pulse" />
      <div className="gift-card__meta">
        <div className="gift-card__skel gift-card__skel--title" />
        <div className="gift-card__skel gift-card__skel--price" />
      </div>
    </div>
  );
}
