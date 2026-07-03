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
