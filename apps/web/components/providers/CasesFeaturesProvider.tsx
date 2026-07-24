"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCasesFeatures } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";

type CasesFeaturesState = {
  /** Platform flag from admin settings (false when section is turned off for players). */
  casesEnabled: boolean;
  /** Whether the current user should see cases (admins always true). */
  casesVisible: boolean;
  bannersEnabled: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
};

const CasesFeaturesContext = createContext<CasesFeaturesState | null>(null);

export function CasesFeaturesProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, user } = useAuth();
  const [casesEnabled, setCasesEnabled] = useState(true);
  const [bannersEnabled, setBannersEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const features = await getCasesFeatures();
      setCasesEnabled(Boolean(features.enabled));
      setBannersEnabled(Boolean(features.banners_enabled));
    } catch {
      // Keep last known value — do not force-enable on transient errors.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    void refresh();
  }, [authReady, user, refresh]);

  useEffect(() => {
    if (!authReady || !user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authReady, user, refresh]);

  const casesVisible = Boolean(user?.is_admin) || casesEnabled;

  const value = useMemo(
    () => ({ casesEnabled, casesVisible, bannersEnabled, ready, refresh }),
    [casesEnabled, casesVisible, bannersEnabled, ready, refresh],
  );

  return (
    <CasesFeaturesContext.Provider value={value}>{children}</CasesFeaturesContext.Provider>
  );
}

export function useCasesFeatures() {
  const ctx = useContext(CasesFeaturesContext);
  if (!ctx) {
    throw new Error("useCasesFeatures must be used within CasesFeaturesProvider");
  }
  return ctx;
}
