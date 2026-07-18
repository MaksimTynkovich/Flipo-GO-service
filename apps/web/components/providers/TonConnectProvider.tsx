"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import type { ReactNode } from "react";

const manifestUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/tonconnect-manifest.json`
    : "/tonconnect-manifest.json";

/** TonConnect is heavy — mount only on deposit, not around the whole Mini App. */
export function TonConnectProvider({ children }: { children: ReactNode }) {
  return <TonConnectUIProvider manifestUrl={manifestUrl}>{children}</TonConnectUIProvider>;
}
