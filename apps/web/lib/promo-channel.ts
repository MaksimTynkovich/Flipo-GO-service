export const PROMO_REQUIRED_CHANNEL =
  process.env.NEXT_PUBLIC_PROMO_REQUIRED_CHANNEL?.trim() || "";

function normalizeChannelRef(channel: string): string {
  return channel.trim();
}

export function promoChannelMention(channel = PROMO_REQUIRED_CHANNEL): string {
  const value = normalizeChannelRef(channel);
  if (!value) return "";
  if (value.startsWith("@")) return value;
  if (value.startsWith("https://t.me/")) {
    const slug = value.replace("https://t.me/", "").replace(/\/$/, "");
    return slug ? `@${slug}` : "";
  }
  if (value.startsWith("-")) return value;
  return `@${value}`;
}

export function promoChannelUrl(channel = PROMO_REQUIRED_CHANNEL): string {
  const value = normalizeChannelRef(channel);
  if (!value) return "";
  if (value.startsWith("https://t.me/")) return value.replace(/\/$/, "");
  if (value.startsWith("-")) return "";
  const slug = value.replace(/^@/, "");
  return slug ? `https://t.me/${slug}` : "";
}

export function promoChannelRequired(): boolean {
  return PROMO_REQUIRED_CHANNEL.length > 0;
}
