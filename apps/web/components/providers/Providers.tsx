"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { AuthProvider } from "./AuthProvider";

const manifestUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/tonconnect-manifest.json`
    : "http://localhost:3000/tonconnect-manifest.json";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <AuthProvider>{children}</AuthProvider>
    </TonConnectUIProvider>
  );
}
