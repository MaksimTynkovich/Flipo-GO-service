"use client";

import { useEffect, useMemo, useState } from "react";
import {
  InventoryGiftCard,
  InventoryGiftCardSkeleton,
} from "@/components/inventory/InventoryGiftCard";
import { InventoryDepositGuide } from "@/components/inventory/InventoryDepositGuide";
import { InventoryGiftDetailSheet } from "@/components/inventory/InventoryGiftDetailSheet";
import {
  cancelMarketListing,
  getInventory,
  getMyMarketListings,
  InventoryItem,
  liquidateItem,
  MarketListing,
  withdrawGiftItem,
} from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { markModalCompleted } from "@/lib/analytics";
import { INVENTORY_DEPOSITED_EVENT } from "@/components/providers/UserRealtimeProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { Gift, ArrowUpRight } from "lucide-react";
import { depositBotMention, depositBotTelegramUrl } from "@/lib/bot";
import { formatUserError } from "@/lib/user-errors";
import { openTelegramLink } from "@/src/shared/lib/twa";
import { Button } from "@/components/ui/button";
import { GIFT_DEPOSIT_ENABLED, MARKET_ENABLED } from "@/src/shared/config/features";

export function InventorySection() {
  const { setUser } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [liquidating, setLiquidating] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const listingByItemId = useMemo(
    () =>
      new Map(
        myListings
          .filter((l) => l.status === "active")
          .map((l) => [l.item.id, l]),
      ),
    [myListings],
  );

  async function load() {
    setLoading(true);
    try {
      const inv = await getInventory();
      setItems(inv.filter((i) => i.status !== "liquidated" && i.status !== "staked" && i.status !== "withdrawn"));
      if (MARKET_ENABLED) {
        const mine = await getMyMarketListings().catch(() => [] as MarketListing[]);
        setMyListings(mine);
      } else {
        setMyListings([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onDeposited = () => {
      load();
    };
    window.addEventListener(INVENTORY_DEPOSITED_EVENT, onDeposited);
    return () => window.removeEventListener(INVENTORY_DEPOSITED_EVENT, onDeposited);
  }, []);

  useEffect(() => {
    if (selected) {
      setListError(null);
    }
  }, [selected]);

  function closeSheet() {
    setSelected(null);
    setListError(null);
  }

  async function handleLiquidate() {
    if (!selected) return;
    setLiquidating(true);
    try {
      const { balance } = await liquidateItem(selected.id);
      setUser((prev) => (prev ? patchUserBalance(prev, { betting_balance: balance }) : prev));
      markModalCompleted("inventory_gift_detail");
      closeSheet();
      load();
    } catch (e) {
      setListError(formatUserError(e, "Ошибка"));
    } finally {
      setLiquidating(false);
    }
  }

  async function handleWithdraw() {
    if (!selected) return;
    setWithdrawing(true);
    setListError(null);
    try {
      const result = await withdrawGiftItem(selected.id);
      markModalCompleted("inventory_gift_detail");
      if (result.pending) {
        setSelected({ ...selected, status: "withdraw_pending" });
        if (result.message) {
          setListError(null);
        }
        await load();
      } else {
        closeSheet();
        load();
      }
    } catch (e) {
      setListError(formatUserError(e, "Ошибка"));
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleCancelListing() {
    if (!selected) return;
    const listing = listingByItemId.get(selected.id);
    if (!listing) return;
    await cancelMarketListing(listing.id);
    markModalCompleted("inventory_gift_detail");
    closeSheet();
    load();
  }

  const visibleItems = items.filter(
    (i) => i.status !== "liquidated" && i.status !== "staked" && i.status !== "withdrawn",
  );

  return (
    <>
      {GIFT_DEPOSIT_ENABLED ? <InventoryDepositGuide /> : null}

      <section className={GIFT_DEPOSIT_ENABLED ? "mt-5 space-y-2" : "space-y-2"}>
        <div className="flex items-center justify-between px-0.5">
          <p className="section-label">Мои подарки</p>
          {!loading && <span className="text-xs text-muted">{visibleItems.length}</span>}
        </div>

        <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <InventoryGiftCardSkeleton key={i} />)
            : visibleItems.map((item) => {
                const listing = listingByItemId.get(item.id);
                return (
                  <InventoryGiftCard
                    key={item.id}
                    item={item}
                    listingPrice={listing?.price_nanoton}
                    onClick={setSelected}
                  />
                );
              })}
        </div>

        {!loading && visibleItems.length === 0 && (
          <div className="panel flex flex-col items-center gap-3 py-8 text-center">
            <div className="icon-box h-11 w-11 rounded-xl">
              <Gift className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Инвентарь пуст</p>
              <p className="text-xs leading-relaxed text-muted">
                Отправьте подарок боту {depositBotMention()} — он появится здесь.
              </p>
            </div>
            <Button
              variant="accent"
              className="mt-1 h-11 rounded-xl px-5"
              onClick={() => {
                const url = depositBotTelegramUrl();
                if (!openTelegramLink(url)) {
                  window.open(url, "_blank", "noopener,noreferrer");
                }
              }}
            >
              Открыть бота
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}
      </section>

      {selected && (
        <InventoryGiftDetailSheet
          item={selected}
          marketListing={MARKET_ENABLED ? listingByItemId.get(selected.id) : undefined}
          listError={listError}
          liquidating={liquidating}
          withdrawing={withdrawing}
          onClose={closeSheet}
          onLiquidate={handleLiquidate}
          onWithdraw={handleWithdraw}
          onCancelListing={handleCancelListing}
        />
      )}
    </>
  );
}
