"use client";

import { TelegramProvider } from "@/src/app/providers/TelegramProvider";
import { TelegramAccessGate } from "./TelegramAccessGate";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { AuthProvider } from "./AuthProvider";
import { ToastProvider } from "./ToastProvider";
import { UserRealtimeProvider } from "./UserRealtimeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
