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

const BUYBACK_HAIRCUT = 0.12;

export function giftValuationNanoton(item: {
  buyback_price_nanoton?: number;
  floor_price_nanoton: number;
}): number {
  if (item.buyback_price_nanoton && item.buyback_price_nanoton > 0) {
    return item.buyback_price_nanoton;
  }
  if (item.floor_price_nanoton <= 0) return 0;
  return Math.round(item.floor_price_nanoton * (1 - BUYBACK_HAIRCUT));
}

export function formatCollectionSlug(slug: string): string {
  return slug.replace(/-/g, " ");
}

export function traitValue(value?: string): string {
  return value?.trim() || "—";
}
