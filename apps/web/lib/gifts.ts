export function giftImageUrl(slug: string, imageUrl?: string): string {
  if (imageUrl) return imageUrl;
  return `https://nft.fragment.com/gift/${slug}.medium.jpg`;
}

export function giftGradient(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 45% 28%) 0%, hsl(${(hue + 40) % 360} 35% 18%) 100%)`;
}

/** Stake / game valuation — prefers admin valuation, then buyback, then floor. */
export function giftValuationNanoton(item: {
  valuation_nanoton?: number;
  buyback_price_nanoton?: number;
  floor_price_nanoton: number;
}): number {
  if (item.valuation_nanoton && item.valuation_nanoton > 0) {
    return item.valuation_nanoton;
  }
  if (item.buyback_price_nanoton && item.buyback_price_nanoton > 0) {
    return item.buyback_price_nanoton;
  }
  if (item.floor_price_nanoton <= 0) return 0;
  return item.floor_price_nanoton;
}

/** Platform buy price for liquidate. */
export function giftBuyPriceNanoton(item: {
  buyback_price_nanoton?: number;
  floor_price_nanoton: number;
}): number {
  if (item.buyback_price_nanoton && item.buyback_price_nanoton > 0) {
    return item.buyback_price_nanoton;
  }
  if (item.floor_price_nanoton <= 0) return 0;
  return item.floor_price_nanoton;
}

export function formatCollectionSlug(slug: string): string {
  return slug.replace(/-/g, " ");
}

export function traitValue(value?: string): string {
  return value?.trim() || "—";
}
