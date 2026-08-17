"use client";

import { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { GiftPickerModal } from "@/components/admin/GiftPickerModal";
import { AdminUserPicker } from "@/components/admin/AdminUserPicker";
import { AdminPage, AdminButton, AdminLocalizedField, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminIntField, AdminTonField } from "@/components/admin/AdminInputs";
import { useToast } from "@/components/providers/ToastProvider";
import {
  deleteAdminDailyQuest,
  formatTON,
  getAdminCases,
  getAdminDailyQuestBoard,
  getAdminDailyQuests,
  resetAdminDailyQuestClaims,
  updateAdminDailyQuestBoard,
  uploadAdminCaseImage,
  upsertAdminDailyQuest,
  type AdminCase,
  type AdminDailyQuest,
  type AdminDailyQuestBoard,
  type DailyQuestPromoSlide,
} from "@/lib/api";
import type { GiftPickerSelection } from "@/lib/changes-gifts";
import { CASE_ACCENT_COLOR_OPTIONS } from "@/components/cases/case-ui";
import { CasesQuestBannerPreview } from "@/components/cases/CasesQuestBanner";

const PROMO_TEXT_COLOR_OPTIONS = [
  "#ffffff",
  "#ff4eb1",
  "#ff6bcb",
  "#7dd3fc",
  "#9ec9ff",
  "#3390ec",
  "#0f9f7a",
  "#5ee0c0",
  "#7c5cff",
  "#ffb44a",
  "#e11d48",
  "#111827",
  ...CASE_ACCENT_COLOR_OPTIONS,
] as const;

function uniqueColors(colors: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of colors) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

const PROMO_PALETTE = uniqueColors(PROMO_TEXT_COLOR_OPTIONS);

function PromoColorPicker({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value?: string;
  fallback: string;
  onChange: (color: string) => void;
}) {
  const current = /^#[0-9a-fA-F]{6}$/.test(value || "") ? value! : fallback;
  return (
    <div className="space-y-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {PROMO_PALETTE.map((color) => {
          const selected = (value || "").trim().toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              className={
                selected
                  ? "h-6 w-6 rounded-md ring-2 ring-[var(--admin-accent,#3390ec)] ring-offset-1 ring-offset-[var(--admin-panel,#0c141c)]"
                  : "h-6 w-6 rounded-md ring-1 ring-white/15 hover:ring-white/35"
              }
              style={{ backgroundColor: color }}
              onClick={() => onChange(color)}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-8 w-9 cursor-pointer rounded-md border border-border bg-transparent"
          value={current}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
        />
      </div>
    </div>
  );
}

const QUEST_INPUT = "w-full rounded-lg border border-border bg-background px-3 py-2";

const DEFAULT_PROMO_SLIDES: DailyQuestPromoSlide[] = [
  {
    id: "duo",
    tone: "duo",
    eyebrow: "Promo",
    eyebrow_en: "Promo",
    eyebrow_ru: "Супер-акция",
    title: "1+1 on cases",
    title_en: "1+1 on cases",
    title_ru: "1+1 на кейсы",
    subtitle: "Open a case — get the second one free",
    subtitle_en: "Open a case — get the second one free",
    subtitle_ru: "Открой кейс — второй бесплатно",
    cta: "To quests",
    cta_en: "To quests",
    cta_ru: "К заданиям",
    cta_color: "#7c5cff",
    cta_bold: false,
    cover_url: "/cases/covers/quest-promo-2x.webp",
    active: true,
  },
  {
    id: "open",
    tone: "open",
    eyebrow: "Daily quest",
    eyebrow_en: "Daily quest",
    eyebrow_ru: "Задание дня",
    title: "Open a case",
    title_en: "Open a case",
    title_ru: "Открой кейс",
    subtitle: "Complete the goal and claim the reward",
    subtitle_en: "Complete the goal and claim the reward",
    subtitle_ru: "Выполни цель и забери награду",
    cta: "View",
    cta_en: "View",
    cta_ru: "Смотреть",
    cta_color: "#0f9f7a",
    cta_bold: false,
    cover_url: "/cases/covers/quest-promo-open.webp",
    active: true,
  },
];

const EMPTY_QUEST: AdminDailyQuest = {
  title: "",
  title_en: "",
  title_ru: "",
  description: "",
  sort_order: 10,
  active: true,
  objective_type: "open_cases",
  objective_target: 1,
  objective_param: 0,
  objective_case_id: null,
  reward_type: "balance_nanoton",
  reward_nanoton: 1_000_000_000,
  reward_collection_slug: "",
  reward_model_name: "",
  reward_gift_name: "",
  reward_gift_image_url: "",
  card_image_url: "",
};

const EMPTY_BOARD: AdminDailyQuestBoard = {
  bonus_title: "Bonus of the day",
  bonus_title_en: "Bonus of the day",
  bonus_title_ru: "Бонус дня",
  bonus_description: "",
  bonus_reward_type: "balance_nanoton",
  bonus_reward_nanoton: 1_000_000_000,
  bonus_reward_collection_slug: "",
  bonus_reward_model_name: "",
  bonus_reward_gift_name: "",
  bonus_reward_gift_image_url: "",
  bonus_card_image_url: "",
  bonus_active: false,
  promo_slides: DEFAULT_PROMO_SLIDES,
};

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function giftRewardLabel(name?: string, slug?: string, model?: string): string {
  const title = name?.trim() || model?.trim() || slug?.trim();
  return title ? `Подарок: ${title}` : "Подарок";
}

const NANOTON_OBJECTIVES = new Set([
  "open_cases_spend",
  "wager_roulette",
  "wager_crash",
]);

const MULT_OBJECTIVES = new Set(["roulette_win_mult", "crash_cashout_mult"]);

function isNanotonObjective(type: string): boolean {
  return NANOTON_OBJECTIVES.has(type);
}

function isMultObjective(type: string): boolean {
  return MULT_OBJECTIVES.has(type);
}

function isCaseObjective(type: string): boolean {
  return type === "open_cases" || type === "open_cases_spend";
}

function multFromParam(param?: number): number {
  const p = Number(param) || 0;
  if (p < 100) return 2;
  return p / 100;
}

function paramFromMult(mult: number): number {
  return Math.max(100, Math.round(mult * 100));
}

export default function QuestsSection() {
  const { showToast } = useToast();
  const [quests, setQuests] = useState<AdminDailyQuest[]>([]);
  const [draft, setDraft] = useState<AdminDailyQuest>(EMPTY_QUEST);
  const [board, setBoard] = useState<AdminDailyQuestBoard>(EMPTY_BOARD);
  const [cases, setCases] = useState<AdminCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetTelegramId, setResetTelegramId] = useState<number | null>(null);
  const [giftPickerTarget, setGiftPickerTarget] = useState<"quest" | "board" | null>(null);
  const [uploadingCoverIndex, setUploadingCoverIndex] = useState<number | null>(null);
  const [uploadingCardImage, setUploadingCardImage] = useState(false);
  const [uploadingBonusCardImage, setUploadingBonusCardImage] = useState(false);

  const caseOptions = useMemo(
    () => cases.filter((c) => c.active !== false).sort((a, b) => (a.title_ru || a.title).localeCompare(b.title_ru || b.title)),
    [cases],
  );

  async function load() {
    setLoading(true);
    try {
      const [items, boardRes, caseRes] = await Promise.all([
        getAdminDailyQuests(),
        getAdminDailyQuestBoard(),
        getAdminCases().catch(() => [] as AdminCase[]),
      ]);
      setQuests(items);
      setBoard({
        ...boardRes,
        bonus_title_en: boardRes.bonus_title_en || boardRes.bonus_title || "",
        bonus_title_ru: boardRes.bonus_title_ru || boardRes.bonus_title || "",
        promo_slides:
          boardRes.promo_slides && boardRes.promo_slides.length > 0
            ? boardRes.promo_slides
            : DEFAULT_PROMO_SLIDES,
      });
      setCases(caseRes);
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось загрузить",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function applyGift(target: "quest" | "board", gift: GiftPickerSelection) {
    if (target === "quest") {
      setDraft((prev) => ({
        ...prev,
        reward_collection_slug: gift.collectionSlug,
        reward_model_name: gift.modelName,
        reward_gift_name: gift.displayName,
        reward_gift_image_url: gift.previewUrl,
      }));
      return;
    }
    setBoard((prev) => ({
      ...prev,
      bonus_reward_collection_slug: gift.collectionSlug,
      bonus_reward_model_name: gift.modelName,
      bonus_reward_gift_name: gift.displayName,
      bonus_reward_gift_image_url: gift.previewUrl,
    }));
  }

  async function saveQuest() {
    if (!(draft.title_en || "").trim() && !(draft.title_ru || "").trim() && !draft.title.trim()) {
      showToast({ variant: "error", title: "Укажите название" });
      return;
    }
    if (draft.reward_type === "gift" && !draft.reward_collection_slug?.trim()) {
      showToast({ variant: "error", title: "Выберите подарок" });
      return;
    }
    setSaving(true);
    try {
      const payload: AdminDailyQuest = {
        ...draft,
        title: (draft.title_en || draft.title_ru || draft.title).trim(),
        title_en: (draft.title_en || "").trim(),
        title_ru: (draft.title_ru || "").trim(),
        description: "",
        active_from: draft.active_from || null,
        active_to: draft.active_to || null,
        objective_case_id: isCaseObjective(draft.objective_type)
          ? draft.objective_case_id || null
          : null,
        objective_param: isMultObjective(draft.objective_type)
          ? Math.max(100, Math.floor(draft.objective_param || 0))
          : 0,
        reward_case_id: draft.reward_type === "free_case_open" ? draft.reward_case_id || null : null,
        reward_nanoton:
          draft.reward_type === "balance_nanoton" || draft.reward_type === "gift"
            ? draft.reward_nanoton
            : 0,
        reward_collection_slug:
          draft.reward_type === "gift" ? draft.reward_collection_slug || "" : "",
        reward_model_name: draft.reward_type === "gift" ? draft.reward_model_name || "" : "",
        reward_gift_name: draft.reward_type === "gift" ? draft.reward_gift_name || "" : "",
        reward_gift_image_url:
          draft.reward_type === "gift" ? draft.reward_gift_image_url || "" : "",
        card_image_url: draft.card_image_url?.trim() || "",
      };
      await upsertAdminDailyQuest(payload);
      showToast({ variant: "success", title: "Задание сохранено" });
      setDraft(EMPTY_QUEST);
      await load();
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Ошибка сохранения",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveBoard() {
    if (
      board.bonus_active &&
      board.bonus_reward_type === "gift" &&
      !board.bonus_reward_collection_slug?.trim()
    ) {
      showToast({ variant: "error", title: "Выберите подарок для бонуса" });
      return;
    }
    setSaving(true);
    try {
      const payload: AdminDailyQuestBoard = {
        ...board,
        bonus_title: (board.bonus_title_en || board.bonus_title_ru || board.bonus_title).trim() || "Bonus of the day",
        bonus_title_en: (board.bonus_title_en || "").trim(),
        bonus_title_ru: (board.bonus_title_ru || "").trim(),
        bonus_description: "",
        bonus_reward_case_id:
          board.bonus_reward_type === "free_case_open" ? board.bonus_reward_case_id || null : null,
        bonus_reward_nanoton:
          board.bonus_reward_type === "balance_nanoton" || board.bonus_reward_type === "gift"
            ? board.bonus_reward_nanoton
            : 0,
        bonus_reward_collection_slug:
          board.bonus_reward_type === "gift" ? board.bonus_reward_collection_slug || "" : "",
        bonus_reward_model_name:
          board.bonus_reward_type === "gift" ? board.bonus_reward_model_name || "" : "",
        bonus_reward_gift_name:
          board.bonus_reward_type === "gift" ? board.bonus_reward_gift_name || "" : "",
        bonus_reward_gift_image_url:
          board.bonus_reward_type === "gift" ? board.bonus_reward_gift_image_url || "" : "",
        bonus_card_image_url: board.bonus_card_image_url?.trim() || "",
        promo_slides: board.promo_slides ?? [],
      };
      const next = await updateAdminDailyQuestBoard(payload);
      setBoard({
        ...next,
        promo_slides:
          next.promo_slides && next.promo_slides.length > 0
            ? next.promo_slides
            : board.promo_slides ?? DEFAULT_PROMO_SLIDES,
      });
      showToast({ variant: "success", title: "Бонус сохранён" });
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Ошибка сохранения",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeQuest(id: string) {
    if (!window.confirm("Удалить задание?")) return;
    try {
      await deleteAdminDailyQuest(id);
      showToast({ variant: "success", title: "Удалено" });
      if (draft.id === id) setDraft(EMPTY_QUEST);
      await load();
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось удалить",
      });
    }
  }

  async function resetClaims(scope: "all" | "user") {
    if (resetting) return;
    let telegramId: number | undefined;
    if (scope === "user") {
      if (resetTelegramId == null || resetTelegramId <= 0) {
        showToast({ variant: "error", title: "Выберите игрока" });
        return;
      }
      telegramId = resetTelegramId;
      if (
        !window.confirm(
          `Сбросить клеймы заданий за сегодня (МСК) у игрока ${telegramId}? Уже выданные TON и подарки не забираются.`,
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        "Сбросить клеймы заданий за сегодня (МСК) у ВСЕХ игроков? Уже выданные TON и подарки не забираются.",
      )
    ) {
      return;
    }

    setResetting(true);
    try {
      const result = await resetAdminDailyQuestClaims(
        scope === "user" ? { telegram_id: telegramId } : {},
      );
      showToast({
        variant: "success",
        title:
          result.deleted_claims > 0
            ? `Сброшены прогресс и клеймы: ${result.deleted_claims} (${result.day_msk})`
            : `Прогресс сброшен за ${result.day_msk} (клеймов не было)`,
      });
      if (scope === "user") setResetTelegramId(null);
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось сбросить",
      });
    } finally {
      setResetting(false);
    }
  }

  function updatePromoSlide(index: number, patch: Partial<DailyQuestPromoSlide>) {
    setBoard((prev) => {
      const slides = [...(prev.promo_slides ?? DEFAULT_PROMO_SLIDES)];
      const current = slides[index] ?? {
        id: `slide-${index + 1}`,
        tone: "open",
        eyebrow: "",
        eyebrow_en: "",
        eyebrow_ru: "",
        title: "",
        title_en: "",
        title_ru: "",
        subtitle: "",
        subtitle_en: "",
        subtitle_ru: "",
        cta: "To quests",
        cta_en: "To quests",
        cta_ru: "К заданиям",
        cta_color: "#0f9f7a",
        cta_bold: false,
        cover_url: "",
        active: true,
      };
      slides[index] = { ...current, ...patch };
      return { ...prev, promo_slides: slides };
    });
  }

  async function onPickBonusCardImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ variant: "error", title: "Нужен файл изображения" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast({ variant: "error", title: "Максимум 5 МБ" });
      return;
    }
    setUploadingBonusCardImage(true);
    try {
      const res = await uploadAdminCaseImage(file);
      setBoard((prev) => ({ ...prev, bonus_card_image_url: res.image_url || res.url }));
      showToast({ variant: "success", title: "Картинка загружена" });
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось загрузить картинку",
      });
    } finally {
      setUploadingBonusCardImage(false);
    }
  }

  async function onPickQuestCardImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ variant: "error", title: "Нужен файл изображения" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast({ variant: "error", title: "Максимум 5 МБ" });
      return;
    }
    setUploadingCardImage(true);
    try {
      const res = await uploadAdminCaseImage(file);
      setDraft((prev) => ({ ...prev, card_image_url: res.image_url || res.url }));
      showToast({ variant: "success", title: "Картинка загружена" });
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось загрузить картинку",
      });
    } finally {
      setUploadingCardImage(false);
    }
  }

  async function onPickPromoCover(index: number, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ variant: "error", title: "Нужен файл изображения" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast({ variant: "error", title: "Максимум 5 МБ" });
      return;
    }
    setUploadingCoverIndex(index);
    try {
      const res = await uploadAdminCaseImage(file);
      updatePromoSlide(index, { cover_url: res.image_url || res.url });
      showToast({ variant: "success", title: "Картинка загружена" });
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось загрузить картинку",
      });
    } finally {
      setUploadingCoverIndex(null);
    }
  }

  function addPromoSlide() {
    setBoard((prev) => ({
      ...prev,
      promo_slides: [
        ...(prev.promo_slides ?? []),
        {
          id: `slide-${Date.now()}`,
          tone: "open",
          eyebrow: "",
          eyebrow_en: "",
          eyebrow_ru: "",
          title: "",
          title_en: "",
          title_ru: "",
          subtitle: "",
          subtitle_en: "",
          subtitle_ru: "",
          cta: "To quests",
          cta_en: "To quests",
          cta_ru: "К заданиям",
          cta_color: "#0f9f7a",
          cta_bold: false,
          cover_url: "",
          active: true,
        },
      ],
    }));
  }

  function removePromoSlide(index: number) {
    setBoard((prev) => ({
      ...prev,
      promo_slides: (prev.promo_slides ?? []).filter((_, i) => i !== index),
    }));
  }

  function rewardLabel(q: AdminDailyQuest): string {
    if (q.reward_type === "none") return "Без награды";
    if (q.reward_type === "free_case_open") {
      const c = caseOptions.find((x) => x.id === q.reward_case_id);
      return c ? `Кейс: ${c.title_ru || c.title}` : "Кейс";
    }
    if (q.reward_type === "gift") {
      return `${giftRewardLabel(q.reward_gift_name, q.reward_collection_slug, q.reward_model_name)} (${formatTON(q.reward_nanoton)} TON)`;
    }
    return `${formatTON(q.reward_nanoton)} TON`;
  }

  function objectiveLabel(q: AdminDailyQuest): string {
    if (q.objective_type === "invite_referrals") return `Рефералы ×${q.objective_target}`;
    if (q.objective_type === "wager_roulette") {
      return `Рулетка ${formatTON(q.objective_target)} TON`;
    }
    if (q.objective_type === "wager_crash") {
      return `Crash ${formatTON(q.objective_target)} TON`;
    }
    if (q.objective_type === "roulette_win_mult") {
      return `Рулетка ≥×${multFromParam(q.objective_param)} ×${q.objective_target}`;
    }
    if (q.objective_type === "crash_cashout_mult") {
      return `Crash cashout ≥×${multFromParam(q.objective_param)} ×${q.objective_target}`;
    }
    if (q.objective_type === "roulette_color_streak") {
      return `Рулетка серия цвета ×${q.objective_target}`;
    }
    const found = caseOptions.find((x) => x.id === q.objective_case_id);
    const caseTitle = found ? found.title_ru || found.title : undefined;
    if (q.objective_type === "open_cases_spend") {
      const amount = `${formatTON(q.objective_target)} TON`;
      return caseTitle ? `Кейс «${caseTitle}» ${amount}` : `Кейсы ${amount}`;
    }
    if (caseTitle) return `Кейс «${caseTitle}» ×${q.objective_target}`;
    return `Любые кейсы ×${q.objective_target}`;
  }

  return (
    <AdminPage title="Задания" description="Ежедневные задания и бонус за выполнение всех.">
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Сброс клеймов</h3>
        <p className="text-xs text-muted">
          Удаляет полученные сегодня (по МСК) отметки заданий и бонуса. Неиспользованные бесплатные
          открытия кейсов с квестов тоже снимаются. Баланс и подарки в инвентаре не трогаются.
        </p>
        <AdminToolbar>
          <AdminButton
            variant="danger"
            disabled={resetting || loading}
            onClick={() => void resetClaims("all")}
          >
            Сбросить у всех
          </AdminButton>
        </AdminToolbar>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <AdminUserPicker
            label="Игрок для сброса"
            value={resetTelegramId}
            onChange={(telegramId) => setResetTelegramId(telegramId)}
            className="text-sm text-muted"
          />
          <AdminButton
            variant="secondary"
            disabled={resetting || loading || resetTelegramId == null}
            onClick={() => void resetClaims("user")}
          >
            Сбросить игроку
          </AdminButton>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Бонус за все задания</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminLocalizedField
            className="sm:col-span-2"
            label="Заголовок"
            en={board.bonus_title_en || ""}
            ru={board.bonus_title_ru || board.bonus_title}
            onEnChange={(bonus_title_en) => setBoard({ ...board, bonus_title_en, bonus_title: bonus_title_en || board.bonus_title_ru || board.bonus_title })}
            onRuChange={(bonus_title_ru) => setBoard({ ...board, bonus_title_ru })}
            controlClassName={QUEST_INPUT}
            enPlaceholder="Bonus of the day"
            ruPlaceholder="Бонус дня"
          />
          <label className="space-y-1 text-sm">
            <span className="text-muted">Тип награды</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={board.bonus_reward_type}
              onChange={(e) => setBoard({ ...board, bonus_reward_type: e.target.value })}
            >
              <option value="balance_nanoton">TON на баланс</option>
              <option value="free_case_open">Бесплатный кейс</option>
              <option value="gift">Подарок в инвентарь</option>
            </select>
          </label>
          {board.bonus_reward_type === "balance_nanoton" ? (
            <AdminTonField
              label="Награда TON"
              valueNanoton={board.bonus_reward_nanoton}
              onChangeNanoton={(v) => setBoard({ ...board, bonus_reward_nanoton: v })}
            />
          ) : null}
          {board.bonus_reward_type === "free_case_open" ? (
            <label className="space-y-1 text-sm">
              <span className="text-muted">Кейс</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                value={board.bonus_reward_case_id ?? ""}
                onChange={(e) =>
                  setBoard({ ...board, bonus_reward_case_id: e.target.value || null })
                }
              >
                <option value="">Выберите кейс</option>
                {caseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title_ru || c.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {board.bonus_reward_type === "gift" ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <span className="text-sm text-muted">Подарок</span>
                <div className="flex flex-wrap items-center gap-3">
                  {board.bonus_reward_gift_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={board.bonus_reward_gift_image_url}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 text-sm">
                    {board.bonus_reward_collection_slug ? (
                      <p className="font-medium">
                        {board.bonus_reward_gift_name ||
                          board.bonus_reward_model_name ||
                          board.bonus_reward_collection_slug}
                      </p>
                    ) : (
                      <p className="text-muted">Не выбран</p>
                    )}
                  </div>
                  <AdminButton variant="secondary" onClick={() => setGiftPickerTarget("board")}>
                    Выбрать подарок
                  </AdminButton>
                </div>
              </div>
              <AdminTonField
                label="Цена выкупа (TON)"
                valueNanoton={board.bonus_reward_nanoton}
                onChangeNanoton={(v) => setBoard({ ...board, bonus_reward_nanoton: v })}
              />
            </>
          ) : null}
          <div className="space-y-2 sm:col-span-2">
            <span className="text-sm text-muted">Картинка на карточке бонуса</span>
            <p className="text-xs text-muted">
              Опционально. Если не задана — берётся превью награды (кейс / подарок / TON).
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {board.bonus_card_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={board.bonus_card_image_url}
                  alt=""
                  className="h-14 w-14 rounded-xl object-cover bg-black/30"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted">
                  —
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center">
                <span className="rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-surface">
                  {uploadingBonusCardImage ? "Загрузка…" : "Загрузить"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingBonusCardImage}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onPickBonusCardImage(file);
                  }}
                />
              </label>
              {board.bonus_card_image_url ? (
                <AdminButton
                  variant="secondary"
                  onClick={() => setBoard({ ...board, bonus_card_image_url: "" })}
                >
                  Убрать
                </AdminButton>
              ) : null}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={board.bonus_active}
            onChange={(e) => setBoard({ ...board, bonus_active: e.target.checked })}
          />
          Бонус активен
        </label>
        <AdminToolbar>
          <AdminButton onClick={() => void saveBoard()} disabled={saving || loading}>
            Сохранить бонус
          </AdminButton>
        </AdminToolbar>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Баннер на странице кейсов</h3>
        <p className="text-xs text-muted">
          Слайды карусели над каталогом. Текст, картинка и кнопка ведут в задания.
        </p>
        {(board.promo_slides ?? []).map((slide, index) => {
          return (
          <div
            key={slide.id || `slide-${index}`}
            className="space-y-3 rounded-lg border border-border bg-background/40 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Слайд {index + 1}</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={slide.active}
                    onChange={(e) => updatePromoSlide(index, { active: e.target.checked })}
                  />
                  Показывать
                </label>
                <AdminButton
                  variant="secondary"
                  onClick={() => removePromoSlide(index)}
                  disabled={(board.promo_slides?.length ?? 0) <= 1}
                >
                  Удалить
                </AdminButton>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted">Предпросмотр</p>
              <div className="rounded-2xl bg-[#0c141c] p-3">
                <CasesQuestBannerPreview slide={slide} />
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                В текстах: <code className="text-foreground/80">**акцент**</code> для цветного
                фрагмента, <code className="text-foreground/80">\n</code> для переноса строки.
                Пример заголовка: <code className="text-foreground/80">Кейс в **подарок**</code>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminLocalizedField
                className="sm:col-span-2"
                label="Надзаголовок"
                en={slide.eyebrow_en || ""}
                ru={slide.eyebrow_ru || slide.eyebrow}
                onEnChange={(eyebrow_en) => updatePromoSlide(index, { eyebrow_en, eyebrow: eyebrow_en || slide.eyebrow_ru || slide.eyebrow })}
                onRuChange={(eyebrow_ru) => updatePromoSlide(index, { eyebrow_ru })}
                controlClassName={QUEST_INPUT}
                enPlaceholder="1 + 1"
                ruPlaceholder="1 + 1"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(slide.eyebrow_bold)}
                  onChange={(e) => updatePromoSlide(index, { eyebrow_bold: e.target.checked })}
                />
                <span className="text-muted">Жирный надзаголовок</span>
              </label>
              <PromoColorPicker
                label="Цвет надзаголовка"
                value={slide.eyebrow_color}
                fallback="#ff4eb1"
                onChange={(color) => updatePromoSlide(index, { eyebrow_color: color })}
              />

              <AdminLocalizedField
                className="sm:col-span-2"
                label="Заголовок"
                en={slide.title_en || ""}
                ru={slide.title_ru || slide.title}
                onEnChange={(title_en) => updatePromoSlide(index, { title_en, title: title_en || slide.title_ru || slide.title })}
                onRuChange={(title_ru) => updatePromoSlide(index, { title_ru })}
                multiline
                controlClassName={QUEST_INPUT}
                enPlaceholder={"Case as a **gift**"}
                ruPlaceholder={"Кейс в **подарок**"}
              />
              <label className="space-y-1 text-sm">
                <span className="text-muted">Размер заголовка</span>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={slide.title_size === "sm" || slide.title_size === "lg" ? slide.title_size : "md"}
                  onChange={(e) => updatePromoSlide(index, { title_size: e.target.value })}
                >
                  <option value="sm">Маленький</option>
                  <option value="md">Обычный</option>
                  <option value="lg">Крупный</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(slide.title_bold)}
                  onChange={(e) => updatePromoSlide(index, { title_bold: e.target.checked })}
                />
                <span className="text-muted">Жирный заголовок</span>
              </label>
              <PromoColorPicker
                label="Цвет заголовка"
                value={slide.title_color}
                fallback="#ffffff"
                onChange={(color) => updatePromoSlide(index, { title_color: color })}
              />
              <PromoColorPicker
                label="Цвет акцента (**…**)"
                value={slide.accent_color}
                fallback="#ff4eb1"
                onChange={(color) => updatePromoSlide(index, { accent_color: color })}
              />

              <AdminLocalizedField
                className="sm:col-span-2"
                label="Подзаголовок"
                en={slide.subtitle_en || ""}
                ru={slide.subtitle_ru || slide.subtitle}
                onEnChange={(subtitle_en) => updatePromoSlide(index, { subtitle_en, subtitle: subtitle_en || slide.subtitle_ru || slide.subtitle })}
                onRuChange={(subtitle_ru) => updatePromoSlide(index, { subtitle_ru })}
                controlClassName={QUEST_INPUT}
                enPlaceholder="The second open is free"
                ruPlaceholder="Второй открывается бесплатно"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(slide.subtitle_bold)}
                  onChange={(e) => updatePromoSlide(index, { subtitle_bold: e.target.checked })}
                />
                <span className="text-muted">Жирный подзаголовок</span>
              </label>
              <PromoColorPicker
                label="Цвет подзаголовка"
                value={slide.subtitle_color}
                fallback="#9ec9ff"
                onChange={(color) => updatePromoSlide(index, { subtitle_color: color })}
              />

              <AdminLocalizedField
                className="sm:col-span-2"
                label="Текст кнопки"
                en={slide.cta_en || ""}
                ru={slide.cta_ru || slide.cta}
                onEnChange={(cta_en) => updatePromoSlide(index, { cta_en, cta: cta_en || slide.cta_ru || slide.cta })}
                onRuChange={(cta_ru) => updatePromoSlide(index, { cta_ru })}
                controlClassName={QUEST_INPUT}
                enPlaceholder="Join"
                ruPlaceholder="Участвовать"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(slide.cta_bold)}
                  onChange={(e) => updatePromoSlide(index, { cta_bold: e.target.checked })}
                />
                <span className="text-muted">Жирный шрифт кнопки</span>
              </label>
              <div className="sm:col-span-2">
                <PromoColorPicker
                  label="Цвет кнопки (текст на белой pill)"
                  value={slide.cta_color}
                  fallback={slide.tone === "duo" ? "#7c5cff" : "#3390ec"}
                  onChange={(color) => updatePromoSlide(index, { cta_color: color })}
                />
              </div>

              <div className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted">
                  Картинка — с компьютера (JPEG/PNG/WebP/GIF, до 5 МБ) или URL
                </span>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={uploadingCoverIndex !== null || saving}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          void onPickPromoCover(index, f);
                        }}
                      />
                      <span
                        className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm ${
                          uploadingCoverIndex !== null
                            ? "pointer-events-none opacity-50"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingCoverIndex === index ? "Загрузка…" : "С компьютера"}
                      </span>
                    </label>
                    {slide.cover_url ? (
                      <AdminButton
                        variant="secondary"
                        disabled={uploadingCoverIndex !== null || saving}
                        onClick={() => updatePromoSlide(index, { cover_url: "" })}
                      >
                        Убрать
                      </AdminButton>
                    ) : null}
                  </div>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={slide.cover_url}
                    onChange={(e) => updatePromoSlide(index, { cover_url: e.target.value })}
                    placeholder="/static/cases/… или https://…"
                  />
                </div>
              </div>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Стиль фона (fade)</span>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={slide.tone === "duo" ? "duo" : "open"}
                  onChange={(e) => updatePromoSlide(index, { tone: e.target.value })}
                >
                  <option value="open">Задание</option>
                  <option value="duo">Акция</option>
                </select>
              </label>
              <div className="flex items-end">
                <AdminButton
                  variant="secondary"
                  onClick={() =>
                    updatePromoSlide(index, {
                      eyebrow: "1 + 1",
                      eyebrow_en: "1 + 1",
                      eyebrow_ru: "1 + 1",
                      eyebrow_color: "#ff4eb1",
                      eyebrow_bold: true,
                      title: "Case as a **gift**",
                      title_en: "Case as a **gift**",
                      title_ru: "Кейс в **подарок**",
                      title_color: "#ffffff",
                      title_bold: true,
                      title_size: "lg",
                      accent_color: "#ff4eb1",
                      subtitle: "The second open is free",
                      subtitle_en: "The second open is free",
                      subtitle_ru: "Второй открывается бесплатно",
                      subtitle_color: "#9ec9ff",
                      subtitle_bold: false,
                      cta: "Join",
                      cta_en: "Join",
                      cta_ru: "Участвовать",
                      cta_color: "#3390ec",
                      cta_bold: true,
                      tone: "duo",
                    })
                  }
                >
                  Пример как на макете 1+1
                </AdminButton>
              </div>
            </div>
          </div>
          );
        })}
        <AdminToolbar>
          <AdminButton variant="secondary" onClick={addPromoSlide} disabled={saving || loading}>
            Добавить слайд
          </AdminButton>
          <AdminButton onClick={() => void saveBoard()} disabled={saving || loading}>
            Сохранить баннер
          </AdminButton>
        </AdminToolbar>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">
          {draft.id ? "Редактирование задания" : "Новое задание"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminLocalizedField
            className="sm:col-span-2"
            label="Название"
            en={draft.title_en || ""}
            ru={draft.title_ru || draft.title}
            onEnChange={(title_en) => setDraft({ ...draft, title_en, title: title_en || draft.title_ru || draft.title })}
            onRuChange={(title_ru) => setDraft({ ...draft, title_ru })}
            controlClassName={QUEST_INPUT}
            enPlaceholder="Open a case"
            ruPlaceholder="Открой кейс"
          />
          <label className="space-y-1 text-sm">
            <span className="text-muted">Цель</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={draft.objective_type}
              onChange={(e) => {
                const nextType = e.target.value;
                const wasNanoton = isNanotonObjective(draft.objective_type);
                const nextNanoton = isNanotonObjective(nextType);
                let nextTarget = draft.objective_target;
                let nextParam = draft.objective_param ?? 0;
                if (!wasNanoton && nextNanoton) {
                  nextTarget = 1_000_000_000;
                } else if (wasNanoton && !nextNanoton) {
                  nextTarget = 1;
                }
                if (nextType === "roulette_win_mult") {
                  nextTarget = 1;
                  nextParam = 5000;
                } else if (nextType === "crash_cashout_mult") {
                  nextTarget = 1;
                  nextParam = 200;
                } else if (nextType === "roulette_color_streak") {
                  nextTarget = 5;
                  nextParam = 0;
                } else if (!isMultObjective(nextType)) {
                  nextParam = 0;
                }
                setDraft({
                  ...draft,
                  objective_type: nextType,
                  objective_target: Math.max(1, nextTarget),
                  objective_param: nextParam,
                  objective_case_id: isCaseObjective(nextType)
                    ? draft.objective_case_id ?? null
                    : null,
                });
              }}
            >
              <option value="open_cases">Открыть кейсы (шт.)</option>
              <option value="open_cases_spend">Отыграть в кейсах (TON)</option>
              <option value="wager_roulette">Отыграть в рулетке (TON)</option>
              <option value="wager_crash">Отыграть в Crash (TON)</option>
              <option value="roulette_win_mult">Рулетка: выбей множитель</option>
              <option value="crash_cashout_mult">Crash: додержи до множителя</option>
              <option value="roulette_color_streak">Рулетка: угадай цвет подряд</option>
              <option value="invite_referrals">Пригласить рефералов</option>
            </select>
          </label>
          {isNanotonObjective(draft.objective_type) ? (
            <AdminTonField
              label="Сумма TON"
              valueNanoton={draft.objective_target}
              onChangeNanoton={(v) =>
                setDraft({ ...draft, objective_target: Math.max(1, Math.floor(v)) })
              }
              min={0.001}
              hint="Сколько нужно отыграть за день"
            />
          ) : draft.objective_type === "roulette_color_streak" ? (
            <AdminIntField
              label="Длина серии"
              value={draft.objective_target}
              onChange={(v) => setDraft({ ...draft, objective_target: Math.max(1, v) })}
              hint="Сколько правильных цветов подряд"
            />
          ) : (
            <AdminIntField
              label={isMultObjective(draft.objective_type) ? "Сколько раз" : "Сколько раз"}
              value={draft.objective_target}
              onChange={(v) => setDraft({ ...draft, objective_target: Math.max(1, v) })}
            />
          )}
          {isMultObjective(draft.objective_type) ? (
            <AdminIntField
              label={
                draft.objective_type === "crash_cashout_mult"
                  ? "Мин. множитель cashout"
                  : "Мин. множитель выигрыша"
              }
              value={Math.round(multFromParam(draft.objective_param))}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  objective_param: paramFromMult(Math.max(1, v)),
                })
              }
              hint={
                draft.objective_type === "roulette_win_mult"
                  ? "×2 синий/красный, ×5 зелёный, ×50 жёлтый"
                  : "Например 2 = додержать до ×2 и забрать"
              }
            />
          ) : null}
          {isCaseObjective(draft.objective_type) ? (
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted">
                {draft.objective_type === "open_cases_spend"
                  ? "Какой кейс учитывать"
                  : "Какой кейс открыть"}
              </span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                value={draft.objective_case_id ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, objective_case_id: e.target.value || null })
                }
              >
                <option value="">Любой платный кейс</option>
                {caseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title_ru || c.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="text-muted">Награда</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={draft.reward_type}
              onChange={(e) => setDraft({ ...draft, reward_type: e.target.value })}
            >
              <option value="balance_nanoton">TON на баланс</option>
              <option value="free_case_open">Бесплатный кейс</option>
              <option value="gift">Подарок в инвентарь</option>
              <option value="none">Без награды (к бонусу дня)</option>
            </select>
          </label>
          {draft.reward_type === "balance_nanoton" ? (
            <AdminTonField
              label="Сумма TON"
              valueNanoton={draft.reward_nanoton}
              onChangeNanoton={(v) => setDraft({ ...draft, reward_nanoton: v })}
            />
          ) : null}
          {draft.reward_type === "free_case_open" ? (
            <label className="space-y-1 text-sm">
              <span className="text-muted">Кейс в награду</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                value={draft.reward_case_id ?? ""}
                onChange={(e) => setDraft({ ...draft, reward_case_id: e.target.value || null })}
              >
                <option value="">Выберите кейс</option>
                {caseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title_ru || c.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {draft.reward_type === "gift" ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <span className="text-sm text-muted">Подарок на выдачу</span>
                <div className="flex flex-wrap items-center gap-3">
                  {draft.reward_gift_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.reward_gift_image_url}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 text-sm">
                    {draft.reward_collection_slug ? (
                      <p className="font-medium">
                        {draft.reward_gift_name ||
                          draft.reward_model_name ||
                          draft.reward_collection_slug}
                      </p>
                    ) : (
                      <p className="text-muted">Не выбран</p>
                    )}
                  </div>
                  <AdminButton variant="secondary" onClick={() => setGiftPickerTarget("quest")}>
                    Выбрать подарок
                  </AdminButton>
                </div>
              </div>
              <AdminTonField
                label="Цена выкупа (TON)"
                valueNanoton={draft.reward_nanoton}
                onChangeNanoton={(v) => setDraft({ ...draft, reward_nanoton: v })}
              />
            </>
          ) : null}
          <div className="space-y-2 sm:col-span-2">
            <span className="text-sm text-muted">Картинка на карточке задания</span>
            <p className="text-xs text-muted">
              Опционально. Если не задана — берётся превью награды (кейс / подарок / TON).
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {draft.card_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.card_image_url}
                  alt=""
                  className="h-14 w-14 rounded-xl object-cover bg-black/30"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted">
                  —
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center">
                <span className="rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-surface">
                  {uploadingCardImage ? "Загрузка…" : "Загрузить"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingCardImage}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onPickQuestCardImage(file);
                  }}
                />
              </label>
              {draft.card_image_url ? (
                <AdminButton
                  variant="secondary"
                  onClick={() => setDraft({ ...draft, card_image_url: "" })}
                >
                  Убрать
                </AdminButton>
              ) : null}
            </div>
          </div>
          <AdminIntField
            label="Порядок"
            value={draft.sort_order}
            onChange={(v) => setDraft({ ...draft, sort_order: v })}
          />
          <label className="space-y-1 text-sm">
            <span className="text-muted">С даты (опц.)</span>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={dateOnly(draft.active_from)}
              onChange={(e) => setDraft({ ...draft, active_from: e.target.value || null })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">По дату (опц.)</span>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={dateOnly(draft.active_to)}
              onChange={(e) => setDraft({ ...draft, active_to: e.target.value || null })}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Активно
        </label>
        <AdminToolbar>
          <AdminButton onClick={() => void saveQuest()} disabled={saving || loading}>
            {draft.id ? "Обновить" : "Создать"}
          </AdminButton>
          {draft.id ? (
            <AdminButton variant="secondary" onClick={() => setDraft(EMPTY_QUEST)}>
              Сбросить
            </AdminButton>
          ) : null}
        </AdminToolbar>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Каталог ({quests.length})</h3>
        {loading ? <p className="text-sm text-muted">Загрузка…</p> : null}
        {!loading && quests.length === 0 ? (
          <p className="text-sm text-muted">Пока нет заданий</p>
        ) : null}
        <ul className="space-y-2">
          {quests.map((q) => (
            <li
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {q.active ? "" : "[выкл] "}
                  {q.title_ru || q.title_en || q.title}
                </p>
                <p className="text-xs text-muted">
                  {objectiveLabel(q)} → {rewardLabel(q)}
                </p>
              </div>
              <div className="flex gap-2">
                <AdminButton
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...EMPTY_QUEST,
                      ...q,
                      active_from: dateOnly(q.active_from) || null,
                      active_to: dateOnly(q.active_to) || null,
                    })
                  }
                >
                  Изменить
                </AdminButton>
                {q.id ? (
                  <AdminButton variant="danger" onClick={() => void removeQuest(q.id!)}>
                    Удалить
                  </AdminButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <GiftPickerModal
        open={giftPickerTarget != null}
        onClose={() => setGiftPickerTarget(null)}
        title="Подарок для задания"
        onSelect={(gift) => {
          if (giftPickerTarget) applyGift(giftPickerTarget, gift);
          setGiftPickerTarget(null);
        }}
      />
    </AdminPage>
  );
}
