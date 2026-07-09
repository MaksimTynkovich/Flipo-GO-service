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
import { markModalCompleted } from "@/lib/analytics";
import { INVENTORY_DEPOSITED_EVENT } from "@/components/providers/UserRealtimeProvider";
import { Gift } from "lucide-react";

export function InventorySection() {
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
      const [inv, mine] = await Promise.all([getInventory(), getMyMarketListings().catch(() => [])]);
      setItems(inv.filter((i) => i.status !== "liquidated" && i.status !== "staked" && i.status !== "withdrawn"));
      setMyListings(mine);
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
      await liquidateItem(selected.id);
      markModalCompleted("inventory_gift_detail");
      closeSheet();
      load();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLiquidating(false);
    }
  }

  async function handleWithdraw() {
    if (!selected) return;
    setWithdrawing(true);
    try {
      await withdrawGiftItem(selected.id);
      markModalCompleted("inventory_gift_detail");
      closeSheet();
      load();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Ошибка");
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
      <InventoryDepositGuide />

      <section className="mt-5 space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <p className="section-label">Мои подарки</p>
          {!loading && <span className="text-xs text-muted">{visibleItems.length}</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
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
              <p className="text-sm font-semibold">Здесь будут отображаться ваши подарки</p>
            </div>
          </div>
        )}
      </section>

      {selected && (
        <InventoryGiftDetailSheet
          item={selected}
          marketListing={listingByItemId.get(selected.id)}
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
