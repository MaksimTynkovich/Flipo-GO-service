/** Telegram bot that receives collectible gifts for inventory deposits. */
export const DEPOSIT_BOT_NAME = process.env.NEXT_PUBLIC_BOT_NAME?.replace(/^@/, "").trim() || "Flipo";
export const APP_BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace(/^@/, "") ||
  process.env.NEXT_PUBLIC_BOT_NAME?.replace(/^@/, "").trim() ||
  "flipoGameBot";
export const WEBAPP_SHORT_NAME =
  process.env.NEXT_PUBLIC_WEBAPP_SHORT_NAME?.replace(/^\//, "").trim() || "app";

export const DEPOSIT_BOT_USERNAME =
  process.env.NEXT_PUBLIC_GIFT_TRANSFER_BOT_USERNAME?.replace(/^@/, "") ||
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace(/^@/, "") ||
  "flipo";

export function depositBotName(): string {
  return DEPOSIT_BOT_NAME;
}

export function depositBotTelegramUrl(): string {
  return `https://t.me/${DEPOSIT_BOT_USERNAME}`;
}

export function depositBotMention(): string {
  return `@${DEPOSIT_BOT_USERNAME}`;
}

/** Direct link to open the mini app inside Telegram. */
export function miniAppTelegramUrl(startApp?: string): string {
  const base = `https://t.me/${APP_BOT_USERNAME}/${WEBAPP_SHORT_NAME}`;
  if (!startApp?.trim()) {
    return base;
  }
  return `${base}?startapp=${encodeURIComponent(startApp.trim())}`;
}

/** Referral deep link (startapp passes ref code into Telegram initData.start_param). */
export function referralTelegramUrl(referrerTelegramId: number | string): string {
  const numericId =
    typeof referrerTelegramId === "number"
      ? referrerTelegramId
      : Number.parseInt(String(referrerTelegramId).trim(), 10);
  const referralCode =
    Number.isFinite(numericId) && numericId > 0
      ? numericId.toString(36).toLowerCase()
      : String(referrerTelegramId).trim().toLowerCase();
  const payload = `ref_${referralCode}`;
  return `https://t.me/${APP_BOT_USERNAME}/${WEBAPP_SHORT_NAME}?startapp=${payload}`;
}
