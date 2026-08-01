"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { CaseDetailPlayerPreview } from "@/components/cases/CaseDetailPlayerPreview";
import { CaseQuestSheet, type CaseQuestStep } from "@/components/cases/CaseQuestSheet";
import { CaseWinModal } from "@/components/cases/CaseWinModal";
import { formatCasePrice } from "@/components/cases/case-ui";
import { WheelChannelSheet } from "@/components/games/WheelChannelSheet";
import {
  ApiRequestError,
  getCase,
  getMe,
  liquidateCaseClaimItem,
  liquidateItem,
  openCase,
  silentReauth,
  shareCaseQuest,
  type CaseLootPreview,
  type CaseOpenResult,
  type CaseView,
} from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { emitBalanceWin } from "@/lib/balance-win";
import {
  setCasePrizeBalanceHold,
  takePendingCasePrizeBalance,
} from "@/lib/case-prize-balance";
import { referralTelegramUrl } from "@/lib/bot";
import { PROMO_REQUIRED_CHANNEL, promoChannelUrl } from "@/lib/promo-channel";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCasesFeatures } from "@/components/providers/CasesFeaturesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { openTelegramLink, openTelegramShare } from "@/src/shared/lib/twa";
import { Gift } from "lucide-react";

type Phase = "idle" | "revealing" | "won";

function msUntil(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t - Date.now());
}

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Next unfinished quest: share first, then name tag. */
function nextQuestStep(c: CaseView): CaseQuestStep | null {
  const needShare = Boolean(c.require_share) && c.share_done !== true;
  if (needShare) return "share";
  const tag = c.required_name_tag?.trim();
  if (tag && c.name_tag_ok !== true) return "name";
  return null;
}

export function CaseDetailView() {
  const params = useParams();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { casesVisible, ready: featuresReady } = useCasesFeatures();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();
  const idOrSlug = String(params?.id || "");

  const [caseItem, setCaseItem] = useState<CaseView | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CaseOpenResult | null>(null);
  const [revealLoot, setRevealLoot] = useState<CaseLootPreview[]>([]);
  const [channelSheetOpen, setChannelSheetOpen] = useState(false);
  const [questStep, setQuestStep] = useState<CaseQuestStep | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [cooldownMs, setCooldownMs] = useState(0);
  const [questBusy, setQuestBusy] = useState(false);
  const [shareAwaitingReturn, setShareAwaitingReturn] = useState(false);
  const shareResumeRef = useRef<CaseView | null>(null);

  const notifyError = useCallback(
    (message: string) => {
      showToast({ variant: "error", title: message });
      haptics.notificationOccurred("error");
    },
    // haptics object is recreated each render; API is fire-and-forget
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showToast],
  );

  useEffect(() => {
    if (!featuresReady) return;
    if (!casesVisible) {
      router.replace(APP_ROUTES.games);
    }
  }, [featuresReady, casesVisible, router]);

  const load = useCallback(async () => {
    if (!idOrSlug) return;
    setLoading(true);
    try {
      setCaseItem(await getCase(idOrSlug));
    } catch (e) {
      notifyError(formatUserError(e, "Кейс не найден"));
    } finally {
      setLoading(false);
    }
  }, [idOrSlug, notifyError]);

  useEffect(() => {
    if (!featuresReady || !casesVisible) return;
    void load();
  }, [load, featuresReady, casesVisible]);

  useEffect(() => {
    return () => {
      const pending = takePendingCasePrizeBalance();
      setCasePrizeBalanceHold(false);
      if (pending) {
        setUser((prev) =>
          prev
            ? patchUserBalance(prev, { betting_balance: pending.betting_balance })
            : prev,
        );
      }
    };
  }, [setUser]);

  useEffect(() => {
    const iso = caseItem?.next_available_at;
    if (!iso || caseItem?.daily_available !== false) {
      setCooldownMs(0);
      return;
    }
    let reloaded = false;
    const tick = () => {
      const left = msUntil(iso);
      setCooldownMs(left);
      if (left <= 0 && !reloaded) {
        reloaded = true;
        void load();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [caseItem?.next_available_at, caseItem?.daily_available, load]);

  const accent = caseItem?.accent_color || "#3390ec";
  const loot = caseItem?.loot || [];
  const isPromo = caseItem?.kind === "promo";
  const cooldownBlocked = caseItem?.daily_available === false;
  const isFree =
    Boolean(caseItem) &&
    (caseItem!.kind === "daily" ||
      caseItem!.kind === "promo" ||
      caseItem!.price_nanoton <= 0);
  const needsChannel =
    Boolean(caseItem?.require_channel) && caseItem?.channel_subscribed === false;
  const channel = caseItem?.required_channel || PROMO_REQUIRED_CHANNEL;
  const channelUrl = promoChannelUrl(channel);
  const nameTag = caseItem?.required_name_tag?.trim() || "";
  const balance = user?.betting_balance ?? 0;
  const needsTopUp =
    Boolean(caseItem) &&
    !isFree &&
    !isPromo &&
    caseItem!.price_nanoton > 0 &&
    balance < caseItem!.price_nanoton;

  async function runOpen(fresh: CaseView) {
    setOpening(true);
    setQuestStep(null);
    haptics.impactOccurred("medium");
    setCasePrizeBalanceHold(true);
    takePendingCasePrizeBalance();
    try {
      const res = await openCase(fresh.slug, {
        promoCode: fresh.kind === "promo" ? promoCode : undefined,
      });
      const pool = fresh.loot?.length ? fresh.loot : [res.loot_entry];
      setRevealLoot(pool);
      setResult(res);
      setPhase("revealing");
      setChannelSheetOpen(false);
      // Share is consumed by this open — require it again next time.
      if (fresh.require_share) {
        setCaseItem((prev) => (prev ? { ...prev, share_done: false } : prev));
      }
      haptics.impactOccurred("heavy");

      const isTonPrize = res.prize_type === "ton" && (res.prize_nanoton ?? 0) > 0;
      if (isTonPrize) {
        // Keep TON prize off the header until reveal ends; apply open debit locally.
        if (fresh.price_nanoton > 0) {
          setUser((prev) =>
            prev
              ? patchUserBalance(prev, {
                  betting_balance: Math.max(0, (prev.betting_balance ?? 0) - fresh.price_nanoton),
                })
              : prev,
          );
        }
      } else {
        try {
          setUser(await getMe());
        } catch {
          /* ignore */
        }
      }
      void load();
    } catch (e) {
      setCasePrizeBalanceHold(false);
      takePendingCasePrizeBalance();
      if (e instanceof ApiRequestError && e.code === "channel_not_subscribed") {
        setChannelSheetOpen(true);
        void load();
      } else if (e instanceof ApiRequestError && e.code === "insufficient_funds") {
        notifyError(formatUserError(e, "Недостаточно средств"));
        router.push(APP_ROUTES.deposit);
      } else if (
        e instanceof ApiRequestError &&
        (e.code === "case_cooldown" || e.code === "case_daily_used")
      ) {
        notifyError(formatUserError(e, "Кейс пока недоступен"));
        void load();
      } else if (e instanceof ApiRequestError && e.code === "case_share_required") {
        setQuestStep("share");
        void load();
      } else if (e instanceof ApiRequestError && e.code === "case_name_tag_required") {
        setQuestStep("name");
        void load();
      } else {
        notifyError(formatUserError(e, "Не удалось открыть кейс"));
      }
    } finally {
      setOpening(false);
    }
  }

  /** After quests (and channel if needed) — continue opening. */
  const continueAfterQuests = useCallback(
    async (fresh: CaseView) => {
      const step = nextQuestStep(fresh);
      if (step) {
        setQuestStep(step);
        setShareAwaitingReturn(false);
        shareResumeRef.current = null;
        return;
      }
      setQuestStep(null);
      setShareAwaitingReturn(false);
      shareResumeRef.current = null;
      if (fresh.require_channel && fresh.channel_subscribed === false) {
        setChannelSheetOpen(true);
        return;
      }
      await runOpen(fresh);
    },
    // runOpen closes over promo/load/notify — intentional for this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [promoCode, idOrSlug],
  );

  const resumeAfterShare = useCallback(() => {
    const fresh = shareResumeRef.current;
    if (!fresh || questBusy || opening) return;
    setShareAwaitingReturn(false);
    shareResumeRef.current = null;
    haptics.notificationOccurred("success");
    void continueAfterQuests(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueAfterQuests, questBusy, opening]);

  async function handleOpen() {
    if (!caseItem || opening || phase !== "idle" || cooldownBlocked || questBusy) return;

    if (needsTopUp) {
      notifyError("Недостаточно средств");
      router.push(APP_ROUTES.deposit);
      return;
    }

    if (caseItem.kind === "promo" && !promoCode.trim()) {
      notifyError("Введите промокод");
      return;
    }

    // Refresh quest status before deciding which popup to show.
    let fresh = caseItem;
    try {
      fresh = await getCase(idOrSlug);
      setCaseItem(fresh);
      if (fresh.daily_available === false) {
        return;
      }
    } catch {
      /* use cached caseItem */
    }

    const step = nextQuestStep(fresh);
    if (step) {
      setQuestStep(step);
      return;
    }

    if (fresh.require_channel && fresh.channel_subscribed === false) {
      setChannelSheetOpen(true);
      return;
    }

    await runOpen(fresh);
  }

  async function handleShareQuest() {
    if (!caseItem || !user || questBusy) return;
    setQuestBusy(true);
    try {
      const url = referralTelegramUrl(user.telegram_id);
      const text = "Заходи в Flipo — открываем кейсы и стейкаем подарки!";
      // Record share BEFORE opening the sheet — Telegram can cancel in-flight fetches.
      const fresh = await shareCaseQuest(caseItem.slug || idOrSlug);
      setCaseItem(fresh);
      shareResumeRef.current = fresh;
      setShareAwaitingReturn(true);
      openTelegramShare({ url, text });
      // Opening continues only when the user taps «Продолжить».
    } catch (e) {
      notifyError(formatUserError(e, "Не удалось зафиксировать share"));
      setShareAwaitingReturn(false);
      shareResumeRef.current = null;
    } finally {
      setQuestBusy(false);
    }
  }

  async function handleCheckNameQuest() {
    if (!idOrSlug || questBusy) return;
    setQuestBusy(true);
    try {
      // Re-auth from Telegram initData so first/last name are refreshed in DB.
      const reauthed = await silentReauth();
      if (reauthed) {
        setUser(reauthed);
      } else {
        try {
          setUser(await getMe());
        } catch {
          /* ignore */
        }
      }
      const fresh = await getCase(idOrSlug);
      setCaseItem(fresh);
      if (fresh.required_name_tag?.trim() && fresh.name_tag_ok !== true) {
        notifyError("Тег в имени не найден — обновите имя в Telegram и зайдите снова");
        setQuestStep("name");
        return;
      }
      haptics.notificationOccurred("success");
      await continueAfterQuests(fresh);
    } catch (e) {
      notifyError(formatUserError(e, "Не удалось проверить имя"));
    } finally {
      setQuestBusy(false);
    }
  }

  async function recheckChannelAndOpen() {
    setChannelSheetOpen(false);
    try {
      const fresh = await getCase(idOrSlug);
      setCaseItem(fresh);
      if (fresh.require_channel && fresh.channel_subscribed === false) {
        setChannelSheetOpen(true);
        notifyError("Подписка не найдена — подпишитесь и нажмите снова");
        return;
      }
      await runOpen(fresh);
    } catch (e) {
      notifyError(formatUserError(e, "Не удалось проверить подписку"));
    }
  }

  const handleRevealComplete = useCallback(() => {
    setPhase("won");
    haptics.notificationOccurred("success");

    const pendingBalance = takePendingCasePrizeBalance();
    setCasePrizeBalanceHold(false);
    if (pendingBalance) {
      setUser((prev) =>
        prev
          ? patchUserBalance(prev, { betting_balance: pendingBalance.betting_balance })
          : prev,
      );
      if (pendingBalance.delta_nanoton && pendingBalance.delta_nanoton > 0) {
        emitBalanceWin(pendingBalance.delta_nanoton);
      }
    } else if (result?.prize_type === "ton") {
      void getMe()
        .then((me) => setUser(me))
        .catch(() => {
          /* WS may still refresh */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- haptic API is fire-and-forget
  }, [result?.prize_type, setUser]);

  function handleAgain() {
    setResult(null);
    setRevealLoot([]);
    setPhase("idle");
    setCasePrizeBalanceHold(false);
    takePendingCasePrizeBalance();
    void load();
  }

  async function handleSellPrize() {
    const item = result?.item;
    const itemId = item?.id;
    if (!itemId || !item) return;
    try {
      const { balance } =
        item.case_cashout_nanoton && item.case_cashout_nanoton > 0
          ? await liquidateCaseClaimItem(itemId)
          : await liquidateItem(itemId);
      setUser((prev) => (prev ? patchUserBalance(prev, { betting_balance: balance }) : prev));
      haptics.notificationOccurred("success");
    } catch (e) {
      notifyError(formatUserError(e, "Не удалось продать подарок"));
      throw e;
    }
  }

  function ctaLabel(): string {
    if (opening || phase === "revealing") return "Открываем…";
    if (cooldownBlocked) {
      return cooldownMs > 0 ? formatCountdown(cooldownMs) : "00:00:00";
    }
    if (needsChannel) return "Подписаться и открыть";
    if (isPromo) return "Открыть по промокоду";
    if (caseItem && caseItem.price_nanoton > 0) {
      return `Открыть · ${formatCasePrice(caseItem.price_nanoton)} TON`;
    }
    return "Открыть бесплатно";
  }

  if (!featuresReady || !casesVisible) {
    return null;
  }

  return (
    <PageShell>
      {loading && !caseItem ? (
        <div className="space-y-4">
          <div className="h-5 w-40 animate-pulse rounded-md bg-white/10" aria-hidden />
          <div className="case-detail-hero case-detail-hero--skeleton" aria-hidden>
            <div className="case-reveal__viewport case-reveal__viewport--skeleton animate-pulse" />
          </div>
          <div className="h-[3.25rem] animate-pulse rounded-[1.15rem] bg-surface" />
          <div className="case-detail__loot-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="case-loot-card case-loot-card--skeleton" aria-hidden>
                <div className="case-loot-card__frame case-loot-card__frame--skeleton" />
                <div className="case-loot-card__meta">
                  <div className="case-loot-card__skel case-loot-card__skel--name" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {caseItem && (phase === "idle" || phase === "revealing") ? (
        <CaseDetailPlayerPreview
          caseItem={caseItem}
          loot={loot}
          hideTitle
          ctaLabel={ctaLabel()}
          ctaDisabled={
            cooldownBlocked ||
            opening ||
            phase === "revealing" ||
            (isPromo && !promoCode.trim())
          }
          onCtaClick={() => void handleOpen()}
          showCatalogLink={phase === "idle"}
          showPromoCodeInput={isPromo}
          promoCode={promoCode}
          onPromoCodeChange={setPromoCode}
          revealMode={phase === "revealing" ? "spin" : "idle"}
          revealLoot={revealLoot}
          winnerId={phase === "revealing" ? result?.loot_entry.id : null}
          onRevealComplete={handleRevealComplete}
        />
      ) : null}

      {phase === "won" && result ? (
        <CaseWinModal
          result={result}
          accent={accent}
          onAgain={handleAgain}
          onSell={handleSellPrize}
        />
      ) : null}

      {questStep ? (
        <CaseQuestSheet
          step={questStep}
          nameTag={nameTag}
          busy={questBusy}
          awaitingReturn={shareAwaitingReturn}
          onClose={() => {
            setQuestStep(null);
            setShareAwaitingReturn(false);
            shareResumeRef.current = null;
            void load();
          }}
          onShare={() => void handleShareQuest()}
          onContinueAfterShare={resumeAfterShare}
          onCheckName={() => void handleCheckNameQuest()}
        />
      ) : null}

      {channelSheetOpen ? (
        <WheelChannelSheet
          channel={channel}
          channelUrl={channelUrl}
          description="Чтобы открыть этот кейс, подпишитесь на наш канал"
          onClose={() => {
            setChannelSheetOpen(false);
            void load();
          }}
          onOpenChannel={() => {
            if (channelUrl) openTelegramLink(channelUrl);
            window.setTimeout(() => {
              void recheckChannelAndOpen();
            }, 1200);
          }}
        />
      ) : null}

      {!caseItem && !loading ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted">
          <Gift className="h-8 w-8 opacity-40" />
          <p className="text-sm">Кейс не найден</p>
          <Link href={APP_ROUTES.cases} className="text-sm text-accent">
            Назад
          </Link>
        </div>
      ) : null}
    </PageShell>
  );
}
