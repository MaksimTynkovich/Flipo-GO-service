"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { GiftTile, GiftTileSkeleton } from "@/components/profile/GiftTile";
import { StakingGiftSheet } from "@/components/profile/StakingGiftSheet";
import { StakingOverview } from "@/components/profile/StakingOverview";
import { StakingActionBar } from "@/components/profile/StakingActionBar";
import { Button } from "@/components/ui/button";
import {
  getProfileGifts,
  ProfileGift,
  StakingStats,
  stakeGift,
} from "@/lib/api";
import { pluralizeGifts, weeklyYieldNanoton } from "@/lib/staking-ui";
import { trackFlowViewed } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Eye, Gift } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [staking, setStaking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspected, setInspected] = useState<ProfileGift | null>(null);
  const [tab, setTab] = useState<Tab>("staked");
  const [epochEndsAt, setEpochEndsAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await getProfileGifts();
      setGifts(data.gifts);
      setStats(data.stats);
      setEpochEndsAt(data.epoch.ends_at);
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
    trackFlowViewed("staking_flow", "staking");
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
      weekly: selectedGifts.reduce((s, g) => s + weeklyYieldNanoton(g.daily_yield_nanoton), 0),
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
        if (gift.source === "inventory" && gift.item_id) {
          await stakeGift({ itemId: gift.item_id });
        } else {
          await stakeGift({ slug: gift.slug });
        }
      }
      await load();
      setTab("staked");
    } finally {
      setStaking(false);
    }
  }

  const isBoost = user?.staking_tier === "boost";
  const allUnstakedSelected =
    selectedGifts.length === unstakedGifts.length && unstakedGifts.length > 0;

  const stakeLabel = staking
    ? "Стейкаем…"
    : selectedGifts.length > 0
      ? allUnstakedSelected && unstakedGifts.length > 1
        ? "Застейкать все"
        : "Застейкать"
      : "Выберите подарки";

  return (
    <div className="space-y-4">
      <header className="space-y-1 pt-1">
        <h1 className="text-[1.25rem] font-semibold tracking-tight">Стейкинг</h1>
        <p className="text-sm leading-relaxed text-muted">
          Подарки из профиля приносят TON каждый день — без передачи боту.
        </p>
      </header>

      {loading ? (
        <div className="h-44 animate-pulse rounded-2xl bg-surface-raised" />
      ) : (
        <StakingOverview isBoost={isBoost} stats={stats} epochEndsAt={epochEndsAt} />
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <GiftTileSkeleton key={i} />
          ))}
        </div>
      ) : gifts.length === 0 ? (
        <section className="panel flex flex-col items-center gap-3 py-9 text-center">
          <div className="icon-box h-11 w-11 rounded-xl">
            <Gift className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Подарков пока нет</p>
            <p className="mx-auto max-w-[17rem] text-xs leading-relaxed text-muted">
              Если у вас есть подарки в Telegram — включите их отображение в профиле, и они появятся здесь автоматически.
            </p>
          </div>
        </section>
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

          {tab === "staked" ? (
            <section key="staked" className="segment-panel space-y-3">
              {stakedGifts.length === 0 ? (
                <div className="panel flex flex-col items-center gap-3 py-9 text-center">
                  <p className="text-sm font-semibold">Стейкинг пуст</p>
                  <p className="max-w-[16rem] text-xs leading-relaxed text-muted">
                    Добавьте подарки — они начнут приносить доход каждый день.
                  </p>
                  {unstakedGifts.length > 0 ? (
                    <Button
                      variant="accent"
                      className="mt-1 h-10 rounded-xl px-5"
                      onClick={() => setTab("add")}
                    >
                      Добавить · {pluralizeGifts(unstakedGifts.length)}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
                  {stakedGifts.map((gift) => (
                    <GiftTile key={gift.slug} gift={gift} onInspect={setInspected} />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section key="add" className="segment-panel space-y-3">
              {unstakedGifts.length === 0 ? (
                <div className="panel flex flex-col items-center gap-2 py-9 text-center">
                  <p className="text-sm font-semibold text-success">Всё в стейке</p>
                  <p className="text-xs text-muted">Новых подарков для добавления нет</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-0.5">
                    <p className="text-xs text-muted">
                      {selectedGifts.length > 0
                        ? `Выбрано ${pluralizeGifts(selectedGifts.length)}`
                        : "Выберите подарки"}
                    </p>
                    <div className="flex items-center gap-3">
                      {selectedGifts.length > 0 ? (
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-xs font-medium text-muted"
                        >
                          Сбросить
                        </button>
                      ) : null}
                      {unstakedGifts.length > 1 && selectedGifts.length < unstakedGifts.length ? (
                        <button
                          type="button"
                          onClick={selectAll}
                          className="text-xs font-medium text-accent"
                        >
                          Выбрать все
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
                    {unstakedGifts.map((gift) => (
                      <GiftTile
                        key={gift.slug}
                        gift={gift}
                        selected={selected.has(gift.slug)}
                        onToggle={toggleGift}
                      />
                    ))}
                  </div>
                  <StakingActionBar
                    label={stakeLabel}
                    disabled={staking || selectedGifts.length === 0}
                    giftCount={selectedGifts.length}
                    totalPriceNanoton={actionTotals.price}
                    weeklyYieldNanoton={actionTotals.weekly}
                    onStake={handleStake}
                  />
                </>
              )}
            </section>
          )}
        </>
      )}

      {inspected ? (
        <StakingGiftSheet
          gift={inspected}
          stats={stats}
          epochEndsAt={epochEndsAt}
          onClose={() => setInspected(null)}
        />
      ) : null}
    </div>
  );
}
