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
  casesEnabled: boolean;
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
      // Keep last known / optimistic default so nav does not flicker off on blips.
      setCasesEnabled(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    void refresh();
  }, [authReady, user, refresh]);

  const value = useMemo(
    () => ({ casesEnabled, bannersEnabled, ready, refresh }),
    [casesEnabled, bannersEnabled, ready, refresh],
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
