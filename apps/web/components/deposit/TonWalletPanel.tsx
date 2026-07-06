"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsConnectionRestored, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { TonWalletConnectControl } from "@/components/deposit/TonWalletConnectControl";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  confirmWalletDeposit,
  createWalletDepositIntent,
  clearWallet,
  formatTON,
  getWalletTransfers,
  requestWalletWithdraw,
  updateWallet,
  WalletTransfer,
} from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { Button } from "@/components/ui/button";
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
                    {direction === "deposit" ? "С" : "На"}:{" "}
                    {shortenTonWalletAddress(item.wallet_address)}
                  </p>
                ) : null}
                {item.status === "failed" && item.error_message ? (
                  <p className="mt-0.5 text-xs text-muted">Не удалось завершить</p>
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
    if (!hasPendingDeposit) return;

    const timer = setInterval(() => {
      refreshTransfers().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [deposits]);

  async function refreshTransfers() {
    try {
      setTransfers(await getWalletTransfers());
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
      setMessage({ type: "error", text: "Введи сумму пополнения." });
      return;
    }
    if (amountNanoton < MIN_TRANSFER_NANOTON) {
      setMessage({ type: "error", text: "Минимальное пополнение — 0.1 TON." });
      return;
    }
    if (!isWalletConnected) {
      setMessage({ type: "error", text: "Сначала подключи TON-кошелёк." });
      return;
    }

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
        if (user) setUser({ ...user, betting_balance: confirm.balance });
        setMessage({ type: "success", text: "Пополнение зачислено на баланс." });
      } else if (confirm.transfer.status === "awaiting_payment") {
        setMessage({
          type: "info",
          text: "Платёж отправлен. Зачисление появится в течение минуты — статус обновится в истории пополнений.",
        });
      } else if (confirm.transfer.status === "expired") {
        setMessage({ type: "error", text: "Время на оплату истекло. Создай новое пополнение." });
      } else {
        setMessage({
          type: "info",
          text: `Статус пополнения: ${walletStatusLabel(confirm.transfer.status)}.`,
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
      setMessage({ type: "error", text: "Введи сумму, которую хочешь получить на кошелёк." });
      return;
    }
    if (receiveNanoton < MIN_TRANSFER_NANOTON) {
      setMessage({ type: "error", text: "Минимальная сумма вывода на кошелёк — 0.1 TON." });
      return;
    }
    if (!isWalletConnected) {
      setMessage({ type: "error", text: "Сначала подключи TON-кошелёк." });
      return;
    }
    const debitNanoton = withdrawDebitNanoton(receiveNanoton);
    if (user && user.betting_balance < debitNanoton) {
      setMessage({
        type: "error",
        text: `Недостаточно средств. Нужно ${formatTON(debitNanoton)} с учётом комиссии ${formatTON(WITHDRAW_FEE_NANOTON)}.`,
      });
      return;
    }

    setLoading(true);
    try {
      const result = await requestWalletWithdraw(receiveNanoton, newIdempotencyKey("withdraw"));
      if (user) setUser({ ...user, betting_balance: result.balance });
      setMessage({
        type: "success",
        text: `Вывод создан. На кошелёк придёт ${formatTON(receiveNanoton)}.`,
      });
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
                  Пополняй и выводи TON напрямую
                </p>
                <p className="text-sm leading-relaxed text-muted">
                  Подключите свой TON Wallet для доступа ко всем возможностям пополнения и вывода средств. Баланс и история операций будут отображаться здесь после подключения.
             
                </p>
              </div>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
              <Wallet className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface-raised/80 p-3">
              <p className="text-[11px] text-muted">Баланс</p>
              <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
                <TonAmount
                  amount={user ? formatTON(user.betting_balance) : "—"}
                  variant="brand"
                  iconClassName="h-5 w-5"
                />
              </div>
            </div>
            <div className="rounded-2xl bg-surface-raised/80 p-3">
              <p className="text-[11px] text-muted">Кошелёк</p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground">
                {displayWallet ? shortenTonWalletAddress(displayWallet) : "Не подключён"}
              </p>
              {pendingDeposits > 0 && (
                <p className="mt-1 text-[11px] text-muted">
                  {pendingDeposits} в обработке
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="section-label">{mode === "deposit" ? "Пополнение" : "Вывод"}</p>
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
              Пополнить
            </button>
            <button
              type="button"
              onClick={() => switchMode("withdraw")}
              className={cn("segment-item", mode === "withdraw" && "segment-item-active")}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Вывести
            </button>
          </div>

          {mode === "deposit" ? (
            <div className="space-y-3">
              <label className="block space-y-2">
                <span className="text-xs text-muted">Сумма пополнения</span>
                <input
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  inputMode="decimal"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-surface-raised px-3 text-sm tabular-nums outline-none focus:border-accent"
                  placeholder="1"
                />
              </label>

              <div className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4">
                <p className="text-xs leading-relaxed text-muted">
                  Минимум — 0.1 TON. После подтверждения в кошельке зачисление появится на балансе
                  автоматически.
                </p>
              </div>

              <Button className="h-11 w-full rounded-xl" disabled={loading} onClick={handleDeposit}>
                {loading ? "Отправляем…" : "Пополнить через кошелёк"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-2">
                <span className="text-xs text-muted">Сколько получить на кошелёк</span>
                <input
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  inputMode="decimal"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-surface-raised px-3 text-sm tabular-nums outline-none focus:border-accent"
                  placeholder="1"
                />
              </label>

              {nanotonFromTonInput(withdrawAmount) > 0 && (
                <div className="rounded-2xl bg-surface-raised/70 p-3 text-[11px] leading-relaxed text-muted">
                  <p>
                    Комиссия сервиса:{" "}
                    <TonAmount
                      amount={formatTON(WITHDRAW_FEE_NANOTON)}
                      variant="brand"
                      iconClassName="h-3.5 w-3.5"
                    />
                  </p>
                  <p className="mt-1">
                    С баланса спишется:{" "}
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
                  Доступно{" "}
                  <TonAmount
                    amount={user ? formatTON(user.betting_balance) : "—"}
                    variant="brand"
                    iconClassName="h-3.5 w-3.5"
                  />
                  . Минимум к получению — 0.1 TON.
                </p>
              </div>

              <Button
                className="h-11 w-full rounded-xl shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_28%,transparent)]"
                disabled={loading}
                onClick={handleWithdraw}
              >
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
                {loading ? "Создаём заявку…" : "Вывести на кошелёк"}
              </Button>
            </div>
          )}

          {message && <WalletAlert message={message} />}
        </div>
      </section>

      {mode === "deposit" ? (
        <TransferHistory
          title="История пополнений"
          items={deposits}
          direction="deposit"
          emptyText="Пополнений пока не было."
        />
      ) : (
        <TransferHistory
          title="История выводов"
          items={withdrawals}
          direction="withdraw"
          emptyText="Выводов пока не было."
        />
      )}
    </div>
  );
}
