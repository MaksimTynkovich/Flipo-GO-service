"use client";

import { TelegramProvider } from "@/src/app/providers/TelegramProvider";
import { TelegramAccessGate } from "./TelegramAccessGate";
import { MaintenanceGate } from "./MaintenanceGate";
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
            <MaintenanceGate>
              <ToastProvider>
                <UserRealtimeProvider>{children}</UserRealtimeProvider>
              </ToastProvider>
            </MaintenanceGate>
          </AuthProvider>
        </TelegramAccessGate>
      </AnalyticsProvider>
    </TelegramProvider>
  );
}
