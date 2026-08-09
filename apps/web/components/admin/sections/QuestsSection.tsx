"use client";

import { useEffect, useMemo, useState } from "react";
import { GiftPickerModal } from "@/components/admin/GiftPickerModal";
import { AdminPage, AdminButton, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminIntField, AdminTonField } from "@/components/admin/AdminInputs";
import { useToast } from "@/components/providers/ToastProvider";
import {
  deleteAdminDailyQuest,
  formatTON,
  getAdminCases,
  getAdminDailyQuestBoard,
  getAdminDailyQuests,
  updateAdminDailyQuestBoard,
  upsertAdminDailyQuest,
  type AdminCase,
  type AdminDailyQuest,
  type AdminDailyQuestBoard,
} from "@/lib/api";
import type { GiftPickerSelection } from "@/lib/changes-gifts";

const EMPTY_QUEST: AdminDailyQuest = {
  title: "",
  description: "",
  sort_order: 10,
  active: true,
  objective_type: "open_cases",
  objective_target: 1,
  reward_type: "balance_nanoton",
  reward_nanoton: 1_000_000_000,
  reward_collection_slug: "",
  reward_model_name: "",
  reward_gift_name: "",
  reward_gift_image_url: "",
};

const EMPTY_BOARD: AdminDailyQuestBoard = {
  bonus_title: "Бонус дня",
  bonus_description: "Выполни все задания",
  bonus_reward_type: "balance_nanoton",
  bonus_reward_nanoton: 1_000_000_000,
  bonus_reward_collection_slug: "",
  bonus_reward_model_name: "",
  bonus_reward_gift_name: "",
  bonus_reward_gift_image_url: "",
  bonus_active: false,
};

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function giftRewardLabel(name?: string, slug?: string, model?: string): string {
  const title = name?.trim() || model?.trim() || slug?.trim();
  return title ? `Подарок: ${title}` : "Подарок";
}

export default function QuestsSection() {
  const { showToast } = useToast();
  const [quests, setQuests] = useState<AdminDailyQuest[]>([]);
  const [draft, setDraft] = useState<AdminDailyQuest>(EMPTY_QUEST);
  const [board, setBoard] = useState<AdminDailyQuestBoard>(EMPTY_BOARD);
  const [cases, setCases] = useState<AdminCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [giftPickerTarget, setGiftPickerTarget] = useState<"quest" | "board" | null>(null);

  const caseOptions = useMemo(
    () => cases.filter((c) => c.active !== false).sort((a, b) => a.title.localeCompare(b.title)),
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
      setBoard(boardRes);
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
    if (!draft.title.trim()) {
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
        title: draft.title.trim(),
        description: draft.description.trim(),
        active_from: draft.active_from || null,
        active_to: draft.active_to || null,
        objective_case_id: draft.objective_case_id || null,
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
        bonus_title: board.bonus_title.trim() || "Бонус дня",
        bonus_description: board.bonus_description.trim(),
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
      };
      const next = await updateAdminDailyQuestBoard(payload);
      setBoard(next);
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

  function rewardLabel(q: AdminDailyQuest): string {
    if (q.reward_type === "free_case_open") {
      const c = caseOptions.find((x) => x.id === q.reward_case_id);
      return c ? `Кейс: ${c.title}` : "Кейс";
    }
    if (q.reward_type === "gift") {
      return `${giftRewardLabel(q.reward_gift_name, q.reward_collection_slug, q.reward_model_name)} (${formatTON(q.reward_nanoton)} TON)`;
    }
    return `${formatTON(q.reward_nanoton)} TON`;
  }

  function objectiveLabel(q: AdminDailyQuest): string {
    if (q.objective_type === "invite_referrals") return `Рефералы ×${q.objective_target}`;
    return `Кейсы ×${q.objective_target}`;
  }

  return (
    <AdminPage title="Задания" description="Ежедневные задания и бонус за выполнение всех.">
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Бонус за все задания</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Заголовок</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={board.bonus_title}
              onChange={(e) => setBoard({ ...board, bonus_title: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Описание</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={board.bonus_description}
              onChange={(e) => setBoard({ ...board, bonus_description: e.target.value })}
            />
          </label>
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
                    {c.title}
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
        <h3 className="text-sm font-semibold">
          {draft.id ? "Редактирование задания" : "Новое задание"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted">Название</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted">Описание</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Цель</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={draft.objective_type}
              onChange={(e) => setDraft({ ...draft, objective_type: e.target.value })}
            >
              <option value="open_cases">Открыть кейсы</option>
              <option value="invite_referrals">Пригласить рефералов</option>
            </select>
          </label>
          <AdminIntField
            label="Сколько раз"
            value={draft.objective_target}
            onChange={(v) => setDraft({ ...draft, objective_target: Math.max(1, v) })}
          />
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
                    {c.title}
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
                  {q.title}
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
