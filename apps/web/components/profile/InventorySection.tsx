"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { depositGift, formatTON, getInventory, InventoryItem, liquidateItem } from "@/lib/api";

export function InventorySection() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [txRef, setTxRef] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setItems(await getInventory());
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

  const available = items.filter((i) => i.status === "available");

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
                <Button variant="outline" onClick={() => handleLiquidate(item.id)}>
                  Продать
                </Button>
              )}
            </div>
          ))
        )}
      </section>
    </>
  );
}
