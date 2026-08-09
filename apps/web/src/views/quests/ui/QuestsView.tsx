"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { TonIcon } from "@/components/icons/TonIcon";
import {
  claimDailyQuest,
  claimDailyQuestBonus,
  formatTON,
  getDailyQuests,
  resolveAsset,
  type DailyQuestBoard,
  type DailyQuestBonus,
  type DailyQuestReward,
  type DailyQuestTask,
} from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { formatUserError } from "@/lib/user-errors";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";

type TaskTone = "teal" | "blue" | "green" | "cyan";

const TONES: TaskTone[] = ["teal", "blue", "green", "cyan"];

function taskTone(task: DailyQuestTask, index: number): TaskTone {
  if (task.objective_type === "invite_referrals") return "blue";
  if (task.objective_type === "open_cases") return index % 2 === 0 ? "teal" : "green";
  return TONES[index % TONES.length]!;
}

function progressPct(progress: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
}

function rewardLabel(reward: DailyQuestReward): string {
  if (reward.type === "free_case_open") {
    return reward.case_title?.trim() || "Кейс";
  }
  if (reward.type === "gift") {
    return reward.gift_name?.trim() || reward.model_name?.trim() || "Подарок";
  }
  if (reward.nanoton) return formatTON(reward.nanoton);
  return "—";
}

function bonusRewardHeadline(reward: DailyQuestReward): string {
  if (reward.type === "free_case_open") {
    const title = reward.case_title?.trim();
    return title ? `Кейс «${title}»` : "Бесплатный кейс";
  }
  if (reward.type === "gift") {
    const title = reward.gift_name?.trim() || reward.model_name?.trim();
    return title ? `Подарок «${title}»` : "Подарок в инвентарь";
  }
  if (reward.nanoton) return `+${formatTON(reward.nanoton)} TON на баланс`;
  return "Награда за все задания";
}

function claimSuccessTitle(reward: DailyQuestReward, isBonus: boolean): string {
  if (reward.type === "free_case_open") {
    return isBonus ? "Бонусный кейс получен" : "Бесплатный кейс получен";
  }
  if (reward.type === "gift") {
    return isBonus ? "Бонусный подарок получен" : "Подарок добавлен в инвентарь";
  }
  return isBonus ? "Бонус зачислен" : "Награда зачислена";
}

export function QuestsView() {
  const { showToast } = useToast();
  const { setUser } = useAuth();
  const haptics = useTelegramHaptics();
  const [board, setBoard] = useState<DailyQuestBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await getDailyQuests());
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, "Не удалось загрузить задания"),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onClaimTask(task: DailyQuestTask) {
    setBusy(task.id);
    try {
      const result = await claimDailyQuest(task.id);
      haptics.notificationOccurred("success");
      if (result.balance_after != null) {
        setUser((u) => (u ? patchUserBalance(u, { betting_balance: result.balance_after }) : u));
      }
      showToast({
        variant: "success",
        title: claimSuccessTitle(result.reward, false),
      });
      await load();
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, "Не удалось забрать награду"),
      });
    } finally {
      setBusy(null);
    }
  }

  async function onClaimBonus() {
    setBusy("bonus");
    try {
      const result = await claimDailyQuestBonus();
      haptics.notificationOccurred("success");
      if (result.balance_after != null) {
        setUser((u) => (u ? patchUserBalance(u, { betting_balance: result.balance_after }) : u));
      }
      showToast({
        variant: "success",
        title: claimSuccessTitle(result.reward, true),
      });
      await load();
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, "Не удалось забрать бонус"),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell flush>
      <section className="quests-lobby">
        <header className="quests-lobby__intro">
          <h1 className="quests-lobby__intro-title">Задания дня</h1>
        </header>

        {loading && !board ? (
          <div className="quests-lobby__stack" aria-hidden>
            <div className="skel-shimmer quests-bonus-card" />
            <div className="skel-shimmer quests-task-row" />
            <div className="skel-shimmer quests-task-row" />
          </div>
        ) : null}

        {board ? (
          <div className="quests-lobby__stack">
            {board.bonus.status !== "disabled" ? (
              <BonusCard
                bonus={board.bonus}
                busy={busy === "bonus"}
                onClaim={() => void onClaimBonus()}
              />
            ) : null}

            <div className="quests-lobby__tasks">
              <h2 className="quests-lobby__section-title">Задания</h2>
              {board.tasks.length === 0 ? (
                <p className="quests-lobby__empty">Сегодня заданий нет</p>
              ) : (
                <div className="quests-lobby__list">
                  {board.tasks.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      tone={taskTone(task, index)}
                      busy={busy === task.id}
                      onClaim={() => void onClaimTask(task)}
                      onNavigate={() => haptics.impactOccurred("light")}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}

function BonusWash({ reward }: { reward: DailyQuestReward }) {
  const coverImage =
    reward.type === "free_case_open"
      ? resolveAsset(reward.case_image_url?.trim())
      : reward.type === "gift"
        ? resolveAsset(reward.gift_image_url?.trim())
        : undefined;

  return (
    <div className="quests-bonus-card__art" aria-hidden>
      <div className="quests-bonus-card__glow" />
      {coverImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="quests-bonus-card__cover" src={coverImage} alt="" draggable={false} />
          <div className="quests-bonus-card__cover-tint" />
        </>
      ) : (
        <svg className="quests-bonus-card__arcs" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="questsBonusOrb" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFE08A" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#FF9A2E" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#FF7A18" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#FF7A18" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="128" cy="96" r="78" fill="url(#questsBonusOrb)" />
          <circle cx="128" cy="96" r="64" fill="none" stroke="rgba(255,200,100,0.35)" strokeWidth="10" />
          <circle cx="128" cy="96" r="46" fill="none" stroke="rgba(255,170,60,0.45)" strokeWidth="8" />
          <circle cx="128" cy="96" r="28" fill="none" stroke="rgba(255,220,140,0.55)" strokeWidth="6" />
          <circle cx="128" cy="96" r="12" fill="rgba(255,236,180,0.75)" />
        </svg>
      )}
      {reward.type === "balance_nanoton" ? (
        <div className="quests-bonus-card__ton-badge">
          <TonIcon variant="brand" className="quests-bonus-card__ton-icon" title="TON" />
        </div>
      ) : null}
      <div className="quests-bonus-card__fade" />
    </div>
  );
}

function BonusCard({
  bonus,
  busy,
  onClaim,
}: {
  bonus: DailyQuestBonus;
  busy: boolean;
  onClaim: () => void;
}) {
  const ready = bonus.status === "ready";
  const claimed = bonus.status === "claimed";
  const pct = progressPct(bonus.completed_count, bonus.total_count);
  const hasCaseCover =
    (bonus.reward.type === "free_case_open" &&
      Boolean(resolveAsset(bonus.reward.case_image_url?.trim()))) ||
    (bonus.reward.type === "gift" && Boolean(resolveAsset(bonus.reward.gift_image_url?.trim())));

  return (
    <article
      className={cn(
        "quests-bonus-card",
        hasCaseCover && "quests-bonus-card--case",
        claimed && "quests-bonus-card--claimed",
        ready && "quests-bonus-card--ready",
      )}
    >
      <BonusWash reward={bonus.reward} />
      <div className="quests-bonus-card__copy">
        <p className="quests-bonus-card__eyebrow">Бонус</p>
        <h2 className="quests-bonus-card__title">{bonus.title}</h2>
        <p className="quests-bonus-card__reward">{bonusRewardHeadline(bonus.reward)}</p>
        {bonus.description ? (
          <p className="quests-bonus-card__desc">{bonus.description}</p>
        ) : null}
        <div className="quests-bonus-card__progress">
          <div className="quests-progress">
            <div className="quests-progress__track">
              <div
                className="quests-progress__fill quests-progress__fill--gold"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="quests-progress__label">
              {bonus.completed_count}/{bonus.total_count}
            </span>
          </div>
        </div>
        {claimed ? (
          <span className="quests-pill quests-pill--done">Получено</span>
        ) : ready ? (
          <button
            type="button"
            className="quests-pill quests-pill--primary"
            disabled={busy}
            onClick={onClaim}
          >
            {busy ? "…" : "Забрать"}
          </button>
        ) : (
          <span className="quests-pill quests-pill--muted">Выполните все</span>
        )}
      </div>
    </article>
  );
}

function TaskRow({
  task,
  tone,
  busy,
  onClaim,
  onNavigate,
}: {
  task: DailyQuestTask;
  tone: TaskTone;
  busy: boolean;
  onClaim: () => void;
  onNavigate: () => void;
}) {
  const claimed = task.status === "claimed";
  const ready = task.status === "ready";
  const pct = progressPct(task.progress, task.target);
  const href =
    task.action === "referrals"
      ? APP_ROUTES.profileReferrals
      : task.action === "cases"
        ? APP_ROUTES.cases
        : null;
  const isTon = task.reward.type === "balance_nanoton";
  const giftThumb =
    task.reward.type === "gift" ? resolveAsset(task.reward.gift_image_url?.trim()) : undefined;

  return (
    <article
      className={cn(
        "quests-task-row",
        `quests-task-row--${tone}`,
        claimed && "quests-task-row--claimed",
      )}
    >
      <span className="quests-task-row__accent" aria-hidden />
      <div className="quests-task-row__main">
        <p className="quests-task-row__title">{task.title}</p>
        <div className="quests-progress quests-progress--row">
          <div className="quests-progress__track">
            <div
              className={cn("quests-progress__fill", `quests-progress__fill--${tone}`)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="quests-progress__label">
            {task.progress}/{task.target}
          </span>
        </div>
      </div>

      <div className="quests-task-row__side">
        <span className={cn("quests-reward-chip", `quests-reward-chip--${tone}`)}>
          {isTon ? (
            <TonIcon variant="brand" size="sm" className="quests-reward-chip__ton" title="TON" />
          ) : giftThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="quests-reward-chip__gift" src={giftThumb} alt="" draggable={false} />
          ) : (
            <span className="quests-reward-chip__dot" aria-hidden />
          )}
          <span className="quests-reward-chip__value">{rewardLabel(task.reward)}</span>
        </span>

        {claimed ? (
          <span className="quests-pill quests-pill--done">Получено</span>
        ) : ready ? (
          <button
            type="button"
            className="quests-pill quests-pill--primary"
            disabled={busy}
            onClick={onClaim}
          >
            {busy ? "…" : "Забрать"}
          </button>
        ) : href ? (
          <Link href={href} className="quests-pill quests-pill--primary" onClick={onNavigate}>
            Выполнить
          </Link>
        ) : (
          <span className="quests-pill quests-pill--muted">Выполнить</span>
        )}
      </div>
    </article>
  );
}
