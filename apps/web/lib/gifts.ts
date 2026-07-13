const FRAGMENT_GIFT_PREFIX = "https://nft.fragment.com/gift/";
const PROXY_GIFT_PREFIX = "/static/gifts/";

function giftSlugFromSources(slug: string, imageUrl?: string): string {
  if (imageUrl?.startsWith(FRAGMENT_GIFT_PREFIX)) {
    return imageUrl.slice(FRAGMENT_GIFT_PREFIX.length).replace(/\.medium\.jpg$/i, "");
  }
  if (imageUrl?.startsWith(PROXY_GIFT_PREFIX)) {
    return imageUrl.slice(PROXY_GIFT_PREFIX.length).replace(/\.medium\.jpg$/i, "");
  }
  return slug;
}

export function giftImageUrl(slug: string, imageUrl?: string): string {
  if (
    imageUrl &&
    !imageUrl.includes("nft.fragment.com") &&
    !imageUrl.startsWith(PROXY_GIFT_PREFIX)
  ) {
    return imageUrl;
  }
  const giftSlug = giftSlugFromSources(slug, imageUrl);
  return `${PROXY_GIFT_PREFIX}${giftSlug.toLowerCase()}.medium.jpg`;
}

export function giftImageUrlFromURL(imageUrl?: string): string {
  if (!imageUrl) return "";
  return giftImageUrl("", imageUrl);
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
