"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { depositGift, formatTON, updateWallet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ChevronLeft, Gift, Wallet } from "lucide-react";

type Tab = "ton" | "gifts";

function shortenAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function DepositSection() {
  const { user, setUser } = useAuth();
  const wallet = useTonWallet();
  const syncedWallet = useRef<string | null>(null);

  const [tab, setTab] = useState<Tab>("ton");
  const [txRef, setTxRef] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const connectedAddress = wallet?.account?.address ?? user?.ton_wallet;

  useEffect(() => {
    const addr = wallet?.account?.address;
    if (!addr || syncedWallet.current === addr || user?.ton_wallet === addr) {
      if (addr) syncedWallet.current = addr;
      return;
    }
    updateWallet(addr)
      .then(() => {
        syncedWallet.current = addr;
        if (user) setUser({ ...user, ton_wallet: addr });
      })
      .catch(() => {});
  }, [wallet?.account?.address, user, setUser]);

  async function handleGiftDeposit() {
    if (!txRef.trim()) return;
    setDepositing(true);
    setMsg(null);
    try {
      const item = await depositGift(txRef.trim());
      setMsg(`Подарок «${item.name}» зачислен в инвентарь`);
      setTxRef("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setDepositing(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: "ton", label: "TON кошелёк", icon: Wallet },
    { id: "gifts", label: "Подарки", icon: Gift },
  ];

  return (
    <div className="space-y-5">
      <Link
        href="/"
        className="-mt-1 inline-flex items-center gap-0.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Назад
      </Link>

      <div>
        <h1 className="text-xl font-bold">Пополнение</h1>
        <p className="mt-1 text-sm text-muted">Выбери способ зачисления средств</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-surface-raised p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors",
              tab === id ? "bg-surface text-foreground" : "text-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "ton" && (
        <div className="panel space-y-4">
          <div>
            <p className="section-label">Telegram Wallet</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Подключи кошелёк через Telegram — пополнение TON появится в следующем обновлении.
            </p>
          </div>

          <div className="flex justify-center [&_button]:!rounded-xl">
            <TonConnectButton />
          </div>

          {connectedAddress && (
            <div className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted">Подключён</p>
              <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
                {shortenAddress(connectedAddress)}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "gifts" && (
        <div className="panel space-y-4">
          <div>
            <p className="section-label">Подарки Telegram</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Передай collectible gift боту — он попадёт в инвентарь. Продай за TON или используй
              в играх.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-xs text-muted">
            <p>1. Отправь upgraded gift боту @flipo</p>
            <p className="mt-1">2. Вставь ссылку или slug подарка ниже</p>
          </div>

          <input
            className="input-field"
            placeholder="vintagecigar-22477"
            value={txRef}
            onChange={(e) => setTxRef(e.target.value)}
            disabled={depositing}
          />

          <Button
            variant="accent"
            className="w-full"
            disabled={depositing || !txRef.trim()}
            onClick={handleGiftDeposit}
          >
            {depositing ? "Проверяем…" : "Зачислить подарок"}
          </Button>

          {msg && (
            <p
              className={cn(
                "text-center text-xs",
                msg.startsWith("Подарок") ? "text-success" : "text-danger",
              )}
            >
              {msg}
            </p>
          )}

          <p className="text-center text-[11px] text-muted">
            Оценка и зачисление на баланс —{" "}
            <Link href="/profile/inventory" className="text-accent">
              инвентарь
            </Link>
            , продажа от {formatTON(100_000_000)} TON
          </p>
        </div>
      )}
    </div>
  );
}
