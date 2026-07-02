"use client";

import { useEffect, useState } from "react";
import { WalletBar } from "@/components/WalletBar";
import { Button, Card } from "@/components/ui/button";
import { depositGift, formatTON, getInventory, InventoryItem, liquidateItem } from "@/lib/api";

export default function InventoryPage() {
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Inventory</h1>
      <WalletBar />

      <Card className="space-y-3">
        <p className="text-sm text-zinc-400">Deposit Telegram Gift</p>
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="gift:id:collection:price"
          value={txRef}
          onChange={(e) => setTxRef(e.target.value)}
        />
        <Button onClick={handleDeposit}>Deposit</Button>
      </Card>

      {loading ? (
        <p className="text-zinc-400">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-zinc-400">No items yet</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-zinc-400">
                  {item.collection_slug} · {formatTON(item.floor_price_nanoton)} TON
                </p>
                <p className="text-xs text-zinc-500">{item.status}</p>
              </div>
              {item.status === "available" && (
                <Button variant="outline" onClick={() => handleLiquidate(item.id)}>
                  Sell
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
