"use client";

import { useState } from "react";
import { formatTON, ProfileGift } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";
import { Check, Gift } from "lucide-react";

type Props = {
  gift: ProfileGift;
  selected?: boolean;
  onToggle?: (slug: string) => void;
  onInspect?: (gift: ProfileGift) => void;
};

export function GiftTile({ gift, selected, onToggle, onInspect }: Props) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = giftImageUrl(gift.slug, gift.image_url);

  if (gift.is_staked) {
    return (
      <button
        type="button"
        onClick={() => onInspect?.(gift)}
        className="gift-card app-control"
      >
        <div className="gift-card__media">
          {!imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt={gift.name}
              loading="lazy"
              className="gift-card__img"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="gift-card__fallback">
              <Gift className="h-5 w-5 text-muted/40" strokeWidth={1.5} />
            </div>
          )}
          <span className="gift-card__dot" aria-hidden />
        </div>
        <div className="gift-card__meta">
          <p className="gift-card__title">{gift.name}</p>
          <span className="gift-card__price gift-card__price--success">
            +{formatTON(gift.earned_nanoton)}
          </span>
        </div>
      </button>
    );
  }

  const isSelectable = !!onToggle;

  return (
    <button
      type="button"
      onClick={() => isSelectable && onToggle?.(gift.slug)}
      disabled={!isSelectable}
      className={cn(
        "gift-card app-control",
        isSelectable && !selected && "gift-card--dimmed",
      )}
    >
      <div className="gift-card__media">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={gift.name}
            loading="lazy"
            className="gift-card__img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="gift-card__fallback">
            <Gift className="h-5 w-5 text-muted/40" strokeWidth={1.5} />
          </div>
        )}
        {isSelectable && selected ? (
          <span className="gift-card__check">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : null}
      </div>
      <div className="gift-card__meta">
        <p className="gift-card__title">{gift.name}</p>
        <span className="gift-card__price">
          {formatTON(gift.price_nanoton)}
          <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
        </span>
      </div>
    </button>
  );
}

export function GiftTileSkeleton() {
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
