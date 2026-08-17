"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsConnectionRestored, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { TonWalletConnectControl } from "@/components/deposit/TonWalletConnectControl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useT } from "@/components/providers/I18nProvider";
import {
  confirmWalletDeposit,
  createWalletDepositIntent,
  clearWallet,
  formatTON,
  getMe,
  getWalletTransfers,
  requestWalletWithdraw,
  updateWallet,
  WalletTransfer,
} from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { emitBalanceWin } from "@/lib/balance-win";
import { TonAmount } from "@/components/icons/TonIcon";
import { Button } from "@/components/ui/button";
import { useAnalyticsInput } from "@/lib/useAnalyticsInput";
import {
  formatWalletError,
  formatTransferDate,
  walletStatusLabel,
  type WalletMessage,
} from "@/lib/wallet-errors";
import {
  encodeTonCommentPayload,
  formatTonWalletAddress,
  MIN_TRANSFER_NANOTON,
  nanotonFromTonInput,
  newIdempotencyKey,
  shortenTonWalletAddress,
  sleep,
  tonWalletAddressesEqual,
  WITHDRAW_FEE_NANOTON,
  withdrawDebitNanoton,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Wallet,
} from "lucide-react";

function WalletAlert({ message }: { message: WalletMessage }) {
  return (
    <p
      className={cn(
        "rounded-2xl px-4 py-3 text-xs leading-relaxed",
        message.type === "error" && "bg-red-500/10 text-red-300",
        message.type === "success" && "bg-success/10 text-success",
        message.type === "info" && "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-muted",
      )}
    >
      {message.text}
    </p>
  );
}

function TransferHistory({
  title,
  items,
  direction,
  emptyText,
}: {
  title: string;
  items: WalletTransfer[];
  direction: "deposit" | "withdraw";
  emptyText: string;
}) {
  const t = useT();
  return (
    <section className="panel overflow-hidden p-0">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted" />
          <p className="section-label">{title}</p>
        </div>
      </div>
      <div className="space-y-2 p-4">
        {items.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted">{emptyText}</p>
        ) : (
          items.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-surface-raised/70 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-[11px] text-muted">{formatTransferDate(item.created_at)}</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {walletStatusLabel(item.status)}
                </p>
                {item.wallet_address ? (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {direction === "deposit" ? t("deposit.from") : t("deposit.to")}{" "}
                    {shortenTonWalletAddress(item.wallet_address)}
                  </p>
                ) : null}
                {item.status === "failed" && item.error_message ? (
                  <p className="mt-0.5 text-xs text-muted">{t("deposit.incomplete")}</p>
                ) : null}
              </div>
              <p
                className={cn(
                  "shrink-0 text-sm font-bold tabular-nums",
                  direction === "deposit" ? "text-success" : "text-red-400",
                )}
              >
                {direction === "deposit" ? "+" : "−"}
                {formatTON(direction === "withdraw" ? item.net_nanoton : item.amount_nanoton)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function TonWalletPanel() {
  const t = useT();
  const { user, setUser } = useAuth();
  const wallet = useTonWallet();
  const connectionRestored = useIsConnectionRestored();
  const [tonConnectUI] = useTonConnectUI();

  const [depositAmount, setDepositAmount] = useState("1");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<WalletMessage | null>(null);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);

  const connectedAddr = wallet?.account?.address;
  const isWalletConnected = Boolean(connectedAddr);
  const displayWallet = connectedAddr ? formatTonWalletAddress(connectedAddr) : null;
  const deposits = useMemo(
    () => transfers.filter((item) => item.direction === "deposit"),
    [transfers],
  );
  const withdrawals = useMemo(
    () => transfers.filter((item) => item.direction === "withdraw"),
    [transfers],
  );
  const pendingDeposits = deposits.filter((item) => item.status === "awaiting_payment").length;
  const depositInput = useAnalyticsInput("deposit_ton_amount", "deposit");
  const withdrawInput = useAnalyticsInput("withdraw_ton_amount", "wallet");

  useEffect(() => {
    if (!connectionRestored) return;

    if (connectedAddr) {
      if (user?.ton_wallet && tonWalletAddressesEqual(user.ton_wallet, connectedAddr)) return;
      updateWallet(connectedAddr)
        .then((res) => {
          if (user) setUser({ ...user, ton_wallet: res.wallet });
        })
        .catch(() => {});
      return;
    }

    if (!user?.ton_wallet) return;
    clearWallet()
      .then(() => {
        if (user) setUser({ ...user, ton_wallet: undefined });
      })
      .catch(() => {});
  }, [connectionRestored, connectedAddr, user, setUser]);

  useEffect(() => {
    getWalletTransfers()
      .then(setTransfers)
      .catch(() => setTransfers([]));
  }, []);

  useEffect(() => {
    const hasPendingDeposit = deposits.some((item) => item.status === "awaiting_payment");
    const hasPendingWithdraw = withdrawals.some((item) =>
      item.status === "queued" ||
      item.status === "broadcasting" ||
      item.status === "pending_review",
    );
    if (!hasPendingDeposit && !hasPendingWithdraw) return;

    const timer = setInterval(() => {
      refreshTransfers().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [deposits, withdrawals]);

  async function refreshTransfers() {
    try {
      const next = await getWalletTransfers();
      const completedDeposit = next.find(
        (item) =>
          item.direction === "deposit" &&
          item.status === "completed" &&
          transfers.some(
            (prev) => prev.id === item.id && prev.status !== "completed",
          ),
      );
      const failedWithdraw = next.find(
        (item) =>
          item.direction === "withdraw" &&
          item.status === "failed" &&
          transfers.some(
            (prev) => prev.id === item.id && prev.status !== "failed",
          ),
      );
      const completedWithdraw = next.find(
        (item) =>
          item.direction === "withdraw" &&
          item.status === "completed" &&
          transfers.some(
            (prev) => prev.id === item.id && prev.status !== "completed",
          ),
      );
      setTransfers(next);
      if (completedDeposit || failedWithdraw || completedWithdraw) {
        const me = await getMe();
        setUser(me);
      }
      if (failedWithdraw) {
        setMessage({
          type: "error",
          text: t("deposit.withdrawRefunded"),
        });
      } else if (completedWithdraw) {
        setMessage({
          type: "success",
          text: t("deposit.withdrawDone", { amount: formatTON(completedWithdraw.net_nanoton) }),
        });
      }
    } catch {
      setTransfers([]);
    }
  }

  function switchMode(next: "deposit" | "withdraw") {
    setMode(next);
    setMessage(null);
  }

  async function handleDeposit() {
    setMessage(null);
    const amountNanoton = nanotonFromTonInput(depositAmount);
    if (amountNanoton <= 0) {
      setMessage({ type: "error", text: t("deposit.enterDepositAmount") });
      return;
    }
    if (amountNanoton < MIN_TRANSFER_NANOTON) {
      setMessage({ type: "error", text: t("deposit.minDeposit01") });
      return;
    }
    if (!isWalletConnected) {
      setMessage({ type: "error", text: t("deposit.connectWalletFirst") });
      return;
    }

    depositInput.complete();
    setLoading(true);
    try {
      const intent = await createWalletDepositIntent(amountNanoton);
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: intent.to_address,
            amount: String(intent.amount_nanoton),
            payload: encodeTonCommentPayload(intent.comment),
          },
        ],
      });

      let confirm = await confirmWalletDeposit(intent.id);
      for (let attempt = 0; attempt < 20 && confirm.transfer.status === "awaiting_payment"; attempt++) {
        await sleep(3000);
        confirm = await confirmWalletDeposit(intent.id);
      }

      if (confirm.transfer.status === "completed") {
        setUser((prev) => (prev ? patchUserBalance(prev, { betting_balance: confirm.balance }) : prev));
        if (confirm.transfer.amount_nanoton > 0) {
          emitBalanceWin(confirm.transfer.amount_nanoton, { source: "local" });
        }
        setMessage({ type: "success", text: t("deposit.creditedBalance") });
      } else if (confirm.transfer.status === "awaiting_payment") {
        setMessage({
          type: "info",
          text: t("deposit.sentPending"),
        });
      } else if (confirm.transfer.status === "expired") {
        setMessage({ type: "error", text: t("deposit.expired") });
      } else {
        setMessage({
          type: "info",
          text: t("deposit.status", { status: walletStatusLabel(confirm.transfer.status) }),
        });
      }
      await refreshTransfers();
    } catch (e) {
      setMessage({ type: "error", text: formatWalletError(e, "deposit") });
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    setMessage(null);
    const receiveNanoton = nanotonFromTonInput(withdrawAmount);
    if (receiveNanoton <= 0) {
      setMessage({ type: "error", text: t("deposit.enterWithdrawAmount") });
      return;
    }
    if (receiveNanoton < MIN_TRANSFER_NANOTON) {
      setMessage({ type: "error", text: t("deposit.minWithdraw01") });
      return;
    }
    if (!isWalletConnected) {
      setMessage({ type: "error", text: t("deposit.connectWalletFirst") });
      return;
    }
    const debitNanoton = withdrawDebitNanoton(receiveNanoton);
    if (user && user.betting_balance < debitNanoton) {
      setMessage({
        type: "error",
        text: t("deposit.needWithFee", {
          amount: formatTON(debitNanoton),
          fee: formatTON(WITHDRAW_FEE_NANOTON),
        }),
      });
      return;
    }

    withdrawInput.complete();
    setLoading(true);
    try {
      const result = await requestWalletWithdraw(receiveNanoton, newIdempotencyKey("withdraw"));
      setUser((prev) => (prev ? patchUserBalance(prev, { betting_balance: result.balance }) : prev));
      if (result.transfer.status === "pending_review") {
        setMessage({
          type: "info",
          text: t("deposit.withdrawPending", { amount: formatTON(receiveNanoton) }),
        });
      } else if (result.transfer.status === "failed") {
        setMessage({
          type: "error",
          text: t("deposit.withdrawReturned"),
        });
      } else {
        setMessage({
          type: "info",
          text: t("deposit.withdrawCreated", { amount: formatTON(receiveNanoton) }),
        });
      }
      await refreshTransfers();
    } catch (e) {
      setMessage({ type: "error", text: formatWalletError(e, "withdraw") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <section className="panel overflow-hidden p-0">
        <div className="bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--accent)_20%,transparent),_transparent_60%)] px-5 py-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3">
              <span className="chip chip-accent">TON Wallet</span>
              <div className="space-y-2">
                <p className="text-[1.4rem] font-semibold leading-tight text-foreground">
                  {t("deposit.tonTitle")}
                </p>
                <p className="text-sm leading-relaxed text-muted">
                  {t("deposit.tonBody")}
             
                </p>
              </div>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
              <Wallet className="h-7 w-7" />
            </div>
          </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface-raised/80 p-3">
              <p className="text-[11px] text-muted">{t("deposit.balance")}</p>
              <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
                <TonAmount
                  amount={user ? formatTON(user.betting_balance) : "—"}
                  variant="brand"
                  iconClassName="h-5 w-5"
                />
              </div>
            </div>
            <div className="rounded-2xl bg-surface-raised/80 p-3">
              <p className="text-[11px] text-muted">{t("deposit.wallet")}</p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground">
                {displayWallet ? shortenTonWalletAddress(displayWallet) : t("deposit.notConnected")}
              </p>
              {pendingDeposits > 0 && (
                <p className="mt-1 text-[11px] text-muted">
                  {t("deposit.pendingCount", { count: pendingDeposits })}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="section-label">{mode === "deposit" ? t("nav.deposit") : t("common.withdraw")}</p>
        </div>

        <div className="space-y-4 p-4">
          <TonWalletConnectControl />

          <div className="segment-control">
            <button
              type="button"
              onClick={() => switchMode("deposit")}
              className={cn("segment-item", mode === "deposit" && "segment-item-active")}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {t("deposit.tabDeposit")}
            </button>
            <button
              type="button"
              onClick={() => switchMode("withdraw")}
              className={cn("segment-item", mode === "withdraw" && "segment-item-active")}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              {t("deposit.tabWithdraw")}
            </button>
          </div>

          {mode === "deposit" ? (
            <div key="deposit" className="segment-panel space-y-3">
              <label className="block space-y-2">
                <span className="text-xs text-muted">{t("deposit.amountLabel")}</span>
                <input
                  value={depositAmount}
                  {...depositInput.bind({
                    onChange: (e) => setDepositAmount(e.target.value),
                  })}
                  inputMode="decimal"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-surface-raised px-3 text-sm tabular-nums outline-none focus:border-accent"
                  placeholder="1"
                />
              </label>

              <div className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4">
                <p className="text-xs leading-relaxed text-muted">
                  {t("deposit.minHint")}
                </p>
              </div>

              <Button className="h-11 w-full rounded-xl" disabled={loading} onClick={handleDeposit}>
                {loading ? t("deposit.sending") : t("deposit.viaWallet")}
              </Button>
            </div>
          ) : (
            <div key="withdraw" className="segment-panel space-y-3">
              <label className="block space-y-2">
                <span className="text-xs text-muted">{t("deposit.receiveLabel")}</span>
                <input
                  value={withdrawAmount}
                  {...withdrawInput.bind({
                    onChange: (e) => setWithdrawAmount(e.target.value),
                  })}
                  inputMode="decimal"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-surface-raised px-3 text-sm tabular-nums outline-none focus:border-accent"
                  placeholder="1"
                />
              </label>

              {nanotonFromTonInput(withdrawAmount) > 0 && (
                <div className="rounded-2xl bg-surface-raised/70 p-3 text-[11px] leading-relaxed text-muted">
                  <p>
                    {t("deposit.fee")}{" "}
                    <TonAmount
                      amount={formatTON(WITHDRAW_FEE_NANOTON)}
                      variant="brand"
                      iconClassName="h-3.5 w-3.5"
                    />
                  </p>
                  <p className="mt-1">
                    {t("deposit.debit")}{" "}
                    <TonAmount
                      amount={formatTON(withdrawDebitNanoton(nanotonFromTonInput(withdrawAmount)))}
                      variant="brand"
                      iconClassName="h-3.5 w-3.5"
                    />
                  </p>
                </div>
              )}

              <div className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4">
                <p className="text-xs leading-relaxed text-muted">
                  {t("deposit.available")}{" "}
                  <TonAmount
                    amount={user ? formatTON(user.betting_balance) : "—"}
                    variant="brand"
                    iconClassName="h-3.5 w-3.5"
                  />
                  {t("deposit.minReceive")}
                </p>
              </div>

              <Button
                className="h-11 w-full rounded-xl"
                disabled={loading}
                onClick={handleWithdraw}
              >
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
                {loading ? t("deposit.creatingRequest") : t("deposit.withdrawCta")}
              </Button>
            </div>
          )}

          {message && <WalletAlert message={message} />}
        </div>
      </section>

      {mode === "deposit" ? (
        <TransferHistory
          title={t("deposit.historyIn")}
          items={deposits}
          direction="deposit"
          emptyText={t("deposit.historyInEmpty")}
        />
      ) : (
        <TransferHistory
          title={t("deposit.historyOut")}
          items={withdrawals}
          direction="withdraw"
          emptyText={t("deposit.historyOutEmpty")}
        />
      )}
    </div>
  );
}
