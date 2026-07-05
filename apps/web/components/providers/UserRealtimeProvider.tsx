"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { InventoryItem } from "@/lib/api";
import { connectUserWS } from "@/lib/ws";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export const INVENTORY_DEPOSITED_EVENT = "flipo:inventory-deposited";

type DepositPayload = {
  item: InventoryItem;
  message: string;
};

export function UserRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();

  useEffect(() => {
    if (!user) return;

    return connectUserWS((msg) => {
      if (msg.event !== "inventory.deposited") return;

      const payload = msg.payload as DepositPayload;
      if (!payload?.item) return;

      window.dispatchEvent(
        new CustomEvent(INVENTORY_DEPOSITED_EVENT, { detail: payload }),
      );

      haptics.notificationOccurred("success");
      showToast({
        title: payload.message || `🎁 Подарок «${payload.item.name}» зачислен в инвентарь!`,
      });
    });
    // Reconnect only when the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return <>{children}</>;
}
