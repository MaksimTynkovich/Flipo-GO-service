import type { RoundProof } from "@/lib/api";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToInt(hexStr: string): number {
  let val = 0;
  for (const c of hexStr) {
    val <<= 4;
    if (c >= "0" && c <= "9") val |= c.charCodeAt(0) - 48;
    else if (c >= "a" && c <= "f") val |= c.charCodeAt(0) - 97 + 10;
    else if (c >= "A" && c <= "F") val |= c.charCodeAt(0) - 65 + 10;
  }
  return val;
}

const WHEEL_ORDER = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14];

function rouletteColor(n: number): string {
  if (n === 0) return "green";
  if (n >= 1 && n <= 7) return "red";
  return "black";
}

async function hashChain(seed: string, length: number): Promise<string[]> {
  const chain = new Array<string>(length);
  let current = seed;
  for (let i = length - 1; i >= 0; i--) {
    current = await sha256Hex(current);
    chain[i] = current;
  }
  return chain;
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
    const chain = await hashChain(proof.server_seed, proof.nonce + 1);
    const point = await crashPointFromHash(chain[proof.nonce] ?? "");
    const target = Number(proof.result);
    return Math.abs(point - target) < 0.001;
  }

  return proof.verified;
}
