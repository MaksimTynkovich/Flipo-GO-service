"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getMaintenanceStatus } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppSplashScreen } from "@/src/widgets/app-shell/ui/AppSplashScreen";
import { MaintenanceScreen } from "@/src/widgets/maintenance/ui/MaintenanceScreen";

type GateState =
  | { status: "loading" }
  | { status: "open" }
  | { status: "maintenance"; message: string };

type BettingStatus = {
  /** When false, new crash/roulette/pvp bets are rejected; cashouts still work. */
  acceptBets: boolean;
};

const BettingStatusContext = createContext<BettingStatus>({ acceptBets: true });

export function useAcceptBets() {
  return useContext(BettingStatusContext).acceptBets;
}

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminUser = Boolean(user?.is_admin);
  const bypass = isAdminRoute || isAdminUser;
  const [state, setState] = useState<GateState>({ status: "loading" });
  const [acceptBets, setAcceptBets] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const apply = (data: { enabled: boolean; accept_bets?: boolean; message: string }) => {
      if (cancelled) return;
      setAcceptBets(data.accept_bets !== false);
      if (bypass) {
        setState({ status: "open" });
        return;
      }
      if (data.enabled) {
        setState({ status: "maintenance", message: data.message || "" });
        return;
      }
      setState({ status: "open" });
    };

    if (!bypass) {
      setState({ status: "loading" });
    }

    getMaintenanceStatus()
      .then(apply)
      .catch(() => {
        // Fail open: don't lock users out if status probe fails.
        if (!cancelled) {
          setAcceptBets(true);
          setState({ status: "open" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bypass]);

  // Poll while the app is open so turning maintenance / bet pause on/off applies without reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      getMaintenanceStatus()
        .then((data) => {
          setAcceptBets(data.accept_bets !== false);
          if (bypass) return;
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

  const bettingValue = useMemo(() => ({ acceptBets }), [acceptBets]);

  if (!bypass && state.status === "loading") {
    return <AppSplashScreen />;
  }

  if (!bypass && state.status === "maintenance") {
    return <MaintenanceScreen message={state.message} />;
  }

  return (
    <BettingStatusContext.Provider value={bettingValue}>{children}</BettingStatusContext.Provider>
  );
}
