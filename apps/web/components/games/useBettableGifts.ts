"use client";

import { useCallback, useEffect, useState } from "react";
import { getInventory, InventoryItem } from "@/lib/api";
import { giftValuationNanoton } from "@/lib/gifts";

const BETTABLE_GIFTS_CHANGED_EVENT = "flipo:bettable-gifts-changed";

export function notifyBettableGiftsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BETTABLE_GIFTS_CHANGED_EVENT));
}

function bettableGifts(items: InventoryItem[]): InventoryItem[] {
  return items.filter(
    (item) => item.status === "available" && giftValuationNanoton(item) > 0,
  );
}

/** Shared across BetFundingControl prefetch and BetFundingPanel so the sheet opens warm. */
let sharedGifts: InventoryItem[] = [];
let sharedLoaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

async function fetchBettableGifts(opts?: { silent?: boolean }) {
  if (inflight) return inflight;

  const silent = opts?.silent ?? (sharedLoaded || sharedGifts.length > 0);

  inflight = (async () => {
    try {
      const items = await getInventory();
      sharedGifts = bettableGifts(items);
      sharedLoaded = true;
      emit();
    } catch {
      if (!silent) {
        sharedGifts = [];
      }
      sharedLoaded = true;
      emit();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function useBettableGifts(enabled: boolean) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setTick((n) => n + 1);
    listeners.add(onUpdate);
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    await fetchBettableGifts(opts);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchBettableGifts({ silent: sharedLoaded });
    const onChange = () => {
      void fetchBettableGifts({ silent: true });
    };
    window.addEventListener(BETTABLE_GIFTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(BETTABLE_GIFTS_CHANGED_EVENT, onChange);
  }, [enabled]);

  return {
    gifts: sharedGifts,
    loading: enabled && !sharedLoaded,
    reload,
  };
}
