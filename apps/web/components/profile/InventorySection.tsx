"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  InventoryGiftCard,
  InventoryGiftCardSkeleton,
} from "@/components/inventory/InventoryGiftCard";
import { InventoryDepositGuide } from "@/components/inventory/InventoryDepositGuide";
import { InventoryGiftDetailSheet } from "@/components/inventory/InventoryGiftDetailSheet";
import {
  cancelMarketListing,
  createMarketListing,
  getInventory,
  getMyMarketListings,
  InventoryItem,
  liquidateItem,
  MarketListing,
} from "@/lib/api";
import { INVENTORY_DEPOSITED_EVENT } from "@/components/providers/UserRealtimeProvider";
import { Gift } from "lucide-react";

function tonToNanoton(ton: string): number {
  const val = parseFloat(ton.replace(",", "."));
  if (Number.isNaN(val) || val <= 0) return 0;
  return Math.round(val * 1_000_000_000);
}

export function InventorySection() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [listPrice, setListPrice] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [isListing, setIsListing] = useState(false);
  const [liquidating, setLiquidating] = useState(false);

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
      setItems(inv.filter((i) => i.status !== "liquidated" && i.status !== "staked"));
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
      const listing = listingByItemId.get(selected.id);
      setListPrice(
        listing ? (listing.price_nanoton / 1_000_000_000).toFixed(2) : "",
      );
      setListError(null);
    }
  }, [selected, listingByItemId]);

  function closeSheet() {
    setSelected(null);
    setListPrice("");
    setListError(null);
  }

  async function handleLiquidate() {
    if (!selected) return;
    setLiquidating(true);
    try {
      await liquidateItem(selected.id);
      closeSheet();
      load();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLiquidating(false);
    }
  }

  async function handleListOnMarket() {
    if (!selected) return;
    const price = tonToNanoton(listPrice);
    if (price <= 0) {
      setListError("Укажите корректную цену");
      return;
    }
    setIsListing(true);
    setListError(null);
    try {
      await createMarketListing(selected.id, price);
      closeSheet();
      load();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setIsListing(false);
    }
  }

  async function handleCancelListing() {
    if (!selected) return;
    const listing = listingByItemId.get(selected.id);
    if (!listing) return;
    await cancelMarketListing(listing.id);
    closeSheet();
    load();
  }

  const visibleItems = items.filter((i) => i.status !== "liquidated" && i.status !== "staked");

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
          <div className="panel py-10 text-center">
            <Gift className="mx-auto h-8 w-8 text-muted/50" />
            <p className="mt-3 text-sm font-medium">Инвентарь пуст</p>
            <p className="mt-1 text-xs text-muted">Отправь collectible gift боту — он появится здесь</p>
          </div>
        )}
      </section>

      {selected && (
        <InventoryGiftDetailSheet
          item={selected}
          marketListing={listingByItemId.get(selected.id)}
          listPrice={listPrice}
          listError={listError}
          isListing={isListing}
          liquidating={liquidating}
          onListPriceChange={setListPrice}
          onClose={closeSheet}
          onList={handleListOnMarket}
          onLiquidate={handleLiquidate}
          onCancelListing={handleCancelListing}
        />
      )}
    </>
  );
}
