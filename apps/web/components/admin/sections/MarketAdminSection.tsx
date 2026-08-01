"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, X } from "lucide-react";
import { AdminButton, AdminChip, AdminPage, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { useToast } from "@/components/providers/ToastProvider";
import {
  bulkAdminMarketListings,
  cancelAdminMarketListing,
  createAdminBotMarketListing,
  formatTON,
  getAdminBotMarketStock,
  getAdminMarketListings,
  getAdminMarketStats,
  repriceAdminBotMarketGifts,
  syncAdminBotMarketGifts,
  updateAdminMarketListingPrice,
  type AdminBotStockItem,
  type AdminMarketStats,
  type MarketListing,
} from "@/lib/api";
import { giftImageUrlFromURL } from "@/lib/gifts";
import { nanotonToTonInput, tonInputToNanoton } from "@/lib/admin-units";

type MarketTab = "listings" | "stock" | "stats";
type SourceFilter = "all" | "bot" | "user";
type ListedFilter = "unlisted" | "listed" | "all";

const PAGE_SIZE = 40;

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

export default function MarketAdminSection() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<MarketTab>("listings");

  const [listings, setListings] = useState<MarketListing[]>([]);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [listingsOffset, setListingsOffset] = useState(0);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPercent, setBulkPercent] = useState("0");

  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [collection, setCollection] = useState("");
  const [collectionDraft, setCollectionDraft] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("bot");
  const [statusFilter, setStatusFilter] = useState("active");
  const [priceMinTon, setPriceMinTon] = useState("");
  const [priceMaxTon, setPriceMaxTon] = useState("");
  const [priceMinDraft, setPriceMinDraft] = useState("");
  const [priceMaxDraft, setPriceMaxDraft] = useState("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");

  const [stock, setStock] = useState<AdminBotStockItem[]>([]);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockOffset, setStockOffset] = useState(0);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockQ, setStockQ] = useState("");
  const [stockQDraft, setStockQDraft] = useState("");
  const [listedFilter, setListedFilter] = useState<ListedFilter>("unlisted");
  const [stockDraftPrices, setStockDraftPrices] = useState<Record<string, string>>({});
  const [stockBusyId, setStockBusyId] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminMarketStats | null>(null);
  const [statsDays, setStatsDays] = useState<number | undefined>(30);
  const [statsLoading, setStatsLoading] = useState(false);

  const [syncingBot, setSyncingBot] = useState(false);
  const [repricingBot, setRepricingBot] = useState(false);
  const [detail, setDetail] = useState<MarketListing | null>(null);

  const loadListings = useCallback(
    async (opts?: {
      offset?: number;
      q?: string;
      collection?: string;
      source?: SourceFilter;
      status?: string;
      priceMinTon?: string;
      priceMaxTon?: string;
      sort?: "newest" | "price_asc" | "price_desc";
    }) => {
      const offset = opts?.offset ?? listingsOffset;
      const nextQ = opts?.q ?? q;
      const nextCollection = opts?.collection ?? collection;
      const nextSource = opts?.source ?? sourceFilter;
      const nextStatus = opts?.status ?? statusFilter;
      const nextPriceMin = opts?.priceMinTon ?? priceMinTon;
      const nextPriceMax = opts?.priceMaxTon ?? priceMaxTon;
      const nextSort = opts?.sort ?? sort;
      setListingsLoading(true);
      try {
        const priceMin = tonInputToNanoton(nextPriceMin);
        const priceMax = tonInputToNanoton(nextPriceMax);
        const data = await getAdminMarketListings({
          q: nextQ || undefined,
          collection: nextCollection || undefined,
          source: nextSource === "all" ? undefined : nextSource,
          status: nextStatus || undefined,
          price_min: priceMin > 0 ? priceMin : undefined,
          price_max: priceMax > 0 ? priceMax : undefined,
          sort: nextSort,
          limit: PAGE_SIZE,
          offset,
        });
        setListings(data.items);
        setListingsTotal(data.total);
        setDraftPrices(
          Object.fromEntries(data.items.map((listing) => [listing.id, nanotonToTonInput(listing.price_nanoton)])),
        );
        setSelectedIds(new Set());
      } catch (err) {
        showToast({
          variant: "error",
          title: err instanceof Error ? err.message : "Не удалось загрузить лоты",
        });
      } finally {
        setListingsLoading(false);
      }
    },
    [collection, listingsOffset, priceMaxTon, priceMinTon, q, showToast, sort, sourceFilter, statusFilter],
  );

  const loadStock = useCallback(
    async (opts?: { offset?: number }) => {
      const offset = opts?.offset ?? stockOffset;
      setStockLoading(true);
      try {
        const data = await getAdminBotMarketStock({
          q: stockQ || undefined,
          listed: listedFilter === "all" ? undefined : listedFilter === "listed",
          limit: PAGE_SIZE,
          offset,
        });
        setStock(data.items);
        setStockTotal(data.total);
        setStockDraftPrices(
          Object.fromEntries(
            data.items.map((item) => [
              item.id,
              nanotonToTonInput(
                item.listing_price_nanoton ||
                  item.suggested_price_nanoton ||
                  item.floor_price_nanoton ||
                  0,
              ),
            ]),
          ),
        );
      } catch (err) {
        showToast({
          variant: "error",
          title: err instanceof Error ? err.message : "Не удалось загрузить сток",
        });
      } finally {
        setStockLoading(false);
      }
    },
    [listedFilter, showToast, stockOffset, stockQ],
  );

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await getAdminMarketStats(statsDays));
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось загрузить статистику",
      });
    } finally {
      setStatsLoading(false);
    }
  }, [showToast, statsDays]);

  useEffect(() => {
    setListingsOffset(0);
    loadListings({ offset: 0, source: sourceFilter, status: statusFilter, sort }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter, statusFilter, sort]);

  useEffect(() => {
    if (tab === "stock") loadStock().catch(() => {});
    if (tab === "stats") loadStats().catch(() => {});
  }, [tab, loadStock, loadStats]);

  const listingsPageCount = useMemo(
    () => Math.max(1, Math.ceil(listingsTotal / PAGE_SIZE)),
    [listingsTotal],
  );
  const listingsPageIndex = Math.floor(listingsOffset / PAGE_SIZE) + 1;
  const stockPageCount = useMemo(() => Math.max(1, Math.ceil(stockTotal / PAGE_SIZE)), [stockTotal]);
  const stockPageIndex = Math.floor(stockOffset / PAGE_SIZE) + 1;

  const allSelected = listings.length > 0 && listings.every((l) => selectedIds.has(l.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(listings.map((l) => l.id)));
  }

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
      if (detail?.id === listing.id) {
        setDetail({ ...listing, price_nanoton: priceNanoton });
      }
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

  async function handleCancelListing(listing: MarketListing) {
    if (!window.confirm(`Снять «${listing.item.name}» с продажи?`)) return;
    setSavingId(listing.id);
    try {
      await cancelAdminMarketListing(listing.id);
      setDetail(null);
      await loadListings();
      showToast({ variant: "success", title: "Лот снят с продажи" });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось снять лот",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleBulk(action: "cancel" | "reprice_percent") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast({ variant: "info", title: "Выберите лоты" });
      return;
    }
    let percent = 0;
    if (action === "reprice_percent") {
      const parsed = parsePercent(bulkPercent);
      if (parsed == null) {
        showToast({ variant: "error", title: "Введите корректный %" });
        return;
      }
      percent = parsed;
    }
    if (action === "cancel" && !window.confirm(`Снять с продажи ${ids.length} лот(ов)?`)) return;

    setBulkBusy(true);
    try {
      const result = await bulkAdminMarketListings({ action, ids, percent });
      await loadListings();
      showToast({
        variant: result.failed > 0 ? "info" : "success",
        title: action === "cancel" ? "Массовое снятие" : "Массовый reprice",
        subtitle: `обновлено: ${result.updated} · ошибок: ${result.failed}`,
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
        title: err instanceof Error ? err.message : "Bulk-операция не удалась",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleSyncBotGifts() {
    setSyncingBot(true);
    try {
      const result = await syncAdminBotMarketGifts();
      await loadListings({ offset: listingsOffset });
      if (tab === "stock") await loadStock();
      showToast({
        variant: result.listed > 0 ? "success" : "info",
        title: "Синхронизация бота",
        subtitle: `скан: ${result.scanned} · выгружено: ${result.listed} · без цены: ${result.skipped_unpriced}`,
      });
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
      await loadListings({ offset: listingsOffset });
      showToast({
        variant: result.updated > 0 ? "success" : "info",
        title: "Цены обновлены по алгоритму",
        subtitle: `лотов: ${result.listings_checked} · обновлено: ${result.updated}`,
      });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось обновить цены",
      });
    } finally {
      setRepricingBot(false);
    }
  }

  async function handleListStockItem(item: AdminBotStockItem) {
    const priceNanoton = tonInputToNanoton(stockDraftPrices[item.id] ?? "");
    setStockBusyId(item.id);
    try {
      await createAdminBotMarketListing(item.id, priceNanoton > 0 ? priceNanoton : undefined);
      await loadStock();
      showToast({ variant: "success", title: "Подарок выставлен на маркет" });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось выставить",
      });
    } finally {
      setStockBusyId(null);
    }
  }

  async function handleUnlistStockItem(item: AdminBotStockItem) {
    if (!item.listing_id) return;
    if (!window.confirm(`Снять «${item.name}» с маркета?`)) return;
    setStockBusyId(item.id);
    try {
      await cancelAdminMarketListing(item.listing_id);
      await loadStock();
      showToast({ variant: "success", title: "Снято с маркета" });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось снять",
      });
    } finally {
      setStockBusyId(null);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ variant: "info", title: "Скопировано" });
    } catch {
      // ignore
    }
  }

  return (
    <AdminPage title="Маркет" description="Операции по бот-лотам: витрина, сток и продажи.">
      <AdminToolbar>
        <AdminChip active={tab === "listings"} onClick={() => setTab("listings")}>
          Лоты
        </AdminChip>
        <AdminChip active={tab === "stock"} onClick={() => setTab("stock")}>
          Сток бота
        </AdminChip>
        <AdminChip active={tab === "stats"} onClick={() => setTab("stats")}>
          Статистика
        </AdminChip>
        <AdminButton variant="secondary" disabled={syncingBot} onClick={() => void handleSyncBotGifts()}>
          {syncingBot ? "Синхронизация…" : "Выгрузить подарки бота"}
        </AdminButton>
        <AdminButton variant="secondary" disabled={repricingBot} onClick={() => void handleRepriceBotGifts()}>
          {repricingBot ? "Пересчёт…" : "Обновить цены по алгоритму"}
        </AdminButton>
        <AdminButton
          variant="secondary"
          onClick={() => {
            if (tab === "listings") loadListings().catch(() => {});
            if (tab === "stock") loadStock().catch(() => {});
            if (tab === "stats") loadStats().catch(() => {});
          }}
        >
          Обновить
        </AdminButton>
      </AdminToolbar>

      {tab === "listings" ? (
        <>
          <AdminPanel title="Фильтры" description="Серверный поиск по активным и архивным лотам.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-muted">
                Поиск
                <input
                  className="input-field mt-1"
                  value={qDraft}
                  placeholder="имя, slug, модель…"
                  onChange={(e) => setQDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setQ(qDraft.trim());
                      setListingsOffset(0);
                    }
                  }}
                />
              </label>
              <label className="text-xs text-muted">
                Коллекция
                <input
                  className="input-field mt-1"
                  value={collectionDraft}
                  placeholder="slug"
                  onChange={(e) => setCollectionDraft(e.target.value)}
                />
              </label>
              <label className="text-xs text-muted">
                Цена от (TON)
                <input
                  className="input-field mt-1"
                  value={priceMinDraft}
                  inputMode="decimal"
                  onChange={(e) => setPriceMinDraft(e.target.value)}
                />
              </label>
              <label className="text-xs text-muted">
                Цена до (TON)
                <input
                  className="input-field mt-1"
                  value={priceMaxDraft}
                  inputMode="decimal"
                  onChange={(e) => setPriceMaxDraft(e.target.value)}
                />
              </label>
            </div>
            <AdminToolbar className="mt-2">
              <AdminChip active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
                Все источники
              </AdminChip>
              <AdminChip active={sourceFilter === "bot"} onClick={() => setSourceFilter("bot")}>
                Бот
              </AdminChip>
              <AdminChip active={sourceFilter === "user"} onClick={() => setSourceFilter("user")}>
                Пользователи
              </AdminChip>
              <AdminChip active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
                Активные
              </AdminChip>
              <AdminChip active={statusFilter === "sold"} onClick={() => setStatusFilter("sold")}>
                Проданные
              </AdminChip>
              <AdminChip active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")}>
                Снятые
              </AdminChip>
              <select
                className="input-field w-auto"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="newest">Сначала новые</option>
                <option value="price_asc">Цена ↑</option>
                <option value="price_desc">Цена ↓</option>
              </select>
              <AdminButton
                onClick={() => {
                  const nextQ = qDraft.trim();
                  const nextCollection = collectionDraft.trim();
                  setQ(nextQ);
                  setCollection(nextCollection);
                  setPriceMinTon(priceMinDraft);
                  setPriceMaxTon(priceMaxDraft);
                  setListingsOffset(0);
                  loadListings({
                    offset: 0,
                    q: nextQ,
                    collection: nextCollection,
                    source: sourceFilter,
                    status: statusFilter,
                    priceMinTon: priceMinDraft,
                    priceMaxTon: priceMaxDraft,
                    sort,
                  }).catch(() => {});
                }}
              >
                Применить
              </AdminButton>
            </AdminToolbar>
          </AdminPanel>

          {statusFilter === "active" ? (
            <AdminToolbar>
              <AdminButton variant="secondary" onClick={toggleSelectAll}>
                {allSelected ? "Снять выбор" : "Выбрать все на стр."}
              </AdminButton>
              <label className="flex items-center gap-2 text-xs text-muted">
                Bulk %
                <input
                  className="input-field w-20"
                  value={bulkPercent}
                  onChange={(e) => setBulkPercent(filterPercentInput(e.target.value))}
                />
              </label>
              <AdminButton
                variant="secondary"
                disabled={bulkBusy || selectedIds.size === 0}
                onClick={() => void handleBulk("reprice_percent")}
              >
                Применить % к выбранным
              </AdminButton>
              <AdminButton
                variant="danger"
                disabled={bulkBusy || selectedIds.size === 0}
                onClick={() => void handleBulk("cancel")}
              >
                Снять выбранные
              </AdminButton>
              <span className="text-xs text-muted">Выбрано: {selectedIds.size}</span>
            </AdminToolbar>
          ) : null}

          <AdminPanel title={`Лоты (${listingsTotal})`}>
            {listingsLoading && listings.length === 0 ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-xl bg-surface-raised/50" />
              ))
            ) : listings.length === 0 ? (
              <p className="text-sm text-muted">Нет лотов по фильтрам</p>
            ) : (
              <div className="space-y-2">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
                  >
                    {statusFilter === "active" ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(listing.id)}
                        onChange={() => toggleSelect(listing.id)}
                        className="mt-1"
                      />
                    ) : null}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => setDetail(listing)}
                    >
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
                          {listing.item.model || listing.item.sub_name || listing.item.collection_slug} ·{" "}
                          {listing.source === "bot" ? "бот" : "пользователь"} · {listing.status}
                        </p>
                        <p className="text-xs text-muted">{formatTON(listing.price_nanoton)} TON</p>
                      </div>
                    </button>
                    {listing.status === "active" ? (
                      <div className="flex items-end gap-2 sm:w-64">
                        <label className="flex-1 text-xs text-muted">
                          Цена (TON)
                          <input
                            className="input-field mt-1"
                            type="text"
                            inputMode="decimal"
                            value={draftPrices[listing.id] ?? ""}
                            onChange={(e) =>
                              setDraftPrices((prev) => ({ ...prev, [listing.id]: e.target.value }))
                            }
                          />
                        </label>
                        <AdminButton
                          disabled={savingId === listing.id}
                          onClick={() => void handleSaveListing(listing)}
                        >
                          {savingId === listing.id ? "..." : "OK"}
                        </AdminButton>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {listingsTotal > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-xs text-muted">
                  Стр. {listingsPageIndex} / {listingsPageCount}
                </p>
                <div className="flex gap-2">
                  <AdminButton
                    variant="secondary"
                    disabled={listingsOffset <= 0 || listingsLoading}
                    onClick={() => {
                      const next = Math.max(0, listingsOffset - PAGE_SIZE);
                      setListingsOffset(next);
                      loadListings({ offset: next }).catch(() => {});
                    }}
                  >
                    Назад
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    disabled={listingsOffset + PAGE_SIZE >= listingsTotal || listingsLoading}
                    onClick={() => {
                      const next = listingsOffset + PAGE_SIZE;
                      setListingsOffset(next);
                      loadListings({ offset: next }).catch(() => {});
                    }}
                  >
                    Далее
                  </AdminButton>
                </div>
              </div>
            ) : null}
          </AdminPanel>
        </>
      ) : null}

      {tab === "stock" ? (
        <>
          <AdminToolbar>
            <input
              className="input-field max-w-xs"
              value={stockQDraft}
              placeholder="Поиск по стоку…"
              onChange={(e) => setStockQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setStockQ(stockQDraft.trim());
                  setStockOffset(0);
                }
              }}
            />
            <AdminChip active={listedFilter === "unlisted"} onClick={() => setListedFilter("unlisted")}>
              Не на витрине
            </AdminChip>
            <AdminChip active={listedFilter === "listed"} onClick={() => setListedFilter("listed")}>
              На витрине
            </AdminChip>
            <AdminChip active={listedFilter === "all"} onClick={() => setListedFilter("all")}>
              Все
            </AdminChip>
            <AdminButton
              onClick={() => {
                setStockQ(stockQDraft.trim());
                setStockOffset(0);
                loadStock({ offset: 0 }).catch(() => {});
              }}
            >
              Найти
            </AdminButton>
          </AdminToolbar>

          <AdminPanel title={`Сток бота (${stockTotal})`} description="Выставление и снятие подарков вручную.">
            {stockLoading && stock.length === 0 ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-xl bg-surface-raised/50" />
              ))
            ) : stock.length === 0 ? (
              <p className="text-sm text-muted">Пусто</p>
            ) : (
              <div className="space-y-2">
                {stock.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={giftImageUrlFromURL(item.image_url)}
                          alt={item.name}
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-xs text-muted">
                          NFT
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-xs text-muted">
                          {item.model || item.sub_name || item.collection_slug} · {item.status}
                          {item.listed ? " · на витрине" : ""}
                        </p>
                        <p className="text-xs text-muted">
                          floor {formatTON(item.floor_price_nanoton)} TON
                          {item.suggested_price_nanoton
                            ? ` · suggest ${formatTON(item.suggested_price_nanoton)} TON`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-end gap-2 sm:w-72">
                      {!item.listed ? (
                        <>
                          <label className="flex-1 text-xs text-muted">
                            Цена (TON)
                            <input
                              className="input-field mt-1"
                              value={stockDraftPrices[item.id] ?? ""}
                              onChange={(e) =>
                                setStockDraftPrices((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                            />
                          </label>
                          <AdminButton
                            disabled={stockBusyId === item.id}
                            onClick={() => void handleListStockItem(item)}
                          >
                            {stockBusyId === item.id ? "..." : "Выставить"}
                          </AdminButton>
                        </>
                      ) : (
                        <AdminButton
                          variant="danger"
                          disabled={stockBusyId === item.id}
                          onClick={() => void handleUnlistStockItem(item)}
                        >
                          {stockBusyId === item.id ? "..." : "Снять"}
                        </AdminButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stockTotal > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-xs text-muted">
                  Стр. {stockPageIndex} / {stockPageCount}
                </p>
                <div className="flex gap-2">
                  <AdminButton
                    variant="secondary"
                    disabled={stockOffset <= 0 || stockLoading}
                    onClick={() => {
                      const next = Math.max(0, stockOffset - PAGE_SIZE);
                      setStockOffset(next);
                      loadStock({ offset: next }).catch(() => {});
                    }}
                  >
                    Назад
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    disabled={stockOffset + PAGE_SIZE >= stockTotal || stockLoading}
                    onClick={() => {
                      const next = stockOffset + PAGE_SIZE;
                      setStockOffset(next);
                      loadStock({ offset: next }).catch(() => {});
                    }}
                  >
                    Далее
                  </AdminButton>
                </div>
              </div>
            ) : null}
          </AdminPanel>
        </>
      ) : null}

      {tab === "stats" ? (
        <AdminPanel title="Продажи и fee" description="Агрегаты по market_listings и ledger.">
          <AdminToolbar>
            <AdminChip active={statsDays === 7} onClick={() => setStatsDays(7)}>
              7 дней
            </AdminChip>
            <AdminChip active={statsDays === 30} onClick={() => setStatsDays(30)}>
              30 дней
            </AdminChip>
            <AdminChip active={statsDays === undefined} onClick={() => setStatsDays(undefined)}>
              Всё время
            </AdminChip>
          </AdminToolbar>
          {statsLoading && !stats ? (
            <div className="h-28 animate-pulse rounded-xl bg-surface-raised/50" />
          ) : stats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Активные лоты" value={String(stats.active_count)} />
              <StatCard label="Продаж" value={String(stats.sold_count)} />
              <StatCard label="Объём" value={`${formatTON(stats.volume_nanoton)} TON`} />
              <StatCard label="Fee" value={`${formatTON(stats.fees_nanoton)} TON`} />
            </div>
          ) : (
            <p className="text-sm text-muted">Нет данных</p>
          )}
        </AdminPanel>
      ) : null}

      {detail ? (
        <ModalOverlay onClose={() => setDetail(null)} analyticsModalId="admin_market_listing_detail">
          {(close) => (
            <div
              role="dialog"
              aria-modal="true"
              className="relative mx-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="font-medium">Лот</p>
                <button type="button" className="rounded-lg p-1 text-muted hover:bg-surface-raised" onClick={close}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 overflow-y-auto p-4">
                {detail.item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={giftImageUrlFromURL(detail.item.image_url)}
                    alt={detail.item.name}
                    className="mx-auto h-40 w-40 rounded-xl object-cover"
                  />
                ) : null}
                <div>
                  <p className="text-lg font-semibold">{detail.item.name}</p>
                  <p className="text-sm text-muted">
                    {detail.item.collection_slug}
                    {detail.item.model ? ` · ${detail.item.model}` : ""}
                    {detail.item.backdrop ? ` · ${detail.item.backdrop}` : ""}
                  </p>
                </div>
                <div className="space-y-1 text-sm">
                  <p>
                    Цена: <span className="font-medium">{formatTON(detail.price_nanoton)} TON</span>
                  </p>
                  <p className="text-muted">
                    {detail.source} · {detail.status}
                  </p>
                  <p className="truncate text-xs text-muted">id: {detail.id}</p>
                </div>
                {detail.status === "active" ? (
                  <div className="flex items-end gap-2">
                    <label className="flex-1 text-xs text-muted">
                      Новая цена (TON)
                      <input
                        className="input-field mt-1"
                        value={draftPrices[detail.id] ?? nanotonToTonInput(detail.price_nanoton)}
                        onChange={(e) =>
                          setDraftPrices((prev) => ({ ...prev, [detail.id]: e.target.value }))
                        }
                      />
                    </label>
                    <AdminButton disabled={savingId === detail.id} onClick={() => void handleSaveListing(detail)}>
                      Сохранить
                    </AdminButton>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <AdminButton variant="secondary" onClick={() => void copyText(detail.id)}>
                    <span className="inline-flex items-center gap-1">
                      <Copy className="h-3.5 w-3.5" /> ID лота
                    </span>
                  </AdminButton>
                  <AdminButton variant="secondary" onClick={() => void copyText(detail.item.id)}>
                    ID предмета
                  </AdminButton>
                  {detail.status === "active" ? (
                    <AdminButton variant="danger" disabled={savingId === detail.id} onClick={() => void handleCancelListing(detail)}>
                      Снять с продажи
                    </AdminButton>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </ModalOverlay>
      ) : null}
    </AdminPage>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised/40 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
