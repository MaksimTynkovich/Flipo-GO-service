"use client";

import { usePathname } from "next/navigation";
import { TelegramAccessGate } from "./TelegramAccessGate";
import { MaintenanceGate } from "./MaintenanceGate";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { AuthProvider } from "./AuthProvider";
import { AdminAuthProvider } from "./AdminAuthProvider";
import { ToastProvider } from "./ToastProvider";
import { UserRealtimeProvider } from "./UserRealtimeProvider";
import { TelegramProvider } from "@/src/app/providers/TelegramProvider";

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TelegramAccessGate>
      <AuthProvider>
        <MaintenanceGate>
          <ToastProvider>
            <UserRealtimeProvider>{children}</UserRealtimeProvider>
          </ToastProvider>
        </MaintenanceGate>
      </AuthProvider>
    </TelegramAccessGate>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <TelegramProvider>
      <AnalyticsProvider>
        {isAdmin ? (
          <AdminAuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AdminAuthProvider>
        ) : (
          <AppProviders>{children}</AppProviders>
        )}
      </AnalyticsProvider>
    </TelegramProvider>
  );
}
