/** Telegram bot that receives collectible gifts for inventory deposits. */
export const DEPOSIT_BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace(/^@/, "") || "flipo";

export function depositBotTelegramUrl(): string {
  return `https://t.me/${DEPOSIT_BOT_USERNAME}`;
}

export function depositBotMention(): string {
  return `@${DEPOSIT_BOT_USERNAME}`;
}
