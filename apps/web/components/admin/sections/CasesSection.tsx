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
import { AdminFloatField, AdminPercentField, AdminTonField, AdminIntField } from "@/components/admin/AdminInputs";
import { useToast } from "@/components/providers/ToastProvider";
import {
  changesGiftModelImageUrl,
  modelNameFromChangesImageUrl,
  type ChangesGiftModel,
} from "@/lib/changes-gifts";
import { giftImageUrl } from "@/lib/gifts";
import { formatUserError } from "@/lib/user-errors";
import { chancePercentFromWeight, applyChancePercentWeights } from "@/lib/admin-units";
import {
  candyTileBackgroundForLoot,
  getCatalogAccent,
  LOOT_TILE_COLOR_OPTIONS,
  normalizeLootTileColor,
} from "@/components/cases/case-ui";
import { CaseDetailPlayerPreview } from "@/components/cases/CaseDetailPlayerPreview";
import { CasesPageAdminPreview } from "@/components/cases/CasesPageAdminPreview";
import {
  lootDraftsToPreview,
  previewCtaLabel,
} from "@/components/cases/case-detail-preview-utils";
import {
  deleteAdminCasePromoCode,
  getAdminCaseCatalogSettings,
  getAdminCaseLiveFeedSettings,
  getAdminCasePromoCodes,
  getAdminCases,
  replaceAdminCaseLoot,
  resolveAsset,
  updateAdminCaseCatalogSettings,
  updateAdminCaseLiveFeedSettings,
  uploadAdminCaseImage,
  upsertAdminCase,
  upsertAdminCasePromoCode,
  simulateAdminCase,
  formatTON,
  type AdminCase,
  type AdminCaseLiveFeedSettings,
  type AdminCaseLootEntry,
  type AdminCasePromoCode,
  type AdminCaseSimulateResult,
  type AdminCaseUpsert,
} from "@/lib/api";
import { Upload } from "lucide-react";

const KINDS = [
  { value: "catalog", label: "Каталог" },
  { value: "featured", label: "Баннер (Featured)" },
  { value: "daily", label: "Баннер (Daily)" },
  { value: "promo", label: "Промокод" },
] as const;

const SIM_ITERATIONS = 100;

function bpsPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

const EMPTY_CASE_PROMO: Omit<AdminCasePromoCode, "used_count" | "created_at"> = {
  code: "",
  case_id: "",
  max_uses: 0,
  active: true,
};

const DEFAULT_LIVE_SETTINGS: AdminCaseLiveFeedSettings = {
  enabled: false,
  intensity: 1,
  fill_when_sparse: true,
  min_visible: 6,
  common_weight: 50,
  uncommon_weight: 25,
  rare_weight: 15,
  epic_weight: 7,
  legendary_weight: 3,
  fat_chance: 0.08,
  fat_min_floor_nanoton: 5_000_000_000,
};

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
    tile_background_color: e.tile_background_color || "",
    sort_order: e.sort_order ?? i,
    weight: e.weight > 0 ? e.weight : 1,
    floor_price_nanoton: e.floor_price_nanoton ?? 0,
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
    tile_background_color: "",
    sort_order: sortOrder,
    weight: 1,
    floor_price_nanoton: 0,
  };
}

function formatChanceInput(weight: number, total: number): string {
  const pct = chancePercentFromWeight(weight, total);
  if (pct <= 0) return "0";
  if (pct >= 10) return pct.toFixed(1);
  if (pct >= 1) return pct.toFixed(2);
  return pct.toFixed(3);
}

function LootChanceField({
  rowKey,
  weight,
  weightTotal,
  loot,
  onApplyWeights,
}: {
  rowKey: string;
  weight: number;
  weightTotal: number;
  loot: { _key: string; weight: number }[];
  onApplyWeights: (weights: Record<string, number>) => void;
}) {
  const formatted = formatChanceInput(weight, weightTotal);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatted);

  useEffect(() => {
    if (!focused) setText(formatted);
  }, [formatted, focused]);

  function applyPercent(raw: string) {
    const parsed = Number.parseFloat(raw.trim().replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    onApplyWeights(
      applyChancePercentWeights(
        parsed,
        rowKey,
        loot.map((r) => ({ key: r._key, weight: r.weight })),
      ),
    );
  }

  return (
    <AdminField
      label="шанс %"
      hint="Задаёт долю этого приза; остальные веса пересчитываются пропорционально"
    >
      <input
        className="input-field tabular-nums"
        type="text"
        inputMode="decimal"
        value={focused ? text : formatted}
        onFocus={() => {
          setFocused(true);
          setText(formatted);
        }}
        onChange={(e) => {
          const next = e.target.value.replace(",", ".");
          setText(next);
          if (next.trim() === "" || next === "." || next.endsWith(".")) return;
          applyPercent(next);
        }}
        onBlur={() => {
          applyPercent(text);
          setFocused(false);
        }}
      />
    </AdminField>
  );
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [bannersEnabled, setBannersEnabled] = useState(false);
  const [savingBanners, setSavingBanners] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [casePromos, setCasePromos] = useState<AdminCasePromoCode[]>([]);
  const [casePromosLoading, setCasePromosLoading] = useState(false);
  const [casePromoDraft, setCasePromoDraft] = useState(EMPTY_CASE_PROMO);
  const [savingCasePromo, setSavingCasePromo] = useState(false);
  const [deletingCasePromo, setDeletingCasePromo] = useState<string | null>(null);
  const [liveSettings, setLiveSettings] = useState<AdminCaseLiveFeedSettings>(DEFAULT_LIVE_SETTINGS);
  const [liveSettingsLoading, setLiveSettingsLoading] = useState(true);
  const [savingLiveSettings, setSavingLiveSettings] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<AdminCaseSimulateResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, settings] = await Promise.all([
        getAdminCases(),
        getAdminCaseCatalogSettings().catch(() => null),
      ]);
      setCases(data);
      if (settings) setBannersEnabled(Boolean(settings.banners_enabled));
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
    void getAdminCaseLiveFeedSettings()
      .then((s) => setLiveSettings({ ...DEFAULT_LIVE_SETTINGS, ...s }))
      .catch(() => {})
      .finally(() => setLiveSettingsLoading(false));
  }, [load]);

  async function saveLiveSettings() {
    setSavingLiveSettings(true);
    try {
      const saved = await updateAdminCaseLiveFeedSettings(liveSettings);
      setLiveSettings({ ...DEFAULT_LIVE_SETTINGS, ...saved });
      showToast({ title: "Настройки live-ленты сохранены", variant: "success" });
    } catch (e) {
      showToast({
        title: formatUserError(e, "Не удалось сохранить live-ленту"),
        variant: "error",
      });
    } finally {
      setSavingLiveSettings(false);
    }
  }

  function selectCase(c: AdminCase) {
    setSelectedId(c.id);
    setDraft(caseToDraft(c));
    setLoot(lootToDraft(c.loot));
    setExpandedKey(null);
    setCasePromoDraft({ ...EMPTY_CASE_PROMO, case_id: c.id });
    setSimResult(null);
  }

  function startNew() {
    setSelectedId("new");
    setDraft(emptyCaseDraft());
    setLoot([]);
    setExpandedKey(null);
    setCasePromos([]);
    setCasePromoDraft(EMPTY_CASE_PROMO);
    setSimResult(null);
  }

  async function runSimulate() {
    if (!draft.id) return;
    setSimulating(true);
    try {
      const result = await simulateAdminCase(draft.id, SIM_ITERATIONS);
      setSimResult(result);
      const rtpLine = result.rtp_available
        ? `RTP ${bpsPct(result.simulated_rtp_bps)} (теор ${bpsPct(result.theoretical_rtp_bps)})`
        : "RTP — (цена 0)";
      showToast({
        title: `Тест · ${result.iterations} открытий`,
        subtitle: `Spent ${formatTON(result.spent_nanoton)} · Prize ${formatTON(result.prize_total_nanoton)} · ${rtpLine}`,
        variant: "success",
      });
    } catch (e) {
      showToast({
        title: formatUserError(e, "Не удалось прогнать симуляцию"),
        variant: "error",
      });
    } finally {
      setSimulating(false);
    }
  }

  const loadCasePromos = useCallback(
    async (caseId: string) => {
      setCasePromosLoading(true);
      try {
        setCasePromos(await getAdminCasePromoCodes(caseId));
      } catch (e) {
        showToast({
          title: formatUserError(e, "Не удалось загрузить промокоды кейса"),
          variant: "error",
        });
        setCasePromos([]);
      } finally {
        setCasePromosLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (draft.id && draft.kind === "promo") {
      void loadCasePromos(draft.id);
    } else {
      setCasePromos([]);
    }
  }, [draft.id, draft.kind, loadCasePromos]);

  async function toggleBanners(next: boolean) {
    setSavingBanners(true);
    try {
      const settings = await updateAdminCaseCatalogSettings({ banners_enabled: next });
      setBannersEnabled(Boolean(settings.banners_enabled));
      showToast({
        title: settings.banners_enabled ? "Баннеры включены" : "Баннеры скрыты",
        variant: "success",
      });
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось сохранить настройку"), variant: "error" });
    } finally {
      setSavingBanners(false);
    }
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
    const isPromo = draft.kind === "promo";
    const priceNanoton = isPromo ? 0 : draft.price_nanoton;
    const requireChannel =
      draft.require_channel ||
      (!isPromo && draft.kind !== "daily" && priceNanoton <= 0);
    if (!isPromo && draft.kind !== "daily" && priceNanoton <= 0 && !requireChannel) {
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
        accent_color: draft.accent_color?.trim() || "#3b82f6",
        price_nanoton: priceNanoton,
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

  async function saveCasePromo() {
    if (!draft.id) {
      showToast({ title: "Сначала сохраните кейс", variant: "error" });
      return;
    }
    const code = casePromoDraft.code.trim().toUpperCase();
    if (!code) {
      showToast({ title: "Введите промокод", variant: "error" });
      return;
    }
    setSavingCasePromo(true);
    try {
      await upsertAdminCasePromoCode({
        code,
        case_id: draft.id,
        max_uses: Math.max(0, casePromoDraft.max_uses),
        active: casePromoDraft.active,
      });
      showToast({ title: "Промокод сохранён", variant: "success" });
      setCasePromoDraft({ ...EMPTY_CASE_PROMO, case_id: draft.id });
      await loadCasePromos(draft.id);
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось сохранить промокод"), variant: "error" });
    } finally {
      setSavingCasePromo(false);
    }
  }

  async function removeCasePromo(code: string) {
    setDeletingCasePromo(code);
    try {
      await deleteAdminCasePromoCode(code);
      showToast({ title: "Промокод удалён", variant: "success" });
      if (draft.id) await loadCasePromos(draft.id);
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось удалить промокод"), variant: "error" });
    } finally {
      setDeletingCasePromo(null);
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
        tile_background_color: normalizeLootTileColor(row.tile_background_color),
        sort_order: i,
        weight: Math.round(row.weight),
        floor_price_nanoton: Math.max(0, Math.round(row.floor_price_nanoton ?? 0)),
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

  function applyLootWeights(weights: Record<string, number>) {
    setLoot((prev) =>
      prev.map((row) =>
        weights[row._key] != null ? { ...row, weight: Math.max(1, Math.round(weights[row._key])) } : row,
      ),
    );
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

  async function reorderCasesByIds(orderedIds: string[]) {
    const byId = new Map(cases.map((c) => [c.id, c]));
    const nextLocal = cases.map((c) => {
      const idx = orderedIds.indexOf(c.id);
      if (idx < 0) return c;
      return { ...c, sort_order: idx };
    });
    setCases(nextLocal);
    if (draft.id) {
      const idx = orderedIds.indexOf(draft.id);
      if (idx >= 0) setDraft((d) => ({ ...d, sort_order: idx }));
    }

    setSavingOrder(true);
    try {
      await Promise.all(
        orderedIds.map((id, i) => {
          const c = byId.get(id);
          if (!c) return Promise.resolve();
          return upsertAdminCase({
            id: c.id,
            slug: c.slug,
            title: c.title,
            image_url: c.image_url || "",
            accent_color: c.accent_color || "#3b82f6",
            price_nanoton: c.price_nanoton,
            kind: c.kind,
            sort_order: i,
            active: c.active,
            require_channel: c.require_channel,
            target_rtp_bps: c.target_rtp_bps,
          });
        }),
      );
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось сохранить порядок"), variant: "error" });
      await load();
    } finally {
      setSavingOrder(false);
    }
  }

  const selected = selectedId && selectedId !== "new"
    ? cases.find((c) => c.id === selectedId)
    : null;

  const coverPreviewAccent = getCatalogAccent({
    slug: draft.slug || "preview",
    accent_color: draft.accent_color,
  });
  const coverPreviewUrl = resolveAsset(draft.image_url?.trim() || "") || "";

  async function onPickCaseImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ title: "Нужен файл изображения", variant: "error" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast({ title: "Максимум 5 МБ", variant: "error" });
      return;
    }
    setUploadingImage(true);
    try {
      const res = await uploadAdminCaseImage(file);
      setDraft((d) => ({ ...d, image_url: res.image_url || res.url }));
      showToast({ title: "Картинка загружена", variant: "success" });
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось загрузить картинку"), variant: "error" });
    } finally {
      setUploadingImage(false);
    }
  }

  const previewLoot = useMemo(() => lootDraftsToPreview(loot), [loot]);

  const previewCase = useMemo(
    () => ({
      title: draft.title || "Кейс",
      slug: draft.slug || "preview",
      kind: draft.kind,
      accent_color: draft.accent_color,
      price_nanoton: draft.price_nanoton,
      require_channel: draft.require_channel,
    }),
    [draft],
  );

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
        <AdminButton
          variant="secondary"
          disabled={savingBanners || loading}
          onClick={() => void toggleBanners(!bannersEnabled)}
        >
          {savingBanners
            ? "…"
            : bannersEnabled
              ? "Скрыть баннеры"
              : "Показать баннеры"}
        </AdminButton>
      </AdminToolbar>
      <p className="text-[11px] text-muted">
        Баннеры featured/daily на странице кейсов:{" "}
        <span className="text-foreground/80">
          {bannersEnabled ? "показаны" : "скрыты"}
        </span>
        . Полноценную реализацию баннеров сделаем позже.
      </p>

      {loading && cases.length === 0 ? (
        <div className="h-24 animate-pulse rounded-xl bg-surface-raised/50" />
      ) : cases.length === 0 && selectedId !== "new" ? (
        <AdminEmpty>Кейсов пока нет — создайте первый.</AdminEmpty>
      ) : (
        <AdminPanel
          title="Витрина"
        >
          <CasesPageAdminPreview
            cases={cases}
            bannersEnabled={bannersEnabled}
            selectedId={typeof selectedId === "string" ? selectedId : null}
            draftOverlay={draft.id ? draft : null}
            savingOrder={savingOrder}
            onSelect={selectCase}
            onReorder={(ids) => void reorderCasesByIds(ids)}
          />
          {cases.some((c) => !c.active) || selectedId === "new" ? (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
              {cases
                .filter((c) => !c.active)
                .map((c) => (
                  <AdminChip
                    key={c.id}
                    active={selectedId === c.id}
                    onClick={() => selectCase(c)}
                  >
                    {c.title} · выкл
                  </AdminChip>
                ))}
              {selectedId === "new" ? <AdminChip active>Новый</AdminChip> : null}
            </div>
          ) : null}
        </AdminPanel>
      )}

      <AdminPanel
        title="Live-лента"
        description="Фейк-дропы только в UI ленты. Не влияет на реальные открытия, баланс и аналитику case_opens."
      >
        {liveSettingsLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-raised/50" />
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={liveSettings.enabled}
                onChange={(e) =>
                  setLiveSettings((s) => ({ ...s, enabled: e.target.checked }))
                }
              />
              Включить фейк-дропы
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={liveSettings.fill_when_sparse}
                onChange={(e) =>
                  setLiveSettings((s) => ({ ...s, fill_when_sparse: e.target.checked }))
                }
              />
              Доливать при редких реальных открытиях
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <AdminFloatField
                label="Intensity"
                hint="0.2–5: чем выше, тем чаще фейк в ленте"
                min={0.05}
                step={0.1}
                value={liveSettings.intensity}
                onChange={(v) => setLiveSettings((s) => ({ ...s, intensity: v }))}
              />
              <AdminIntField
                label="Min visible"
                hint="целевой минимум тайлов (1–6)"
                min={1}
                value={liveSettings.min_visible}
                onChange={(v) => setLiveSettings((s) => ({ ...s, min_visible: v }))}
              />
              <AdminFloatField
                label="Fat chance"
                hint="0–1: шанс «жирного» дропа"
                min={0}
                step={0.01}
                value={liveSettings.fat_chance}
                onChange={(v) => setLiveSettings((s) => ({ ...s, fat_chance: v }))}
              />
              <AdminTonField
                label="Fat min floor (TON)"
                hint="порог цены для жирного дропа"
                valueNanoton={liveSettings.fat_min_floor_nanoton}
                onChangeNanoton={(v) =>
                  setLiveSettings((s) => ({ ...s, fat_min_floor_nanoton: v }))
                }
              />
            </div>
            <p className="text-[11px] text-muted">Веса редкости (выше = чаще в обычном сэмпле)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <AdminFloatField
                label="Common"
                min={0}
                step={1}
                value={liveSettings.common_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, common_weight: v }))}
              />
              <AdminFloatField
                label="Uncommon"
                min={0}
                step={1}
                value={liveSettings.uncommon_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, uncommon_weight: v }))}
              />
              <AdminFloatField
                label="Rare"
                min={0}
                step={1}
                value={liveSettings.rare_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, rare_weight: v }))}
              />
              <AdminFloatField
                label="Epic"
                min={0}
                step={1}
                value={liveSettings.epic_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, epic_weight: v }))}
              />
              <AdminFloatField
                label="Legendary"
                min={0}
                step={1}
                value={liveSettings.legendary_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, legendary_weight: v }))}
              />
            </div>
            <AdminToolbar>
              <AdminButton disabled={savingLiveSettings} onClick={() => void saveLiveSettings()}>
                {savingLiveSettings ? "…" : "Сохранить live-ленту"}
              </AdminButton>
            </AdminToolbar>
          </div>
        )}
      </AdminPanel>

      {selectedId ? (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_min(24.5rem,100%)]">
          <div className="min-w-0 space-y-4">
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
              <AdminField
                label="Тип"
                hint={
                  draft.kind === "promo"
                    ? "Открывается только по промокоду. Коды создаются ниже после сохранения кейса."
                    : bannersEnabled
                      ? "Баннер (Featured/Daily) — верхний ряд; Каталог — сетка ниже."
                      : "Баннеры скрыты: Featured/Daily попадают в общую сетку каталога вместе с остальными."
                }
              >
                <select
                  className="input-field"
                  value={draft.kind}
                  onChange={(e) => {
                    const kind = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      kind,
                      price_nanoton: kind === "promo" ? 0 : d.price_nanoton,
                    }));
                  }}
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
                valueNanoton={draft.kind === "promo" ? 0 : draft.price_nanoton}
                onChangeNanoton={(v) =>
                  setDraft((d) => ({
                    ...d,
                    price_nanoton: d.kind === "promo" ? 0 : v,
                    require_channel:
                      d.kind !== "daily" && d.kind !== "promo" && v <= 0
                        ? true
                        : d.require_channel,
                  }))
                }
                hint={
                  draft.kind === "promo"
                    ? "Промо-кейс всегда бесплатный (открытие по коду)"
                    : "0 = бесплатный кейс (нужна подписка на канал)"
                }
              />
              <AdminField label="Порядок" hint="меньше = выше в витрине">
                <input
                  className="input-field"
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sort_order: Number.parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </AdminField>
              <AdminField label="Фон (accent #hex)" hint="градиент карточки, если нет картинки или под ней">
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
              <AdminField
                label="Картинка"
                className="sm:col-span-2 lg:col-span-3"
                hint="Загрузка с компьютера (JPEG/PNG/WebP/GIF, до 5 МБ) или прямой URL."
              >
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          disabled={uploadingImage}
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            e.target.value = "";
                            void onPickCaseImage(f);
                          }}
                        />
                        <span
                          className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-surface-raised px-3 text-sm ${
                            uploadingImage ? "pointer-events-none opacity-50" : "hover:bg-white/5"
                          }`}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {uploadingImage ? "Загрузка…" : "С компьютера"}
                        </span>
                      </label>
                      {draft.image_url ? (
                        <AdminButton
                          variant="secondary"
                          className="!h-9"
                          disabled={uploadingImage}
                          onClick={() => setDraft((d) => ({ ...d, image_url: "" }))}
                        >
                          Убрать
                        </AdminButton>
                      ) : null}
                    </div>
                    <input
                      className="input-field"
                      value={draft.image_url || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, image_url: e.target.value }))}
                      placeholder="/static/cases/… или https://…"
                    />
                  </div>
                  <div
                    className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[12px] border border-white/10"
                    style={{
                      background: coverPreviewUrl
                        ? "#0a0e14"
                        : `linear-gradient(180deg, ${coverPreviewAccent.from} 0%, ${coverPreviewAccent.to} 100%)`,
                    }}
                    title="Превью обложки"
                  >
                    {coverPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverPreviewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-8 w-8 rounded-lg bg-white/20 ring-1 ring-inset ring-white/25" />
                      </div>
                    )}
                  </div>
                </div>
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
                    (draft.kind !== "daily" &&
                      draft.kind !== "promo" &&
                      draft.price_nanoton <= 0)
                  }
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, require_channel: e.target.checked }))
                  }
                />
                <span>
                  Нужна подписка на канал
                  <span className="mt-0.5 block text-[11px] text-muted/80">
                    {draft.kind === "promo"
                      ? "Опционально для промо-кейса. Канал = PROMO_REQUIRED_CHANNEL."
                      : "Для бесплатных (цена 0) обязательно. Канал = PROMO_REQUIRED_CHANNEL."}
                  </span>
                </span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminButton disabled={savingCase} onClick={() => void saveCase()}>
                {savingCase ? "…" : draft.id ? "Сохранить кейс" : "Создать кейс"}
              </AdminButton>
              <AdminButton
                variant="secondary"
                disabled={!draft.id || simulating || loot.length === 0}
                onClick={() => void runSimulate()}
              >
                {simulating ? "…" : `Тест · ${SIM_ITERATIONS}`}
              </AdminButton>
            </div>
            {simResult ? (
              <div className="mt-3 space-y-2 rounded-xl bg-surface-raised/50 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2 font-medium">
                  <span>Симуляция · {simResult.iterations} открытий</span>
                  <span className="text-xs font-normal text-muted">
                    сохранённый лут (сохраните лут перед тестом правок)
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Spent {formatTON(simResult.spent_nanoton)} TON · Prize{" "}
                  {formatTON(simResult.prize_total_nanoton)} TON · Edge{" "}
                  {formatTON(simResult.house_edge_nanoton)} TON
                </p>
                <p className="text-xs text-muted">
                  RTP sim{" "}
                  {simResult.rtp_available ? bpsPct(simResult.simulated_rtp_bps) : "—"} · теор{" "}
                  {simResult.rtp_available ? bpsPct(simResult.theoretical_rtp_bps) : "—"} · target{" "}
                  {bpsPct(simResult.target_rtp_bps)}
                </p>
                {simResult.warnings && simResult.warnings.length > 0 ? (
                  <p className="text-xs text-amber-400/90">{simResult.warnings.join(" · ")}</p>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                    <thead>
                      <tr className="text-muted">
                        <th className="py-1 pr-2 font-medium">Приз</th>
                        <th className="py-1 pr-2 font-medium">Ожид.</th>
                        <th className="py-1 pr-2 font-medium">Факт</th>
                        <th className="py-1 pr-2 font-medium">Hits</th>
                        <th className="py-1 pr-2 font-medium">Floor</th>
                        <th className="py-1 font-medium">Σ prize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResult.entries.map((row) => (
                        <tr key={row.loot_entry_id} className="border-t border-white/[0.04]">
                          <td className="max-w-[10rem] truncate py-1 pr-2" title={row.display_name}>
                            {row.display_name}
                          </td>
                          <td className="py-1 pr-2 tabular-nums">{bpsPct(row.expected_pct_bps)}</td>
                          <td className="py-1 pr-2 tabular-nums">{bpsPct(row.actual_pct_bps)}</td>
                          <td className="py-1 pr-2 tabular-nums">{row.hits}</td>
                          <td className="py-1 pr-2 tabular-nums">{formatTON(row.floor_price_nanoton)}</td>
                          <td className="py-1 tabular-nums">{formatTON(row.prize_sum_nanoton)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </AdminPanel>

          {draft.kind === "promo" ? (
            <AdminPanel
              title="Промокоды кейса"
              description={
                draft.id
                  ? "Код открывает этот кейс один раз на пользователя. Max uses = 0 — без лимита."
                  : "Сначала сохраните кейс, затем создайте промокоды."
              }
            >
              {!draft.id ? (
                <AdminEmpty>Промокоды появятся после создания кейса.</AdminEmpty>
              ) : (
                <div className="space-y-3">
                  {casePromosLoading && casePromos.length === 0 ? (
                    <div className="h-16 animate-pulse rounded-xl bg-surface-raised/50" />
                  ) : casePromos.length === 0 ? (
                    <p className="text-sm text-muted">Пока нет промокодов</p>
                  ) : (
                    casePromos.map((promo) => (
                      <div
                        key={promo.code}
                        className="flex items-start justify-between gap-3 rounded-xl bg-surface-raised/50 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold tracking-wide">{promo.code}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {promo.used_count}/{promo.max_uses || "∞"} ·{" "}
                            {promo.active ? "active" : "off"}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-300 transition-colors active:bg-red-500/10 disabled:opacity-50"
                          disabled={deletingCasePromo === promo.code}
                          onClick={() => void removeCasePromo(promo.code)}
                        >
                          {deletingCasePromo === promo.code ? "…" : "Удалить"}
                        </button>
                      </div>
                    ))
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <AdminField label="Промокод">
                      <input
                        className="input-field uppercase tracking-wide"
                        placeholder="PEPELOVE"
                        value={casePromoDraft.code}
                        onChange={(e) =>
                          setCasePromoDraft((d) => ({
                            ...d,
                            code: e.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </AdminField>
                    <AdminIntField
                      label="Max uses"
                      min={0}
                      value={casePromoDraft.max_uses}
                      onChange={(v) => setCasePromoDraft((d) => ({ ...d, max_uses: v }))}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={casePromoDraft.active}
                      onChange={(e) =>
                        setCasePromoDraft((d) => ({ ...d, active: e.target.checked }))
                      }
                    />
                    Активен
                  </label>
                  <AdminToolbar>
                    <AdminButton
                      disabled={savingCasePromo || !casePromoDraft.code.trim()}
                      onClick={() => void saveCasePromo()}
                    >
                      {savingCasePromo ? "…" : "Создать / обновить промокод"}
                    </AdminButton>
                  </AdminToolbar>
                </div>
              )}
            </AdminPanel>
          ) : null}

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
                          <div
                            className="admin-loot-card__thumb"
                            style={{ background: candyTileBackgroundForLoot(row) }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={lootPreviewUrl(row)}
                              alt=""
                              className="admin-loot-card__img"
                            />
                          </div>
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

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                              <LootChanceField
                                rowKey={row._key}
                                weight={row.weight}
                                weightTotal={weightTotal}
                                loot={loot}
                                onApplyWeights={applyLootWeights}
                              />
                              <AdminTonField
                                label="цена (TON)"
                                valueNanoton={row.floor_price_nanoton ?? 0}
                                onChangeNanoton={(v) =>
                                  updateLoot(row._key, { floor_price_nanoton: Math.max(0, v) })
                                }
                                hint="Показывается в списке призов кейса. 0 — подтянуть рыночный floor."
                              />
                              <AdminField label="редкость" className="col-span-2 sm:col-span-3">
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
                              <AdminField label="фон плитки" className="col-span-2 sm:col-span-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    title="По редкости"
                                    className={
                                      !normalizeLootTileColor(row.tile_background_color)
                                        ? "rounded-lg border border-[var(--admin-accent)] bg-[var(--admin-accent-subtle)] px-2 py-1 text-[10px] text-[var(--admin-fg)]"
                                        : "rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
                                    }
                                    onClick={() =>
                                      updateLoot(row._key, { tile_background_color: "" })
                                    }
                                  >
                                    авто
                                  </button>
                                  {LOOT_TILE_COLOR_OPTIONS.map((color) => {
                                    const selected =
                                      normalizeLootTileColor(row.tile_background_color) === color;
                                    return (
                                      <button
                                        key={color}
                                        type="button"
                                        title={color}
                                        aria-label={color}
                                        className={
                                          selected
                                            ? "h-7 w-7 rounded-lg ring-2 ring-[var(--admin-accent)] ring-offset-1 ring-offset-[var(--admin-panel)]"
                                            : "h-7 w-7 rounded-lg ring-1 ring-white/15 hover:ring-white/35"
                                        }
                                        style={{ backgroundColor: color }}
                                        onClick={() =>
                                          updateLoot(row._key, {
                                            tile_background_color: selected ? "" : color,
                                          })
                                        }
                                      />
                                    );
                                  })}
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
          </div>

          <AdminPanel
            title="Экран кейса"
            description="Детальная страница выбранного кейса. Обновляется по черновику."
            className="xl:sticky xl:top-4"
          >
            <CaseDetailPlayerPreview
              framed
              caseItem={previewCase}
              loot={previewLoot}
              ctaLabel={previewCtaLabel(draft)}
              ctaDisabled
            />
          </AdminPanel>
        </div>
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
