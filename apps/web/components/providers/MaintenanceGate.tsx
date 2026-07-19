"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getMaintenanceStatus } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppSplashScreen } from "@/src/widgets/app-shell/ui/AppSplashScreen";
import { MaintenanceScreen } from "@/src/widgets/maintenance/ui/MaintenanceScreen";

type GateState =
  | { status: "loading" }
  | { status: "open" }
  | { status: "maintenance"; message: string };

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminUser = Boolean(user?.is_admin);
  const bypass = isAdminRoute || isAdminUser;
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    if (bypass) {
      setState({ status: "open" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    getMaintenanceStatus()
      .then((data) => {
        if (cancelled) return;
        if (data.enabled) {
          setState({ status: "maintenance", message: data.message || "" });
          return;
        }
        setState({ status: "open" });
      })
      .catch(() => {
        // Fail open: don't lock users out if status probe fails.
        if (!cancelled) setState({ status: "open" });
      });

    return () => {
      cancelled = true;
    };
  }, [bypass]);

  // Poll while the app is open so turning maintenance on/off applies without reload.
  useEffect(() => {
    if (bypass) return;

    const timer = window.setInterval(() => {
      getMaintenanceStatus()
        .then((data) => {
          if (data.enabled) {
            setState({ status: "maintenance", message: data.message || "" });
          } else {
            setState({ status: "open" });
          }
        })
        .catch(() => {});
    }, 20_000);

    return () => window.clearInterval(timer);
  }, [bypass]);

  if (bypass) {
    return children;
  }

  if (state.status === "loading") {
    return <AppSplashScreen />;
  }

  if (state.status === "maintenance") {
    return <MaintenanceScreen message={state.message} />;
  }

  return children;
}
