export const PROMO_REQUIRED_CHANNEL =
  process.env.NEXT_PUBLIC_PROMO_REQUIRED_CHANNEL?.trim() || "";

function normalizeChannelRef(channel: string): string {
  return channel.trim();
}

/** Prefer t.me — Telegram Mini Apps openTelegramLink rejects t.me. */
function toTmeUrl(pathOrUrl: string): string {
  const value = pathOrUrl.trim();
  if (!value) return "";
  if (value.startsWith("https://t.me/")) return value.replace(/\/$/, "");
  if (value.startsWith("http://t.me/")) {
    return `https://t.me/${value.slice("http://t.me/".length)}`.replace(/\/$/, "");
  }
  if (value.startsWith("https://t.me/")) {
    return `https://t.me/${value.slice("https://t.me/".length)}`.replace(/\/$/, "");
  }
  if (value.startsWith("http://t.me/")) {
    return `https://t.me/${value.slice("http://t.me/".length)}`.replace(/\/$/, "");
  }
  return "";
}

export function promoChannelMention(channel = PROMO_REQUIRED_CHANNEL): string {
  const value = normalizeChannelRef(channel);
  if (!value) return "";
  if (value.startsWith("@")) return value;
  const fromUrl = toTmeUrl(value);
  if (fromUrl) {
    const slug = fromUrl.replace("https://t.me/", "").replace(/\/$/, "");
    return slug && !slug.startsWith("+") ? `@${slug}` : "";
  }
  if (value.startsWith("-")) return value;
  return `@${value}`;
}

export function promoChannelUrl(channel = PROMO_REQUIRED_CHANNEL): string {
  const value = normalizeChannelRef(channel);
  if (!value) return "";
  const fromUrl = toTmeUrl(value);
  if (fromUrl) return fromUrl;
  // Private channel numeric id — no public t.me slug.
  if (value.startsWith("-")) return "";
  const slug = value.replace(/^@/, "");
  return slug ? `https://t.me/${slug}` : "";
}

export function promoChannelRequired(): boolean {
  return PROMO_REQUIRED_CHANNEL.length > 0;
}
