"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { AdminButton, AdminChip, AdminToolbar } from "@/components/admin/admin-ui";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminGiftPriceSettings,
  getAdminGiftTraitPrices,
  getMarketListings,
  syncAdminBotMarketGifts,
  repriceAdminBotMarketGifts,
  updateAdminGiftPriceSettings,
  updateAdminGiftTraitPrice,
  updateAdminMarketListingPrice,
  type AdminGiftPriceSettings,
  type AdminGiftTraitPrice,
  type AdminGiftTraitPriceList,
  type MarketListing,
} from "@/lib/api";
import { giftImageUrlFromURL } from "@/lib/gifts";
import { nanotonToTonInput, tonInputToNanoton } from "@/lib/admin-units";

type SourceFilter = "all" | "bot" | "user";
type MarketTab = "listings" | "gift-prices" | "catalog";

const DEFAULT_GIFT_SETTINGS: AdminGiftPriceSettings = {
  buy_adjust_percent: 0,
  valuation_adjust_percent: 0,
};

const PAGE_SIZE = 50;

function rowKey(row: AdminGiftTraitPrice): string {
  return `${row.collection_slug}\0${row.model}\0${row.backdrop}`;
}

function backdropLabel(backdrop: string): string {
  return backdrop ? backdrop : "модель (без чёрного фона)";
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
  const [tab, setTab] = useState<MarketTab>("catalog");
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

  const [catalog, setCatalog] = useState<AdminGiftTraitPrice[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogFilters, setCatalogFilters] = useState<AdminGiftTraitPriceList["filters"]>({
    collections: [],
    models: [],
    backdrops: [],
  });
  const [filterCollection, setFilterCollection] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [filterBackdrop, setFilterBackdrop] = useState("");
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, string>>({});
  const [savingCatalogKey, setSavingCatalogKey] = useState<string | null>(null);

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

  const loadCatalog = useCallback(
    async (opts?: { offset?: number; collection?: string; model?: string; backdrop?: string }) => {
      const offset = opts?.offset ?? catalogOffset;
      const collection = opts?.collection ?? filterCollection;
      const model = opts?.model ?? filterModel;
      const backdrop = opts?.backdrop ?? filterBackdrop;
      setCatalogLoading(true);
      try {
        const modelOnly = backdrop === "__empty__";
        const data = await getAdminGiftTraitPrices({
          collection: collection || undefined,
          model: model || undefined,
          backdrop: modelOnly ? undefined : backdrop || undefined,
          model_only: modelOnly,
          limit: PAGE_SIZE,
          offset,
        });
        setCatalog(data.items);
        setCatalogTotal(data.total);
        setCatalogFilters(data.filters);
        setCatalogDrafts(
          Object.fromEntries(data.items.map((row) => [rowKey(row), nanotonToTonInput(row.price_nanoton)])),
        );
      } finally {
        setCatalogLoading(false);
      }
    },
    [catalogOffset, filterCollection, filterModel, filterBackdrop],
  );

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
      loadCatalog({ offset: 0 }).catch(() => {});
    });
  }, []);

  const visibleListings = listings.filter((listing) => {
    if (sourceFilter === "all") return true;
    return listing.source === sourceFilter;
  });

  const pageCount = useMemo(() => Math.max(1, Math.ceil(catalogTotal / PAGE_SIZE)), [catalogTotal]);
  const pageIndex = Math.floor(catalogOffset / PAGE_SIZE) + 1;

  async function handleSaveListing(listing: MarketListing) {
    const priceNanoton = tonInputToNanoton(draftPrices[listing.id] ?? "");
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

  async function handleSaveCatalogRow(row: AdminGiftTraitPrice) {
    const key = rowKey(row);
    const priceNanoton = tonInputToNanoton(catalogDrafts[key] ?? "");
    if (priceNanoton <= 0) {
      showToast({ variant: "error", title: "Введите корректную цену" });
      return;
    }
    if (priceNanoton === row.price_nanoton && row.source === "admin") {
      showToast({ variant: "info", title: "Цена не изменилась" });
      return;
    }

    setSavingCatalogKey(key);
    try {
      await updateAdminGiftTraitPrice({
        collection_slug: row.collection_slug,
        model: row.model,
        backdrop: row.backdrop,
        price_nanoton: priceNanoton,
      });
      setCatalog((prev) =>
        prev.map((item) =>
          rowKey(item) === key
            ? { ...item, price_nanoton: priceNanoton, source: "admin", fetched_at: new Date().toISOString() }
            : item,
        ),
      );
      showToast({
        variant: "success",
        title: `Сохранено: ${formatTON(priceNanoton)} TON`,
        subtitle: "Ручная цена, daily sync не перезапишет",
      });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось сохранить цену",
      });
    } finally {
      setSavingCatalogKey(null);
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
      description="Каталог цен моделей, корректировка оценки, выгрузка гифтов бота и цены лотов."
    >
      <AdminToolbar>
        <AdminChip active={tab === "catalog"} onClick={() => setTab("catalog")}>
          Каталог цен
        </AdminChip>
        <AdminChip active={tab === "gift-prices"} onClick={() => setTab("gift-prices")}>
          % к алгоритму
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
            else if (tab === "gift-prices") loadGiftSettings().catch(() => {});
            else loadCatalog().catch(() => {});
          }}
        >
          Обновить
        </AdminButton>
      </AdminToolbar>

      {tab === "catalog" ? (
        <section className="panel space-y-4">
          <div className="space-y-1">
            <p className="text-base font-semibold">Цены моделей ({catalogTotal})</p>
            <p className="text-xs text-muted">
              Пустой фон = цена модели для всех не-чёрных фонов. Black / Onyx Black хранятся отдельно.
              Ручная правка (`admin`) используется в оценке и не затирается daily sync.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted">
              Коллекция
              <select
                className="input-field mt-1"
                value={filterCollection}
                onChange={(e) => {
                  const next = e.target.value;
                  setFilterCollection(next);
                  setFilterModel("");
                  setFilterBackdrop("");
                  setCatalogOffset(0);
                  loadCatalog({ offset: 0, collection: next, model: "", backdrop: "" }).catch(() => {});
                }}
              >
                <option value="">Все</option>
                {catalogFilters.collections.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Модель
              <select
                className="input-field mt-1"
                value={filterModel}
                onChange={(e) => {
                  const next = e.target.value;
                  setFilterModel(next);
                  setFilterBackdrop("");
                  setCatalogOffset(0);
                  loadCatalog({ offset: 0, model: next, backdrop: "" }).catch(() => {});
                }}
              >
                <option value="">Все</option>
                {catalogFilters.models.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Фон
              <select
                className="input-field mt-1"
                value={filterBackdrop}
                onChange={(e) => {
                  const next = e.target.value;
                  setFilterBackdrop(next);
                  setCatalogOffset(0);
                  loadCatalog({ offset: 0, backdrop: next }).catch(() => {});
                }}
              >
                <option value="">Все</option>
                <option value="__empty__">Только модели (без black)</option>
                {catalogFilters.backdrops
                  .filter((b) => b !== "")
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {catalogLoading && catalog.length === 0 ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-raised/50" />
            ))
          ) : catalog.length === 0 ? (
            <p className="text-sm text-muted">
              В базе пока нет цен. Они появятся после оценки подарка или{" "}
              <code className="text-xs">make gift-prices-refresh</code>.
            </p>
          ) : (
            <div className="space-y-2">
              {catalog.map((row) => {
                const key = rowKey(row);
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {row.collection_slug} · {row.model}
                      </p>
                      <p className="text-xs text-muted">
                        {backdropLabel(row.backdrop)} · источник: {row.source}
                        {row.source === "admin" ? " (ручная)" : ""}
                      </p>
                      <p className="text-xs text-muted">Сейчас: {formatTON(row.price_nanoton)} TON</p>
                    </div>
                    <div className="flex items-end gap-2 sm:w-56">
                      <label className="flex-1 text-xs text-muted">
                        Цена (TON)
                        <input
                          className="input-field mt-1"
                          type="text"
                          inputMode="decimal"
                          value={catalogDrafts[key] ?? ""}
                          onChange={(e) =>
                            setCatalogDrafts((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <AdminButton
                        disabled={savingCatalogKey === key}
                        onClick={() => handleSaveCatalogRow(row).catch(() => {})}
                      >
                        {savingCatalogKey === key ? "..." : "Сохранить"}
                      </AdminButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {catalogTotal > PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted">
                Стр. {pageIndex} / {pageCount}
              </p>
              <div className="flex gap-2">
                <AdminButton
                  variant="secondary"
                  disabled={catalogOffset <= 0 || catalogLoading}
                  onClick={() => {
                    const next = Math.max(0, catalogOffset - PAGE_SIZE);
                    setCatalogOffset(next);
                    loadCatalog({ offset: next }).catch(() => {});
                  }}
                >
                  Назад
                </AdminButton>
                <AdminButton
                  variant="secondary"
                  disabled={catalogOffset + PAGE_SIZE >= catalogTotal || catalogLoading}
                  onClick={() => {
                    const next = catalogOffset + PAGE_SIZE;
                    setCatalogOffset(next);
                    loadCatalog({ offset: next }).catch(() => {});
                  }}
                >
                  Далее
                </AdminButton>
              </div>
            </div>
          ) : null}
        </section>
      ) : tab === "gift-prices" ? (
        <section className="panel space-y-4">
          <div className="space-y-1">
            <p className="text-base font-semibold">Корректировка от алгоритма</p>
            <p className="text-xs text-muted">
              Процент от рыночной оценки (каталог / GiftAsset / markets). Отрицательное значение — скидка,
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
