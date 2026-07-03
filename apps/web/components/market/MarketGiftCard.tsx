"use client";

import { useState } from "react";
import { formatTON, MarketListing } from "@/lib/api";
import { giftGradient, giftImageUrl } from "@/lib/gifts";
import { Gift } from "lucide-react";

type Props = {
  listing: MarketListing;
  onClick?: (listing: MarketListing) => void;
};

export function MarketGiftCard({ listing, onClick }: Props) {
  const [imgError, setImgError] = useState(false);
  const slug = `${listing.item.collection_slug}-${listing.item.sub_name?.replace("#", "") || ""}`;
  const imageSrc = giftImageUrl(slug, listing.item.image_url);
  const gradient = giftGradient(listing.item.collection_slug || listing.id);

  return (
    <button
      type="button"
      onClick={() => onClick?.(listing)}
      className="group relative w-full touch-manipulation overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.97]"
    >
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-2xl ring-1 ring-white/5"
        style={{ background: gradient }}
      >
        {/* Hex pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 45%, rgba(255,255,255,0.15) 0%, transparent 55%)`,
          }}
        />

        {listing.item.condition && (
          <span className="absolute left-2.5 top-2.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
            {listing.item.condition}
          </span>
        )}

        <span className="absolute right-2.5 top-2.5 text-sm font-bold tabular-nums text-white">
          {formatTON(listing.price_nanoton)}
          <span className="ml-0.5 text-[10px] font-medium text-white/70">TON</span>
        </span>

        <div className="absolute inset-x-0 top-[18%] flex justify-center px-4">
          {!imgError ? (
            <img
              src={imageSrc}
              alt={listing.item.name}
              loading="lazy"
              className="max-h-[55%] w-auto max-w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-black/20">
              <Gift className="h-8 w-8 text-white/40" />
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-3 pt-10">
          <p className="truncate text-sm font-bold text-white">{listing.item.name}</p>
          {listing.item.sub_name && (
            <p className="truncate text-xs text-white/55">{listing.item.sub_name}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export function MarketGiftCardSkeleton() {
  return <div className="aspect-[4/5] animate-pulse rounded-2xl bg-surface-raised" />;
}
