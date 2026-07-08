"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { InventoryItem } from "@/lib/api";
import { connectUserWS } from "@/lib/ws";
import { emitBalanceWin } from "@/lib/balance-win";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export const INVENTORY_DEPOSITED_EVENT = "flipo:inventory-deposited";

type DepositPayload = {
  item: InventoryItem;
  message: string;
};

export function UserRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();

  useEffect(() => {
    if (!user) return;

    return connectUserWS((msg) => {
      if (msg.event === "balance.updated") {
        const payload = msg.payload as {
          betting_balance?: number;
          promo_balance?: number;
          delta_nanoton?: number;
          ledger_type?: string;
        };
        if (payload.betting_balance != null) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  betting_balance: payload.betting_balance!,
                  promo_balance: payload.promo_balance ?? prev.promo_balance ?? 0,
                }
              : prev,
          );
        }
        if (payload.ledger_type === "win" && payload.delta_nanoton && payload.delta_nanoton > 0) {
          emitBalanceWin(payload.delta_nanoton);
          haptics.notificationOccurred("success");
        }
        return;
      }

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
