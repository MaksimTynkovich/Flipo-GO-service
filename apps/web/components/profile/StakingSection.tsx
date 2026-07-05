"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { GiftTile, GiftTileSkeleton } from "@/components/profile/GiftTile";
import { StakingGiftSheet } from "@/components/profile/StakingGiftSheet";
import { StakingOverview } from "@/components/profile/StakingOverview";
import { StakingEpochBanner } from "@/components/profile/StakingEpochBanner";
import { StakingNoTransferHint } from "@/components/profile/StakingNoTransferHint";
import { StakingProfileVisibilityHint } from "@/components/profile/StakingProfileVisibilityHint";
import { StakingActionBar } from "@/components/profile/StakingActionBar";
import { Button } from "@/components/ui/button";
import {
  getProfileGifts,
  ProfileGift,
  StakingStats,
  stakeGift,
} from "@/lib/api";
import { pluralizeGifts, weeklyYieldNanoton } from "@/lib/staking-ui";
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
    : allUnstakedSelected
      ? "Добавить"
      : selectedGifts.length > 0
        ? "Добавить"
        : "Выберите подарки";

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="h-52 animate-pulse rounded-2xl bg-surface-raised" />
      ) : (
        <StakingOverview isBoost={isBoost} stats={stats} />
      )}

      {!loading && epochEndsAt && <StakingEpochBanner endsAt={epochEndsAt} />}

      {!loading && <StakingNoTransferHint />}
      {!loading && <StakingProfileVisibilityHint />}

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
                        Подарки из профиля Telegram появятся здесь автоматически
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-0.5">
                    <p className="text-xs text-muted">
                      {selectedGifts.length > 0
                        ? `Выбрано ${pluralizeGifts(selectedGifts.length)}`
                        : "Выберите подарки для стейка"}
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
                    Подарки из профиля Telegram подтянутся автоматически. Передача боту не обязательна.
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
        <StakingActionBar
          label={stakeLabel}
          disabled={staking || selectedGifts.length === 0}
          giftCount={selectedGifts.length}
          totalPriceNanoton={actionTotals.price}
          weeklyYieldNanoton={actionTotals.weekly}
          onStake={handleStake}
        />
      )}

      {inspected && (
        <StakingGiftSheet
          gift={inspected}
          stats={stats}
          epochEndsAt={epochEndsAt}
          onClose={() => setInspected(null)}
        />
      )}
    </div>
  );
}
