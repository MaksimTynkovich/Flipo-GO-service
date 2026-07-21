"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GiftPickerModal } from "@/components/admin/GiftPickerModal";
import {
  AdminButton,
  AdminChip,
  AdminEmpty,
  AdminField,
  AdminPage,
  AdminPanel,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { AdminPercentField, AdminTonField } from "@/components/admin/AdminInputs";
import { useToast } from "@/components/providers/ToastProvider";
import {
  changesGiftModelImageUrl,
  modelNameFromChangesImageUrl,
  type ChangesGiftModel,
} from "@/lib/changes-gifts";
import { giftImageUrl } from "@/lib/gifts";
import { formatUserError } from "@/lib/user-errors";
import {
  getAdminCases,
  replaceAdminCaseLoot,
  upsertAdminCase,
  type AdminCase,
  type AdminCaseLootEntry,
  type AdminCaseUpsert,
} from "@/lib/api";

const KINDS = [
  { value: "catalog", label: "Каталог" },
  { value: "featured", label: "Featured" },
  { value: "daily", label: "Daily" },
] as const;

const RARITY_OPTIONS = ["common", "uncommon", "rare", "epic", "legendary"] as const;

type CaseDraft = AdminCaseUpsert & { id?: string };
type LootDraft = AdminCaseLootEntry & {
  _key: string;
  _modelName?: string;
};

function emptyCaseDraft(): CaseDraft {
  return {
    slug: "",
    title: "",
    image_url: "",
    accent_color: "#3b82f6",
    price_nanoton: 500_000_000,
    kind: "catalog",
    sort_order: 0,
    active: true,
    require_channel: false,
    target_rtp_bps: 9000,
  };
}

function caseToDraft(c: AdminCase): CaseDraft {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    image_url: c.image_url || "",
    accent_color: c.accent_color || "#3b82f6",
    price_nanoton: c.price_nanoton,
    kind: c.kind || "catalog",
    sort_order: c.sort_order,
    active: c.active,
    require_channel: Boolean(c.require_channel),
    target_rtp_bps: c.target_rtp_bps || 9000,
  };
}

function inferModelName(entry: AdminCaseLootEntry): string | undefined {
  const fromUrl = modelNameFromChangesImageUrl(entry.image_url);
  if (fromUrl) return fromUrl;
  if (entry.display_name?.trim()) return entry.display_name.trim();
  return undefined;
}

function lootToDraft(entries: AdminCaseLootEntry[]): LootDraft[] {
  return (entries || []).map((e, i) => ({
    _key: e.id || `new-${i}-${e.collection_slug}`,
    _modelName: inferModelName(e),
    id: e.id,
    collection_slug: e.collection_slug,
    display_name: e.display_name,
    image_url: e.image_url || "",
    rarity_label: e.rarity_label || "",
    sort_order: e.sort_order ?? i,
    weight: e.weight > 0 ? e.weight : 1,
  }));
}

function lootPreviewUrl(row: LootDraft): string {
  if (row.image_url?.includes("cdn.changes.tg")) return row.image_url;
  if (row._modelName) return changesGiftModelImageUrl(row._modelName);
  return giftImageUrl(row.collection_slug || "unknown", row.image_url);
}

function giftToLootRow(gift: ChangesGiftModel, sortOrder: number): LootDraft {
  return {
    _key: `new-${Date.now()}-${gift.collectionSlug}`,
    _modelName: gift.modelName,
    collection_slug: gift.collectionSlug,
    display_name: gift.displayName,
    image_url: gift.previewUrl,
    rarity_label: "",
    sort_order: sortOrder,
    weight: 1,
  };
}

function chanceLabel(weight: number, total: number): string {
  if (total <= 0 || weight <= 0) return "—";
  const pct = (weight / total) * 100;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

export default function CasesSection() {
  const { showToast } = useToast();
  const [cases, setCases] = useState<AdminCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<CaseDraft>(emptyCaseDraft());
  const [loot, setLoot] = useState<LootDraft[]>([]);
  const [savingCase, setSavingCase] = useState(false);
  const [savingLoot, setSavingLoot] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminCases();
      setCases(data);
      return data;
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось загрузить кейсы"), variant: "error" });
      return [] as AdminCase[];
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load().then((data) => {
      if (data.length > 0) {
        setSelectedId(data[0].id);
        setDraft(caseToDraft(data[0]));
        setLoot(lootToDraft(data[0].loot));
      }
    });
  }, [load]);

  function selectCase(c: AdminCase) {
    setSelectedId(c.id);
    setDraft(caseToDraft(c));
    setLoot(lootToDraft(c.loot));
    setExpandedKey(null);
  }

  function startNew() {
    setSelectedId("new");
    setDraft(emptyCaseDraft());
    setLoot([]);
    setExpandedKey(null);
  }

  const weightTotal = useMemo(
    () => loot.reduce((sum, row) => sum + (row.weight > 0 ? row.weight : 0), 0),
    [loot],
  );

  const lootSlugs = useMemo(
    () => new Set(loot.map((row) => row.collection_slug)),
    [loot],
  );

  async function saveCase() {
    const slug = draft.slug.trim().toLowerCase();
    const title = draft.title.trim();
    if (!slug || !title) {
      showToast({ title: "Нужны slug и title", variant: "error" });
      return;
    }
    const requireChannel =
      draft.require_channel || (draft.kind !== "daily" && draft.price_nanoton <= 0);
    if (draft.kind !== "daily" && draft.price_nanoton <= 0 && !requireChannel) {
      showToast({
        title: "Бесплатный кейс требует подписку на канал",
        variant: "error",
      });
      return;
    }
    setSavingCase(true);
    try {
      const body: AdminCaseUpsert = {
        ...(draft.id ? { id: draft.id } : {}),
        slug,
        title,
        image_url: draft.image_url?.trim() || "",
        accent_color: draft.accent_color?.trim() || "",
        price_nanoton: draft.price_nanoton,
        kind: draft.kind || "catalog",
        sort_order: draft.sort_order,
        active: draft.active,
        require_channel: requireChannel,
        target_rtp_bps: draft.target_rtp_bps > 0 ? draft.target_rtp_bps : 9000,
      };
      const res = await upsertAdminCase(body);
      showToast({ title: draft.id ? "Кейс сохранён" : "Кейс создан", variant: "success" });
      const data = await load();
      const id = res.id || draft.id;
      const found = data.find((c) => c.id === id) ?? data.find((c) => c.slug === slug);
      if (found) {
        selectCase(found);
      }
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось сохранить кейс"), variant: "error" });
    } finally {
      setSavingCase(false);
    }
  }

  async function saveLoot() {
    if (!draft.id || selectedId === "new") {
      showToast({ title: "Сначала сохраните кейс", variant: "error" });
      return;
    }
    const cleaned: AdminCaseLootEntry[] = [];
    for (let i = 0; i < loot.length; i += 1) {
      const row = loot[i];
      const slug = row.collection_slug.trim().toLowerCase();
      if (!slug) {
        showToast({ title: `Приз ${i + 1}: нет collection_slug`, variant: "error" });
        return;
      }
      if (row.weight <= 0) {
        showToast({ title: `Приз ${i + 1}: weight должен быть > 0`, variant: "error" });
        return;
      }
      cleaned.push({
        ...(row.id ? { id: row.id } : {}),
        collection_slug: slug,
        display_name: row.display_name.trim() || slug,
        image_url: row.image_url?.trim() || "",
        rarity_label: row.rarity_label?.trim() || "",
        sort_order: i,
        weight: Math.round(row.weight),
      });
    }
    setSavingLoot(true);
    try {
      await replaceAdminCaseLoot(draft.id, cleaned);
      showToast({ title: "Лут сохранён", variant: "success" });
      const data = await load();
      const found = data.find((c) => c.id === draft.id);
      if (found) selectCase(found);
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось сохранить лут"), variant: "error" });
    } finally {
      setSavingLoot(false);
    }
  }

  function updateLoot(key: string, patch: Partial<LootDraft>) {
    setLoot((prev) => prev.map((row) => (row._key === key ? { ...row, ...patch } : row)));
  }

  function moveLoot(key: string, dir: -1 | 1) {
    setLoot((prev) => {
      const idx = prev.findIndex((r) => r._key === key);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy.map((row, i) => ({ ...row, sort_order: i }));
    });
  }

  function addGift(gift: ChangesGiftModel) {
    setLoot((prev) => [...prev, giftToLootRow(gift, prev.length)]);
  }

  const selected = selectedId && selectedId !== "new"
    ? cases.find((c) => c.id === selectedId)
    : null;

  return (
    <AdminPage
      title="Кейсы"
      description="Метаданные кейса и визуальное наполнение лута. Подарки выбираются из каталога cdn.changes.tg."
    >
      <AdminToolbar>
        <AdminButton variant="secondary" disabled={loading} onClick={() => void load()}>
          Обновить
        </AdminButton>
        <AdminButton onClick={startNew}>Новый кейс</AdminButton>
      </AdminToolbar>

      {loading && cases.length === 0 ? (
        <div className="h-24 animate-pulse rounded-xl bg-surface-raised/50" />
      ) : cases.length === 0 && selectedId !== "new" ? (
        <AdminEmpty>Кейсов пока нет — создайте первый.</AdminEmpty>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {cases.map((c) => (
            <AdminChip key={c.id} active={selectedId === c.id} onClick={() => selectCase(c)}>
              {c.title}
              {!c.active ? " · выкл" : ""}
            </AdminChip>
          ))}
          {selectedId === "new" ? (
            <AdminChip active>Новый</AdminChip>
          ) : null}
        </div>
      )}

      {selectedId ? (
        <>
          <AdminPanel
            title={selectedId === "new" ? "Новый кейс" : `Кейс · ${selected?.slug || draft.slug}`}
            description="Slug после создания не меняется. Цена 0 — бесплатный / daily."
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <AdminField label="Slug" hint="латиница, уникальный">
                <input
                  className="input-field"
                  value={draft.slug}
                  disabled={Boolean(draft.id)}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    }))
                  }
                  placeholder="starter"
                />
              </AdminField>
              <AdminField label="Название">
                <input
                  className="input-field"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </AdminField>
              <AdminField label="Тип">
                <select
                  className="input-field"
                  value={draft.kind}
                  onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminTonField
                label="Цена (TON)"
                valueNanoton={draft.price_nanoton}
                onChangeNanoton={(v) =>
                  setDraft((d) => ({
                    ...d,
                    price_nanoton: v,
                    require_channel:
                      d.kind !== "daily" && v <= 0 ? true : d.require_channel,
                  }))
                }
                hint="0 = бесплатный кейс (нужна подписка на канал)"
              />
              <AdminField label="Порядок">
                <input
                  className="input-field"
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sort_order: Number.parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </AdminField>
              <AdminField label="Accent (#hex)">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-10 cursor-pointer rounded-md border border-white/10 bg-transparent"
                    value={/^#[0-9a-fA-F]{6}$/.test(draft.accent_color || "") ? draft.accent_color! : "#3b82f6"}
                    onChange={(e) => setDraft((d) => ({ ...d, accent_color: e.target.value }))}
                  />
                  <input
                    className="input-field flex-1"
                    value={draft.accent_color || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, accent_color: e.target.value }))}
                  />
                </div>
              </AdminField>
              <AdminPercentField
                label="Target RTP %"
                valueBps={draft.target_rtp_bps}
                onChangeBps={(v) => setDraft((d) => ({ ...d, target_rtp_bps: v }))}
                hint="например 90 = 9000 bps"
              />
              <AdminField label="Image URL">
                <input
                  className="input-field"
                  value={draft.image_url || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, image_url: e.target.value }))}
                  placeholder="опционально"
                />
              </AdminField>
              <label className="flex items-center gap-2 pt-5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                Активен в каталоге
              </label>
              <label className="flex items-start gap-2 pt-5 text-sm text-muted">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={
                    draft.require_channel ||
                    (draft.kind !== "daily" && draft.price_nanoton <= 0)
                  }
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, require_channel: e.target.checked }))
                  }
                />
                <span>
                  Нужна подписка на канал
                  <span className="mt-0.5 block text-[11px] text-muted/80">
                    Для бесплатных (цена 0) обязательно. Канал = PROMO_REQUIRED_CHANNEL.
                  </span>
                </span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminButton disabled={savingCase} onClick={() => void saveCase()}>
                {savingCase ? "…" : draft.id ? "Сохранить кейс" : "Создать кейс"}
              </AdminButton>
            </div>
          </AdminPanel>

          <AdminPanel
            title="Содержимое кейса"
            description={
              draft.id
                ? `${loot.length} приз(ов) · Σ weight = ${weightTotal}. Сохранение полностью заменяет лут.`
                : "Сначала создайте кейс, затем добавьте подарки."
            }
          >
            {!draft.id ? (
              <AdminEmpty>Лут недоступен до сохранения кейса.</AdminEmpty>
            ) : (
              <>
                {loot.length === 0 ? (
                  <AdminEmpty>
                    Пусто — нажмите «Добавить подарок» и выберите модель из каталога.
                  </AdminEmpty>
                ) : (
                  <div className="space-y-2">
                    {loot.map((row, idx) => {
                      const expanded = expandedKey === row._key;
                      return (
                        <div key={row._key} className="admin-loot-card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={lootPreviewUrl(row)}
                            alt=""
                            className="admin-loot-card__img"
                          />
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="admin-loot-card__title">
                                  {row.display_name || row._modelName || row.collection_slug}
                                </p>
                                <p className="admin-loot-card__slug">{row.collection_slug}</p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <AdminButton
                                  variant="secondary"
                                  className="!h-8 !px-2"
                                  disabled={idx === 0}
                                  onClick={() => moveLoot(row._key, -1)}
                                >
                                  ↑
                                </AdminButton>
                                <AdminButton
                                  variant="secondary"
                                  className="!h-8 !px-2"
                                  disabled={idx === loot.length - 1}
                                  onClick={() => moveLoot(row._key, 1)}
                                >
                                  ↓
                                </AdminButton>
                                <AdminButton
                                  variant="secondary"
                                  className="!h-8 !px-2.5 text-xs"
                                  onClick={() =>
                                    setExpandedKey(expanded ? null : row._key)
                                  }
                                >
                                  {expanded ? "Скрыть" : "Ещё"}
                                </AdminButton>
                                <AdminButton
                                  variant="danger"
                                  className="!h-8 !px-2"
                                  onClick={() =>
                                    setLoot((prev) => prev.filter((r) => r._key !== row._key))
                                  }
                                >
                                  ×
                                </AdminButton>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <AdminField label="weight">
                                <input
                                  className="input-field"
                                  type="number"
                                  min={1}
                                  value={row.weight}
                                  onChange={(e) =>
                                    updateLoot(row._key, {
                                      weight: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                                    })
                                  }
                                />
                              </AdminField>
                              <AdminField label="шанс">
                                <div className="input-field flex items-center tabular-nums text-muted">
                                  {chanceLabel(row.weight, weightTotal)}
                                </div>
                              </AdminField>
                              <AdminField label="редкость" className="col-span-2 sm:col-span-2">
                                <div className="flex flex-wrap gap-1">
                                  {RARITY_OPTIONS.map((r) => (
                                    <button
                                      key={r}
                                      type="button"
                                      className={
                                        row.rarity_label === r
                                          ? "rounded-lg bg-[var(--admin-accent-subtle)] px-2 py-1 text-xs text-[var(--admin-fg)]"
                                          : "rounded-lg bg-black/20 px-2 py-1 text-xs text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
                                      }
                                      onClick={() => updateLoot(row._key, { rarity_label: r })}
                                    >
                                      {r}
                                    </button>
                                  ))}
                                  <input
                                    className="input-field min-w-[5rem] flex-1"
                                    value={row.rarity_label || ""}
                                    onChange={(e) =>
                                      updateLoot(row._key, { rarity_label: e.target.value })
                                    }
                                    placeholder="своя"
                                  />
                                </div>
                              </AdminField>
                            </div>

                            {expanded ? (
                              <div className="grid grid-cols-1 gap-2 border-t border-white/5 pt-2 sm:grid-cols-2">
                                <AdminField label="display_name">
                                  <input
                                    className="input-field"
                                    value={row.display_name}
                                    onChange={(e) =>
                                      updateLoot(row._key, { display_name: e.target.value })
                                    }
                                  />
                                </AdminField>
                                <AdminField label="collection_slug" hint="обычно авто из модели">
                                  <input
                                    className="input-field"
                                    value={row.collection_slug}
                                    onChange={(e) =>
                                      updateLoot(row._key, {
                                        collection_slug: e.target.value
                                          .toLowerCase()
                                          .replace(/[^a-z0-9-]/g, ""),
                                      })
                                    }
                                  />
                                </AdminField>
                                <AdminField label="image_url" className="sm:col-span-2" hint="CDN URL, заполняется автоматически">
                                  <input
                                    className="input-field font-mono text-xs"
                                    value={row.image_url || ""}
                                    onChange={(e) =>
                                      updateLoot(row._key, { image_url: e.target.value })
                                    }
                                  />
                                </AdminField>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <AdminButton variant="secondary" onClick={() => setPickerOpen(true)}>
                    + Добавить подарок
                  </AdminButton>
                  <AdminButton disabled={savingLoot || loot.length === 0} onClick={() => void saveLoot()}>
                    {savingLoot ? "…" : "Сохранить лут"}
                  </AdminButton>
                </div>
              </>
            )}
          </AdminPanel>
        </>
      ) : null}

      <GiftPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addGift}
        excludeSlugs={lootSlugs}
      />
    </AdminPage>
  );
}
