"use client";

import { useState } from "react";
import { formatTON, ProfileGift } from "@/lib/api";
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
        className="panel relative w-full touch-manipulation overflow-hidden p-1.5 text-left transition-opacity active:opacity-80"
      >
        <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-raised">
          {!imgError ? (
            <img
              src={imageSrc}
              alt={gift.name}
              loading="lazy"
              className="h-full w-full rounded-[14px] object-contain p-1"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Gift className="h-6 w-6 text-muted/50" />
            </div>
          )}
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success shadow-[0_0_8px_var(--success)]" />
        </div>
        <div className="mt-1.5 min-w-0 px-0.5">
          <p className="truncate text-[10px] font-medium leading-tight">{gift.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-success">
            +{formatTON(gift.earned_nanoton)}
          </p>
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
        "panel relative w-full touch-manipulation overflow-hidden p-1.5 text-left transition-all active:scale-[0.98]",
        isSelectable && selected && "ring-2 ring-accent",
        isSelectable && !selected && "opacity-80",
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-raised">
        {!imgError ? (
          <img
            src={imageSrc}
            alt={gift.name}
            loading="lazy"
            className="h-full w-full rounded-[14px] object-contain p-1"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gift className="h-6 w-6 text-muted/50" />
          </div>
        )}
        {isSelectable && selected && (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-surface shadow-sm">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="mt-1.5 min-w-0 px-0.5">
        <p className="truncate text-[10px] font-medium leading-tight">{gift.name}</p>
        <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-muted">
          {formatTON(gift.price_nanoton)}
        </p>
      </div>
    </button>
  );
}

export function GiftTileSkeleton() {
  return (
    <div className="panel space-y-1.5 p-1.5">
      <div className="aspect-square animate-pulse rounded-xl bg-surface-raised" />
      <div className="space-y-1 px-0.5">
        <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface-raised" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
      </div>
    </div>
  );
}
