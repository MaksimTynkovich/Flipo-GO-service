"use client";

import { useEffect, useState } from "react";
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
import { encodeTonCommentPayload, nanotonFromTonInput, newIdempotencyKey, sleep, WITHDRAW_FEE_NANOTON, withdrawDebitNanoton } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, History, Wallet } from "lucide-react";

function shortenAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "awaiting_payment":
      return "Ожидает оплату";
    case "queued":
      return "В очереди";
    case "broadcasting":
      return "Отправляется";
    case "completed":
      return "Завершено";
    case "failed":
      return "Ошибка";
    case "expired":
      return "Истекло";
    default:
      return status;
  }
}

export function TonWalletPanel() {
  const { user, setUser } = useAuth();
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  const [depositAmount, setDepositAmount] = useState("1");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);

  const connectedAddress = wallet?.account?.address ?? user?.ton_wallet;

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
    const hasPending = transfers.some((item) => item.status === "awaiting_payment");
    if (!hasPending) return;

    const timer = setInterval(() => {
      refreshTransfers().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [transfers.some((item) => item.status === "awaiting_payment")]);

  async function refreshTransfers() {
    try {
      setTransfers(await getWalletTransfers());
    } catch {
      setTransfers([]);
    }
  }

  async function handleDeposit() {
    setMessage(null);
    const amountNanoton = nanotonFromTonInput(depositAmount);
    if (amountNanoton <= 0) {
      setMessage("Введите сумму пополнения");
      return;
    }
    if (!connectedAddress) {
      setMessage("Сначала подключи кошелёк");
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
        setMessage("Пополнение зачислено на баланс.");
      } else if (confirm.transfer.status === "awaiting_payment") {
        setMessage("Платёж отправлен. Зачисление появится в течение минуты — обнови страницу.");
      } else {
        setMessage(`Статус пополнения: ${statusLabel(confirm.transfer.status)}`);
      }
      await refreshTransfers();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось отправить пополнение");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    setMessage(null);
    const amountNanoton = nanotonFromTonInput(withdrawAmount);
    if (amountNanoton <= 0) {
      setMessage("Введите сумму вывода");
      return;
    }
    if (!connectedAddress) {
      setMessage("Сначала подключи кошелёк");
      return;
    }

    setLoading(true);
    try {
      const result = await requestWalletWithdraw(amountNanoton, newIdempotencyKey("withdraw"));
      if (user) setUser({ ...user, betting_balance: result.balance });
      setMessage("Заявка на вывод создана. Средства отправятся на подключённый кошелёк.");
      await refreshTransfers();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось создать вывод");
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
            onClick={() => setMode("deposit")}
            className={cn("segment-item", mode === "deposit" && "segment-item-active")}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Пополнить
          </button>
          <button
            type="button"
            onClick={() => setMode("withdraw")}
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

        {message && <p className="text-xs leading-relaxed text-muted">{message}</p>}
      </div>

      {transfers.length > 0 && (
        <div className="panel space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted" />
            <p className="section-label">История операций</p>
          </div>
          <div className="space-y-2">
            {transfers.slice(0, 8).map((item) => (
              <div key={item.id} className="stat-tile flex items-center justify-between gap-3 text-left">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {item.direction === "deposit" ? "Пополнение" : "Вывод"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {statusLabel(item.status)}
                    {item.direction === "withdraw" && item.fee_nanoton > 0
                      ? ` · комиссия ${formatTON(item.fee_nanoton)}`
                      : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-success">
                  {item.direction === "deposit" ? "+" : "−"}
                  {formatTON(item.direction === "withdraw" ? item.net_nanoton : item.amount_nanoton)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
