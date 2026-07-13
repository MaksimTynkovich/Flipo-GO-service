"use client";

import { Gift } from "lucide-react";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON, BetGiftView } from "@/lib/api";
import { giftImageUrlFromURL } from "@/lib/gifts";

type Props = {
  amountNanoton: number;
  fundingType?: string;
  gift?: BetGiftView | null;
  iconSize?: "xs" | "sm";
  className?: string;
};

const iconSizes = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
} as const;

export function BetStakeLabel({
  amountNanoton,
  fundingType,
  gift,
  iconSize = "xs",
  className,
}: Props) {
  const isGift = fundingType === "gift" || !!gift;
  const sizeClass = iconSizes[iconSize];

  if (isGift && gift?.image_url) {
    return (
      <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
        <span
          className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded bg-surface`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={giftImageUrlFromURL(gift.image_url)} alt="" className="h-full w-full object-cover" />
        </span>
        <TonAmount amount={formatTON(amountNanoton)} iconSize={iconSize} />
      </span>
    );
  }

  if (isGift) {
    return (
      <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
        <Gift className={`${sizeClass} text-muted`} />
        <TonAmount amount={formatTON(amountNanoton)} iconSize={iconSize} />
      </span>
    );
  }

  return <TonAmount amount={formatTON(amountNanoton)} iconSize={iconSize} className={className} />;
}

export function GiftStakeIcons({
  gifts,
  size = "sm",
  amountNanoton,
}: {
  gifts: BetGiftView[];
  size?: "xs" | "sm";
  amountNanoton?: number;
}) {
  const sizeClass = iconSizes[size];
  if (gifts.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {gifts.map((gift) => (
        <span
          key={gift.id}
          className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded bg-surface`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={giftImageUrlFromURL(gift.image_url)} alt="" className="h-full w-full object-cover" />
        </span>
      ))}
      {amountNanoton != null && amountNanoton > 0 && (
        <TonAmount amount={formatTON(amountNanoton)} iconSize={size} />
      )}
    </span>
  );
}
