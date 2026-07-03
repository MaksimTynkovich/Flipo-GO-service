"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { formatTON, getInventory, getStakingPositions, InventoryItem, stakeItem } from "@/lib/api";

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

  const activePositions = positions.filter((p) => p.is_active);
  const totalYield = activePositions.reduce((s, p) => s + p.accrued_yield_nanoton, 0);

  return (
    <PageShell
      title="Стейкинг"
      description="Заморозь NFT и получай до 5% в месяц"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="panel">
          <p className="section-label">Базовая ставка</p>
          <p className="mt-1 text-xl font-bold">3%</p>
          <p className="text-xs text-muted">в месяц</p>
        </div>
        <div className="panel">
          <p className="section-label">Буст</p>
          <p className="mt-1 text-xl font-bold text-accent">5%</p>
          <p className="text-xs text-muted">5 TON в рулетке / 7 дней</p>
        </div>
      </div>

      <div className="panel">
        <p className="section-label">Накопленный доход</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-success">
          {formatTON(totalYield)} <span className="text-sm font-medium text-muted">TON</span>
        </p>
      </div>

      <section className="space-y-2">
        <p className="section-label">Активные позиции</p>
        {activePositions.length === 0 ? (
          <div className="panel py-6 text-center text-sm text-muted">
            Нет активных стейков
          </div>
        ) : (
          activePositions.map((p) => (
            <div key={p.id} className="panel">
              <p className="font-semibold tabular-nums">
                {formatTON(p.principal_nanoton)} TON
              </p>
              <p className="text-xs text-muted">Tier: {p.tier_at_stake}</p>
              <p className="mt-1 text-sm text-success">
                +{formatTON(p.accrued_yield_nanoton)} TON доход
              </p>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <p className="section-label">Застейкать NFT</p>
        {items.length === 0 ? (
          <div className="panel py-6 text-center text-sm text-muted">
            Нет доступных предметов — сначала внеси в инвентарь
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="panel flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.name}</p>
                <p className="text-xs text-muted">
                  {formatTON(item.floor_price_nanoton)} TON
                </p>
              </div>
              <Button variant="outline" onClick={() => handleStake(item.id)}>
                Стейк
              </Button>
            </div>
          ))
        )}
      </section>
    </PageShell>
  );
}
