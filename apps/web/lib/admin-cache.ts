"use client";

type Entry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, Entry<unknown>>();

export async function loadCached<T>(key: string, loader: () => Promise<T>, ttlMs = 15_000): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function primeCache<T>(key: string, value: T, ttlMs = 15_000) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function readCached<T>(key: string): T | null {
  const existing = cache.get(key) as Entry<T> | undefined;
  if (!existing || existing.expiresAt <= Date.now()) {
    return null;
  }
  return existing.value;
}

export function invalidateCached(prefix: string) {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function runAfterFirstPaint(task: () => void) {
  if (typeof window === "undefined") {
    task();
    return;
  }

  window.requestAnimationFrame(() => {
    window.setTimeout(task, 0);
  });
}
