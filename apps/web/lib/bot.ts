/** Telegram bot that receives collectible gifts for inventory deposits. */
export const DEPOSIT_BOT_NAME = process.env.NEXT_PUBLIC_BOT_NAME?.trim() || "Flipo";

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

const WEBAPP_SHORT_NAME = process.env.NEXT_PUBLIC_WEBAPP_SHORT_NAME?.replace(/^\//, "");

/** Referral deep link (startapp passes ref code into Telegram initData.start_param). */
export function referralTelegramUrl(referrerId: string): string {
  const payload = `ref_${referrerId}`;
  if (WEBAPP_SHORT_NAME) {
    return `https://t.me/${DEPOSIT_BOT_USERNAME}/${WEBAPP_SHORT_NAME}?startapp=${payload}`;
  }
  return `https://t.me/${DEPOSIT_BOT_USERNAME}?start=${payload}`;
}
