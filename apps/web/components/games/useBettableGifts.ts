"use client";

import { useCallback, useEffect, useState } from "react";
import { getInventory, InventoryItem } from "@/lib/api";
import { giftValuationNanoton } from "@/lib/gifts";

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
    if (enabled) {
      void reload();
    }
  }, [enabled, reload]);

  return { gifts, loading, reload };
}
