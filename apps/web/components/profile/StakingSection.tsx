"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { GiftTile, GiftTileSkeleton } from "@/components/profile/GiftTile";
import { StakingGiftSheet } from "@/components/profile/StakingGiftSheet";
import { StakingOverview } from "@/components/profile/StakingOverview";
import { Button } from "@/components/ui/button";
import {
  formatTON,
  getProfileGifts,
  getStakingPositions,
  ProfileGift,
  StakingStats,
  stakeGift,
  unstakeGift,
} from "@/lib/api";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";
import { Gift } from "lucide-react";
import Link from "next/link";
import { APP_ROUTES } from "@/src/shared/config/navigation";

const emptyStats: StakingStats = {
  staked_count: 0,
  total_count: 0,
  earned_nanoton: 0,
  active_daily_yield_nanoton: 0,
  active_monthly_yield_nanoton: 0,
  unlockable_monthly_nanoton: 0,
  boost_wager_nanoton: 0,
  boost_threshold_nanoton: 5_000_000_000,
  monthly_rate_percent: 3,
};

type Tab = "staked" | "add";

export function StakingSection() {
  const { user } = useAuth();
  const [gifts, setGifts] = useState<ProfileGift[]>([]);
  const [stats, setStats] = useState<StakingStats>(emptyStats);
  const [positionByItem, setPositionByItem] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [staking, setStaking] = useState(false);
  const [unstaking, setUnstaking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspected, setInspected] = useState<ProfileGift | null>(null);
  const [tab, setTab] = useState<Tab>("staked");

  async function load() {
    setLoading(true);
    try {
      const [data, positions] = await Promise.all([getProfileGifts(), getStakingPositions()]);
      setGifts(data.gifts);
      setStats(data.stats);
      setPositionByItem(new Map(positions.map((p) => [p.inventory_item_id, p.id])));
      setSelected(new Set(data.gifts.filter((g) => !g.is_staked).map((g) => g.slug)));

      if (data.stats.staked_count === 0 && data.gifts.some((g) => !g.is_staked)) {
        setTab("add");
      } else {
        setTab("staked");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const unstakedGifts = useMemo(() => gifts.filter((g) => !g.is_staked), [gifts]);
  const stakedGifts = useMemo(() => gifts.filter((g) => g.is_staked), [gifts]);

  const selectedGifts = useMemo(
    () => unstakedGifts.filter((g) => selected.has(g.slug)),
    [unstakedGifts, selected],
  );

  const actionTotals = useMemo(
    () => ({
      price: selectedGifts.reduce((s, g) => s + g.price_nanoton, 0),
      monthly: selectedGifts.reduce((s, g) => s + g.monthly_yield_nanoton, 0),
    }),
    [selectedGifts],
  );

  function toggleGift(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(unstakedGifts.map((g) => g.slug)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleStake() {
    if (selectedGifts.length === 0) return;
    setStaking(true);
    try {
      for (const gift of selectedGifts) {
        await stakeGift(gift.slug);
      }
      await load();
      setTab("staked");
    } finally {
      setStaking(false);
    }
  }

  async function handleUnstake(gift: ProfileGift) {
    const positionId = gift.item_id ? positionByItem.get(gift.item_id) : undefined;
    if (!positionId) return;
    setUnstaking(true);
    try {
      await unstakeGift(positionId);
      setInspected(null);
      await load();
      if (stakedGifts.length <= 1) setTab("add");
    } finally {
      setUnstaking(false);
    }
  }

  const isBoost = user?.staking_tier === "boost";
  const allUnstakedSelected =
    selectedGifts.length === unstakedGifts.length && unstakedGifts.length > 0;

  const stakeLabel = staking
    ? "Стейкаем…"
    : allUnstakedSelected
      ? "Застейкать всё"
      : selectedGifts.length > 0
        ? `Застейкать · ${selectedGifts.length}`
        : "Выберите подарки";

  return (
    <div className="space-y-4 pb-28">
      {loading ? (
        <div className="h-52 animate-pulse rounded-2xl bg-surface-raised" />
      ) : (
        <StakingOverview isBoost={isBoost} stats={stats} />
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <GiftTileSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="segment-control">
            <button
              type="button"
              onClick={() => setTab("staked")}
              className={cn("segment-item", tab === "staked" && "segment-item-active")}
            >
              В стейке
              {stakedGifts.length > 0 && (
                <span className="tabular-nums text-[10px] opacity-70">{stakedGifts.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("add")}
              className={cn("segment-item", tab === "add" && "segment-item-active")}
            >
              Добавить
              {unstakedGifts.length > 0 && (
                <span className="tabular-nums text-[10px] opacity-70">{unstakedGifts.length}</span>
              )}
            </button>
          </div>

          {tab === "staked" && (
            <section className="space-y-3">
              {stakedGifts.length === 0 ? (
                <div className="panel py-10 text-center">
                  <p className="font-medium">Стейкинг пуст</p>
                  <p className="mt-1 text-sm text-muted">
                    Добавь подарки — они начнут приносить доход каждый день
                  </p>
                  {unstakedGifts.length > 0 && (
                    <Button
                      variant="accent"
                      className="mt-4 rounded-xl px-6"
                      onClick={() => setTab("add")}
                    >
                      Добавить подарки
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {stakedGifts.map((gift) => (
                    <GiftTile key={gift.slug} gift={gift} onInspect={setInspected} />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "add" && (
            <section className="space-y-3">
              {unstakedGifts.length === 0 ? (
                <div className="panel py-10 text-center">
                  {gifts.length > 0 ? (
                    <>
                      <p className="font-medium text-success">Весь портфель в стейке</p>
                      <p className="mt-1 text-sm text-muted">Новых подарков для добавления нет</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Нет подарков для добавления</p>
                      <p className="mt-1 text-sm text-muted">
                        Сначала пополни инвентарь collectible gift
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-0.5">
                    <p className="text-xs text-muted">
                      Выбрано {selectedGifts.length} из {unstakedGifts.length}
                    </p>
                    <div className="flex items-center gap-3">
                      {selectedGifts.length > 0 && (
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-xs font-medium text-muted"
                        >
                          Сбросить
                        </button>
                      )}
                      {unstakedGifts.length > 1 && selectedGifts.length < unstakedGifts.length && (
                        <button
                          type="button"
                          onClick={selectAll}
                          className="text-xs font-medium text-accent"
                        >
                          Выбрать все
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {unstakedGifts.map((gift) => (
                      <GiftTile
                        key={gift.slug}
                        gift={gift}
                        selected={selected.has(gift.slug)}
                        onToggle={toggleGift}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {gifts.length === 0 && (
            <div className="panel flex items-start gap-3 p-4">
              <div className="icon-box h-10 w-10 shrink-0">
                <Gift className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Подарков пока нет</p>
                  <p className="text-xs leading-relaxed text-muted">
                    Передай collectible gift боту — он появится здесь
                  </p>
                </div>
                <Link href={APP_ROUTES.deposit}>
                  <Button variant="outline" className="h-9 rounded-xl px-4 text-xs">
                    Как пополнить
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && tab === "add" && unstakedGifts.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-4">
          <div className="mx-auto max-w-lg">
            <Button
              variant="accent"
              className="h-auto w-full rounded-2xl px-4 py-3.5 shadow-lg shadow-black/25"
              disabled={staking || selectedGifts.length === 0}
              onClick={handleStake}
            >
              <span className="block text-sm font-bold">{stakeLabel}</span>
              {selectedGifts.length > 0 && (
                <span className="mt-0.5 inline-flex flex-wrap items-center justify-center gap-x-1 text-[11px] font-medium tabular-nums text-surface/75">
                  <TonAmount amount={formatTON(actionTotals.price)} variant="brand" iconClassName="h-5 w-5" />
                  <span>→</span>
                  <span className="inline-flex items-center gap-0.5">
                    +{formatTON(actionTotals.monthly)}
                    <TonIcon variant="brand" className="h-5 w-5" />
                  </span>
                  /мес
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {inspected && (
        <StakingGiftSheet
          gift={inspected}
          stats={stats}
          positionId={inspected.item_id ? positionByItem.get(inspected.item_id) : undefined}
          unstaking={unstaking}
          onClose={() => setInspected(null)}
          onUnstake={
            inspected.is_staked && inspected.can_unstake
              ? () => handleUnstake(inspected)
              : undefined
          }
        />
      )}
    </div>
  );
}
