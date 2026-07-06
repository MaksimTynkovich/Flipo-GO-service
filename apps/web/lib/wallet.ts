import { beginCell } from "@ton/core";

/** Encode a text comment for a TON transfer payload (base64 BOC). */
export function encodeTonCommentPayload(comment: string): string {
  return beginCell().storeUint(0, 32).storeStringTail(comment).endCell().toBoc().toString("base64");
}

export function nanotonFromTonInput(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  const ton = Number(normalized);
  if (!Number.isFinite(ton) || ton <= 0) return 0;
  return Math.floor(ton * 1_000_000_000);
}

export function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
