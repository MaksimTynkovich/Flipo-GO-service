"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { GiftTile, GiftTileSkeleton } from "@/components/profile/GiftTile";
import { StakingDashboard } from "@/components/profile/StakingDashboard";
import { Button } from "@/components/ui/button";
import { formatTON, getProfileGifts, ProfileGift, StakingStats, stakeGift } from "@/lib/api";
import { X } from "lucide-react";

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

export function StakingSection() {
  const { user } = useAuth();
  const [gifts, setGifts] = useState<ProfileGift[]>([]);
  const [stats, setStats] = useState<StakingStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [staking, setStaking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspected, setInspected] = useState<ProfileGift | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await getProfileGifts();
      setGifts(data.gifts);
      setStats(data.stats);
      setSelected(new Set(data.gifts.filter((g) => !g.is_staked).map((g) => g.slug)));
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

  async function handleStake() {
    if (selectedGifts.length === 0) return;
    setStaking(true);
    try {
      for (const gift of selectedGifts) {
        await stakeGift(gift.slug);
      }
      await load();
    } finally {
      setStaking(false);
    }
  }

  const isBoost = user?.staking_tier === "boost";
  const allStaked = unstakedGifts.length === 0 && gifts.length > 0;
  const allUnstakedSelected =
    selectedGifts.length === unstakedGifts.length && unstakedGifts.length > 0;

  const stakeLabel = staking
    ? "Стейкаем…"
    : allStaked
      ? "Портфель полный"
      : allUnstakedSelected
        ? "Застейкать всё"
        : `Застейкать · ${selectedGifts.length}`;

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="h-36 animate-pulse rounded-2xl bg-surface-raised" />
      ) : gifts.length > 0 ? (
        <StakingDashboard stats={stats} isBoost={isBoost} />
      ) : null}

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <GiftTileSkeleton key={i} />
          ))}
        </div>
      ) : gifts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">Подарков в профиле нет</p>
      ) : (
        <div className="space-y-4">
          {stakedGifts.length > 0 && (
            <section className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                В стейке · {stakedGifts.length}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {stakedGifts.map((gift) => (
                  <GiftTile key={gift.slug} gift={gift} onInspect={setInspected} />
                ))}
              </div>
            </section>
          )}

          {unstakedGifts.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  Добавить · {unstakedGifts.length}
                </p>
                {unstakedGifts.length > 1 && selectedGifts.length < unstakedGifts.length && (
                  <button type="button" onClick={selectAll} className="text-xs font-medium text-accent">
                    Выбрать все
                  </button>
                )}
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
            </section>
          )}
        </div>
      )}

      {!loading && unstakedGifts.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-5">
          <div className="mx-auto max-w-lg">
            <Button
              variant="accent"
              className="h-auto w-full rounded-2xl px-4 py-3.5 shadow-lg shadow-black/25"
              disabled={staking || selectedGifts.length === 0}
              onClick={handleStake}
            >
              <span className="block text-sm font-bold">{stakeLabel}</span>
              {selectedGifts.length > 0 && (
                <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-surface/75">
                  {formatTON(actionTotals.price)} TON → +{formatTON(actionTotals.monthly)}/мес
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {inspected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-5 pb-[calc(5rem+env(safe-area-inset-bottom))]"
          onClick={() => setInspected(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{inspected.name}</p>
                <p className="mt-0.5 text-xs text-muted">В стейке · подарок у тебя в профиле</p>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                className="rounded-lg p-1 text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-raised px-2 py-3">
                <p className="text-[10px] text-muted">Заработано</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-success">
                  +{formatTON(inspected.earned_nanoton)}
                </p>
              </div>
              <div className="rounded-xl bg-surface-raised px-2 py-3">
                <p className="text-[10px] text-muted">В день</p>
                <p className="mt-1 text-sm font-bold tabular-nums">
                  +{formatTON(inspected.daily_yield_nanoton)}
                </p>
              </div>
              <div className="rounded-xl bg-surface-raised px-2 py-3">
                <p className="text-[10px] text-muted">В месяц</p>
                <p className="mt-1 text-sm font-bold tabular-nums">
                  +{formatTON(inspected.monthly_yield_nanoton)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted">
              Стоимость {formatTON(inspected.price_nanoton)} TON · {stats.monthly_rate_percent}%/мес
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
