"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight, Gift, Infinity as InfinityIcon, UserRoundPlus, Users, X } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { PrizeWheel } from "@/components/games/PrizeWheel";
import { WheelChannelSheet } from "@/components/games/WheelChannelSheet";
import { WheelWinModal } from "@/components/games/WheelWinModal";
import { TonIcon } from "@/components/icons/TonIcon";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { BtnBusy } from "@/components/ui/BtnBusy";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import {
  ApiRequestError,
  formatTON,
  getMe,
  getWheelStatus,
  reportWheelShare,
  spinWheel,
  type WheelSpinResult,
  type WheelStatus,
} from "@/lib/api";
import { referralTelegramUrl } from "@/lib/bot";
import { PROMO_REQUIRED_CHANNEL, promoChannelUrl } from "@/lib/promo-channel";
import { formatUserError } from "@/lib/user-errors";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { openTelegramLink, openTelegramShare, getTelegramWebApp } from "@/src/shared/lib/twa";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";
import { prizeTierForAmount } from "@/lib/wheel-tiers";
import {
  setWheelPrizeBalanceHold,
  takePendingWheelPrizeBalance,
} from "@/lib/wheel-prize-balance";
import { patchUserBalance } from "@/lib/apply-balance";
import { emitBalanceWin } from "@/lib/balance-win";

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

type StatusCopyInput = {
  loading: boolean;
  unlimitedSpins: boolean;
  needsChannel: boolean;
  canSpin: boolean;
  waitingDailyReset: boolean;
  dailyAvailable: boolean;
  bonusSpins: number;
  resetMs: number;
};

function statusCopy({
  loading,
  unlimitedSpins,
  needsChannel,
  canSpin,
  waitingDailyReset,
  dailyAvailable,
  bonusSpins,
  resetMs,
}: StatusCopyInput): string {
  if (loading) return "Загрузка…";
  if (unlimitedSpins) return "Безлимитные спины";
  if (needsChannel) return "Подпишись на канал, чтобы крутить";
  if (waitingDailyReset) return `Доступно через ${formatCountdown(resetMs)}`;
  if (canSpin && dailyAvailable) return "1 бесплатный спин";
  if (canSpin && bonusSpins > 0) return `Бонус ×${bonusSpins}`;
  if (bonusSpins > 0) return `Бонус ×${bonusSpins}`;
  return "Нет доступных спинов";
}

function StatValue({
  unlimited,
  value,
}: {
  unlimited: boolean;
  value: string | number;
}) {
  if (unlimited) {
    return (
      <span className="wheel-stat__infinity" aria-label="Безлимит">
        <InfinityIcon className="wheel-stat__infinity-icon" strokeWidth={2.25} />
      </span>
    );
  }
  return <>{value}</>;
}

const CTA_BASE =
  "app-control wheel-cta flex h-14 w-full items-center justify-center gap-2 text-[15px] font-semibold tracking-tight";

function formatWinAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  return `${days} дн назад`;
}

function winInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function winAvatarTone(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 5;
}

function WheelFeedAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  const [imgError, setImgError] = useState(false);
  const showPhoto = Boolean(photoUrl) && !imgError;
  return (
    <span
      className={cn(
        "wheel-feed__avatar",
        !showPhoto && `wheel-feed__avatar--${winAvatarTone(name)}`,
      )}
      aria-hidden
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="wheel-feed__avatar-img"
          onError={() => setImgError(true)}
        />
      ) : (
        winInitial(name)
      )}
    </span>
  );
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
  const [channelSheetOpen, setChannelSheetOpen] = useState(false);

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
    return () => {
      const pendingBalance = takePendingWheelPrizeBalance();
      setWheelPrizeBalanceHold(false);
      if (!pendingBalance) return;
      setUser((prev) =>
        prev
          ? patchUserBalance(prev, {
              betting_balance: pendingBalance.betting_balance,
              promo_balance: pendingBalance.promo_balance,
            })
          : prev,
      );
    };
  }, [setUser]);

  useEffect(() => {
    if (!status?.next_daily_reset_at) return;
    const tick = () => setResetMs(msUntilReset(status.next_daily_reset_at));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [status?.next_daily_reset_at]);

  const channel = status?.required_channel || PROMO_REQUIRED_CHANNEL;
  const channelUrl = promoChannelUrl(channel);

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
    if (!result) {
      setWheelPrizeBalanceHold(false);
      takePendingWheelPrizeBalance();
      return;
    }

    applyStatusFromResult(result);
    haptics.notificationOccurred("success");
    setWinBurst(formatTON(result.prize_nanoton));

    const pendingBalance = takePendingWheelPrizeBalance();
    setWheelPrizeBalanceHold(false);
    if (pendingBalance) {
      setUser((prev) =>
        prev
          ? patchUserBalance(prev, {
              betting_balance: pendingBalance.betting_balance,
              promo_balance: pendingBalance.promo_balance,
            })
          : prev,
      );
      if (pendingBalance.delta_nanoton && pendingBalance.delta_nanoton > 0) {
        emitBalanceWin(pendingBalance.delta_nanoton);
      }
    } else {
      try {
        setUser(await getMe());
      } catch {
        // WS may still refresh balance.
      }
    }
    void load();
  }

  function openChannel() {
    if (!channelUrl) return;
    openTelegramLink(channelUrl);
    haptics.impactOccurred("light");
  }

  async function handleSpin() {
    if (spinning) return;
    const unlimited = Boolean(status?.unlimited_spins || user?.is_admin);
    const hasStock =
      unlimited ||
      Boolean(status?.daily_available) ||
      (status?.bonus_spins ?? 0) > 0;
    if (!hasStock) return;

    setWinBurst(null);
    setSpinning(true);
    haptics.impactOccurred("medium");

    try {
      const fresh = await getWheelStatus();
      setStatus(fresh);
      setResetMs(msUntilReset(fresh.next_daily_reset_at));
      if (!fresh.channel_subscribed) {
        setSpinning(false);
        setChannelSheetOpen(true);
        haptics.notificationOccurred("warning");
        return;
      }
      if (!fresh.can_spin && !fresh.unlimited_spins && !user?.is_admin) {
        setSpinning(false);
        showToast({ variant: "error", title: "Нет доступных спинов" });
        haptics.notificationOccurred("error");
        return;
      }

      setWheelPrizeBalanceHold(true);
      takePendingWheelPrizeBalance();
      const result = await spinWheel();
      setPendingResult(result);
      setTargetSegmentId(result.segment_id);
    } catch (e) {
      setSpinning(false);
      setTargetSegmentId(null);
      setWheelPrizeBalanceHold(false);
      takePendingWheelPrizeBalance();
      if (e instanceof ApiRequestError && e.code === "channel_not_subscribed") {
        setChannelSheetOpen(true);
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

  async function inviteFriend() {
    if (!user) return;
    const url = referralTelegramUrl(user.telegram_id);
    const text =
      "🎁 Халява в Flipo: каждый день бесплатно крути колесо удачи и забирай TON! 💸";
    haptics.impactOccurred("light");

    // Report BEFORE opening the share sheet — otherwise Telegram can cancel the fetch.
    const webApp = getTelegramWebApp();
    const canShare = typeof webApp?.openTelegramLink === "function";
    const action = canShare ? "share" : "copy";
    try {
      await reportWheelShare(action);
    } catch {
      // Still open share / copy even if analytics notify failed.
    }

    if (canShare && openTelegramShare({ url, text })) {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${url}\n\n${text}`);
      showToast({ variant: "success", title: "Ссылка скопирована" });
    } catch {
      showToast({ variant: "error", title: "Не удалось скопировать ссылку" });
    }
  }

  const unlimitedSpins = Boolean(status?.unlimited_spins || user?.is_admin);
  const needsChannel = Boolean(status && !status.channel_subscribed);
  const hasSpinStock = Boolean(
    unlimitedSpins || status?.daily_available || (status?.bonus_spins ?? 0) > 0,
  );
  const canSpin = Boolean(status?.can_spin || unlimitedSpins);
  const canInviteForSpin = Boolean(!unlimitedSpins && !hasSpinStock);
  const waitingDailyReset = Boolean(
    !unlimitedSpins &&
      !hasSpinStock &&
      !status?.daily_available &&
      (status?.bonus_spins ?? 0) <= 0,
  );

  const statusText = statusCopy({
    loading,
    unlimitedSpins,
    needsChannel,
    canSpin,
    waitingDailyReset,
    dailyAvailable: Boolean(status?.daily_available),
    bonusSpins: status?.bonus_spins ?? 0,
    resetMs,
  });

  const topWins = status?.recent_wins?.slice(0, 5) ?? [];

  return (
    <PageShell flush>
      <div className="wheel-page flex flex-col gap-3.5">
        <div className="wheel-hero">
          <p className="wheel-status" aria-live="polite" aria-atomic="true">
            {loading ? (
              <span className="wheel-status__skeleton" aria-hidden />
            ) : (
              statusText
            )}
          </p>

          <section
            className={cn(
              "wheel-stage",
              !loading && !hasSpinStock && !spinning && "wheel-stage--dim",
            )}
          >
            <PrizeWheel
              segments={status?.segments ?? []}
              targetSegmentId={targetSegmentId}
              spinning={spinning}
              ready={hasSpinStock}
              onSpinEnd={onSpinEnd}
              onTick={() => haptics.selectionChanged()}
            />
          </section>
        </div>

        <div className="wheel-controls">
          {loading ? (
            <>
              <div className="wheel-skeleton-cta" aria-hidden />
              <div className="wheel-stats">
                <div className="wheel-skeleton-tile" aria-hidden />
              </div>
            </>
          ) : (
            <>
              <div className="wheel-actions">
                {hasSpinStock ? (
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => {
                      void handleSpin();
                    }}
                    className={cn(CTA_BASE, "wheel-cta--spin")}
                  >
                    {spinning ? <BtnBusy label="Крутим…" /> : "Крутить"}
                  </button>
                ) : canInviteForSpin ? (
                  <div className="wheel-empty">
                    <p className="wheel-empty__title">Спины закончились</p>
                    <p className="wheel-empty__desc">
                      Приглашай друзей и получай спины за каждого
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void inviteFriend();
                      }}
                      className={cn(CTA_BASE, "wheel-cta--invite-primary")}
                    >
                      <UserRoundPlus className="h-4 w-4" strokeWidth={2.25} />
                      Пригласить друга +1 спин
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="wheel-stats" role="group" aria-label="Спины">
                <div className="wheel-stat">
                  <span className="wheel-stat__label">Сегодня</span>
                  <span className="wheel-stat__value">
                    <StatValue
                      unlimited={unlimitedSpins}
                      value={status?.daily_available ? "1" : "0"}
                    />
                  </span>
                </div>
                <div className="wheel-stat__divider" aria-hidden />
                <div className="wheel-stat">
                  <span className="wheel-stat__label">Бонус</span>
                  <span className="wheel-stat__value">
                    <StatValue
                      unlimited={unlimitedSpins}
                      value={status?.bonus_spins ?? 0}
                    />
                  </span>
                </div>
              </div>
            </>
          )}

        {!canInviteForSpin ? (
          <aside className="wheel-tip" aria-label="Совет">
            <Users className="wheel-tip__icon" strokeWidth={2} aria-hidden />
            <p className="wheel-tip__text">
              По статистике каждый приглашённый реферал увеличивает шанс крупного выигрыша
            </p>
          </aside>
        ) : null}

          {(prizeChips.length > 0 || status?.channel_subscribed || user) && !loading ? (
            <nav className="wheel-menu" aria-label="Дополнительно">
              {user ? (
                <button
                  type="button"
                  className="wheel-menu__item"
                  onClick={() => {
                    void inviteFriend();
                  }}
                >
                  <UserRoundPlus className="wheel-menu__icon" strokeWidth={1.75} aria-hidden />
                  <span className="wheel-menu__title">Пригласить друга</span>
                  <ChevronRight className="wheel-menu__chevron" strokeWidth={1.5} />
                </button>
              ) : null}
              {prizeChips.length > 0 ? (
                <button
                  type="button"
                  className="wheel-menu__item"
                  aria-haspopup="dialog"
                  aria-expanded={prizesOpen}
                  onClick={() => {
                    haptics.impactOccurred("light");
                    setPrizesOpen(true);
                  }}
                >
                  <Gift className="wheel-menu__icon" strokeWidth={1.75} aria-hidden />
                  <span className="wheel-menu__title">Посмотреть призы</span>
                  <ChevronRight className="wheel-menu__chevron" strokeWidth={1.5} />
                </button>
              ) : null}
            </nav>
          ) : null}
        </div>

        {topWins.length > 0 && !loading ? (
          <section className="wheel-feed" aria-label="Топ выигрышей за 24 часа">
            <div className="wheel-feed__head">
              <span className="wheel-feed__spark" aria-hidden />
              <p className="wheel-feed__label">Топ выигрышей за 24ч</p>
            </div>
            <ul className="wheel-feed__list">
              {topWins.map((win, i) => {
                const tier = prizeTierForAmount(win.prize_nanoton);
                const rank = i + 1;
                const name = win.display_name?.trim() || "Игрок";
                const ago = formatWinAgo(win.created_at);
                return (
                  <li
                    key={`${win.created_at}-${i}`}
                    className={cn(
                      "wheel-feed__row",
                      rank === 1 && "wheel-feed__row--gold",
                      rank === 2 && "wheel-feed__row--silver",
                      rank === 3 && "wheel-feed__row--bronze",
                    )}
                  >
                    <span
                      className={cn("wheel-feed__rank", rank <= 3 && `wheel-feed__rank--${rank}`)}
                      aria-label={`Место ${rank}`}
                    >
                      {rank}
                    </span>
                    <WheelFeedAvatar name={name} photoUrl={win.photo_url} />
                    <span className="wheel-feed__meta">
                      <span className="wheel-feed__name">{name}</span>
                      {ago ? <span className="wheel-feed__ago">{ago}</span> : null}
                    </span>
                    <span className={cn("wheel-feed__amount", `wheel-feed__amount--${tier}`)}>
                      {formatTON(win.prize_nanoton)}
                      <TonIcon variant="brand" className="h-3.5 w-3.5" />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {channelSheetOpen ? (
        <WheelChannelSheet
          channel={channel}
          channelUrl={channelUrl}
          onClose={() => {
            setChannelSheetOpen(false);
            void load();
          }}
          onOpenChannel={openChannel}
        />
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
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/10" />
                <div className="relative flex items-center justify-center pb-1">
                  <p className="text-center text-[15px] font-semibold tracking-tight">
                    Призы
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="absolute right-0 flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
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
                      <span className="wheel-prize__spark wheel-prize__spark--a" aria-hidden />
                      <span className="wheel-prize__spark wheel-prize__spark--b" aria-hidden />
                      <span className="wheel-prize__amount">
                        {formatTON(seg.amount_nanoton)}
                      </span>
                      <span className="wheel-prize__gem" aria-hidden>
                        <TonIcon variant="brand" className="wheel-prize__gem-icon" title="" />
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
