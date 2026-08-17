"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TelegramAccessGate } from "./TelegramAccessGate";
import { MaintenanceGate } from "./MaintenanceGate";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { AuthProvider } from "./AuthProvider";
import { AdminAuthProvider } from "./AdminAuthProvider";
import { CasesFeaturesProvider } from "./CasesFeaturesProvider";
import { ToastProvider } from "./ToastProvider";
import { UserRealtimeProvider } from "./UserRealtimeProvider";
import { TelegramProvider } from "@/src/app/providers/TelegramProvider";
import { I18nProvider } from "./I18nProvider";
import { setRuntimeLocale } from "@/lib/i18n";

function AdminLocaleLock({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setRuntimeLocale("ru");
  }, []);
  return <>{children}</>;
}

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <TelegramAccessGate>
        <AuthProvider>
          <CasesFeaturesProvider>
            <MaintenanceGate>
              <ToastProvider>
                <UserRealtimeProvider>{children}</UserRealtimeProvider>
              </ToastProvider>
            </MaintenanceGate>
          </CasesFeaturesProvider>
        </AuthProvider>
      </TelegramAccessGate>
    </I18nProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <TelegramProvider>
      <AnalyticsProvider>
        {isAdmin ? (
          <I18nProvider lockedLocale="ru">
            <AdminLocaleLock>
              <AdminAuthProvider>
                <ToastProvider>{children}</ToastProvider>
              </AdminAuthProvider>
            </AdminLocaleLock>
          </I18nProvider>
        ) : (
          <AppProviders>{children}</AppProviders>
        )}
      </AnalyticsProvider>
    </TelegramProvider>
  );
}
