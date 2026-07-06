"use client";

import { useEffect, useMemo, useState } from "react";
import { TonConnectButton, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  confirmWalletDeposit,
  createWalletDepositIntent,
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
  MIN_TRANSFER_NANOTON,
  nanotonFromTonInput,
  newIdempotencyKey,
  sleep,
  WITHDRAW_FEE_NANOTON,
  withdrawDebitNanoton,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, History, Wallet } from "lucide-react";

function shortenAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function WalletAlert({ message }: { message: WalletMessage }) {
  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2.5 text-xs leading-relaxed",
        message.type === "error" && "bg-red-500/10 text-red-300",
        message.type === "success" && "bg-success/10 text-success",
        message.type === "info" && "bg-surface-raised text-muted",
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
    <div className="panel space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted" />
        <p className="section-label">{title}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="stat-tile flex items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <p className="text-xs text-muted">{formatTransferDate(item.created_at)}</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {walletStatusLabel(item.status)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {item.direction === "withdraw" && item.fee_nanoton > 0
                    ? `Комиссия ${formatTON(item.fee_nanoton)}`
                    : null}
                  {item.status === "failed" && item.error_message
                    ? " · Не удалось завершить"
                    : null}
                </p>
              </div>
              <p
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  direction === "deposit" ? "text-success" : "text-foreground",
                )}
              >
                {direction === "deposit" ? "+" : "−"}
                {formatTON(direction === "withdraw" ? item.net_nanoton : item.amount_nanoton)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TonWalletPanel() {
  const { user, setUser } = useAuth();
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  const [depositAmount, setDepositAmount] = useState("1");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<WalletMessage | null>(null);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);

  const connectedAddress = wallet?.account?.address ?? user?.ton_wallet;
  const deposits = useMemo(
    () => transfers.filter((item) => item.direction === "deposit"),
    [transfers],
  );
  const withdrawals = useMemo(
    () => transfers.filter((item) => item.direction === "withdraw"),
    [transfers],
  );

  useEffect(() => {
    const addr = wallet?.account?.address;
    if (!addr || user?.ton_wallet === addr) return;
    updateWallet(addr)
      .then((res) => {
        if (user) setUser({ ...user, ton_wallet: res.wallet });
      })
      .catch(() => {});
  }, [wallet?.account?.address, user, setUser]);

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
    if (!connectedAddress) {
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
    if (!connectedAddress) {
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
    <div className="space-y-4">
      <div className="panel space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label">TON кошелёк</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Подключи Telegram Wallet и пополняй или выводи TON напрямую. Все операции проходят
              через защищённый контур с защитой от повторных списаний.
            </p>
          </div>
          <div className="icon-box h-10 w-10 shrink-0 rounded-xl">
            <Wallet className="h-4 w-4" />
          </div>
        </div>

        <div className="flex justify-center [&_button]:!rounded-xl">
          <TonConnectButton />
        </div>

        {connectedAddress && (
          <div className="surface-inset px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted">Подключён</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
              {shortenAddress(connectedAddress)}
            </p>
          </div>
        )}

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
            <p className="text-[11px] leading-relaxed text-muted">Минимум — 0.1 TON.</p>
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
              <div className="surface-inset space-y-1 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                <p>
                  Комиссия сервиса:{" "}
                  <TonAmount amount={formatTON(WITHDRAW_FEE_NANOTON)} variant="brand" iconClassName="h-3.5 w-3.5" />
                </p>
                <p>
                  С баланса спишется:{" "}
                  <TonAmount
                    amount={formatTON(withdrawDebitNanoton(nanotonFromTonInput(withdrawAmount)))}
                    variant="brand"
                    iconClassName="h-3.5 w-3.5"
                  />
                </p>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-muted">
              Доступно:{" "}
              <TonAmount
                amount={user ? formatTON(user.betting_balance) : "—"}
                variant="brand"
                iconClassName="h-4 w-4"
              />
              . Минимум к получению — 0.1 TON.
            </p>
            <Button
              className="h-11 w-full rounded-xl"
              variant="outline"
              disabled={loading}
              onClick={handleWithdraw}
            >
              {loading ? "Создаём заявку…" : "Вывести на кошелёк"}
            </Button>
          </div>
        )}

        {message && <WalletAlert message={message} />}
      </div>

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
