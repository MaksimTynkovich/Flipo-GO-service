"use client";

import { useState, type ReactNode } from "react";
import { formatTON, ProfileGift } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatCollectionSlug, giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";
import { Check, Gift } from "lucide-react";

type Props = {
  gift: ProfileGift;
  selected?: boolean;
  onToggle?: (slug: string) => void;
  onInspect?: (gift: ProfileGift) => void;
};

function GiftTileImage({
  imageSrc,
  name,
  imgError,
  onError,
  overlay,
}: {
  imageSrc: string;
  name: string;
  imgError: boolean;
  onError: () => void;
  overlay?: ReactNode;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-raised">
      {!imgError ? (
        <img
          src={imageSrc}
          alt={name}
          loading="lazy"
          className="h-full w-full rounded-[20px] object-contain p-2"
          onError={onError}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Gift className="h-6 w-6 text-muted/50" />
        </div>
      )}
      {overlay}
    </div>
  );
}

function GiftTileMeta({
  name,
  collection,
  children,
}: {
  name: string;
  collection: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="truncate text-xs font-semibold leading-tight">{name}</p>
      <p className="truncate text-[10px] capitalize text-muted">{collection}</p>
      {children}
    </div>
  );
}

export function GiftTile({ gift, selected, onToggle, onInspect }: Props) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = giftImageUrl(gift.slug, gift.image_url);
  const collection = formatCollectionSlug(gift.collection_slug);

  if (gift.is_staked) {
    return (
      <button
        type="button"
        onClick={() => onInspect?.(gift)}
        className="app-control interactive-card panel flex w-full flex-col gap-2 p-2 text-left"
      >
        <GiftTileImage
          imageSrc={imageSrc}
          name={gift.name}
          imgError={imgError}
          onError={() => setImgError(true)}
          overlay={
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success" />
          }
        />
        <GiftTileMeta name={gift.name} collection={collection}>
          <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-surface-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-success">
            +{formatTON(gift.earned_nanoton)}
          </span>
        </GiftTileMeta>
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
        "app-control interactive-card panel flex w-full flex-col gap-2 p-2 text-left",
        isSelectable && selected && "ring-1 ring-inset ring-accent/50 bg-accent/5",
        isSelectable && !selected && "opacity-90",
      )}
    >
      <GiftTileImage
        imageSrc={imageSrc}
        name={gift.name}
        imgError={imgError}
        onError={() => setImgError(true)}
        overlay={
          isSelectable &&
          selected && (
            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )
        }
      />
      <GiftTileMeta name={gift.name} collection={collection}>
        <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-surface-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
          {formatTON(gift.price_nanoton)}
          <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
        </span>
      </GiftTileMeta>
    </button>
  );
}

export function GiftTileSkeleton() {
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
