import { beginCell, Address } from "@ton/core";

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

export function formatTonWalletAddress(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("UQ") || value.startsWith("EQ") || value.startsWith("kQ")) {
    return value;
  }
  try {
    return Address.parse(value).toString({ bounceable: false });
  } catch {
    return value;
  }
}

export function shortenTonWalletAddress(raw: string): string {
  const friendly = formatTonWalletAddress(raw);
  if (friendly.length <= 16) return friendly;
  return `${friendly.slice(0, 6)}…${friendly.slice(-4)}`;
}

export function tonWalletAddressesEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    return Address.parse(a).equals(Address.parse(b));
  } catch {
    return formatTonWalletAddress(a) === formatTonWalletAddress(b);
  }
}

/** Platform withdrawal fee in nanoton (keep in sync with TON_WITHDRAW_FEE_NANOTON). */
export const WITHDRAW_FEE_NANOTON = 50_000_000;

/** Minimum deposit / withdraw receive amount in nanoton. */
export const MIN_TRANSFER_NANOTON = 100_000_000;

export function withdrawDebitNanoton(receiveNanoton: number): number {
  if (receiveNanoton <= 0) return 0;
  return receiveNanoton + WITHDRAW_FEE_NANOTON;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
