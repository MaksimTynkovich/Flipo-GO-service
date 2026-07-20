"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatUserError } from "@/lib/user-errors";
import {
  getAdminCases,
  replaceAdminCaseLoot,
  upsertAdminCase,
  type AdminCase,
  type AdminCaseLootEntry,
  type AdminCaseUpsert,
} from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";

const KINDS = [
  { value: "catalog", label: "Каталог" },
  { value: "featured", label: "Featured" },
  { value: "daily", label: "Daily" },
] as const;

type CaseDraft = AdminCaseUpsert & { id?: string };
type LootDraft = AdminCaseLootEntry & { _key: string };

function emptyCaseDraft(): CaseDraft {
  return {
    slug: "",
    title: "",
    subtitle: "",
    image_url: "",
    accent_color: "#3b82f6",
    price_nanoton: 0,
    kind: "catalog",
    sort_order: 0,
    active: true,
    target_rtp_bps: 9000,
  };
}

function caseToDraft(c: AdminCase): CaseDraft {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle || "",
    image_url: c.image_url || "",
    accent_color: c.accent_color || "#3b82f6",
    price_nanoton: c.price_nanoton,
    kind: c.kind || "catalog",
    sort_order: c.sort_order,
    active: c.active,
    target_rtp_bps: c.target_rtp_bps || 9000,
  };
}

function lootToDraft(entries: AdminCaseLootEntry[]): LootDraft[] {
  return (entries || []).map((e, i) => ({
    _key: e.id || `new-${i}-${e.collection_slug}`,
    id: e.id,
    collection_slug: e.collection_slug,
    display_name: e.display_name,
    image_url: e.image_url || "",
    rarity_label: e.rarity_label || "",
    sort_order: e.sort_order ?? i,
    weight: e.weight > 0 ? e.weight : 1,
  }));
}

function emptyLootRow(sortOrder: number): LootDraft {
  return {
    _key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    collection_slug: "",
    display_name: "",
    image_url: "",
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
  }

  function startNew() {
    setSelectedId("new");
    setDraft(emptyCaseDraft());
    setLoot([]);
  }

  const weightTotal = useMemo(
    () => loot.reduce((sum, row) => sum + (row.weight > 0 ? row.weight : 0), 0),
    [loot],
  );

  async function saveCase() {
    const slug = draft.slug.trim().toLowerCase();
    const title = draft.title.trim();
    if (!slug || !title) {
      showToast({ title: "Нужны slug и title", variant: "error" });
      return;
    }
    setSavingCase(true);
    try {
      const body: AdminCaseUpsert = {
        ...(draft.id ? { id: draft.id } : {}),
        slug,
        title,
        subtitle: draft.subtitle?.trim() || "",
        image_url: draft.image_url?.trim() || "",
        accent_color: draft.accent_color?.trim() || "",
        price_nanoton: draft.price_nanoton,
        kind: draft.kind || "catalog",
        sort_order: draft.sort_order,
        active: draft.active,
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
        showToast({ title: `Строка ${i + 1}: укажите collection_slug`, variant: "error" });
        return;
      }
      if (row.weight <= 0) {
        showToast({ title: `Строка ${i + 1}: weight должен быть > 0`, variant: "error" });
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

  const selected = selectedId && selectedId !== "new"
    ? cases.find((c) => c.id === selectedId)
    : null;

  return (
    <AdminPage
      title="Кейсы"
      description="CRUD кейсов и таблицы лута. Веса определяют шанс выпадения; RTP — ориентир для балансировки."
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
              <AdminField label="Подзаголовок">
                <input
                  className="input-field"
                  value={draft.subtitle || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
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
                onChangeNanoton={(v) => setDraft((d) => ({ ...d, price_nanoton: v }))}
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
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminButton disabled={savingCase} onClick={() => void saveCase()}>
                {savingCase ? "…" : draft.id ? "Сохранить кейс" : "Создать кейс"}
              </AdminButton>
            </div>
          </AdminPanel>

          <AdminPanel
            title="Лут"
            description={
              draft.id
                ? `Σ weight = ${weightTotal}. Сохранение полностью заменяет таблицу.`
                : "Сначала создайте кейс, затем добавьте лут."
            }
          >
            {!draft.id ? (
              <AdminEmpty>Лут недоступен до сохранения кейса.</AdminEmpty>
            ) : (
              <>
                <div className="space-y-2">
                  {loot.length === 0 ? (
                    <AdminEmpty>Пусто — добавьте хотя бы один приз.</AdminEmpty>
                  ) : (
                    loot.map((row, idx) => (
                      <div
                        key={row._key}
                        className="grid grid-cols-1 gap-2 rounded-xl bg-surface-raised/45 p-2.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_5rem_5.5rem_auto]"
                      >
                        <div className="flex items-center justify-center sm:pt-5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={giftImageUrl(row.collection_slug || "unknown", row.image_url)}
                            alt=""
                            className="h-9 w-9 object-contain opacity-90"
                          />
                        </div>
                        <AdminField label="collection_slug">
                          <input
                            className="input-field"
                            value={row.collection_slug}
                            onChange={(e) =>
                              updateLoot(row._key, {
                                collection_slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                              })
                            }
                            placeholder="plush-pepe"
                          />
                        </AdminField>
                        <AdminField label="display_name">
                          <input
                            className="input-field"
                            value={row.display_name}
                            onChange={(e) => updateLoot(row._key, { display_name: e.target.value })}
                            placeholder="Plush Pepe"
                          />
                        </AdminField>
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
                        <div className="flex flex-wrap items-end gap-1 sm:pt-5">
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
                            variant="danger"
                            className="!h-8 !px-2"
                            onClick={() => setLoot((prev) => prev.filter((r) => r._key !== row._key))}
                          >
                            ×
                          </AdminButton>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:col-span-5 sm:grid-cols-2">
                          <AdminField label="rarity_label">
                            <input
                              className="input-field"
                              value={row.rarity_label || ""}
                              onChange={(e) => updateLoot(row._key, { rarity_label: e.target.value })}
                              placeholder="common / rare / …"
                            />
                          </AdminField>
                          <AdminField label="image_url">
                            <input
                              className="input-field"
                              value={row.image_url || ""}
                              onChange={(e) => updateLoot(row._key, { image_url: e.target.value })}
                              placeholder="пусто = Fragment preview"
                            />
                          </AdminField>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminButton
                    variant="secondary"
                    onClick={() => setLoot((prev) => [...prev, emptyLootRow(prev.length)])}
                  >
                    + Приз
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
    </AdminPage>
  );
}
