import type { RoundProof } from "@/lib/api";
import { ROULETTE_SEGMENTS, numberColor } from "@/lib/roulette";

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
    const idx = hexToInt(h.slice(0, 8)) % ROULETTE_SEGMENTS;
    const color = numberColor(idx);
    return color === proof.result;
  }

  if (proof.game_type === "crash") {
    const point = await crashPointFromHash(proof.server_seed);
    const target = Number(proof.result);
    return Math.abs(point - target) < 0.001;
  }

  return proof.verified;
}
