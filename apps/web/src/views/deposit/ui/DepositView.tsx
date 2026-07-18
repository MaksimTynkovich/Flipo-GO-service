"use client";

import { DepositSection } from "@/components/deposit/DepositSection";
import { TonConnectProvider } from "@/components/providers/TonConnectProvider";

export function DepositView() {
  return (
    <TonConnectProvider>
      <DepositSection />
    </TonConnectProvider>
  );
}
