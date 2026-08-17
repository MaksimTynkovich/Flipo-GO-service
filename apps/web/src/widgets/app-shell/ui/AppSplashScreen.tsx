"use client";

import { useEffect, useState } from "react";
import { reportBootHang } from "@/lib/boot";
import { useT } from "@/components/providers/I18nProvider";

type AppSplashScreenProps = {
  /** When true, show reload CTA after slowMs (React already mounted but stuck on splash). */
  showRecovery?: boolean;
  slowMs?: number;
};

export function AppSplashScreen({ showRecovery = false, slowMs = 8000 }: AppSplashScreenProps) {
  const [slow, setSlow] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!showRecovery) return;
    const id = window.setTimeout(() => {
      setSlow(true);
      reportBootHang(`splash still visible after ${slowMs}ms`, { surface: "splash" });
    }, slowMs);
    return () => window.clearTimeout(id);
  }, [showRecovery, slowMs]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background px-6 pt-[var(--app-safe-top)] pb-[var(--app-safe-bottom)]"
      role="status"
      aria-live="polite"
      aria-label={t("splash.aria")}
    >
      {!slow ? (
        <div className="splash-brand">
          <div className="splash-loader" aria-hidden>
            <span className="splash-loader__ring" />
            <span className="splash-loader__ring splash-loader__ring--delayed" />
            <span className="splash-loader__core" />
          </div>
          <p className="splash-brand__mark">Flipo</p>
        </div>
      ) : (
        <>
          <p className="max-w-[280px] text-center text-[0.9375rem] leading-relaxed text-muted">
            {t("splash.slow")}
          </p>
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-accent px-6 py-3.5 text-[0.9375rem] font-semibold text-accent-foreground"
            onClick={() => {
              reportBootHang("splash_reload_clicked", { surface: "splash", action: "reload" });
              window.location.reload();
            }}
          >
            {t("splash.reload")}
          </button>
        </>
      )}
    </div>
  );
}
