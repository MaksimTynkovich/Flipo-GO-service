"use client";

import { useState } from "react";
import { formatTON, MarketListing } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { Gift } from "lucide-react";

type Props = {
  listing: MarketListing;
  onClick?: (listing: MarketListing) => void;
};

export function MarketGiftCard({ listing, onClick }: Props) {
  const [imgError, setImgError] = useState(false);
  const slug = `${listing.item.collection_slug}-${listing.item.sub_name?.replace("#", "") || ""}`;
  const imageSrc = giftImageUrl(slug, listing.item.image_url);

  return (
    <button
      type="button"
      onClick={() => onClick?.(listing)}
      className="panel flex flex-col gap-2 p-2 text-left transition-opacity active:opacity-80"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-raised">
        {!imgError ? (
          <img
            src={imageSrc}
            alt={listing.item.name}
            loading="lazy"
            className="h-full w-full object-contain p-2"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gift className="h-6 w-6 text-muted/50" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-xs font-semibold leading-tight">{listing.item.name}</p>
        <p className="text-[13px] font-semibold tabular-nums text-accent">
          {formatTON(listing.price_nanoton)}
          <span className="ml-0.5 text-[9px] font-medium text-muted">TON</span>
        </p>
      </div>
    </button>
  );
}

export function MarketGiftCardSkeleton() {
  return (
    <div className="panel space-y-2 p-2">
      <div className="aspect-square animate-pulse rounded-xl bg-surface-raised" />
      <div className="space-y-1">
        <div className="h-3 w-3/4 animate-pulse rounded-md bg-surface-raised" />
        <div className="h-3.5 w-1/2 animate-pulse rounded-md bg-surface-raised" />
      </div>
    </div>
  );
}
