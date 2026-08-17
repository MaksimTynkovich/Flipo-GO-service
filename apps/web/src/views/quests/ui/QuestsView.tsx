"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { INVENTORY_DEPOSITED_EVENT } from "@/components/providers/UserRealtimeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { TonIcon } from "@/components/icons/TonIcon";
import { CaseTonPrizeArt } from "@/components/cases/CaseTonPrizeArt";
import { QuestClaimModal } from "@/components/quests/QuestClaimModal";
import {
  claimDailyQuest,
  claimDailyQuestBonus,
  formatTON,
  getDailyQuests,
  resolveAsset,
  type DailyQuestBoard,
  type DailyQuestBonus,
  type DailyQuestClaimResult,
  type DailyQuestReward,
  type DailyQuestTask,
} from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { giftGradient, giftImageUrl } from "@/lib/gifts";
import { formatUserError } from "@/lib/user-errors";
import { useT } from "@/components/providers/I18nProvider";
import type { TFunction } from "@/lib/i18n";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";

type ClaimCelebration = {
  reward: DailyQuestReward;
  isBonus: boolean;
  cardImageUrl?: string;
};

type TaskTone = "teal" | "blue" | "green" | "cyan";

const TONES: TaskTone[] = ["teal", "blue", "green", "cyan"];

function isNanotonObjective(type: string): boolean {
  return type === "open_cases_spend" || type === "wager_roulette" || type === "wager_crash";
}

function formatQuestProgress(progress: number, target: number, objectiveType: string): string {
  if (isNanotonObjective(objectiveType)) {
    return `${formatTON(progress)}/${formatTON(target)} TON`;
  }
  return `${progress}/${target}`;
}

function taskTone(task: DailyQuestTask, index: number): TaskTone {
  if (task.objective_type === "invite_referrals") return "blue";
  if (
    task.objective_type === "wager_roulette" ||
    task.objective_type === "roulette_win_mult" ||
    task.objective_type === "roulette_color_streak"
  ) {
    return "cyan";
  }
  if (task.objective_type === "wager_crash" || task.objective_type === "crash_cashout_mult") {
    return "green";
  }
  if (task.objective_type === "open_cases" || task.objective_type === "open_cases_spend") {
    return index % 2 === 0 ? "teal" : "green";
  }
  return TONES[index % TONES.length]!;
}

function progressPct(progress: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
}

function giftTitle(reward: DailyQuestReward, t: TFunction): string {
  return reward.gift_name?.trim() || reward.model_name?.trim() || t("quests.giftFallback");
}

function rewardLabel(reward: DailyQuestReward, t: TFunction): string {
  if (reward.type === "none") {
    return t("quests.toDailyBonus");
  }
  if (reward.type === "free_case_open") {
    const title = reward.case_title?.trim();
    return title ? t("quests.freeCaseNamed", { title }) : t("quests.freeCase");
  }
  if (reward.type === "gift") {
    return giftTitle(reward, t);
  }
  if (reward.nanoton) return `${formatTON(reward.nanoton)} TON`;
  return "—";
}

function hasQuestReward(reward: DailyQuestReward, t: TFunction): boolean {
  const type = reward.type?.trim() || "";
  if (!type || type === "none") return false;
  if (type === "balance_nanoton") return (reward.nanoton ?? 0) > 0;
  if (type === "free_case_open" || type === "gift") return true;
  return rewardLabel(reward, t) !== "—";
}

function bonusRewardHeadline(reward: DailyQuestReward, t: TFunction): string {
  if (reward.type === "free_case_open") {
    const title = reward.case_title?.trim();
    return title ? t("quests.freeCaseNamed", { title }) : t("quests.freeCase");
  }
  if (reward.type === "gift") {
    return giftTitle(reward, t);
  }
  if (reward.nanoton) return t("quests.tonBalance", { amount: formatTON(reward.nanoton) });
  return t("quests.allReward");
}

function claimSuccessTitle(reward: DailyQuestReward, isBonus: boolean, t: TFunction): string {
  if (reward.type === "free_case_open") {
    return isBonus ? t("quests.bonusCaseGot") : t("quests.freeCaseGot");
  }
  if (reward.type === "gift") {
    return t("quests.giftInInventory", { name: giftTitle(reward, t) });
  }
  return isBonus ? t("quests.bonusCredited") : t("quests.rewardCredited");
}

function notifyInventoryIfGift(result: DailyQuestClaimResult) {
  if (result.reward.type !== "gift" || !result.inventory_item_id) return;
  window.dispatchEvent(new CustomEvent(INVENTORY_DEPOSITED_EVENT));
}

function shouldCelebrateClaim(reward: DailyQuestReward): boolean {
  return (
    reward.type === "gift" ||
    reward.type === "free_case_open" ||
    reward.type === "balance_nanoton"
  );
}

export function QuestsView() {
  const t = useT();
  const { showToast } = useToast();
  const { setUser } = useAuth();
  const haptics = useTelegramHaptics();
  const [board, setBoard] = useState<DailyQuestBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [claimCelebration, setClaimCelebration] = useState<ClaimCelebration | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await getDailyQuests());
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, t("quests.loadFailed")),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function celebrateClaim(result: DailyQuestClaimResult, isBonus: boolean, cardImageUrl?: string) {
    notifyInventoryIfGift(result);
    if (shouldCelebrateClaim(result.reward)) {
      setClaimCelebration({ reward: result.reward, isBonus, cardImageUrl });
      return;
    }
    showToast({
      variant: "success",
      title: claimSuccessTitle(result.reward, isBonus, t),
    });
  }

  async function onClaimTask(task: DailyQuestTask) {
    setBusy(task.id);
    try {
      const result = await claimDailyQuest(task.id);
      haptics.notificationOccurred("success");
      if (result.balance_after != null) {
        setUser((u) => (u ? patchUserBalance(u, { betting_balance: result.balance_after }) : u));
      }
      celebrateClaim(result, false, task.card_image_url);
      await load();
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, t("quests.claimFailed")),
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
      celebrateClaim(result, true, board?.bonus.card_image_url);
      await load();
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, t("quests.bonusFailed")),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell flush>
      <section className="quests-lobby">
        <header className="quests-lobby__intro">
          <h1 className="quests-lobby__intro-title">{t("quests.dayTitle")}</h1>
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
                t={t}
                bonus={board.bonus}
                busy={busy === "bonus"}
                onClaim={() => void onClaimBonus()}
              />
            ) : null}

            <div className="quests-lobby__tasks">
              <h2 className="quests-lobby__section-title">{t("quests.section")}</h2>
              {board.tasks.length === 0 ? (
                <p className="quests-lobby__empty">{t("quests.empty")}</p>
              ) : (
                <div className="quests-lobby__list">
                  {board.tasks.map((task, index) => (
                    <TaskRow
                      t={t}
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

      {claimCelebration ? (
        <QuestClaimModal
          reward={claimCelebration.reward}
          isBonus={claimCelebration.isBonus}
          cardImageUrl={claimCelebration.cardImageUrl}
          onClose={() => setClaimCelebration(null)}
        />
      ) : null}
    </PageShell>
  );
}

function bonusGiftImage(reward: DailyQuestReward): string | undefined {
  if (reward.type !== "gift") return undefined;
  const raw = reward.gift_image_url?.trim();
  if (!raw && !reward.collection_slug?.trim()) return undefined;
  return giftImageUrl(reward.collection_slug?.trim() || "", raw) || undefined;
}

function rewardCaseImage(reward: DailyQuestReward): string | undefined {
  if (reward.type !== "free_case_open") return undefined;
  return resolveAsset(reward.case_image_url?.trim());
}

function BonusWash({
  reward,
  cardImageUrl,
}: {
  reward: DailyQuestReward;
  cardImageUrl?: string;
}) {
  const cardSrc = resolveAsset(cardImageUrl?.trim());
  const caseSrc = !cardSrc ? rewardCaseImage(reward) : undefined;
  const giftSrc = !cardSrc ? bonusGiftImage(reward) : undefined;

  return (
    <div className="quests-bonus-card__art" aria-hidden>
      <div className="quests-bonus-card__glow" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="quests-bonus-card__ambient"
        src="/quests/bonus-ambient-blue-pop.webp"
        alt=""
        draggable={false}
      />
      {!cardSrc && reward.type === "balance_nanoton" ? (
        <div className="quests-bonus-card__ton-badge">
          <TonIcon variant="brand" className="quests-bonus-card__ton-icon" title="TON" />
        </div>
      ) : null}
      {giftSrc ? (
        <div className="quests-bonus-card__gift-stage">
          <div
            className="quests-bonus-card__gift-plate"
            style={{
              background: giftGradient(reward.collection_slug?.trim() || reward.gift_name || "gift"),
            }}
          >
            {reward.nanoton && reward.nanoton > 0 ? (
              <span className="quests-bonus-card__gift-price">
                <TonIcon variant="brand" className="quests-bonus-card__gift-price-ton" aria-hidden />
                {formatTON(reward.nanoton)}
              </span>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="quests-bonus-card__gift-img" src={giftSrc} alt="" draggable={false} />
          </div>
        </div>
      ) : null}
      {caseSrc ? (
        <div className="quests-bonus-card__case-stage">
          <div className="quests-bonus-card__case-plate">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="quests-bonus-card__case-img" src={caseSrc} alt="" draggable={false} />
          </div>
        </div>
      ) : null}
      {cardSrc ? (
        <div className="quests-bonus-card__case-stage">
          <div className="quests-bonus-card__card-plate">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="quests-bonus-card__card-img" src={cardSrc} alt="" draggable={false} />
          </div>
        </div>
      ) : null}
      <div className="quests-bonus-card__fade" />
    </div>
  );
}

function BonusCard({
  t,
  bonus,
  busy,
  onClaim,
}: {
  t: TFunction;
  bonus: DailyQuestBonus;
  busy: boolean;
  onClaim: () => void;
}) {
  const ready = bonus.status === "ready";
  const claimed = bonus.status === "claimed";
  const pct = progressPct(bonus.completed_count, bonus.total_count);
  const cardSrc = resolveAsset(bonus.card_image_url?.trim());
  const caseSrc = !cardSrc ? rewardCaseImage(bonus.reward) : undefined;
  const giftSrc = !cardSrc ? bonusGiftImage(bonus.reward) : undefined;
  const giftPrice =
    !cardSrc && bonus.reward.type === "gift" && bonus.reward.nanoton && bonus.reward.nanoton > 0
      ? bonus.reward.nanoton
      : 0;
  const rewardThumb = cardSrc || giftSrc || caseSrc;

  return (
    <article
      className={cn(
        "quests-bonus-card",
        Boolean(cardSrc) && "quests-bonus-card--card-art",
        Boolean(caseSrc) && "quests-bonus-card--case",
        Boolean(giftSrc) && "quests-bonus-card--gift",
        claimed && "quests-bonus-card--claimed",
        ready && "quests-bonus-card--ready",
      )}
    >
      <BonusWash reward={bonus.reward} cardImageUrl={bonus.card_image_url} />
      <div className="quests-bonus-card__copy">
        <h2 className="quests-bonus-card__title">{bonus.title}</h2>
        <p className="quests-bonus-card__reward">
          {rewardThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="quests-bonus-card__reward-thumb" src={rewardThumb} alt="" draggable={false} />
          ) : null}
          <span className="quests-bonus-card__reward-text">{bonusRewardHeadline(bonus.reward, t)}</span>
          {giftPrice > 0 ? (
            <span className="quests-bonus-card__reward-price" title={`${formatTON(giftPrice)} TON`}>
              <span className="quests-bonus-card__reward-sep" aria-hidden>
                ·
              </span>
              <TonIcon
                variant="brand"
                size="sm"
                className="quests-bonus-card__reward-ton"
                aria-hidden
              />
              <span className="tabular-nums">{formatTON(giftPrice)}</span>
            </span>
          ) : null}
        </p>
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
          <span className="quests-pill quests-pill--done">{t("quests.received")}</span>
        ) : ready ? (
          <button
            type="button"
            className="quests-pill quests-pill--primary"
            disabled={busy}
            onClick={onClaim}
          >
            {busy ? t("common.sharing") : t("common.claim")}
          </button>
        ) : (
          <span className="quests-pill quests-pill--muted">{t("quests.completeAll")}</span>
        )}
      </div>
    </article>
  );
}

function TaskRow({
  t,
  task,
  tone,
  busy,
  onClaim,
  onNavigate,
}: {
  t: TFunction;
  task: DailyQuestTask;
  tone: TaskTone;
  busy: boolean;
  onClaim: () => void;
  onNavigate: () => void;
}) {
  const claimed = task.status === "claimed";
  const ready = task.status === "ready";
  const pct = progressPct(task.progress, task.target);
  const caseHref =
    task.objective_case_slug?.trim() || task.objective_case_id?.trim()
      ? `${APP_ROUTES.cases}/${encodeURIComponent(
          task.objective_case_slug?.trim() || task.objective_case_id!.trim(),
        )}`
      : APP_ROUTES.cases;
  const href =
    task.action === "referrals"
      ? APP_ROUTES.profileReferrals
      : task.action === "cases"
        ? caseHref
        : task.action === "roulette"
          ? APP_ROUTES.roulette
          : task.action === "crash"
            ? APP_ROUTES.crash
            : null;
  const isTon = task.reward.type === "balance_nanoton";
  const noReward = !hasQuestReward(task.reward, t);
  const cardThumb = resolveAsset(task.card_image_url?.trim());
  const giftThumb =
    !cardThumb && !noReward && task.reward.type === "gift"
      ? bonusGiftImage(task.reward)
      : undefined;
  const caseThumb = !cardThumb && !noReward ? rewardCaseImage(task.reward) : undefined;
  const giftPrice =
    !noReward && task.reward.type === "gift" && task.reward.nanoton && task.reward.nanoton > 0
      ? task.reward.nanoton
      : 0;
  const rewardText = rewardLabel(task.reward, t);
  const giftPlateBg =
    !cardThumb && !noReward && task.reward.type === "gift"
      ? giftGradient(task.reward.collection_slug?.trim() || task.reward.gift_name || "gift")
      : undefined;
  const showArt = Boolean(cardThumb) || !noReward;

  let action: ReactNode;
  if (claimed) {
    action = (
      <span className="quests-pill quests-pill--done">
        {noReward ? t("quests.done") : t("quests.received")}
      </span>
    );
  } else if (ready) {
    action = (
      <button
        type="button"
        className="quests-pill quests-pill--primary"
        disabled={busy}
        onClick={onClaim}
      >
        {busy ? t("common.sharing") : t("common.claim")}
      </button>
    );
  } else if (href) {
    action = (
      <Link href={href} className="quests-pill quests-pill--primary" onClick={onNavigate}>
        {t("quests.do")}
      </Link>
    );
  } else {
    action = <span className="quests-pill quests-pill--muted">{t("quests.do")}</span>;
  }

  return (
    <article
      className={cn(
        "quests-task-row",
        `quests-task-row--${tone}`,
        claimed && "quests-task-row--claimed",
        ready && "quests-task-row--ready",
        isTon && !noReward && !cardThumb && "quests-task-row--ton",
        noReward && !cardThumb && "quests-task-row--none",
        Boolean(cardThumb) && "quests-task-row--card-art",
        Boolean(giftThumb) && "quests-task-row--gift",
        Boolean(caseThumb) && "quests-task-row--case",
      )}
    >
      <div className="quests-task-row__wash" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="quests-task-row__ambient"
          src="/quests/task-ambient-blue-pop.webp"
          alt=""
          draggable={false}
        />
        <div className="quests-task-row__fade" />
      </div>
      <span className="quests-task-row__accent" aria-hidden />

      <div className="quests-task-row__copy">
        <p className="quests-task-row__title">{task.title}</p>
        {!noReward ? (
          <p className="quests-task-row__reward" title={rewardText}>
            <span className="quests-task-row__reward-label">{t("quests.rewardLabel")}</span>
            {isTon ? (
              <span className="quests-task-row__reward-value">
                <TonIcon variant="brand" size="sm" className="quests-task-row__reward-ton" title="TON" />
                <span className="tabular-nums">{formatTON(task.reward.nanoton ?? 0)} TON</span>
              </span>
            ) : (
              <span className="quests-task-row__reward-value">{rewardText}</span>
            )}
          </p>
        ) : null}
        <div className="quests-progress quests-progress--row">
          <div className="quests-progress__track">
            <div
              className={cn("quests-progress__fill", `quests-progress__fill--${tone}`)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="quests-progress__label">
            {formatQuestProgress(task.progress, task.target, task.objective_type)}
          </span>
        </div>
        {action}
      </div>

      {showArt ? (
        <div className="quests-task-row__art" aria-hidden>
          <div
            className={cn(
              "quests-task-row__plate",
              Boolean(cardThumb) && "quests-task-row__plate--card",
              !cardThumb && isTon && "quests-task-row__plate--ton",
              Boolean(giftThumb) && "quests-task-row__plate--gift",
              Boolean(caseThumb) && "quests-task-row__plate--case",
            )}
            style={giftPlateBg ? { background: giftPlateBg } : undefined}
          >
            {cardThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="quests-task-row__img" src={cardThumb} alt="" draggable={false} />
            ) : isTon ? (
              <CaseTonPrizeArt className="quests-task-row__ton" />
            ) : giftThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="quests-task-row__img" src={giftThumb} alt="" draggable={false} />
            ) : caseThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="quests-task-row__img" src={caseThumb} alt="" draggable={false} />
            ) : (
              <span className="quests-task-row__dot" />
            )}
            {!cardThumb && isTon && (task.reward.nanoton ?? 0) > 0 ? (
              <span className="quests-task-row__price">
                <TonIcon variant="brand" size="sm" className="quests-task-row__price-ton" title="TON" />
                <span className="tabular-nums">{formatTON(task.reward.nanoton ?? 0)}</span>
              </span>
            ) : !cardThumb && giftPrice > 0 ? (
              <span className="quests-task-row__price">
                <TonIcon variant="brand" size="sm" className="quests-task-row__price-ton" title="TON" />
                <span className="tabular-nums">{formatTON(giftPrice)}</span>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
