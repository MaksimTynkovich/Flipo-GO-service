"use client";

import { useState } from "react";
import { formatTON, MarketListing } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { giftImageUrl } from "@/lib/gifts";
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
  const title = displayTitle(listing.item);

  return (
    <button
      type="button"
      onClick={() => onClick?.(listing)}
      className="gift-card app-control"
    >
      <div className="gift-card__media">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={title}
            loading="lazy"
            className="gift-card__img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="gift-card__fallback">
            <Gift className="h-5 w-5 text-muted/40" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="gift-card__meta">
        <p className="gift-card__title">{title}</p>
        <span className="gift-card__price">
          {formatTON(listing.price_nanoton)}
          <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
        </span>
      </div>
    </button>
  );
}

export function MarketGiftCardSkeleton() {
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
