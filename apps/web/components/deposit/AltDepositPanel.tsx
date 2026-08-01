"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import {
  createCryptoBotDeposit,
  createStarsDeposit,
  formatTON,
  getMe,
  getPaymentFeatures,
  getPaymentIntent,
  quoteStarsDeposit,
  type PaymentFeatures,
  type StarsQuote,
} from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { formatUserError } from "@/lib/user-errors";
import { nanotonFromTonInput, MIN_TRANSFER_NANOTON } from "@/lib/wallet";
import { openTelegramInvoice, openTelegramLink } from "@/src/shared/lib/twa";
import { Bot, Star } from "lucide-react";

type Provider = "cryptobot" | "stars";

export function AltDepositPanel({ provider }: { provider: Provider }) {
  const { setUser } = useAuth();
  const { showToast } = useToast();
  const [amount, setAmount] = useState("1");
  const [features, setFeatures] = useState<PaymentFeatures | null>(null);
  const [quote, setQuote] = useState<StarsQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const enabled =
    provider === "cryptobot"
      ? Boolean(features?.cryptobot_enabled)
      : Boolean(features?.stars_enabled);

  useEffect(() => {
    getPaymentFeatures()
      .then(setFeatures)
      .catch(() =>
        setFeatures({
          cryptobot_enabled: false,
          stars_enabled: false,
          min_deposit_nanoton: MIN_TRANSFER_NANOTON,
          stars_usd_rate: 0.013,
        }),
      );
  }, []);

  const refreshQuote = useCallback(async (tonInput: string) => {
    if (provider !== "stars") return;
    const nanoton = nanotonFromTonInput(tonInput);
    if (nanoton < MIN_TRANSFER_NANOTON) {
      setQuote(null);
      return;
    }
    try {
      setQuote(await quoteStarsDeposit(nanoton));
    } catch {
      setQuote(null);
    }
  }, [provider]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshQuote(amount);
    }, 280);
    return () => window.clearTimeout(t);
  }, [amount, refreshQuote]);

  useEffect(() => {
    if (!pendingId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const intent = await getPaymentIntent(pendingId);
        if (cancelled) return;
        if (intent.status === "paid") {
          setPendingId(null);
          try {
            const me = await getMe();
            setUser((prev) =>
              prev ? patchUserBalance(prev, { betting_balance: me.betting_balance }) : me,
            );
          } catch {
            /* ignore */
          }
          showToast({
            variant: "success",
            title: `Зачислено ${formatTON(intent.amount_nanoton)} TON`,
          });
        }
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pendingId, setUser, showToast]);

  async function handlePay() {
    const nanoton = nanotonFromTonInput(amount);
    const min = features?.min_deposit_nanoton ?? MIN_TRANSFER_NANOTON;
    if (nanoton < min) {
      showToast({
        variant: "error",
        title: `Минимум ${formatTON(min)} TON`,
      });
      return;
    }
    if (!enabled) {
      showToast({ variant: "error", title: "Способ временно недоступен" });
      return;
    }
    setLoading(true);
    try {
      const intent =
        provider === "cryptobot"
          ? await createCryptoBotDeposit(nanoton)
          : await createStarsDeposit(nanoton);
      if (!intent.pay_url) {
        throw new Error("Не получена ссылка на оплату");
      }
      setPendingId(intent.id);
      if (provider === "stars") {
        openTelegramInvoice(intent.pay_url, (status) => {
          if (status === "paid") {
            void getPaymentIntent(intent.id).then(async (fresh) => {
              if (fresh.status === "paid") {
                setPendingId(null);
                try {
                  const me = await getMe();
                  setUser((prev) =>
                    prev ? patchUserBalance(prev, { betting_balance: me.betting_balance }) : me,
                  );
                } catch {
                  /* ignore */
                }
                showToast({
                  variant: "success",
                  title: `Зачислено ${formatTON(fresh.amount_nanoton)} TON`,
                });
              }
            });
          } else if (status === "cancelled" || status === "failed") {
            showToast({ variant: "error", title: "Оплата не завершена" });
          }
        });
      } else {
        const opened = openTelegramLink(intent.pay_url) || openTelegramInvoice(intent.pay_url);
        if (!opened && typeof window !== "undefined") {
          window.open(intent.pay_url, "_blank", "noopener,noreferrer");
        }
        showToast({
          variant: "info",
          title: "Оплатите счёт в Crypto Bot — баланс обновится автоматически",
        });
      }
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, "Не удалось создать платёж"),
      });
    } finally {
      setLoading(false);
    }
  }

  const title = provider === "cryptobot" ? "Crypto Bot" : "Telegram Stars";
  const Icon = provider === "cryptobot" ? Bot : Star;

  return (
    <div className="space-y-4">
      <section className="panel space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="icon-box h-10 w-10 rounded-xl">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {provider === "cryptobot"
                ? "Оплата через @CryptoBot — TON зачисляется на баланс после подтверждения."
                : "Оплата Stars по рыночному курсу TON. Курс фиксируется при создании счёта."}
            </p>
          </div>
        </div>

        {!features ? (
          <div className="h-24 animate-pulse rounded-2xl bg-surface-raised" />
        ) : !enabled ? (
          <p className="rounded-2xl bg-surface-raised/70 px-4 py-3 text-xs text-muted">
            Способ временно недоступен. Проверьте настройки API.
          </p>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-muted">Сумма (TON)</span>
              <input
                className="input-field"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                placeholder="1"
              />
            </label>

            {provider === "stars" && quote ? (
              <div className="rounded-2xl bg-surface-raised/70 px-3 py-3 text-xs leading-relaxed text-muted">
                <p>
                  К оплате:{" "}
                  <span className="font-semibold text-foreground">{quote.stars_count} Stars</span>
                </p>
                <p className="mt-1">
                  Курс: 1 TON ≈ ${quote.ton_usd_rate.toFixed(4)} · 1 Star ≈ $
                  {quote.stars_usd_rate.toFixed(4)}
                </p>
              </div>
            ) : null}

            {provider === "cryptobot" && features.ton_usd_rate ? (
              <p className="text-[11px] text-muted">
                Рыночный ориентир: 1 TON ≈ ${features.ton_usd_rate.toFixed(4)}
              </p>
            ) : null}

            <Button
              variant="accent"
              className="h-11 w-full rounded-xl text-sm font-bold"
              disabled={loading}
              onClick={() => void handlePay()}
            >
              {loading
                ? "Создаём счёт…"
                : provider === "stars"
                  ? `Оплатить Stars · ${formatTON(nanotonFromTonInput(amount) || 0)} TON`
                  : `Оплатить в Crypto Bot · ${formatTON(nanotonFromTonInput(amount) || 0)} TON`}
            </Button>

            {pendingId ? (
              <p className="text-center text-[11px] text-muted">
                Ожидаем оплату… баланс обновится автоматически
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
