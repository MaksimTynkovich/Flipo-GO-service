"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight, Lock, Megaphone, Sparkles, Users, X } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { PrizeWheel } from "@/components/games/PrizeWheel";
import { WheelWinModal } from "@/components/games/WheelWinModal";
import { TonIcon } from "@/components/icons/TonIcon";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import {
  ApiRequestError,
  formatTON,
  getMe,
  getWheelStatus,
  spinWheel,
  type WheelSpinResult,
  type WheelStatus,
} from "@/lib/api";
import { referralTelegramUrl } from "@/lib/bot";
import { PROMO_REQUIRED_CHANNEL, promoChannelMention, promoChannelUrl } from "@/lib/promo-channel";
import { formatUserError } from "@/lib/user-errors";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { openTelegramLink, openTelegramShare } from "@/src/shared/lib/twa";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";
import { prizeTierForAmount } from "@/lib/wheel-tiers";

function msUntilReset(iso: string): number {
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

export function WheelView() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [targetSegmentId, setTargetSegmentId] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<WheelSpinResult | null>(null);
  const [resetMs, setResetMs] = useState(0);
  const [winBurst, setWinBurst] = useState<string | null>(null);
  const [prizesOpen, setPrizesOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getWheelStatus();
      setStatus(next);
      setResetMs(msUntilReset(next.next_daily_reset_at));
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, "Не удалось загрузить колесо"),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!status?.next_daily_reset_at) return;
    const tick = () => setResetMs(msUntilReset(status.next_daily_reset_at));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [status?.next_daily_reset_at]);

  const channel = status?.required_channel || PROMO_REQUIRED_CHANNEL;
  const channelUrl = promoChannelUrl(channel);
  const channelLabel = promoChannelMention(channel);

  const prizeChips = useMemo(() => {
    const segs = [...(status?.segments ?? [])].sort(
      (a, b) => a.amount_nanoton - b.amount_nanoton,
    );
    if (segs.length === 0) return [];
    const max = segs[segs.length - 1]!.amount_nanoton;
    return segs.map((seg, index) => {
      const isMax = index === segs.length - 1 && max > 0;
      return {
        seg,
        tier: prizeTierForAmount(seg.amount_nanoton, isMax),
      };
    });
  }, [status?.segments]);

  function applyStatusFromResult(result: WheelSpinResult) {
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            bonus_spins: result.bonus_spins,
            daily_available: result.daily_available,
            spins_today: result.spins_today,
            unlimited_spins: result.unlimited_spins ?? prev.unlimited_spins,
            can_spin:
              Boolean(result.unlimited_spins) ||
              (prev.channel_subscribed &&
                (result.daily_available || result.bonus_spins > 0)),
          }
        : prev,
    );
  }

  async function onSpinEnd() {
    const result = pendingResult;
    setSpinning(false);
    setPendingResult(null);
    if (!result) return;

    applyStatusFromResult(result);
    haptics.notificationOccurred("success");
    setWinBurst(formatTON(result.prize_nanoton));
    try {
      setUser(await getMe());
    } catch {
      // WS may refresh balance.
    }
    void load();
  }

  async function handleSpin() {
    if (spinning) return;
    if (!status?.can_spin && !status?.unlimited_spins && !user?.is_admin) return;
    setWinBurst(null);
    setSpinning(true);
    haptics.impactOccurred("medium");
    try {
      const result = await spinWheel();
      setPendingResult(result);
      setTargetSegmentId(result.segment_id);
    } catch (e) {
      setSpinning(false);
      setTargetSegmentId(null);
      if (e instanceof ApiRequestError && e.code === "channel_not_subscribed") {
        showToast({ variant: "error", title: "Нужна подписка на канал" });
      } else {
        showToast({
          variant: "error",
          title: formatUserError(e, "Не удалось крутить"),
        });
      }
      haptics.notificationOccurred("error");
      void load();
    }
  }

  function openChannel() {
    if (!channelUrl) return;
    openTelegramLink(channelUrl);
    haptics.impactOccurred("light");
  }

  function inviteFriend() {
    if (!user) return;
    const url = referralTelegramUrl(user.telegram_id);
    const text = "Крути колесо удачи в Flipo — забирай TON каждый день!";
    if (!openTelegramShare({ url, text })) {
      void navigator.clipboard.writeText(`${url}\n\n${text}`);
      showToast({ variant: "success", title: "Ссылка скопирована" });
    }
    haptics.impactOccurred("light");
  }

  const unlimitedSpins = Boolean(status?.unlimited_spins || user?.is_admin);
  const needsChannel = Boolean(status && !status.channel_subscribed && !unlimitedSpins);
  const canSpin = Boolean(status?.can_spin || unlimitedSpins);
  const canInviteForSpin = Boolean(
    !unlimitedSpins && status?.channel_subscribed && !status.can_spin,
  );
  const waitingDailyReset = Boolean(
    !unlimitedSpins &&
      status?.channel_subscribed &&
      !status.can_spin &&
      !status.daily_available &&
      status.bonus_spins <= 0,
  );

  return (
    <PageShell flush className="wheel-page pb-6">
      <header className="wheel-min-hero">
        <div className="wheel-min-hero__row">
          <h1 className="wheel-min-hero__title">Колесо удачи</h1>
          {canSpin ? <span className="wheel-min-hero__live">Доступно</span> : null}
        </div>
      </header>

      <section className="wheel-min-stage">
        <PrizeWheel
          segments={status?.segments ?? []}
          targetSegmentId={targetSegmentId}
          spinning={spinning}
          ready={canSpin}
          onSpinEnd={onSpinEnd}
          onTick={() => haptics.selectionChanged()}
        />

        {/* Primary CTA — spin when available; locked look when not */}
        {needsChannel ? (
          <button
            type="button"
            disabled={!channelUrl}
            onClick={openChannel}
            className="wheel-min-cta wheel-min-cta--channel app-control"
          >
            Подписаться и крутить
          </button>
        ) : canSpin ? (
          <button
            type="button"
            disabled={spinning || loading}
            onClick={handleSpin}
            className={cn(
              "wheel-min-cta wheel-min-cta--spin app-control",
              spinning && "wheel-min-cta--busy",
            )}
          >
            {spinning ? "Крутим…" : "Крутить"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="wheel-min-cta wheel-min-cta--locked app-control"
            aria-label="Нет доступных спинов"
          >
            <Lock className="h-4 w-4" strokeWidth={2.2} />
            Крутить · 0
          </button>
        )}

        {canInviteForSpin ? (
          <button
            type="button"
            onClick={inviteFriend}
            className="wheel-min-cta wheel-min-cta--invite app-control"
          >
            <Users className="h-4 w-4" strokeWidth={2.2} />
            Пригласить · +1
          </button>
        ) : null}

        {waitingDailyReset ? (
          <p className="wheel-min-hint">Бесплатный спин через {formatCountdown(resetMs)}</p>
        ) : null}

        {!needsChannel && canSpin && status?.daily_available ? (
          <div className="wheel-min-meta">
            <span>1 бесплатный сегодня</span>
          </div>
        ) : null}
      </section>

      <section className="wheel-min-widget">
        <div className="wheel-min-widget__cell">
          <span className="wheel-min-widget__label">Спин</span>
          <span className="wheel-min-widget__value">
            {status?.daily_available ? "1" : "0"}
          </span>
        </div>
        <div className="wheel-min-widget__divider" aria-hidden />
        <div className="wheel-min-widget__cell">
          <span className="wheel-min-widget__label">Бонус</span>
          <span className="wheel-min-widget__value">{status?.bonus_spins ?? 0}</span>
        </div>
      </section>

      {prizeChips.length > 0 ? (
        <button
          type="button"
          className="wheel-min-prizes-btn app-control"
          onClick={() => {
            haptics.impactOccurred("light");
            setPrizesOpen(true);
          }}
        >
          <span className="wheel-min-prizes-btn__copy">
            <span className="wheel-min-prizes-btn__title">Все призы</span>
            <span className="wheel-min-prizes-btn__sub">
              {prizeChips.length} номиналов
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted" strokeWidth={2.2} />
        </button>
      ) : null}

      <section className="wheel-min-actions">
        {needsChannel && channelLabel ? (
          <button type="button" onClick={openChannel} className="wheel-min-link app-control">
            <Megaphone className="h-4 w-4" strokeWidth={2} />
            <span>Подписка на {channelLabel}</span>
          </button>
        ) : null}

        {status?.channel_subscribed ? (
          <Link
            href={APP_ROUTES.profileReferrals}
            onClick={() => haptics.impactOccurred("light")}
            className="wheel-min-link app-control"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} />
            <span>Рефералы</span>
          </Link>
        ) : null}
      </section>

      {(status?.recent_wins?.length ?? 0) > 0 ? (
        <section className="wheel-min-feed">
          <p className="wheel-min-section-label">Недавние выигрыши</p>
          <div className="wheel-min-feed__list">
            {status!.recent_wins.slice(0, 5).map((win, i) => (
              <div key={`${win.created_at}-${i}`} className="wheel-min-feed__item">
                <span className="wheel-min-feed__name">{win.display_name}</span>
                <span className="wheel-min-feed__prize">
                  +{formatTON(win.prize_nanoton)}
                  <TonIcon variant="brand" className="h-3.5 w-3.5" />
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {prizesOpen ? (
        <ModalOverlay
          onClose={() => setPrizesOpen(false)}
          analyticsModalId="wheel_prizes"
        >
          {(close) => (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Призы"
              className="sheet-panel relative mx-auto flex w-full max-w-lg max-h-[min(88dvh,100%)] flex-col"
            >
              <div className="shrink-0 px-5 pt-2 sm:px-6">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
                <div className="relative flex items-center justify-center pb-1">
                  <p className="text-center text-[15px] font-semibold">Призы</p>
                  <button
                    type="button"
                    onClick={close}
                    className="absolute right-0 flex size-8 items-center justify-center rounded-full text-muted"
                    aria-label="Закрыть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 sm:px-6">
                <div className="wheel-min-prizes__grid">
                  {prizeChips.map(({ seg, tier }, index) => (
                    <div
                      key={seg.id}
                      className={cn("wheel-prize", `wheel-prize--${tier}`)}
                      style={{ "--i": index } as CSSProperties}
                      aria-label={`${formatTON(seg.amount_nanoton)} TON`}
                    >
                      <span className="wheel-prize__row">
                        <span className="wheel-prize__amount">
                          {formatTON(seg.amount_nanoton)}
                        </span>
                        <span className="wheel-prize__ton-wrap" aria-hidden>
                          <TonIcon variant="brand" className="wheel-prize__ton" />
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ModalOverlay>
      ) : null}
      {winBurst ? (
        <WheelWinModal
          amount={winBurst}
          onClose={() => {
            haptics.impactOccurred("light");
            setWinBurst(null);
          }}
        />
      ) : null}
    </PageShell>
  );
}
