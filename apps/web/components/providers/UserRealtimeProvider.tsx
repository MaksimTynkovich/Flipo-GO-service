"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { InventoryItem } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { connectUserWS } from "@/lib/ws";
import { emitBalanceWin } from "@/lib/balance-win";
import { getMe } from "@/lib/api";
import { patchUserSession } from "@/lib/apply-balance";
import {
  isCasePrizeBalanceHeld,
  stashCasePrizeBalance,
} from "@/lib/case-prize-balance";
import {
  isWheelPrizeBalanceHeld,
  stashWheelPrizeBalance,
} from "@/lib/wheel-prize-balance";
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
  const recentDepositEventsRef = useRef<Map<string, number>>(new Map());
  const wagerRefreshTimerRef = useRef<number | null>(null);

  const scheduleWagerRefresh = useCallback(() => {
    if (wagerRefreshTimerRef.current != null) {
      window.clearTimeout(wagerRefreshTimerRef.current);
    }
    wagerRefreshTimerRef.current = window.setTimeout(() => {
      wagerRefreshTimerRef.current = null;
      void getMe()
        .then((me) => {
          setUser((prev) => (prev ? patchUserSession(prev, me) : me));
        })
        .catch(() => {});
    }, 250);
  }, [setUser]);

  useEffect(() => {
    return () => {
      if (wagerRefreshTimerRef.current != null) {
        window.clearTimeout(wagerRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    return connectUserWS((msg) => {
      if (msg.event === "balance.updated") {
        const payload = msg.payload as {
          betting_balance?: number;
          delta_nanoton?: number;
          ledger_type?: string;
        };

        // Wheel credits the prize when the API returns; keep header balance
        // frozen until the reel animation finishes (WheelView releases hold).
        if (
          payload.ledger_type === "wheel_prize" &&
          payload.betting_balance != null &&
          isWheelPrizeBalanceHeld()
        ) {
          stashWheelPrizeBalance({
            betting_balance: payload.betting_balance,
            delta_nanoton: payload.delta_nanoton,
          });
          return;
        }

        // Case TON prize: freeze until CaseDetailView reveal completes.
        if (
          payload.ledger_type === "case_prize" &&
          payload.betting_balance != null &&
          isCasePrizeBalanceHeld()
        ) {
          stashCasePrizeBalance({
            betting_balance: payload.betting_balance,
            delta_nanoton: payload.delta_nanoton,
          });
          return;
        }

        if (payload.betting_balance != null) {
          setUser((prev) => {
            if (
              prev &&
              (prev.wager_required_nanoton ?? 0) > 0 &&
              (payload.ledger_type === "win" ||
                payload.ledger_type === "case_open" ||
                payload.ledger_type === "game_bet")
            ) {
              scheduleWagerRefresh();
            }
            return prev
              ? {
                  ...prev,
                  betting_balance: payload.betting_balance!,
                }
              : prev;
          });
        } else if (
          (payload.ledger_type === "win" ||
            payload.ledger_type === "case_open" ||
            payload.ledger_type === "game_bet")
        ) {
          setUser((prev) => {
            if (prev && (prev.wager_required_nanoton ?? 0) > 0) {
              scheduleWagerRefresh();
            }
            return prev;
          });
        }
        const creditTypes = new Set([
          "win",
          "liquidate",
          "market_sell",
          "deposit",
          "stake_yield",
          "referral_bonus",
          "refund",
        ]);
        if (
          payload.delta_nanoton &&
          payload.delta_nanoton > 0 &&
          creditTypes.has(payload.ledger_type ?? "")
        ) {
          emitBalanceWin(payload.delta_nanoton);
          if (payload.ledger_type === "win") {
            haptics.notificationOccurred("success");
            trackEvent({
              event_name: "balance_win_received",
              event_category: "gameplay",
              status: "success",
              properties: {
                amount_nanoton: payload.delta_nanoton,
                ledger_type: payload.ledger_type,
              },
            });
          }
        }
        return;
      }

      if (msg.event !== "inventory.deposited") return;

      const payload = msg.payload as DepositPayload;
      if (!payload?.item) return;

      const dedupeKey = payload.item.id || payload.item.telegram_gift_id || payload.message;
      const now = Date.now();
      const lastSeen = recentDepositEventsRef.current.get(dedupeKey);
      if (lastSeen && now - lastSeen < 5000) {
        return;
      }
      recentDepositEventsRef.current.set(dedupeKey, now);
      for (const [key, seenAt] of Array.from(recentDepositEventsRef.current.entries())) {
        if (now - seenAt >= 10000) {
          recentDepositEventsRef.current.delete(key);
        }
      }

      window.dispatchEvent(
        new CustomEvent(INVENTORY_DEPOSITED_EVENT, { detail: payload }),
      );

      haptics.notificationOccurred("success");
      trackEvent({
        event_name: "inventory_deposit_realtime_received",
        event_category: "inventory",
        status: "success",
        properties: {
          item_id: payload.item.id,
          gift_id: payload.item.telegram_gift_id,
        },
      });
      showToast({
        title: payload.message || `🎁 Подарок «${payload.item.name}» зачислен в инвентарь!`,
      });
    });
    // Reconnect only when the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, scheduleWagerRefresh]);

  return <>{children}</>;
}
