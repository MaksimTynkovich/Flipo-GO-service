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
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { AdminFloatField, AdminPercentField, AdminTonField, AdminIntField } from "@/components/admin/AdminInputs";
import { useToast } from "@/components/providers/ToastProvider";
import {
  changesGiftModelImageUrl,
  isChangesGiftImageUrl,
  modelNameFromChangesImageUrl,
  type GiftPickerSelection,
} from "@/lib/changes-gifts";
import { giftImageUrl } from "@/lib/gifts";
import { formatUserError } from "@/lib/user-errors";
import { chancePercentFromWeight, applyChancePercentWeights } from "@/lib/admin-units";
import {
  candyTileBackgroundForLoot,
  rarityFromValueNanoton,
  getCatalogAccent,
  CASE_ACCENT_COLOR_OPTIONS,
  LOOT_BACKDROP_OPTIONS,
  LOOT_TILE_COLOR_OPTIONS,
  normalizeLootBackdrop,
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
  deleteAdminCase,
  simulateAdminCase,
  playerSimulateAdminCase,
  playerSimulateAllAdminCases,
  getAdminCaseEconomyStats,
  formatTON,
  type AdminCase,
  type AdminCaseCatalogSettings,
  type AdminCaseEconomyStats,
  type AdminCaseLiveFeedSettings,
  type AdminCaseLootEntry,
  type AdminCasePromoCode,
  type AdminCaseSimulateResult,
  type AdminCasePlayerSimulateResult,
  type AdminCasePlayerSimulateBatch,
  type AdminCaseUpsert,
} from "@/lib/api";
import { Upload } from "lucide-react";

const KINDS = [
  { value: "catalog", label: "Каталог" },
  { value: "featured", label: "Баннер (Featured)" },
  { value: "daily", label: "Daily (+ задания share/имя)" },
  { value: "promo", label: "Промокод" },
] as const;

const DEFAULT_SIM_ITERATIONS = 100;
const MIN_SIM_ITERATIONS = 1;
const MAX_SIM_ITERATIONS = 10_000;

const DEFAULT_CATALOG_ECONOMY: AdminCaseCatalogSettings = {
  id: 1,
  enabled: true,
  banners_enabled: false,
  bank_enabled: false,
  bank_nanoton: 0,
  bank_target_nanoton: 0,
  bank_loss_threshold_nanoton: -50_000_000_000,
  bank_recovery_target_nanoton: 0,
  bank_bias_weight: 50,
  bank_max_prize_bps: 5000,
  bank_fat_paused: false,
  bank_recovery_smooth_enabled: true,
  bank_recovery_drain_opens: 2,
  bank_recovery_relief_opens: 1,
  bank_recovery_relief_max_prize_bps: 3000,
  bank_recovery_pace_counter: 0,
  daily_pool_enabled: false,
  daily_pool_nanoton: 0,
  daily_pool_max_prize_bps: 5000,
  daily_pool_daily_refill_nanoton: 0,
  promo_pool_enabled: false,
  promo_pool_nanoton: 0,
  promo_pool_max_prize_bps: 5000,
  promo_pool_daily_refill_nanoton: 0,
  deposit_boost_enabled: true,
  deposit_boost_min_nanoton: 10_000_000_000,
  deposit_boost_bias_weight: 40,
  deposit_boost_tier1_min_nanoton: 1_000_000_000,
  deposit_boost_tier2_min_nanoton: 2_000_000_000,
  deposit_boost_tier3_min_nanoton: 5_000_000_000,
  deposit_boost_tier4_min_nanoton: 10_000_000_000,
  deposit_boost_tier1_bias_weight: 0,
  deposit_boost_tier2_bias_weight: 5,
  deposit_boost_tier3_bias_weight: 10,
  deposit_boost_tier4_bias_weight: 15,
  deposit_boost_surplus_share_bps: 2500,
  deposit_boost_ramp_nanoton: 10_000_000_000,
};

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
  common_max_nanoton: 500_000_000,
  uncommon_max_nanoton: 1_500_000_000,
  rare_max_nanoton: 3_000_000_000,
  epic_max_nanoton: 5_000_000_000,
  fat_chance: 0.08,
  fat_min_floor_nanoton: 5_000_000_000,
  max_gift_floor_nanoton: 0,
  hide_ton: false,
};

const CYR_TO_LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** URL slug from case title (latin + digits; Cyrillic transliterated). */
function slugFromTitle(title: string): string {
  let out = "";
  for (const ch of title.trim().toLowerCase()) {
    if (CYR_TO_LAT[ch] !== undefined) out += CYR_TO_LAT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|_/.test(ch) || ch === "-") out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

type CaseDraft = AdminCaseUpsert & { id?: string };
type LootDraft = AdminCaseLootEntry & {
  _key: string;
  _modelName?: string;
};

function lootExcludeKey(collectionSlug: string, modelName = ""): string {
  const slug = collectionSlug.trim().toLowerCase();
  const model = modelName.trim();
  return model ? `${slug}\0${model}` : slug;
}

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
    required_name_tag: "",
    require_share: false,
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
    required_name_tag: c.required_name_tag || "",
    require_share: Boolean(c.require_share),
    target_rtp_bps: c.target_rtp_bps || 9000,
  };
}

function inferModelName(entry: AdminCaseLootEntry): string | undefined {
  if (entry.model_name?.trim()) return entry.model_name.trim();
  // Legacy rows: only treat CDN model URLs as model (not display_name — that was collection).
  return modelNameFromChangesImageUrl(entry.image_url) || undefined;
}

function lootToDraft(entries: AdminCaseLootEntry[]): LootDraft[] {
  return (entries || []).map((e, i) => {
    const prizeType = e.prize_type === "ton" ? "ton" : "gift";
    const modelName = prizeType === "gift" ? inferModelName(e) : undefined;
    return {
      _key:
        e.id ||
        `new-${i}-${prizeType}-${e.collection_slug || e.amount_nanoton || i}-${modelName || "any"}`,
      _modelName: modelName,
      id: e.id,
      prize_type: prizeType,
      collection_slug: e.collection_slug || "",
      model_name: modelName || "",
      display_name: e.display_name,
      image_url: e.image_url || "",
      rarity_label: e.rarity_label || "",
      tile_background_color: e.tile_background_color || "",
      backdrop: normalizeLootBackdrop(e.backdrop),
      sort_order: e.sort_order ?? i,
      weight: Math.max(0, e.weight ?? 0),
      floor_price_nanoton: e.floor_price_nanoton ?? 0,
      amount_nanoton: e.amount_nanoton ?? (prizeType === "ton" ? e.floor_price_nanoton ?? 0 : 0),
    };
  });
}

function lootPreviewUrl(row: LootDraft): string {
  if (row.prize_type === "ton") return "";
  if (row.image_url && isChangesGiftImageUrl(row.image_url)) return row.image_url;
  if (row.image_url?.includes("api.changes.tg")) return row.image_url;
  if (row._modelName && !row.model_name) return changesGiftModelImageUrl(row._modelName);
  return giftImageUrl(row.collection_slug || "unknown", row.image_url);
}

function giftToLootRow(gift: GiftPickerSelection, sortOrder: number): LootDraft {
  const modelName = gift.modelName.trim();
  return {
    _key: `new-${Date.now()}-${gift.collectionSlug}-${modelName || "any"}`,
    _modelName: modelName || undefined,
    prize_type: "gift",
    collection_slug: gift.collectionSlug,
    model_name: modelName,
    display_name: gift.collectionName,
    image_url: gift.previewUrl,
    rarity_label: "",
    tile_background_color: "",
    backdrop: "",
    sort_order: sortOrder,
    weight: 1,
    floor_price_nanoton: 0,
    amount_nanoton: 0,
  };
}

function tonToLootRow(sortOrder: number): LootDraft {
  return {
    _key: `new-ton-${Date.now()}`,
    prize_type: "ton",
    collection_slug: "",
    display_name: "TON",
    image_url: "",
    rarity_label: "",
    tile_background_color: "",
    backdrop: "",
    sort_order: sortOrder,
    weight: 1,
    floor_price_nanoton: 1_000_000_000,
    amount_nanoton: 1_000_000_000,
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
      hint="Доля этого приза среди открытий. 0% — приз виден в кейсе, но никогда не выпадает. Остальные веса пересчитываются пропорционально."
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
  const [deletingCase, setDeletingCase] = useState(false);
  const [savingLoot, setSavingLoot] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [bannersEnabled, setBannersEnabled] = useState(false);
  const [casesEnabled, setCasesEnabled] = useState(true);
  const [savingBanners, setSavingBanners] = useState(false);
  const [savingCasesEnabled, setSavingCasesEnabled] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingLootKey, setEditingLootKey] = useState<string | null>(null);
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
  const [simWithBank, setSimWithBank] = useState(false);
  const [simIterations, setSimIterations] = useState(DEFAULT_SIM_ITERATIONS);
  const [simResult, setSimResult] = useState<AdminCaseSimulateResult | null>(null);
  const [playerSimDepositsTon, setPlayerSimDepositsTon] = useState(10);
  const [playerSimulating, setPlayerSimulating] = useState(false);
  const [playerSimResult, setPlayerSimResult] = useState<AdminCasePlayerSimulateResult | null>(null);
  const [playerSimBatch, setPlayerSimBatch] = useState<AdminCasePlayerSimulateBatch | null>(null);
  const [playerSimBatchRunning, setPlayerSimBatchRunning] = useState(false);
  const [economy, setEconomy] = useState<AdminCaseCatalogSettings>(DEFAULT_CATALOG_ECONOMY);
  const [economyStats, setEconomyStats] = useState<AdminCaseEconomyStats | null>(null);
  const [savingEconomy, setSavingEconomy] = useState(false);
  const [bankAdjustTon, setBankAdjustTon] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, settings, stats] = await Promise.all([
        getAdminCases(),
        getAdminCaseCatalogSettings().catch(() => null),
        getAdminCaseEconomyStats().catch(() => null),
      ]);
      setCases(data);
      if (settings) {
        setBannersEnabled(Boolean(settings.banners_enabled));
        setCasesEnabled(settings.enabled !== false);
        setEconomy({ ...DEFAULT_CATALOG_ECONOMY, ...settings });
      }
      if (stats) setEconomyStats(stats);
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
    setPlayerSimResult(null);
  }

  async function runSimulate() {
    if (!draft.id) return;
    const iterations = Math.min(
      MAX_SIM_ITERATIONS,
      Math.max(MIN_SIM_ITERATIONS, Math.round(simIterations) || DEFAULT_SIM_ITERATIONS),
    );
    if (iterations !== simIterations) {
      setSimIterations(iterations);
    }
    setSimulating(true);
    try {
      const result = await simulateAdminCase(draft.id, iterations, simWithBank);
      setSimResult(result);
      setPlayerSimResult(null);
      const rtpLine = result.rtp_available
        ? `RTP ${bpsPct(result.simulated_rtp_bps)} (теор ${bpsPct(result.theoretical_rtp_bps)})`
        : "RTP — (цена 0)";
      showToast({
        title: `Тест · ${result.iterations} открытий${result.with_bank ? " · банк" : ""}`,
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

  async function runPlayerSimulate() {
    if (!draft.id) return;
    const iterations = Math.min(
      MAX_SIM_ITERATIONS,
      Math.max(MIN_SIM_ITERATIONS, Math.round(simIterations) || DEFAULT_SIM_ITERATIONS),
    );
    if (iterations !== simIterations) {
      setSimIterations(iterations);
    }
    const depositsNanoton = Math.max(0, Math.round(playerSimDepositsTon * 1e9));
    setPlayerSimulating(true);
    try {
      const result = await playerSimulateAdminCase(draft.id, {
        iterations,
        depositsNanoton,
        sampleLimit: Math.min(80, Math.max(20, iterations)),
        withBank: true,
      });
      setPlayerSimResult(result);
      setSimResult(null);
      showToast({
        title: `Игрок · деп ${formatTON(result.deposits_nanoton)} · ${result.iterations} открытий`,
        subtitle: `RTP ${result.rtp_available ? bpsPct(result.simulated_rtp_bps) : "—"} · boost ${result.boost_applied_opens}/${result.iterations} · edge ${formatTON(result.house_edge_nanoton)}`,
        variant: "success",
      });
    } catch (e) {
      showToast({
        title: formatUserError(e, "Не удалось прогнать тест игрока"),
        variant: "error",
      });
    } finally {
      setPlayerSimulating(false);
    }
  }

  async function runPlayerSimulateAll() {
    const iterations = Math.min(
      MAX_SIM_ITERATIONS,
      Math.max(MIN_SIM_ITERATIONS, Math.round(simIterations) || DEFAULT_SIM_ITERATIONS),
    );
    const depositsNanoton = Math.max(0, Math.round(playerSimDepositsTon * 1e9));
    setPlayerSimBatchRunning(true);
    try {
      const result = await playerSimulateAllAdminCases({
        iterations,
        depositsNanoton,
        sampleLimit: 8,
        withBank: true,
      });
      setPlayerSimBatch(result);
      showToast({
        title: `Все кейсы · ${result.cases.length} шт · деп ${formatTON(result.deposits_nanoton)}`,
        subtitle: `${result.iterations} открытий на кейс · сортировка по RTP`,
        variant: "success",
      });
    } catch (e) {
      showToast({
        title: formatUserError(e, "Не удалось прогнать все кейсы"),
        variant: "error",
      });
    } finally {
      setPlayerSimBatchRunning(false);
    }
  }

  async function saveEconomy() {
    setSavingEconomy(true);
    try {
      const adjustRaw = Number(bankAdjustTon.replace(",", "."));
      const adjustNanoton =
        Number.isFinite(adjustRaw) && adjustRaw !== 0
          ? Math.round(adjustRaw * 1e9)
          : undefined;
      const saved = await updateAdminCaseCatalogSettings({
        bank_enabled: economy.bank_enabled,
        bank_target_nanoton: economy.bank_target_nanoton,
        bank_loss_threshold_nanoton: economy.bank_loss_threshold_nanoton,
        bank_recovery_target_nanoton: economy.bank_recovery_target_nanoton,
        bank_bias_weight: economy.bank_bias_weight,
        bank_max_prize_bps: economy.bank_max_prize_bps,
        bank_fat_paused: economy.bank_fat_paused,
        bank_recovery_smooth_enabled: economy.bank_recovery_smooth_enabled,
        bank_recovery_drain_opens: economy.bank_recovery_drain_opens,
        bank_recovery_relief_opens: economy.bank_recovery_relief_opens,
        bank_recovery_relief_max_prize_bps: economy.bank_recovery_relief_max_prize_bps,
        bank_adjust_nanoton: adjustNanoton,
        daily_pool_enabled: economy.daily_pool_enabled,
        daily_pool_max_prize_bps: economy.daily_pool_max_prize_bps,
        daily_pool_daily_refill_nanoton: economy.daily_pool_daily_refill_nanoton,
        promo_pool_enabled: economy.promo_pool_enabled,
        promo_pool_max_prize_bps: economy.promo_pool_max_prize_bps,
        promo_pool_daily_refill_nanoton: economy.promo_pool_daily_refill_nanoton,
        deposit_boost_enabled: economy.deposit_boost_enabled,
        deposit_boost_min_nanoton: economy.deposit_boost_min_nanoton,
        deposit_boost_bias_weight: economy.deposit_boost_bias_weight,
        deposit_boost_tier1_min_nanoton: economy.deposit_boost_tier1_min_nanoton,
        deposit_boost_tier2_min_nanoton: economy.deposit_boost_tier2_min_nanoton,
        deposit_boost_tier3_min_nanoton: economy.deposit_boost_tier3_min_nanoton,
        deposit_boost_tier4_min_nanoton: economy.deposit_boost_tier4_min_nanoton,
        deposit_boost_tier1_bias_weight: economy.deposit_boost_tier1_bias_weight,
        deposit_boost_tier2_bias_weight: economy.deposit_boost_tier2_bias_weight,
        deposit_boost_tier3_bias_weight: economy.deposit_boost_tier3_bias_weight,
        deposit_boost_tier4_bias_weight: economy.deposit_boost_tier4_bias_weight,
        deposit_boost_surplus_share_bps: economy.deposit_boost_surplus_share_bps,
        deposit_boost_ramp_nanoton: economy.deposit_boost_ramp_nanoton,
      });
      setEconomy({ ...DEFAULT_CATALOG_ECONOMY, ...saved });
      setBankAdjustTon("0");
      const stats = await getAdminCaseEconomyStats().catch(() => null);
      if (stats) setEconomyStats(stats);
      showToast({ title: "Экономика кейсов сохранена", variant: "success" });
    } catch (e) {
      showToast({
        title: formatUserError(e, "Не удалось сохранить экономику"),
        variant: "error",
      });
    } finally {
      setSavingEconomy(false);
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

  async function toggleCasesEnabled(next: boolean) {
    setSavingCasesEnabled(true);
    try {
      const settings = await updateAdminCaseCatalogSettings({ enabled: next });
      setCasesEnabled(settings.enabled !== false);
      showToast({
        title: settings.enabled !== false ? "Кейсы включены для игроков" : "Кейсы выключены для игроков",
        variant: "success",
      });
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось сохранить настройку"), variant: "error" });
    } finally {
      setSavingCasesEnabled(false);
    }
  }

  const weightTotal = useMemo(
    () => loot.reduce((sum, row) => sum + (row.weight > 0 ? row.weight : 0), 0),
    [loot],
  );

  const lootKeys = useMemo(() => {
    const editing = editingLootKey
      ? loot.find((row) => row._key === editingLootKey)
      : null;
    const skipKey = editing
      ? lootExcludeKey(editing.collection_slug, editing.model_name || editing._modelName || "")
      : null;
    const keys = new Set<string>();
    for (const row of loot) {
      if (row.prize_type === "ton" || !row.collection_slug) continue;
      const key = lootExcludeKey(row.collection_slug, row.model_name || row._modelName || "");
      if (skipKey && key === skipKey) continue;
      keys.add(key);
    }
    return keys;
  }, [loot, editingLootKey]);

  const editingLootRow = useMemo(
    () => (editingLootKey ? loot.find((row) => row._key === editingLootKey) ?? null : null),
    [loot, editingLootKey],
  );

  async function saveCase() {
    const title = draft.title.trim();
    const slug = (draft.id ? draft.slug : slugFromTitle(title) || draft.slug).trim().toLowerCase();
    if (!title) {
      showToast({ title: "Укажите название", variant: "error" });
      return;
    }
    if (!slug) {
      showToast({ title: "Не удалось сделать slug из названия — добавьте латиницу или цифры", variant: "error" });
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
        required_name_tag: draft.kind === "daily" ? (draft.required_name_tag || "").trim() : "",
        require_share: draft.kind === "daily" ? Boolean(draft.require_share) : false,
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

  async function removeCase() {
    if (!draft.id) return;
    const label = draft.title.trim() || draft.slug || draft.id;
    if (!window.confirm(`Удалить кейс «${label}»? История открытий сохранится.`)) return;
    setDeletingCase(true);
    try {
      await deleteAdminCase(draft.id);
      showToast({ title: "Кейс удалён", variant: "success" });
      const data = await load();
      if (data.length > 0) {
        selectCase(data[0]);
      } else {
        startNew();
      }
    } catch (e) {
      showToast({ title: formatUserError(e, "Не удалось удалить кейс"), variant: "error" });
    } finally {
      setDeletingCase(false);
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
      const prizeType = row.prize_type === "ton" ? "ton" : "gift";
      if (row.weight < 0) {
        showToast({ title: `Приз ${i + 1}: weight не может быть отрицательным`, variant: "error" });
        return;
      }
      if (prizeType === "ton") {
        const amount = Math.max(0, Math.round(row.amount_nanoton ?? 0));
        if (amount <= 0) {
          showToast({ title: `Приз ${i + 1}: укажите сумму TON`, variant: "error" });
          return;
        }
        cleaned.push({
          ...(row.id ? { id: row.id } : {}),
          prize_type: "ton",
          collection_slug: "",
          model_name: "",
          display_name: row.display_name.trim() || "TON",
          image_url: "",
          rarity_label: "",
          tile_background_color: normalizeLootTileColor(row.tile_background_color),
          backdrop: "",
          sort_order: i,
          weight: Math.round(row.weight),
          floor_price_nanoton: amount,
          amount_nanoton: amount,
        });
        continue;
      }
      const slug = row.collection_slug.trim().toLowerCase();
      if (!slug) {
        showToast({ title: `Приз ${i + 1}: нет collection_slug`, variant: "error" });
        return;
      }
      cleaned.push({
        ...(row.id ? { id: row.id } : {}),
        prize_type: "gift",
        collection_slug: slug,
        model_name: (row.model_name || row._modelName || "").trim(),
        display_name: row.display_name.trim() || slug,
        image_url: row.image_url?.trim() || "",
        rarity_label: "",
        tile_background_color: normalizeLootTileColor(row.tile_background_color),
        backdrop: normalizeLootBackdrop(row.backdrop),
        sort_order: i,
        weight: Math.round(row.weight),
        floor_price_nanoton: Math.max(0, Math.round(row.floor_price_nanoton ?? 0)),
        amount_nanoton: 0,
      });
    }
    if (cleaned.length > 0 && cleaned.every((r) => r.weight <= 0)) {
      showToast({
        title: "Хотя бы у одного приза шанс должен быть больше 0%",
        variant: "error",
      });
      return;
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
        weights[row._key] != null ? { ...row, weight: Math.max(0, Math.round(weights[row._key])) } : row,
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

  function addGift(gift: GiftPickerSelection) {
    setLoot((prev) => [...prev, giftToLootRow(gift, prev.length)]);
  }

  function applyGiftSelection(gift: GiftPickerSelection) {
    if (editingLootKey) {
      const modelName = gift.modelName.trim();
      updateLoot(editingLootKey, {
        collection_slug: gift.collectionSlug,
        model_name: modelName,
        _modelName: modelName || undefined,
        display_name: gift.collectionName,
        image_url: gift.previewUrl,
      });
      setEditingLootKey(null);
      return;
    }
    addGift(gift);
  }

  function openAddGiftPicker() {
    setEditingLootKey(null);
    setPickerOpen(true);
  }

  function openEditModelPicker(key: string) {
    setEditingLootKey(key);
    setPickerOpen(true);
  }

  function closeGiftPicker() {
    setPickerOpen(false);
    setEditingLootKey(null);
  }

  function addTonPrize() {
    setLoot((prev) => [...prev, tonToLootRow(prev.length)]);
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
            required_name_tag: c.required_name_tag || "",
            require_share: Boolean(c.require_share),
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

  const previewLoot = useMemo(
    () => lootDraftsToPreview(loot, liveSettings),
    [loot, liveSettings],
  );

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
      description="Метаданные кейса и визуальное наполнение лута. Подарки: коллекция (рандом) или конкретная модель."
    >
      <AdminToolbar>
        <AdminButton variant="secondary" disabled={loading} onClick={() => void load()}>
          Обновить
        </AdminButton>
        <AdminButton onClick={startNew}>Новый кейс</AdminButton>
        <AdminButton
          variant="secondary"
          disabled={savingCasesEnabled || loading}
          onClick={() => void toggleCasesEnabled(!casesEnabled)}
        >
          {savingCasesEnabled
            ? "…"
            : casesEnabled
              ? "Выключить кейсы"
              : "Включить кейсы"}
        </AdminButton>
        <AdminButton
          variant="secondary"
          disabled={savingBanners || loading || !casesEnabled}
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
        Раздел кейсов для игроков:{" "}
        <span className="text-foreground/80">
          {casesEnabled
            ? "включён (иконка в навбаре у игроков)"
            : "выключен для игроков (админы по-прежнему видят раздел)"}
        </span>
        . Баннеры featured/daily:{" "}
        <span className="text-foreground/80">
          {bannersEnabled ? "показаны" : "скрыты"}
        </span>
        .
      </p>

      <AdminPanel title="Экономика кейсов (Case Bank)">
        <p className="mb-3 text-[11px] text-muted">
          Здесь вы настраиваете, сколько кейсы могут раздавать игрокам. Простая идея:
          сначала платные кейсы зарабатывают общий запас, потом из этого запаса можно безопасно
          выдавать более дорогие призы. Бесплатные daily/promo живут на отдельном лимите.
        </p>
        {economyStats ? (
          <div className="mb-3 space-y-1 text-xs text-muted">
            <p>
              Live P&amp;L (organic / живые деньги): opens{" "}
              {economyStats.organic_opens_count ?? economyStats.opens_count} · spent{" "}
              {formatTON(economyStats.organic_spent_nanoton ?? economyStats.spent_nanoton)} · prize{" "}
              {formatTON(economyStats.organic_prize_nanoton ?? economyStats.prize_total_nanoton)} · edge{" "}
              {formatTON(economyStats.organic_edge_nanoton ?? economyStats.house_edge_nanoton)} · RTP{" "}
              {(economyStats.organic_spent_nanoton ?? economyStats.spent_nanoton) > 0
                ? bpsPct(economyStats.organic_rtp_bps ?? economyStats.actual_rtp_bps)
                : "—"}
            </p>
            {(economyStats.admin_funded_spent_nanoton ?? 0) > 0 ? (
              <p>
                Admin-funded (не депозиты): opens {economyStats.admin_funded_opens_count ?? 0} · spent{" "}
                {formatTON(economyStats.admin_funded_spent_nanoton ?? 0)} · prize{" "}
                {formatTON(economyStats.admin_funded_prize_nanoton ?? 0)} · edge{" "}
                {formatTON(economyStats.admin_funded_edge_nanoton ?? 0)}
              </p>
            ) : null}
            <p className="text-[11px]">
              All opens: {economyStats.opens_count} · spent {formatTON(economyStats.spent_nanoton)} · prize{" "}
              {formatTON(economyStats.prize_total_nanoton)} · edge{" "}
              {formatTON(economyStats.house_edge_nanoton)} · RTP{" "}
              {economyStats.spent_nanoton > 0 ? bpsPct(economyStats.actual_rtp_bps) : "—"}
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={Boolean(economy.bank_enabled)}
              onChange={(e) => setEconomy((s) => ({ ...s, bank_enabled: e.target.checked }))}
            />
            <span className="inline-flex items-center gap-1.5">
              Case Bank вкл
              <AdminInfoHint
                label="Case Bank вкл"
                hint="Главный переключатель экономики кейсов. Если включено, система смотрит на запас денег перед выдачей приза. Если денег мало, слишком дорогие призы выпадают реже или не выпадают совсем. Для новичка: включить."
              />
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={Boolean(economy.bank_fat_paused)}
              onChange={(e) => setEconomy((s) => ({ ...s, bank_fat_paused: e.target.checked }))}
            />
            <span className="inline-flex items-center gap-1.5">
              Пауза жирных призов
              <AdminInfoHint
                label="Пауза жирных призов"
                hint="Аварийный режим. Почти отключает дорогие призы, если вы хотите быстро остановить крупные выдачи, не выключая кейсы полностью. Для новичка: обычно выключено."
              />
            </span>
          </label>
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-1">
            <span className="inline-flex items-center gap-1.5">
              Баланс
              <AdminInfoHint
                label="Баланс"
                hint="Это текущий запас денег для выдачи призов. Чем он больше, тем смелее можно раздавать дорогие призы. Если он маленький или ушёл в минус, система начнёт сильнее экономить."
              />
            </span>
            :{" "}
            <span className="font-medium text-foreground/90">
              {formatTON(economy.bank_nanoton || 0)} TON
            </span>
            {economy.bank_recovery_active ? " · recovery" : ""}
          </p>
          <AdminTonField
            label="Target банка"
            valueNanoton={economy.bank_target_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, bank_target_nanoton: v }))}
            hint="Желаемый размер основного запаса. Когда банк дорос до этого уровня, система снова начинает вести себя спокойно и меньше экономить. Для новичка: ставьте сумму, которую готовы держать как подушку, например 100 TON."
          />
          <AdminTonField
            label="Loss threshold"
            valueNanoton={economy.bank_loss_threshold_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, bank_loss_threshold_nanoton: v }))}
            allowNegative
            min={-1e15}
            hint="Точка, после которой система начинает спасать экономику и зажимать дорогие призы. Самый понятный вариант для новичка: `0`, то есть как только запас закончился, включаем экономию."
          />
          <AdminTonField
            label="Recovery target"
            valueNanoton={economy.bank_recovery_target_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, bank_recovery_target_nanoton: v }))}
            allowNegative
            min={-1e15}
            hint="До какой суммы нужно восстановить запас, чтобы режим экономии выключился. Обычно можно ставить так же, как `Target банка`, или немного ниже."
          />
          <AdminIntField
            label="Bias weight 0–100"
            value={economy.bank_bias_weight ?? 50}
            onChange={(v) => setEconomy((s) => ({ ...s, bank_bias_weight: v }))}
            min={0}
            hint="Насколько сильно система будет уводить шанс от дорогих призов, когда денег мало. 0 — почти не вмешиваться. 100 — экономить очень жёстко. Для новичка: 40–60."
          />
          <AdminPercentField
            label="Max prize % банка"
            valueBps={economy.bank_max_prize_bps ?? 5000}
            onChangeBps={(v) => setEconomy((s) => ({ ...s, bank_max_prize_bps: v }))}
            hint="Максимум, который можно отдать одним призом от текущего запаса. Например, 50% значит: если в банке 100 TON, приз дороже 50 TON не выпадет. Для новичка: 30–50%."
          />
          <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2 lg:col-span-3">
            <input
              type="checkbox"
              checked={economy.bank_recovery_smooth_enabled !== false}
              onChange={(e) =>
                setEconomy((s) => ({ ...s, bank_recovery_smooth_enabled: e.target.checked }))
              }
            />
            <span className="inline-flex items-center gap-1.5">
              Плавный recovery
              <AdminInfoHint
                label="Плавный recovery"
                hint="Работает только когда банк в режиме экономии (recovery): баланс упал ниже Loss threshold и ещё не дорос до Recovery target. Без плавности система почти всегда отдаёт самый дешёвый приз, пока банк не восстановится — игроки видят длинную серию «сливов». С плавностью открытия идут циклом: несколько экономных (drain), потом одно или несколько умеренных (relief). Так банк всё равно растёт в среднем, но выдача выглядит естественнее. Выключите, если нужен жёсткий аварийный режим «только дешёвые». Рекомендуемый старт: Drain 2 / Relief 1 / Relief max 30%."
              />
            </span>
          </label>
          <AdminIntField
            label="Drain opens"
            value={economy.bank_recovery_drain_opens ?? 2}
            onChange={(v) => setEconomy((s) => ({ ...s, bank_recovery_drain_opens: v }))}
            min={1}
            hint="Число подряд идущих «экономных» открытий в одном цикле recovery. В этой фазе выпадают только относительно дешёвые призы (ниже медианы loot кейса) — банк быстро набирает запас за счёт цены открытия. Чем больше число, тем жёстче экономия и быстрее выход из минуса, но игроки чаще видят скромные призы. Обычно 2. Пример: Drain 2 + Relief 1 = из трёх открытий два дешёвых, одно умеренное."
          />
          <AdminIntField
            label="Relief opens"
            value={economy.bank_recovery_relief_opens ?? 1}
            onChange={(v) => setEconomy((s) => ({ ...s, bank_recovery_relief_opens: v }))}
            min={1}
            hint="Число «разрядок» после drain в том же цикле. В relief можно выпасть приз средней цены (не джекпот) — чтобы recovery не выглядел как бесконечный слив. Чем больше Relief относительно Drain, тем мягче ощущение для игрока, но банк восстанавливается медленнее. Обычно 1. Счётчик цикла общий на все платные кейсы (catalog/featured), не на каждый кейс отдельно."
          />
          <AdminPercentField
            label="Relief max prize %"
            valueBps={economy.bank_recovery_relief_max_prize_bps ?? 3000}
            onChangeBps={(v) =>
              setEconomy((s) => ({ ...s, bank_recovery_relief_max_prize_bps: v }))
            }
            hint="Верхний потолок одного приза в фазе relief, в процентах от текущего баланса банка. Пример: банк 40 TON и 30% → приз дороже ~12 TON в relief не выпадет. Потолок дополнительно растёт по мере приближения баланса к Recovery target (в начале recovery разрядка скромнее, ближе к выходу — смелее). Не может превысить обычный Max prize % банка. Для новичка: 25–35%. Слишком высокий % замедляет выход из экономии."
          />
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-3">
            <span className="inline-flex items-center gap-1.5">
              Цикл recovery
              <AdminInfoHint
                label="Цикл recovery"
                hint="Текущая фаза и позиция в цикле Drain+Relief. drain — сейчас экономные открытия; relief — умеренная разрядка. pace X / Y — сколько открытий прошло в текущем круге из Y (Drain opens + Relief opens). Счётчик увеличивается после каждого успешного открытия платного кейса в recovery и сбрасывается в 0, когда баланс доходит до Recovery target (экономия выключается). Если loot в кейсе совсем маленький (1–2 приза), разнообразия всё равно мало — плавность ограничена составом призов."
              />
            </span>
            :{" "}
            <span className="font-medium text-foreground/90">
              {(() => {
                if (!economy.bank_recovery_active) return "не активен";
                if (economy.bank_recovery_smooth_enabled === false)
                  return "классический (без плавности)";
                const drain = economy.bank_recovery_drain_opens ?? 2;
                const relief = economy.bank_recovery_relief_opens ?? 1;
                const pace = economy.bank_recovery_pace_counter ?? 0;
                const cycle = Math.max(1, drain + relief);
                const idx = ((pace % cycle) + cycle) % cycle;
                const phase = idx < drain ? "drain" : "relief";
                return `${phase} · pace ${pace} / ${cycle}`;
              })()}
            </span>
          </p>
          <AdminField
            label="Корректировка банка (± TON)"
            hint="Ручное пополнение или уменьшение основного запаса. Используйте, если хотите быстро добавить стартовый резерв или скорректировать цифру вручную."
          >
            <input
              className="input-field w-full"
              value={bankAdjustTon}
              onChange={(e) => setBankAdjustTon(e.target.value)}
              placeholder="0"
            />
          </AdminField>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={Boolean(economy.daily_pool_enabled)}
              onChange={(e) => setEconomy((s) => ({ ...s, daily_pool_enabled: e.target.checked }))}
            />
            <span className="inline-flex items-center gap-1.5">
              Daily pool вкл ({formatTON(economy.daily_pool_nanoton || 0)} TON)
              <AdminInfoHint
                label="Daily pool"
                hint="Отдельный кошелёк для бесплатного daily-кейса. Нужен, чтобы ежедневные подарки не съедали деньги платных кейсов. Для новичка: включить, если daily бесплатный."
              />
            </span>
          </label>
          <AdminTonField
            label="Daily refill / сутки"
            valueNanoton={economy.daily_pool_daily_refill_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, daily_pool_daily_refill_nanoton: v }))}
            hint="Сколько автоматически добавлять в daily-кошелёк каждый день. Это ваш дневной бюджет на бесплатные daily-открытия."
          />
          <AdminPercentField
            label="Daily max prize %"
            valueBps={economy.daily_pool_max_prize_bps ?? 5000}
            onChangeBps={(v) => setEconomy((s) => ({ ...s, daily_pool_max_prize_bps: v }))}
            hint="Максимальный размер одного daily-приза от текущего daily-запаса. Для новичка: 30–50%."
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={Boolean(economy.promo_pool_enabled)}
              onChange={(e) => setEconomy((s) => ({ ...s, promo_pool_enabled: e.target.checked }))}
            />
            <span className="inline-flex items-center gap-1.5">
              Promo pool вкл ({formatTON(economy.promo_pool_nanoton || 0)} TON)
              <AdminInfoHint
                label="Promo pool"
                hint="Отдельный кошелёк для промо-кейсов. Нужен, чтобы промокоды не тратили деньги из основного банка платных кейсов."
              />
            </span>
          </label>
          <AdminTonField
            label="Promo refill / сутки"
            valueNanoton={economy.promo_pool_daily_refill_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, promo_pool_daily_refill_nanoton: v }))}
            hint="Сколько автоматически добавлять в promo-кошелёк каждый день. Это ваш дневной бюджет на промо-открытия."
          />
          <AdminPercentField
            label="Promo max prize %"
            valueBps={economy.promo_pool_max_prize_bps ?? 5000}
            onChangeBps={(v) => setEconomy((s) => ({ ...s, promo_pool_max_prize_bps: v }))}
            hint="Максимальный размер одного промо-приза от текущего promo-запаса. Для новичка: 30–50%."
          />
          <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2 lg:col-span-3">
            <input
              type="checkbox"
              checked={Boolean(economy.deposit_boost_enabled)}
              onChange={(e) => setEconomy((s) => ({ ...s, deposit_boost_enabled: e.target.checked }))}
            />
            <span className="inline-flex items-center gap-1.5">
              Adaptive deposit boost
              <AdminInfoHint
                label="Adaptive deposit boost"
                hint="Улучшает шансы на хорошие призы для активных игроков только после того, как paid bank накопил reserve. До `Target банка` буст не работает. Сверху буст масштабируется только частью surplus, а не всем балансом."
              />
            </span>
          </label>
          <AdminPercentField
            label="Boost surplus share %"
            valueBps={economy.deposit_boost_surplus_share_bps ?? 2500}
            onChangeBps={(v) => setEconomy((s) => ({ ...s, deposit_boost_surplus_share_bps: v }))}
            hint="Какая доля surplus выше reserve target может подпитывать adaptive boost. Например 25%: банк 140 TON при target 100 TON даёт только 10 TON allocatable surplus для буста."
          />
          <AdminTonField
            label="Boost ramp"
            valueNanoton={economy.deposit_boost_ramp_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, deposit_boost_ramp_nanoton: v }))}
            hint="Сколько allocatable surplus нужно набрать, чтобы tier boost включился на полную. До этого буст растёт плавно. Для старта: 10 TON."
          />
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-1">
            Reserve-first: до{" "}
            <span className="font-medium text-foreground/90">
              {formatTON(economy.bank_target_nanoton || 0)} TON
            </span>{" "}
            adaptive boost не расходует surplus. После накопления reserve активным игрокам открывается только
            часть запаса сверху.
          </p>
          <AdminTonField
            label="Tier 1 min deposit"
            valueNanoton={economy.deposit_boost_tier1_min_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier1_min_nanoton: v }))}
            hint="Первый порог общей суммы депозитов игрока. Обычно 1 TON."
          />
          <AdminIntField
            label="Tier 1 boost %"
            value={economy.deposit_boost_tier1_bias_weight ?? 0}
            onChange={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier1_bias_weight: v }))}
            min={0}
            hint="Мягкий буст веса на хорошие призы для Tier 1. Для старта можно оставить 0."
          />
          <AdminTonField
            label="Tier 2 min deposit"
            valueNanoton={economy.deposit_boost_tier2_min_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier2_min_nanoton: v }))}
            hint="Второй порог общей суммы депозитов игрока. Обычно 2 TON."
          />
          <AdminIntField
            label="Tier 2 boost %"
            value={economy.deposit_boost_tier2_bias_weight ?? 5}
            onChange={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier2_bias_weight: v }))}
            min={0}
            hint="Tier 2: сколько прибавить к весу средних и жирных призов при healthy reserve."
          />
          <AdminTonField
            label="Tier 3 min deposit"
            valueNanoton={economy.deposit_boost_tier3_min_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier3_min_nanoton: v }))}
            hint="Третий порог общей суммы депозитов игрока. Обычно 5 TON."
          />
          <AdminIntField
            label="Tier 3 boost %"
            value={economy.deposit_boost_tier3_bias_weight ?? 10}
            onChange={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier3_bias_weight: v }))}
            min={0}
            hint="Tier 3: более заметный буст, но всё ещё в пределах общего edge проекта."
          />
          <AdminTonField
            label="Tier 4 min deposit"
            valueNanoton={economy.deposit_boost_tier4_min_nanoton || 0}
            onChangeNanoton={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier4_min_nanoton: v }))}
            hint="Четвёртый порог общей суммы депозитов игрока. Обычно 10 TON."
          />
          <AdminIntField
            label="Tier 4 boost %"
            value={economy.deposit_boost_tier4_bias_weight ?? 15}
            onChange={(v) => setEconomy((s) => ({ ...s, deposit_boost_tier4_bias_weight: v }))}
            min={0}
            hint="Максимальный boost для самого активного сегмента, пока reserve уже накоплен и surplus позволяет."
          />
        </div>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-surface-raised/40 px-3 py-2.5">
          <p className="text-xs font-medium text-foreground/90">Простая стартовая настройка для новичка</p>
          <pre className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
bank_enabled: true
bank_nanoton: 50_000_000_000      # положите в основной запас 50 TON
bank_target_nanoton: 100_000_000_000 # цель: накопить 100 TON
bank_loss_threshold_nanoton: 0    # если запас кончился, начинаем экономить
bank_recovery_target_nanoton: 100_000_000_000 # выключаем экономию после возврата к 100 TON
bank_bias_weight: 50              # средняя сила экономии
bank_max_prize_bps: 4000          # один приз не дороже 40% банка
bank_fat_paused: false
bank_recovery_smooth_enabled: true
bank_recovery_drain_opens: 2      # два дешёвых
bank_recovery_relief_opens: 1     # одно умеренное
bank_recovery_relief_max_prize_bps: 3000  # до 30% банка в relief
daily_pool_enabled: true
daily_pool_daily_refill_nanoton: 10_000_000_000  # daily бюджет 10 TON в день
daily_pool_max_prize_bps: 3000                    # один daily приз не дороже 30%
promo_pool_enabled: true
promo_pool_daily_refill_nanoton: 5_000_000_000   # promo бюджет 5 TON в день
promo_pool_max_prize_bps: 3000                   # один promo приз не дороже 30%
deposit_boost_enabled: true
deposit_boost_surplus_share_bps: 2500            # только 25% surplus можно тратить на boost
deposit_boost_ramp_nanoton: 10_000_000_000       # полный boost после 10 TON allocatable surplus
deposit_boost_tier1_min_nanoton: 1_000_000_000
deposit_boost_tier1_bias_weight: 0
deposit_boost_tier2_min_nanoton: 2_000_000_000
deposit_boost_tier2_bias_weight: 5
deposit_boost_tier3_min_nanoton: 5_000_000_000
deposit_boost_tier3_bias_weight: 10
deposit_boost_tier4_min_nanoton: 10_000_000_000
deposit_boost_tier4_bias_weight: 15
          </pre>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Как это работает простыми словами: платные кейсы сначала копят reserve до `Target банка`.
            Пока reserve не накоплен, adaptive boost для депозитных игроков не тратит surplus и система
            осторожничает. После накопления reserve только часть surplus идёт на более приятную выдачу
            активным игрокам. Daily и promo живут отдельно, чтобы бесплатные раздачи не мешали платным кейсам
            зарабатывать.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Если вы только запускаете систему, начните именно с таких умеренных значений. Потом смотрите на `Live P&L`:
            если банк стабильно растёт, можно понемногу повышать `Max prize %`; если падает — уменьшать его или
            увеличивать `Bias weight`.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AdminButton disabled={savingEconomy} onClick={() => void saveEconomy()}>
            {savingEconomy ? "…" : "Сохранить экономику"}
          </AdminButton>
          <AdminButton
            variant="secondary"
            disabled={playerSimBatchRunning || savingEconomy}
            onClick={() => void runPlayerSimulateAll()}
            title="Прогнать все платные кейсы как игрок с указанным депозитом"
          >
            {playerSimBatchRunning ? "…" : "Прогнать все кейсы (игрок)"}
          </AdminButton>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span>деп TON</span>
            <input
              type="number"
              className="input-field w-[5rem] py-1 text-xs"
              min={0}
              step={1}
              value={playerSimDepositsTon}
              disabled={playerSimBatchRunning}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setPlayerSimDepositsTon(Math.max(0, n));
              }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span>открытий</span>
            <input
              type="number"
              className="input-field w-[5rem] py-1 text-xs"
              min={MIN_SIM_ITERATIONS}
              max={MAX_SIM_ITERATIONS}
              value={simIterations}
              disabled={playerSimBatchRunning}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setSimIterations(Math.min(MAX_SIM_ITERATIONS, Math.max(0, Math.round(n))));
              }}
            />
          </label>
        </div>
        {playerSimBatch && playerSimBatch.cases.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-xl bg-surface-raised/50 px-3 py-2.5">
            <p className="mb-2 text-xs text-muted">
              Сводка по платным кейсам · деп {formatTON(playerSimBatch.deposits_nanoton)} TON ·{" "}
              {playerSimBatch.iterations} открытий · сортировка по RTP
            </p>
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 pr-2 font-medium">Кейс</th>
                  <th className="py-1 pr-2 font-medium">Цена</th>
                  <th className="py-1 pr-2 font-medium">RTP</th>
                  <th className="py-1 pr-2 font-medium">Target</th>
                  <th className="py-1 pr-2 font-medium">Edge</th>
                  <th className="py-1 pr-2 font-medium">Boost</th>
                  <th className="py-1 font-medium">Банк end</th>
                </tr>
              </thead>
              <tbody>
                {playerSimBatch.cases.map((row) => (
                  <tr
                    key={row.case_id}
                    className="cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.03]"
                    onClick={() => {
                      const found = cases.find((c) => c.id === row.case_id);
                      if (found) selectCase(found);
                      setPlayerSimResult(row);
                      setSimResult(null);
                    }}
                  >
                    <td className="max-w-[12rem] truncate py-1 pr-2" title={row.title}>
                      {row.title}
                    </td>
                    <td className="py-1 pr-2 tabular-nums">{formatTON(row.price_nanoton)}</td>
                    <td className="py-1 pr-2 tabular-nums">
                      {row.rtp_available ? bpsPct(row.simulated_rtp_bps) : "—"}
                    </td>
                    <td className="py-1 pr-2 tabular-nums">{bpsPct(row.target_rtp_bps)}</td>
                    <td className="py-1 pr-2 tabular-nums">{formatTON(row.house_edge_nanoton)}</td>
                    <td className="py-1 pr-2 tabular-nums">
                      {row.boost_applied_opens}/{row.iterations}
                    </td>
                    <td className="py-1 tabular-nums">{formatTON(row.bank_end_nanoton)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminPanel>

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
        description="Фейк-дропы только в UI ленты. Не влияет на реальные открытия, баланс и аналитику case_opens. Цвет тайла в ленте и в кейсе берётся из цены приза по интервалам ниже."
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
              <span className="inline-flex items-center gap-1.5">
                Включить фейк-дропы
                <AdminInfoHint
                  label="Включить фейк-дропы"
                  hint="Главный переключатель симуляции. Если выключено — в ленте только реальные открытия игроков. Если включено — система периодически добавляет «как будто выпавшие» призы из лута активных кейсов, чтобы лента не пустовала."
                />
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={liveSettings.fill_when_sparse}
                onChange={(e) =>
                  setLiveSettings((s) => ({ ...s, fill_when_sparse: e.target.checked }))
                }
              />
              <span className="inline-flex items-center gap-1.5">
                Доливать при редких реальных открытиях
                <AdminInfoHint
                  label="Доливать при редких реальных открытиях"
                  hint="Если включено — фейки появляются только когда за последние ~90 секунд мало реальных открытий (меньше Min visible). Если выключено — фейки идут постоянно с частотой Intensity, даже когда игроки активно открывают кейсы."
                />
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={liveSettings.hide_ton}
                onChange={(e) =>
                  setLiveSettings((s) => ({ ...s, hide_ton: e.target.checked }))
                }
              />
              <span className="inline-flex items-center gap-1.5">
                Не показывать TON во фейк-дропах
                <AdminInfoHint
                  label="Не показывать TON во фейк-дропах"
                  hint="Если включено — симулятор не подмешивает TON в ленту, только подарки. Реальные выигрыши TON от игроков по-прежнему показываются."
                />
              </span>
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <AdminFloatField
                label="Intensity"
                hint="Как часто симулятор пытается добавить фейк в ленту. 1 ≈ раз в ~4 секунды. Больше значение — чаще дропы (до ~0.8 с). Меньше — реже (до ~30 с). Обычно 0.5–2."
                min={0.05}
                step={0.1}
                value={liveSettings.intensity}
                onChange={(v) => setLiveSettings((s) => ({ ...s, intensity: v }))}
              />
              <AdminIntField
                label="Min visible"
                hint="Целевой минимум «живых» реальных открытий за окно ~90 с, при котором фейки ещё доливаются (если включено «Доливать…»). Диапазон 1–6 — столько тайлов видно в ленте. Пример: 6 значит «пока реальных открытий меньше 6, продолжай подмешивать фейки»."
                min={1}
                value={liveSettings.min_visible}
                onChange={(v) => setLiveSettings((s) => ({ ...s, min_visible: v }))}
              />
              <AdminFloatField
                label="Fat chance"
                hint="Отдельный шанс (0–1) выбрать «жирный» приз вместо обычного взвешенного сэмпла. 0.08 = 8% попыток идут в пул дорогих призов (цена ≥ Fat min floor). Нужен, чтобы иногда показывать дорогие тайлы, даже если вес legendary маленький."
                min={0}
                step={0.01}
                value={liveSettings.fat_chance}
                onChange={(v) => setLiveSettings((s) => ({ ...s, fat_chance: v }))}
              />
              <AdminTonField
                label="Fat min floor (TON)"
                hint="Минимальная цена приза (TON), чтобы он попал в «жирный» пул для Fat chance. Пример: 5 TON — при срабатывании fat-шанса симулятор берёт случайный приз стоимостью от 5 TON и выше. Не путать с интервалами редкости ниже."
                valueNanoton={liveSettings.fat_min_floor_nanoton}
                onChangeNanoton={(v) =>
                  setLiveSettings((s) => ({ ...s, fat_min_floor_nanoton: v }))
                }
              />
              <AdminTonField
                label="Макс. цена подарка в ленте (TON)"
                hint="0 = без лимита. Подарки дороже этого значения не показываются в LIVE (реальные открытия и фейк-дропы). TON-призы не затрагиваются."
                valueNanoton={liveSettings.max_gift_floor_nanoton}
                onChangeNanoton={(v) =>
                  setLiveSettings((s) => ({ ...s, max_gift_floor_nanoton: v }))
                }
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--admin-fg)]">
                Редкость по цене приза
                <AdminInfoHint
                  label="Редкость по цене приза"
                  hint="Вручную ставить редкость на каждом подарке больше не нужно. Система смотрит на цену приза (floor / сумма TON) и относит его к тиру: common → uncommon → rare → epic → legendary. От тира зависят цвет тайла в ленте/кейсе и как часто этот приз попадает в фейк-сэмпл (через weight). Пороги — верхние границы тиров в TON (значение max не входит в тир: «строго меньше»)."
                />
              </p>
              <p className="text-[11px] leading-relaxed text-muted">
                Сейчас при ваших порогах:{" "}
                <span className="text-foreground/90">
                  common &lt; {(liveSettings.common_max_nanoton / 1e9).toFixed(2)} · uncommon &lt;{" "}
                  {(liveSettings.uncommon_max_nanoton / 1e9).toFixed(2)} · rare &lt;{" "}
                  {(liveSettings.rare_max_nanoton / 1e9).toFixed(2)} · epic &lt;{" "}
                  {(liveSettings.epic_max_nanoton / 1e9).toFixed(2)} · legendary ≥{" "}
                  {(liveSettings.epic_max_nanoton / 1e9).toFixed(2)} TON
                </span>
                . Пороги должны идти по возрастанию — при сохранении сервер подправит, если перепутали порядок.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <AdminTonField
                label="Common max"
                hint="Верхняя граница common (строго меньше этого значения). Все призы дешевле этого порога считаются common (самый «дешёвый» цвет тайла). Пример: 0.5 TON → приз за 0.3 TON = common, приз ровно за 0.5 уже uncommon."
                valueNanoton={liveSettings.common_max_nanoton}
                onChangeNanoton={(v) =>
                  setLiveSettings((s) => ({ ...s, common_max_nanoton: Math.max(0, v) }))
                }
              />
              <AdminFloatField
                label="Common weight"
                hint="Вес common во фейк-сэмпле. Чем выше относительно других weight, тем чаще в ленту попадают дешёвые (common) призы. 0 — тир не участвует в обычном сэмпле (кроме fat-шанса). Обычно common делают самым большим весом (например 50)."
                min={0}
                step={1}
                value={liveSettings.common_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, common_weight: v }))}
              />
              <AdminTonField
                label="Uncommon max"
                hint="Верхняя граница uncommon: цена ≥ Common max и < Uncommon max. Задаёт, до какой суммы приз ещё «зелёный» uncommon, а не rare. Должен быть ≥ Common max."
                valueNanoton={liveSettings.uncommon_max_nanoton}
                onChangeNanoton={(v) =>
                  setLiveSettings((s) => ({ ...s, uncommon_max_nanoton: Math.max(0, v) }))
                }
              />
              <AdminFloatField
                label="Uncommon weight"
                hint="Вес uncommon во фейк-сэмпле. Средние по цене призы. Обычно меньше common, больше rare (например 25)."
                min={0}
                step={1}
                value={liveSettings.uncommon_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, uncommon_weight: v }))}
              />
              <AdminTonField
                label="Rare max"
                hint="Верхняя граница rare: цена ≥ Uncommon max и < Rare max. Призы в этом диапазоне получают цвет rare. Должен быть ≥ Uncommon max."
                valueNanoton={liveSettings.rare_max_nanoton}
                onChangeNanoton={(v) =>
                  setLiveSettings((s) => ({ ...s, rare_max_nanoton: Math.max(0, v) }))
                }
              />
              <AdminFloatField
                label="Rare weight"
                hint="Вес rare во фейк-сэмпле. Дороже uncommon, но ещё не epic. Обычно небольшой вес (например 15), чтобы редкие тайлы не забивали ленту."
                min={0}
                step={1}
                value={liveSettings.rare_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, rare_weight: v }))}
              />
              <AdminTonField
                label="Epic max"
                hint="Верхняя граница epic: цена ≥ Rare max и < Epic max. Всё от Epic max и выше — legendary. Это последний ценовой порог: им вы отделяете «очень дорогие» от «легендарных»."
                valueNanoton={liveSettings.epic_max_nanoton}
                onChangeNanoton={(v) =>
                  setLiveSettings((s) => ({ ...s, epic_max_nanoton: Math.max(0, v) }))
                }
              />
              <AdminFloatField
                label="Epic weight"
                hint="Вес epic во фейк-сэмпле. Дорогие призы ниже порога legendary. Обычно маленький вес (например 7)."
                min={0}
                step={1}
                value={liveSettings.epic_weight}
                onChange={(v) => setLiveSettings((s) => ({ ...s, epic_weight: v }))}
              />
              <AdminFloatField
                label="Legendary weight"
                hint={`Вес legendary во фейк-сэмпле. Тир без верхнего max: все призы от Epic max (${(liveSettings.epic_max_nanoton / 1e9).toFixed(2)} TON) и дороже. Обычно самый маленький вес (например 3), иначе лента будет часто показывать джекпоты. Дополнительно жирные дропы можно усилить через Fat chance.`}
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
            description="Slug берётся из названия при создании и больше не меняется. Цена 0 — бесплатный / daily."
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <AdminField
                label="Название"
                hint={
                  draft.id
                    ? `slug: ${draft.slug}`
                    : draft.slug
                      ? `slug: ${draft.slug}`
                      : "slug появится из названия"
                }
              >
                <input
                  className="input-field"
                  value={draft.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      title,
                      ...(d.id ? {} : { slug: slugFromTitle(title) }),
                    }));
                  }}
                  placeholder="Стартовый кейс"
                />
              </AdminField>
              <AdminField
                label="Тип"
                hint={
                  draft.kind === "promo"
                    ? "Открывается только по промокоду. Коды создаются ниже после сохранения кейса."
                    : draft.kind === "daily"
                      ? "Бесплатный daily с кулдауном 24ч. Задания (тег в имени, share) — флаги ниже, не отдельный тип."
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
                      ...(kind !== "daily"
                        ? { required_name_tag: "", require_share: false }
                        : {}),
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
              <AdminField
                label="Фон карточки"
                className="sm:col-span-2 lg:col-span-3"
                hint="Палитра или свой #hex — градиент карточки и hero"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CASE_ACCENT_COLOR_OPTIONS.map((color) => {
                      const selected =
                        (draft.accent_color || "").trim().toLowerCase() === color;
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
                          onClick={() => setDraft((d) => ({ ...d, accent_color: color }))}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-10 cursor-pointer rounded-md border border-white/10 bg-transparent"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(draft.accent_color || "")
                          ? draft.accent_color!
                          : "#3b82f6"
                      }
                      onChange={(e) => setDraft((d) => ({ ...d, accent_color: e.target.value }))}
                    />
                    <input
                      className="input-field flex-1"
                      value={draft.accent_color || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, accent_color: e.target.value }))}
                      placeholder="#3b82f6"
                    />
                  </div>
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
              {draft.kind === "daily" ? (
                <>
                  <AdminField
                    label="Тег в имени"
                    hint="Пусто = не требовать. Подстрока в имени или фамилии Telegram (без учёта регистра), например @flipoGameBot."
                  >
                    <input
                      className="input-field"
                      value={draft.required_name_tag || ""}
                      placeholder="@flipoGameBot"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, required_name_tag: e.target.value }))
                      }
                    />
                  </AdminField>
                  <label className="flex items-start gap-2 pt-5 text-sm text-muted sm:col-span-2 lg:col-span-3">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(draft.require_share)}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, require_share: e.target.checked }))
                      }
                    />
                    <span>
                      Требовать share со ссылкой
                      <span className="mt-0.5 block text-[11px] text-muted/80">
                        Перед каждым открытием нужен клик «Поделиться». Текст для игрока может
                        говорить «5 друзей» — доставку ссылки не проверяем.
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminButton disabled={savingCase || deletingCase} onClick={() => void saveCase()}>
                {savingCase ? "…" : draft.id ? "Сохранить кейс" : "Создать кейс"}
              </AdminButton>
              <AdminButton
                variant="secondary"
                disabled={!draft.id || simulating || loot.length === 0 || deletingCase}
                onClick={() => void runSimulate()}
              >
                {simulating ? "…" : "Тест"}
              </AdminButton>
              <AdminButton
                variant="secondary"
                disabled={
                  !draft.id || playerSimulating || loot.length === 0 || deletingCase || draft.price_nanoton <= 0
                }
                onClick={() => void runPlayerSimulate()}
                title="Имитация обычного игрока: депозит + банк + deposit boost"
              >
                {playerSimulating ? "…" : "Тест игрока"}
              </AdminButton>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <span className="whitespace-nowrap">деп TON</span>
                <input
                  type="number"
                  className="input-field w-[5rem] py-1 text-xs"
                  min={0}
                  step={1}
                  value={playerSimDepositsTon}
                  disabled={playerSimulating || playerSimBatchRunning || deletingCase}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setPlayerSimDepositsTon(Math.max(0, n));
                  }}
                  title="Сумма депозитов имитируемого игрока (порог буста по умолчанию 10 TON)"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <span className="whitespace-nowrap">открытий</span>
                <input
                  type="number"
                  className="input-field w-[5.5rem] py-1 text-xs"
                  min={MIN_SIM_ITERATIONS}
                  max={MAX_SIM_ITERATIONS}
                  step={1}
                  value={simIterations}
                  disabled={simulating || playerSimulating || deletingCase}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setSimIterations(Math.min(MAX_SIM_ITERATIONS, Math.max(0, Math.round(n))));
                  }}
                  onBlur={() => {
                    setSimIterations((n) =>
                      Math.min(
                        MAX_SIM_ITERATIONS,
                        Math.max(MIN_SIM_ITERATIONS, n || DEFAULT_SIM_ITERATIONS),
                      ),
                    );
                  }}
                  title={`От 1 до ${MAX_SIM_ITERATIONS.toLocaleString("ru-RU")}`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={simWithBank}
                  onChange={(e) => setSimWithBank(e.target.checked)}
                />
                с банком (простой тест)
              </label>
              {draft.id ? (
                <AdminButton
                  variant="danger"
                  disabled={savingCase || deletingCase}
                  onClick={() => void removeCase()}
                >
                  {deletingCase ? "…" : "Удалить"}
                </AdminButton>
              ) : null}
            </div>
            {playerSimResult ? (
              <div className="mt-3 space-y-3 rounded-xl bg-surface-raised/50 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2 font-medium">
                  <span>
                    Игрок · деп {formatTON(playerSimResult.deposits_nanoton)} TON ·{" "}
                    {playerSimResult.iterations} открытий
                  </span>
                  <span className="text-xs font-normal text-muted">
                    {playerSimResult.boost_eligible
                      ? `${playerSimResult.boost_tier || "tier"} boost +${playerSimResult.boost_strength}% · scale ${bpsPct(playerSimResult.boost_scale_bps ?? 10000)} · применён ${playerSimResult.boost_applied_opens}/${playerSimResult.iterations}`
                      : "deposit boost выкл (мало депов / recovery / банк off)"}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Spent {formatTON(playerSimResult.spent_nanoton)} · Prize{" "}
                  {formatTON(playerSimResult.prize_total_nanoton)} · Edge{" "}
                  {formatTON(playerSimResult.house_edge_nanoton)} · RTP{" "}
                  {playerSimResult.rtp_available
                    ? bpsPct(playerSimResult.simulated_rtp_bps)
                    : "—"}{" "}
                  (теор {playerSimResult.rtp_available ? bpsPct(playerSimResult.theoretical_rtp_bps) : "—"} /
                  target {bpsPct(playerSimResult.target_rtp_bps)})
                </p>
                <p className="text-xs text-muted">
                  Банк: start {formatTON(playerSimResult.bank_start_nanoton)} → end{" "}
                  {formatTON(playerSimResult.bank_end_nanoton)} · min{" "}
                  {formatTON(playerSimResult.bank_min_nanoton)} · max{" "}
                  {formatTON(playerSimResult.bank_max_nanoton)} · recovery opens{" "}
                  {playerSimResult.recovery_opens}
                </p>
                {playerSimResult.warnings && playerSimResult.warnings.length > 0 ? (
                  <p className="text-xs text-amber-400/90">{playerSimResult.warnings.join(" · ")}</p>
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
                      {playerSimResult.entries.map((row) => (
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
                {playerSimResult.sample_opens.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">
                      Лента открытий (первые {playerSimResult.sample_opens.length})
                    </p>
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-white/[0.06]">
                      <table className="w-full min-w-[32rem] border-collapse text-left text-[11px]">
                        <thead className="sticky top-0 bg-surface-raised">
                          <tr className="text-muted">
                            <th className="px-2 py-1 font-medium">#</th>
                            <th className="px-2 py-1 font-medium">Приз</th>
                            <th className="px-2 py-1 font-medium">Цена</th>
                            <th className="px-2 py-1 font-medium">Boost</th>
                            <th className="px-2 py-1 font-medium">Recovery</th>
                            <th className="px-2 py-1 font-medium">Банк до→после</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerSimResult.sample_opens.map((op) => (
                            <tr key={op.index} className="border-t border-white/[0.04]">
                              <td className="px-2 py-0.5 tabular-nums text-muted">{op.index}</td>
                              <td className="max-w-[12rem] truncate px-2 py-0.5" title={op.display_name}>
                                {op.display_name}
                              </td>
                              <td className="px-2 py-0.5 tabular-nums">{formatTON(op.prize_nanoton)}</td>
                              <td className="px-2 py-0.5">
                                {op.boost_applied ? `${op.boost_tier || "tier"} +${op.boost_strength || 0}%` : "—"}
                              </td>
                              <td className="px-2 py-0.5">{op.recovery ? "да" : "—"}</td>
                              <td className="px-2 py-0.5 tabular-nums text-muted">
                                {formatTON(op.bank_before_nanoton)} → {formatTON(op.bank_after_nanoton)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
                  {simResult.with_bank
                    ? ` · банк → ${formatTON(simResult.final_bank_nanoton || 0)} TON`
                    : ""}
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
                    Пусто — добавьте подарок или TON-приз.
                  </AdminEmpty>
                ) : (
                  <div className="space-y-2">
                    {loot.map((row, idx) => {
                      const expanded = expandedKey === row._key;
                      const isTon = row.prize_type === "ton";
                      const valueNanoton = isTon
                        ? row.amount_nanoton || row.floor_price_nanoton || 0
                        : row.floor_price_nanoton || 0;
                      const rarityBg = candyTileBackgroundForLoot({
                        ...row,
                        rarity_label: rarityFromValueNanoton(valueNanoton, liveSettings),
                      });
                      return (
                        <div key={row._key} className="admin-loot-card">
                          <div
                            className="admin-loot-card__thumb"
                            style={{ background: rarityBg }}
                          >
                            {isTon ? (
                              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white/90">
                                TON
                              </span>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={lootPreviewUrl(row)}
                                alt=""
                                className="admin-loot-card__img"
                              />
                            )}
                          </div>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="admin-loot-card__title">
                                  {isTon
                                    ? row.display_name || "TON"
                                    : row.display_name || row.collection_slug}
                                </p>
                                <p className="admin-loot-card__slug">
                                  {isTon
                                    ? "приз · TON"
                                    : row.model_name || row._modelName
                                      ? row.model_name || row._modelName
                                      : "рандом"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {!isTon ? (
                                  <AdminButton
                                    variant="secondary"
                                    className="!h-8 !px-2.5 text-xs"
                                    onClick={() => openEditModelPicker(row._key)}
                                  >
                                    Модель
                                  </AdminButton>
                                ) : null}
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
                              <AdminField label="weight" hint="0 = шанс 0%, приз не выпадает">
                                <input
                                  className="input-field"
                                  type="number"
                                  min={0}
                                  value={row.weight}
                                  onChange={(e) =>
                                    updateLoot(row._key, {
                                      weight: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
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
                              {isTon ? (
                                <AdminTonField
                                  label="сумма (TON)"
                                  valueNanoton={row.amount_nanoton ?? 0}
                                  onChangeNanoton={(v) =>
                                    updateLoot(row._key, {
                                      amount_nanoton: Math.max(0, v),
                                      floor_price_nanoton: Math.max(0, v),
                                    })
                                  }
                                  hint="Сколько TON зачислить на баланс при выпадении"
                                />
                              ) : (
                                <AdminTonField
                                  label="цена (TON)"
                                  valueNanoton={row.floor_price_nanoton ?? 0}
                                  onChangeNanoton={(v) =>
                                    updateLoot(row._key, { floor_price_nanoton: Math.max(0, v) })
                                  }
                                  hint="Показывается в списке призов кейса. 0 — подтянуть рыночный floor."
                                />
                              )}
                              <AdminField
                                label="цвет фона"
                                className="col-span-2 sm:col-span-3"
                                hint="Палитра или свой #hex — фон карточки приза (иначе по цене из интервалов live-ленты)"
                              >
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      title="По цене (live-интервалы)"
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
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      className="h-9 w-10 cursor-pointer rounded-md border border-white/10 bg-transparent"
                                      value={
                                        normalizeLootTileColor(row.tile_background_color) ||
                                        "#3b82f6"
                                      }
                                      onChange={(e) =>
                                        updateLoot(row._key, {
                                          tile_background_color: e.target.value.toLowerCase(),
                                        })
                                      }
                                    />
                                    <input
                                      className="input-field flex-1"
                                      value={row.tile_background_color || ""}
                                      onChange={(e) =>
                                        updateLoot(row._key, {
                                          tile_background_color: e.target.value,
                                        })
                                      }
                                      placeholder="#hex или пусто = авто"
                                    />
                                  </div>
                                </div>
                              </AdminField>
                              {!isTon ? (
                                <AdminField
                                  label="трейт фона"
                                  className="col-span-2 sm:col-span-3"
                                  hint="Black / Onyx Black — премиум-трейт Telegram-подарка (дороже)"
                                >
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      className={
                                        !normalizeLootBackdrop(row.backdrop)
                                          ? "rounded-lg bg-[var(--admin-accent-subtle)] px-2 py-1 text-xs text-[var(--admin-fg)]"
                                          : "rounded-lg bg-black/20 px-2 py-1 text-xs text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
                                      }
                                      onClick={() => updateLoot(row._key, { backdrop: "" })}
                                    >
                                      любой
                                    </button>
                                    {LOOT_BACKDROP_OPTIONS.map((bg) => {
                                      const selected = normalizeLootBackdrop(row.backdrop) === bg;
                                      return (
                                        <button
                                          key={bg}
                                          type="button"
                                          className={
                                            selected
                                              ? "rounded-lg bg-[var(--admin-accent-subtle)] px-2 py-1 text-xs text-[var(--admin-fg)]"
                                              : "rounded-lg bg-black/20 px-2 py-1 text-xs text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
                                          }
                                          onClick={() =>
                                            updateLoot(row._key, {
                                              backdrop: selected ? "" : bg,
                                            })
                                          }
                                        >
                                          {bg}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </AdminField>
                              ) : null}
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
                                {!isTon ? (
                                  <>
                                    <AdminField label="collection_slug" hint="Telegram-коллекция">
                                      <input
                                        className="input-field"
                                        value={row.collection_slug}
                                        onChange={(e) =>
                                          updateLoot(row._key, {
                                            collection_slug: e.target.value
                                              .toLowerCase()
                                              .replace(/[^a-z0-9]/g, ""),
                                          })
                                        }
                                      />
                                    </AdminField>
                                    <AdminField
                                      label="model_name"
                                      hint="пусто = любая модель из коллекции"
                                    >
                                      <input
                                        className="input-field"
                                        value={row.model_name || row._modelName || ""}
                                        onChange={(e) =>
                                          updateLoot(row._key, {
                                            model_name: e.target.value,
                                            _modelName: e.target.value.trim() || undefined,
                                          })
                                        }
                                        placeholder="например Celestia"
                                      />
                                    </AdminField>
                                    <AdminField
                                      label="image_url"
                                      className="sm:col-span-2"
                                      hint="CDN / API URL, заполняется автоматически"
                                    >
                                      <input
                                        className="input-field font-mono text-xs"
                                        value={row.image_url || ""}
                                        onChange={(e) =>
                                          updateLoot(row._key, { image_url: e.target.value })
                                        }
                                      />
                                    </AdminField>
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <AdminButton variant="secondary" onClick={openAddGiftPicker}>
                    + Добавить подарок
                  </AdminButton>
                  <AdminButton variant="secondary" onClick={addTonPrize}>
                    + Добавить TON
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
        onClose={closeGiftPicker}
        onSelect={applyGiftSelection}
        excludeKeys={lootKeys}
        initialCollectionSlug={editingLootRow?.collection_slug}
        title={editingLootRow ? "Сменить модель" : undefined}
      />
    </AdminPage>
  );
}
