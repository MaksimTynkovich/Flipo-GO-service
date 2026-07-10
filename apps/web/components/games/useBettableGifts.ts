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

export function useBettableGifts(enabled: boolean) {
  const [gifts, setGifts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getInventory();
      setGifts(bettableGifts(items));
    } catch {
      setGifts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const onChange = () => {
      void reload();
    };
    window.addEventListener(BETTABLE_GIFTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(BETTABLE_GIFTS_CHANGED_EVENT, onChange);
  }, [enabled, reload]);

  return { gifts, loading, reload };
}
