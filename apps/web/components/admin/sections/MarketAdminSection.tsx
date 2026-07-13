"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { AdminButton, AdminChip, AdminToolbar } from "@/components/admin/admin-ui";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminGiftPriceSettings,
  getMarketListings,
  syncAdminBotMarketGifts,
  repriceAdminBotMarketGifts,
  updateAdminGiftPriceSettings,
  updateAdminMarketListingPrice,
  type AdminGiftPriceSettings,
  type MarketListing,
} from "@/lib/api";
import { giftImageUrlFromURL } from "@/lib/gifts";

type SourceFilter = "all" | "bot" | "user";
type MarketTab = "listings" | "gift-prices";

const DEFAULT_GIFT_SETTINGS: AdminGiftPriceSettings = {
  buy_adjust_percent: 0,
  valuation_adjust_percent: 0,
};

function tonToNanoton(ton: string): number {
  const parsed = Number.parseFloat(ton.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 1_000_000_000);
}

function nanotonToTonInput(nanoton: number): string {
  return (nanoton / 1_000_000_000).toFixed(2);
}

function parsePercent(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed || trimmed === "-") return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/** Keeps optional leading minus and one decimal separator while typing. */
function filterPercentInput(raw: string): string {
  let out = "";
  let hasSep = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "-" && out.length === 0) {
      out += c;
      continue;
    }
    if (c >= "0" && c <= "9") {
      out += c;
      continue;
    }
    if ((c === "." || c === ",") && !hasSep && out !== "" && out !== "-") {
      out += c;
      hasSep = true;
    }
  }
  return out;
}

export default function MarketAdminSection() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<MarketTab>("gift-prices");
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [giftSettings, setGiftSettings] = useState<AdminGiftPriceSettings | null>(null);
  const [buyDraft, setBuyDraft] = useState("0");
  const [valuationDraft, setValuationDraft] = useState("0");
  const [giftLoading, setGiftLoading] = useState(true);
  const [savingGift, setSavingGift] = useState(false);
  const [syncingBot, setSyncingBot] = useState(false);
  const [repricingBot, setRepricingBot] = useState(false);

  async function loadListings() {
    setLoading(true);
    try {
      const data = await loadCached("admin:market:listings", getMarketListings);
      setListings(data);
      setDraftPrices(
        Object.fromEntries(data.map((listing) => [listing.id, nanotonToTonInput(listing.price_nanoton)])),
      );
      primeCache("admin:market:listings", data);
    } finally {
      setLoading(false);
    }
  }

  async function loadGiftSettings() {
    setGiftLoading(true);
    try {
      const data = await loadCached("admin:market:gift-price-settings", getAdminGiftPriceSettings);
      setGiftSettings(data);
      setBuyDraft(String(data.buy_adjust_percent ?? 0));
      setValuationDraft(String(data.valuation_adjust_percent ?? 0));
      primeCache("admin:market:gift-price-settings", data);
    } finally {
      setGiftLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cachedListings = readCached<MarketListing[]>("admin:market:listings");
      if (cachedListings) {
        setListings(cachedListings);
        setDraftPrices(
          Object.fromEntries(
            cachedListings.map((listing) => [listing.id, nanotonToTonInput(listing.price_nanoton)]),
          ),
        );
      }
      const cachedGift = readCached<AdminGiftPriceSettings>("admin:market:gift-price-settings");
      if (cachedGift) {
        setGiftSettings(cachedGift);
        setBuyDraft(String(cachedGift.buy_adjust_percent ?? 0));
        setValuationDraft(String(cachedGift.valuation_adjust_percent ?? 0));
      }
      loadListings().catch(() => {});
      loadGiftSettings().catch(() => {});
    });
  }, []);

  const visibleListings = listings.filter((listing) => {
    if (sourceFilter === "all") return true;
    return listing.source === sourceFilter;
  });

  async function handleSaveListing(listing: MarketListing) {
    const priceNanoton = tonToNanoton(draftPrices[listing.id] ?? "");
    if (priceNanoton <= 0) {
      showToast({ variant: "error", title: "Введите корректную цену" });
      return;
    }
    if (priceNanoton === listing.price_nanoton) {
      showToast({ variant: "info", title: "Цена не изменилась" });
      return;
    }

    setSavingId(listing.id);
    try {
      await updateAdminMarketListingPrice(listing.id, priceNanoton);
      setListings((prev) =>
        prev.map((item) => (item.id === listing.id ? { ...item, price_nanoton: priceNanoton } : item)),
      );
      primeCache(
        "admin:market:listings",
        listings.map((item) => (item.id === listing.id ? { ...item, price_nanoton: priceNanoton } : item)),
      );
      showToast({ variant: "success", title: `Цена обновлена: ${formatTON(priceNanoton)} TON` });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось обновить цену",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveGiftSettings() {
    const buy = parsePercent(buyDraft);
    const valuation = parsePercent(valuationDraft);
    if (buy == null || valuation == null) {
      showToast({ variant: "error", title: "Введите корректные проценты (например −15)" });
      return;
    }
    if (buy < -90 || buy > 100 || valuation < -90 || valuation > 100) {
      showToast({ variant: "error", title: "Диапазон: от −90% до +100%" });
      return;
    }

    setSavingGift(true);
    try {
      const next = { buy_adjust_percent: buy, valuation_adjust_percent: valuation };
      await updateAdminGiftPriceSettings(next);
      setGiftSettings(next);
      primeCache("admin:market:gift-price-settings", next);
      showToast({ variant: "success", title: "Настройки оценки сохранены" });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось сохранить",
      });
    } finally {
      setSavingGift(false);
    }
  }

  async function handleSyncBotGifts() {
    setSyncingBot(true);
    try {
      const result = await syncAdminBotMarketGifts();
      await loadListings();
      const parts = [
        `скан: ${result.scanned}`,
        `выгружено: ${result.listed}`,
        `уже в инвентаре: ${result.skipped_owned}`,
        `ждут депозита: ${result.skipped_pending_deposit}`,
        `без цены: ${result.skipped_unpriced}`,
      ];
      showToast({
        variant: result.listed > 0 ? "success" : "info",
        title: "Синхронизация бота",
        subtitle: parts.join(" · "),
      });
      if (result.errors?.length) {
        showToast({
          variant: "error",
          title: `Ошибки: ${result.errors.length}`,
          subtitle: result.errors.slice(0, 3).join("; "),
        });
      }
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось синхронизировать",
      });
    } finally {
      setSyncingBot(false);
    }
  }

  async function handleRepriceBotGifts() {
    setRepricingBot(true);
    try {
      const result = await repriceAdminBotMarketGifts();
      await loadListings();
      const parts = [
        `лотов: ${result.listings_checked}`,
        `обновлено: ${result.updated}`,
        `без изменений: ${result.unchanged}`,
        `без цены: ${result.skipped_unpriced}`,
      ];
      if (result.bot_gifts_scanned > 0) {
        parts.unshift(`скан бота: ${result.bot_gifts_scanned}`);
      }
      showToast({
        variant: result.updated > 0 ? "success" : "info",
        title: "Цены обновлены по алгоритму",
        subtitle: parts.join(" · "),
      });
      if (result.errors?.length) {
        showToast({
          variant: "error",
          title: `Ошибки: ${result.errors.length}`,
          subtitle: result.errors.slice(0, 3).join("; "),
        });
      }
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось обновить цены",
      });
    } finally {
      setRepricingBot(false);
    }
  }

  const settings = giftSettings ?? DEFAULT_GIFT_SETTINGS;

  return (
    <PageShell
      title="Маркет"
      description="Корректировка оценки подарков, выгрузка ничьих гифтов бота и цены лотов."
    >
      <AdminToolbar>
        <AdminChip active={tab === "gift-prices"} onClick={() => setTab("gift-prices")}>
          Оценка подарков
        </AdminChip>
        <AdminChip active={tab === "listings"} onClick={() => setTab("listings")}>
          Лоты
        </AdminChip>
        <AdminButton
          variant="secondary"
          disabled={syncingBot}
          onClick={() => handleSyncBotGifts().catch(() => {})}
        >
          {syncingBot ? "Синхронизация…" : "Выгрузить подарки бота"}
        </AdminButton>
        <AdminButton
          variant="secondary"
          disabled={repricingBot}
          onClick={() => handleRepriceBotGifts().catch(() => {})}
        >
          {repricingBot ? "Пересчёт…" : "Обновить цены по алгоритму"}
        </AdminButton>
        <AdminButton
          variant="secondary"
          onClick={() => {
            if (tab === "listings") loadListings().catch(() => {});
            else loadGiftSettings().catch(() => {});
          }}
        >
          Обновить
        </AdminButton>
      </AdminToolbar>

      {tab === "gift-prices" ? (
        <section className="panel space-y-4">
          <div className="space-y-1">
            <p className="text-base font-semibold">Корректировка от алгоритма</p>
            <p className="text-xs text-muted">
              Процент от рыночной оценки (traits / floor). Отрицательное значение — скидка,
              положительное — наценка. Например, −12 = скупка по 88% от алгоритма.
            </p>
          </div>

          {giftLoading && !giftSettings ? (
            <div className="h-28 animate-pulse rounded-xl bg-surface-raised/50" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  Скупка на маркет, %
                  <input
                    className="input-field mt-1"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    value={buyDraft}
                    onChange={(e) => setBuyDraft(filterPercentInput(e.target.value))}
                    placeholder="-12"
                  />
                  <span className="mt-1 block text-[11px] text-muted">
                    Сейчас: {settings.buy_adjust_percent}% к алгоритму
                  </span>
                </label>
                <label className="text-xs text-muted">
                  Общая оценка (игры / PvP), %
                  <input
                    className="input-field mt-1"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    value={valuationDraft}
                    onChange={(e) => setValuationDraft(filterPercentInput(e.target.value))}
                    placeholder="-12"
                  />
                  <span className="mt-1 block text-[11px] text-muted">
                    Сейчас: {settings.valuation_adjust_percent}% к алгоритму
                  </span>
                </label>
              </div>
              <AdminButton disabled={savingGift} onClick={() => handleSaveGiftSettings().catch(() => {})}>
                {savingGift ? "Сохраняем…" : "Сохранить"}
              </AdminButton>
            </>
          )}
        </section>
      ) : (
        <>
          <AdminToolbar>
            <AdminChip active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
              Все
            </AdminChip>
            <AdminChip active={sourceFilter === "bot"} onClick={() => setSourceFilter("bot")}>
              Бот
            </AdminChip>
            <AdminChip active={sourceFilter === "user"} onClick={() => setSourceFilter("user")}>
              Пользователи
            </AdminChip>
          </AdminToolbar>

          <section className="panel space-y-3">
            <p className="text-base font-semibold">Активные лоты ({visibleListings.length})</p>

            {loading && visibleListings.length === 0 ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex gap-3 rounded-xl bg-surface-raised/50 p-3">
                  <div className="h-14 w-14 animate-pulse rounded-lg bg-surface-raised" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-surface-raised" />
                    <div className="h-8 w-28 animate-pulse rounded bg-surface-raised" />
                  </div>
                </div>
              ))
            ) : visibleListings.length === 0 ? (
              <p className="text-sm text-muted">Нет активных лотов</p>
            ) : (
              visibleListings.map((listing) => (
                <div
                  key={listing.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {listing.item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={giftImageUrlFromURL(listing.item.image_url)}
                        alt={listing.item.name}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-xs text-muted">
                        NFT
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{listing.item.name}</p>
                      <p className="text-xs text-muted">
                        {listing.item.sub_name || listing.item.collection_slug} ·{" "}
                        {listing.source === "bot" ? "бот" : "пользователь"}
                      </p>
                      <p className="text-xs text-muted">
                        Текущая цена: {formatTON(listing.price_nanoton)} TON
                      </p>
                    </div>
                  </div>

                  <div className="flex items-end gap-2 sm:w-56">
                    <label className="flex-1 text-xs text-muted">
                      Новая цена (TON)
                      <input
                        className="input-field mt-1"
                        type="text"
                        inputMode="decimal"
                        value={draftPrices[listing.id] ?? ""}
                        onChange={(e) =>
                          setDraftPrices((prev) => ({
                            ...prev,
                            [listing.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <AdminButton
                      disabled={savingId === listing.id}
                      onClick={() => handleSaveListing(listing).catch(() => {})}
                    >
                      {savingId === listing.id ? "..." : "Сохранить"}
                    </AdminButton>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
