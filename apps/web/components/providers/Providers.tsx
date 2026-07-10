"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { TelegramProvider } from "@/src/app/providers/TelegramProvider";
import { TelegramAccessGate } from "./TelegramAccessGate";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { AuthProvider } from "./AuthProvider";
import { ToastProvider } from "./ToastProvider";
import { UserRealtimeProvider } from "./UserRealtimeProvider";

const manifestUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/tonconnect-manifest.json`
    : "http://localhost:3000/tonconnect-manifest.json";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <TelegramProvider>
        <AnalyticsProvider>
          <TelegramAccessGate>
            <AuthProvider>
              <ToastProvider>
                <UserRealtimeProvider>{children}</UserRealtimeProvider>
              </ToastProvider>
            </AuthProvider>
          </TelegramAccessGate>
        </AnalyticsProvider>
      </TelegramProvider>
    </TonConnectUIProvider>
  );
}
