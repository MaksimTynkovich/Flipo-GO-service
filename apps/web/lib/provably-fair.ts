import type { RoundProof } from "@/lib/api";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToInt(hexStr: string): number {
  const parsed = Number.parseInt(hexStr, 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

const WHEEL_ORDER = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14];

function rouletteColor(n: number): string {
  if (n === 0) return "green";
  if (n >= 1 && n <= 7) return "red";
  return "black";
}

async function crashPointFromHash(hash: string): Promise<number> {
  const inner = await sha256Hex(hash);
  const h = hexToInt(inner.slice(0, 8));
  if (h % 33 === 0) return 1;
  const e = (h % 0xffffffff) / 0xffffffff;
  return Math.max(1, Math.floor((100 / (1 - e)) / 100 * 100) / 100);
}

export async function verifyRoundProof(proof: RoundProof): Promise<boolean> {
  if (!proof.server_seed || !proof.server_seed_hash) return proof.verified;
  const hash = await sha256Hex(proof.server_seed);
  if (hash !== proof.server_seed_hash) return false;

  if (proof.game_type === "roulette") {
    const h = await sha256Hex(`${proof.server_seed}:${proof.nonce}`);
    const idx = hexToInt(h.slice(0, 8)) % 15;
    const color = rouletteColor(WHEEL_ORDER[idx]);
    return color === proof.result;
  }

  if (proof.game_type === "crash") {
    const point = await crashPointFromHash(proof.server_seed);
    const target = Number(proof.result);
    return Math.abs(point - target) < 0.001;
  }

  return proof.verified;
}
