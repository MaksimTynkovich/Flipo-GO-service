"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelMarketListing,
  createMarketListing,
  depositGift,
  formatTON,
  getInventory,
  getMyMarketListings,
  InventoryItem,
  liquidateItem,
  MarketListing,
} from "@/lib/api";

function tonToNanoton(ton: string): number {
  const val = parseFloat(ton.replace(",", "."));
  if (Number.isNaN(val) || val <= 0) return 0;
  return Math.round(val * 1_000_000_000);
}

export function InventorySection() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [txRef, setTxRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [listingItem, setListingItem] = useState<InventoryItem | null>(null);
  const [listPrice, setListPrice] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [listing, setListing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [inv, mine] = await Promise.all([getInventory(), getMyMarketListings().catch(() => [])]);
      setItems(inv);
      setMyListings(mine);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDeposit() {
    if (!txRef) return;
    await depositGift(txRef);
    setTxRef("");
    load();
  }

  async function handleLiquidate(id: string) {
    await liquidateItem(id);
    load();
  }

  async function handleListOnMarket() {
    if (!listingItem) return;
    const price = tonToNanoton(listPrice);
    if (price <= 0) {
      setListError("Укажите корректную цену");
      return;
    }
    setListing(true);
    setListError(null);
    try {
      await createMarketListing(listingItem.id, price);
      setListingItem(null);
      setListPrice("");
      load();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setListing(false);
    }
  }

  async function handleCancelListing(id: string) {
    await cancelMarketListing(id);
    load();
  }

  const available = items.filter((i) => i.status === "available");
  const activeListings = myListings.filter((l) => l.status === "active");

  return (
    <>
      <div className="panel space-y-2">
        <p className="section-label">Принимаемые подарки</p>
        <p className="text-sm leading-relaxed text-muted">
          Только upgraded collectible gifts — NFT из Telegram, например{" "}
          <span className="text-foreground">Vintage Cigar #22477</span>. Обычные (не upgraded)
          подарки не подходят.
        </p>
      </div>

      <div className="panel space-y-3">
        <p className="section-label">Привязать подарок</p>
        <p className="text-xs text-muted">
          Вставь ссылку или slug — подарок остаётся в твоём профиле Telegram
        </p>
        <input
          className="input-field"
          placeholder="vintagecigar-22477"
          value={txRef}
          onChange={(e) => setTxRef(e.target.value)}
        />
        <Button className="w-full" variant="accent" onClick={handleDeposit}>
          Привязать
        </Button>
      </div>

      {activeListings.length > 0 && (
        <section className="space-y-2">
          <p className="section-label">На маркете</p>
          {activeListings.map((l) => (
            <div key={l.id} className="panel flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{l.item.name}</p>
                <p className="text-xs text-muted">
                  {formatTON(l.price_nanoton)} TON · активен
                </p>
              </div>
              <Button variant="outline" onClick={() => handleCancelListing(l.id)}>
                Снять
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="section-label">Предметы</p>
          <span className="text-xs text-muted">{available.length} доступно</span>
        </div>

        {loading ? (
          <div className="panel py-6 text-center text-sm text-muted">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="panel py-6 text-center text-sm text-muted">
            Инвентарь пуст — внеси первый подарок
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="panel flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.collection_slug} · {formatTON(item.floor_price_nanoton)} TON
                </p>
                <p className="text-[11px] capitalize text-muted">{item.status}</p>
              </div>
              {item.status === "available" && (
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button variant="accent" onClick={() => setListingItem(item)}>
                    На маркет
                  </Button>
                  <Button variant="outline" onClick={() => handleLiquidate(item.id)}>
                    Продать боту
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {listingItem && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="panel w-full max-w-sm space-y-4">
            <div>
              <p className="text-lg font-bold">Выставить на маркет</p>
              <p className="text-sm text-muted">{listingItem.name}</p>
            </div>
            <div className="space-y-2">
              <label className="section-label">Цена (TON)</label>
              <input
                className="input-field"
                type="text"
                inputMode="decimal"
                placeholder={formatTON(listingItem.floor_price_nanoton)}
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
              />
              <p className="text-xs text-muted">
                Floor: {formatTON(listingItem.floor_price_nanoton)} TON
              </p>
            </div>
            {listError && <p className="text-sm text-danger">{listError}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setListingItem(null);
                  setListPrice("");
                  setListError(null);
                }}
              >
                Отмена
              </Button>
              <Button
                variant="accent"
                className="flex-1"
                disabled={listing}
                onClick={handleListOnMarket}
              >
                {listing ? "…" : "Выставить"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
