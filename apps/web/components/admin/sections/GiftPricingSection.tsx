"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminButton, AdminChip, AdminPage, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminGiftPriceSettings,
  getAdminGiftTraitPrices,
  updateAdminGiftPriceSettings,
  updateAdminGiftTraitPrice,
  type AdminGiftPriceSettings,
  type AdminGiftTraitPrice,
  type AdminGiftTraitPriceList,
} from "@/lib/api";
import { nanotonToTonInput, tonInputToNanoton } from "@/lib/admin-units";

type PricingTab = "catalog" | "adjustments";
const PAGE_SIZE = 50;
const DEFAULT_GIFT_SETTINGS: AdminGiftPriceSettings = {
  buy_adjust_percent: 0,
  valuation_adjust_percent: 0,
};

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
  return Number.isFinite(parsed) ? parsed : null;
}

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

export default function GiftPricingSection() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<PricingTab>("catalog");
  const [giftSettings, setGiftSettings] = useState<AdminGiftPriceSettings | null>(null);
  const [buyDraft, setBuyDraft] = useState("0");
  const [valuationDraft, setValuationDraft] = useState("0");
  const [giftLoading, setGiftLoading] = useState(true);
  const [savingGift, setSavingGift] = useState(false);
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
    [catalogOffset, filterBackdrop, filterCollection, filterModel],
  );

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cachedGift = readCached<AdminGiftPriceSettings>("admin:market:gift-price-settings");
      if (cachedGift) {
        setGiftSettings(cachedGift);
        setBuyDraft(String(cachedGift.buy_adjust_percent ?? 0));
        setValuationDraft(String(cachedGift.valuation_adjust_percent ?? 0));
      }
      loadGiftSettings().catch(() => {});
      loadCatalog({ offset: 0 }).catch(() => {});
    });
  }, [loadCatalog]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(catalogTotal / PAGE_SIZE)), [catalogTotal]);
  const pageIndex = Math.floor(catalogOffset / PAGE_SIZE) + 1;

  async function handleSaveGiftSettings() {
    const buy = parsePercent(buyDraft);
    const valuation = parsePercent(valuationDraft);
    if (buy == null || valuation == null) {
      showToast({ variant: "error", title: "Введите корректные проценты" });
      return;
    }
    if (buy < -90 || buy > 100 || valuation < -90 || valuation > 100) {
      showToast({ variant: "error", title: "Диапазон: от -90% до +100%" });
      return;
    }
    setSavingGift(true);
    try {
      const next = { buy_adjust_percent: buy, valuation_adjust_percent: valuation };
      await updateAdminGiftPriceSettings(next);
      setGiftSettings(next);
      primeCache("admin:market:gift-price-settings", next);
      showToast({ variant: "success", title: "Настройки оценки сохранены" });
    } catch (error) {
      showToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Не удалось сохранить",
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
      showToast({ variant: "success", title: "Цена каталога сохранена" });
    } catch (error) {
      showToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Не удалось сохранить цену",
      });
    } finally {
      setSavingCatalogKey(null);
    }
  }

  return (
    <AdminPage
      title="Цены подарков"
      description="Каталог trait-цен и глобальные корректировки алгоритма оценки. Доступен независимо от маркета."
    >
      <AdminToolbar>
        <AdminChip active={tab === "catalog"} onClick={() => setTab("catalog")}>
          Каталог цен
        </AdminChip>
        <AdminChip active={tab === "adjustments"} onClick={() => setTab("adjustments")}>
          % к алгоритму
        </AdminChip>
        <AdminButton
          variant="secondary"
          onClick={() => {
            if (tab === "catalog") loadCatalog().catch(() => {});
            if (tab === "adjustments") loadGiftSettings().catch(() => {});
          }}
        >
          Обновить
        </AdminButton>
      </AdminToolbar>

      {tab === "catalog" ? (
        <AdminPanel title={`Цены моделей (${catalogTotal})`} description="Ручные цены для каталога оценок подарков.">
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
                <option value="__empty__">Только модели</option>
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
                          onChange={(e) => setCatalogDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </label>
                      <AdminButton disabled={savingCatalogKey === key} onClick={() => void handleSaveCatalogRow(row)}>
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
        </AdminPanel>
      ) : null}

      {tab === "adjustments" ? (
        <AdminPanel title="Корректировка от алгоритма" description="Глобальные проценты к рыночной оценке.">
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
                    value={buyDraft}
                    onChange={(e) => setBuyDraft(filterPercentInput(e.target.value))}
                  />
                  <span className="mt-1 block text-[11px] text-muted">
                    Сейчас: {(giftSettings ?? DEFAULT_GIFT_SETTINGS).buy_adjust_percent}% к алгоритму
                  </span>
                </label>
                <label className="text-xs text-muted">
                  Общая оценка, %
                  <input
                    className="input-field mt-1"
                    type="text"
                    value={valuationDraft}
                    onChange={(e) => setValuationDraft(filterPercentInput(e.target.value))}
                  />
                  <span className="mt-1 block text-[11px] text-muted">
                    Сейчас: {(giftSettings ?? DEFAULT_GIFT_SETTINGS).valuation_adjust_percent}% к алгоритму
                  </span>
                </label>
              </div>
              <AdminButton disabled={savingGift} onClick={() => void handleSaveGiftSettings()}>
                {savingGift ? "Сохраняем…" : "Сохранить"}
              </AdminButton>
            </>
          )}
        </AdminPanel>
      ) : null}
    </AdminPage>
  );
}
