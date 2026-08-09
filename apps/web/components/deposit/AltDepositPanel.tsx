"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

function parseStarsInput(raw: string): number {
  const n = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function AltDepositPanel({ provider }: { provider: Provider }) {
  const { setUser } = useAuth();
  const { showToast } = useToast();
  const [amount, setAmount] = useState(provider === "stars" ? "100" : "1");
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

  const refreshQuote = useCallback(
    async (starsInput: string) => {
      if (provider !== "stars") return;
      const stars = parseStarsInput(starsInput);
      if (stars < 1) {
        setQuote(null);
        return;
      }
      try {
        setQuote(await quoteStarsDeposit({ starsCount: stars }));
      } catch {
        setQuote(null);
      }
    },
    [provider],
  );

  useEffect(() => {
    if (provider !== "stars") return;
    const t = window.setTimeout(() => {
      void refreshQuote(amount);
    }, 280);
    return () => window.clearTimeout(t);
  }, [amount, provider, refreshQuote]);

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

  const tonPerStar = useMemo(() => {
    if (!quote || quote.stars_count <= 0 || quote.ton_usd_rate <= 0) return null;
    // Prefer explicit rates; fall back to quote ratio.
    if (quote.stars_usd_rate > 0) {
      return quote.stars_usd_rate / quote.ton_usd_rate;
    }
    return quote.amount_nanoton / 1e9 / quote.stars_count;
  }, [quote]);

  const minStarsHint = useMemo(() => {
    if (!features || provider !== "stars") return null;
    const tonUSD = quote?.ton_usd_rate || features.ton_usd_rate || 0;
    const starUSD = quote?.stars_usd_rate || features.stars_usd_rate || 0;
    if (tonUSD <= 0 || starUSD <= 0) return null;
    const minTon = (features.min_deposit_nanoton || MIN_TRANSFER_NANOTON) / 1e9;
    return Math.max(1, Math.ceil((minTon * tonUSD) / starUSD));
  }, [features, provider, quote]);

  async function handlePay() {
    if (!enabled) {
      showToast({ variant: "error", title: "Способ временно недоступен" });
      return;
    }
    setLoading(true);
    try {
      if (provider === "cryptobot") {
        const nanoton = nanotonFromTonInput(amount);
        const min = features?.min_deposit_nanoton ?? MIN_TRANSFER_NANOTON;
        if (nanoton < min) {
          showToast({
            variant: "error",
            title: `Минимум ${formatTON(min)} TON`,
          });
          return;
        }
        const intent = await createCryptoBotDeposit(nanoton);
        if (!intent.pay_url) {
          throw new Error("Не получена ссылка на оплату");
        }
        setPendingId(intent.id);
        const opened = openTelegramLink(intent.pay_url) || openTelegramInvoice(intent.pay_url);
        if (!opened && typeof window !== "undefined") {
          window.open(intent.pay_url, "_blank", "noopener,noreferrer");
        }
        showToast({
          variant: "info",
          title: "Оплатите счёт в Crypto Bot — баланс обновится автоматически",
        });
        return;
      }

      const stars = parseStarsInput(amount);
      if (stars < 1) {
        showToast({ variant: "error", title: "Укажите число Stars" });
        return;
      }
      if (minStarsHint && stars < minStarsHint) {
        showToast({
          variant: "error",
          title: `Минимум ${minStarsHint} Stars`,
        });
        return;
      }
      const intent = await createStarsDeposit({ starsCount: stars });
      if (!intent.pay_url) {
        throw new Error("Не получена ссылка на оплату");
      }
      setPendingId(intent.id);
      showToast({
        variant: "info",
        title: "Оплатите счёт Stars — зачисление придёт автоматически",
      });
      openTelegramInvoice(intent.pay_url, (status) => {
        if (status === "paid") {
          showToast({ variant: "info", title: "Оплата прошла, зачисляем…" });
          // Webhook may lag behind the Mini App callback — poll briefly.
          const started = Date.now();
          const poll = async () => {
            try {
              const fresh = await getPaymentIntent(intent.id);
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
                return;
              }
            } catch {
              /* ignore */
            }
            if (Date.now() - started < 45000) {
              window.setTimeout(() => void poll(), 1500);
            }
          };
          void poll();
        } else if (status === "cancelled" || status === "failed") {
          showToast({ variant: "error", title: "Оплата не завершена" });
        }
      });
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
  const starsAmount = provider === "stars" ? parseStarsInput(amount) : 0;

  return (
    <div className="space-y-4">
      <section className="panel space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="icon-box h-12 w-12 rounded-2xl">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {provider === "cryptobot"
                ? "Оплата через @CryptoBot — TON зачисляется на баланс после подтверждения."
                : "Укажите сумму в Stars — на баланс зачислится эквивалент в TON."}
            </p>
          </div>
        </div>

        {!features ? (
          <div className="h-24 animate-pulse rounded-2xl bg-surface-raised" />
        ) : !enabled ? (
          <p className="rounded-2xl bg-surface-raised/70 px-4 py-3 text-xs text-muted">
            Способ временно недоступен. Попробуйте позже или выберите другой способ.
          </p>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-muted">
                {provider === "stars" ? "Сумма (Stars)" : "Сумма (TON)"}
              </span>
              <input
                className="input-field"
                inputMode={provider === "stars" ? "numeric" : "decimal"}
                value={amount}
                onChange={(e) =>
                  setAmount(
                    provider === "stars"
                      ? e.target.value.replace(/[^\d]/g, "")
                      : e.target.value.replace(",", "."),
                  )
                }
                placeholder={provider === "stars" ? "100" : "1"}
              />
            </label>

            {provider === "stars" ? (
              <div className="rounded-2xl bg-surface-raised/70 px-3 py-3 text-xs leading-relaxed text-muted">
                {quote && quote.amount_nanoton > 0 ? (
                  <>
                    <p>
                      К зачислению:{" "}
                      <span className="font-semibold text-foreground">
                        {formatTON(quote.amount_nanoton)} TON
                      </span>
                    </p>
                    {minStarsHint ? (
                      <p className="mt-1">Минимум: {minStarsHint} Stars</p>
                    ) : null}
                  </>
                ) : (
                  <p>Введите сумму в Stars, чтобы увидеть курс в TON</p>
                )}
              </div>
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
                  ? `Оплатить ${starsAmount || 0} Stars`
                  : `Оплатить ${formatTON(nanotonFromTonInput(amount) || 0)} TON`}
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
