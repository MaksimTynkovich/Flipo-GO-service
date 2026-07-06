"use client";

import { TonConnectButton, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Button } from "@/components/ui/button";
import { formatTonWalletAddress } from "@/lib/wallet";
import { Unlink, Wallet } from "lucide-react";

export function TonWalletConnectControl() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddr = wallet?.account?.address;
  const displayWallet = connectedAddr ? formatTonWalletAddress(connectedAddr) : null;

  if (!displayWallet) {
    return (
      <div className="flex justify-center rounded-2xl bg-surface-raised/50 py-3 [&_button]:!rounded-xl">
        <TonConnectButton />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-surface-raised/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Telegram Wallet подключён</p>
          <p className="mt-1 break-all font-mono text-xs leading-relaxed text-muted">
            {displayWallet}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 rounded-xl text-xs"
          onClick={() => tonConnectUI.openModal()}
        >
          Сменить кошелёк
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl px-3 text-xs text-red-300"
          onClick={() => tonConnectUI.disconnect()}
        >
          <Unlink className="mr-1.5 h-3.5 w-3.5" />
          Отвязать
        </Button>
      </div>
    </div>
  );
}
