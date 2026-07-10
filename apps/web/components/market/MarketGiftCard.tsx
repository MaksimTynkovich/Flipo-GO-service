"use client";

import { useState } from "react";
import { formatTON, MarketListing } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatCollectionSlug, giftImageUrl } from "@/lib/gifts";
import { Gift } from "lucide-react";

type Props = {
  listing: MarketListing;
  onClick?: (listing: MarketListing) => void;
};

function displayTitle(item: MarketListing["item"]) {
  if (item.sub_name) {
    return `${item.name} ${item.sub_name}`;
  }
  return item.name;
}

export function MarketGiftCard({ listing, onClick }: Props) {
  const [imgError, setImgError] = useState(false);
  const slug = `${listing.item.collection_slug}-${listing.item.sub_name?.replace("#", "") || ""}`;
  const imageSrc = giftImageUrl(slug, listing.item.image_url);
  const collection = formatCollectionSlug(listing.item.collection_slug);
  const title = displayTitle(listing.item);

  return (
    <button
      type="button"
      onClick={() => onClick?.(listing)}
      className="app-control interactive-card panel flex flex-col gap-2 p-2 text-left"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-raised">
        {!imgError ? (
          <img
            src={imageSrc}
            alt={title}
            loading="lazy"
            className="h-full w-full rounded-[20px] object-contain p-2"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gift className="h-6 w-6 text-muted/50" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-1">
        <p className="truncate text-xs font-semibold leading-tight">{title}</p>
        <p className="truncate text-[10px] capitalize text-muted">{collection}</p>
        <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-surface-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
          {formatTON(listing.price_nanoton)}
          <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
        </span>
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
        <div className="h-2.5 w-1/2 animate-pulse rounded-md bg-surface-raised" />
        <div className="h-5 w-14 animate-pulse rounded-lg bg-surface-raised" />
      </div>
    </div>
  );
}
