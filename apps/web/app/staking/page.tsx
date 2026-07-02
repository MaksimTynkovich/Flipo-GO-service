"use client";

import { useEffect, useState } from "react";
import { WalletBar } from "@/components/WalletBar";
import { Button, Card } from "@/components/ui/button";
import { formatTON, getStakingPositions, stakeItem } from "@/lib/api";
import { getInventory, InventoryItem } from "@/lib/api";

type Position = {
  id: string;
  principal_nanoton: number;
  accrued_yield_nanoton: number;
  tier_at_stake: string;
  is_active: boolean;
};

export default function StakingPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  async function load() {
    const [pos, inv] = await Promise.all([
      getStakingPositions().catch(() => []),
      getInventory().catch(() => []),
    ]);
    setPositions(pos as Position[]);
    setItems((inv as InventoryItem[]).filter((i) => i.status === "available"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStake(itemId: string) {
    await stakeItem(itemId);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Staking</h1>
      <WalletBar />

      <Card>
        <p className="text-sm text-zinc-400">Base: 3% / month</p>
        <p className="text-sm text-zinc-400">Boost: 5% / month (5 TON roulette wager / 7 days)</p>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-400">Active Positions</h2>
        {positions.length === 0 ? (
          <p className="text-zinc-500">No active stakes</p>
        ) : (
          positions.map((p) => (
            <Card key={p.id} className="mb-2">
              <p>{formatTON(p.principal_nanoton)} TON · {p.tier_at_stake}</p>
              <p className="text-xs text-accent">Yield: {formatTON(p.accrued_yield_nanoton)} TON</p>
            </Card>
          ))
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-400">Stake NFT</h2>
        {items.map((item) => (
          <Card key={item.id} className="mb-2 flex justify-between">
            <span>{item.name}</span>
            <Button variant="outline" onClick={() => handleStake(item.id)}>Stake</Button>
          </Card>
        ))}
      </section>
    </div>
  );
}
