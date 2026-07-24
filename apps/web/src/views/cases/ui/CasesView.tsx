"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { CasesCatalogScreen } from "@/components/cases/CasesCatalogScreen";
import { CasesLiveFeed } from "@/components/cases/CasesLiveFeed";
import { useCasesFeatures } from "@/components/providers/CasesFeaturesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import {
  getCasesCatalog,
  getCasesLiveFeed,
  type CaseLiveDrop,
  type CaseView,
  type CasesCatalog,
} from "@/lib/api";
import { formatUserError } from "@/lib/user-errors";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { connectGameWS } from "@/lib/ws";

const LIVE_FEED_LIMIT = 6;

function prependLiveDrop(prev: CaseLiveDrop[], drop: CaseLiveDrop): CaseLiveDrop[] {
  if (prev.some((item) => item.open_id === drop.open_id)) return prev;
  return [drop, ...prev].slice(0, LIVE_FEED_LIMIT);
}

export function CasesView() {
  const router = useRouter();
  const { casesVisible, ready: featuresReady } = useCasesFeatures();
  const { showToast } = useToast();
  const [data, setData] = useState<CasesCatalog | null>(null);
  const [live, setLive] = useState<CaseLiveDrop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!featuresReady) return;
    if (!casesVisible) {
      router.replace(APP_ROUTES.games);
    }
  }, [featuresReady, casesVisible, router]);

  const loadLive = useCallback(async () => {
    try {
      setLive(await getCasesLiveFeed());
    } catch {
      /* keep current feed */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, feed] = await Promise.all([
        getCasesCatalog(),
        getCasesLiveFeed().catch(() => [] as CaseLiveDrop[]),
      ]);
      setData(catalog);
      setLive(feed);
    } catch (e) {
      showToast({
        variant: "error",
        title: formatUserError(e, "Не удалось загрузить кейсы"),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!featuresReady || !casesVisible) return;
    void load();
  }, [load, featuresReady, casesVisible]);

  useEffect(() => {
    if (!featuresReady || !casesVisible) return;
    return connectGameWS(
      "cases",
      (msg) => {
        if (msg.event !== "drop" || !msg.payload || typeof msg.payload !== "object") return;
        const drop = msg.payload as CaseLiveDrop;
        if (!drop.open_id) return;
        setLive((prev) => prependLiveDrop(prev, drop));
      },
      { onOpen: () => void loadLive() },
    );
  }, [loadLive, featuresReady, casesVisible]);

  if (!featuresReady || !casesVisible) {
    return null;
  }

  const cases: CaseView[] = data
    ? [
        ...data.featured,
        ...(data.daily ? [data.daily] : []),
        ...data.catalog,
      ]
    : [];

  return (
    <PageShell flush>
      <div className="space-y-4 pb-2">
        {live.length > 0 ? <CasesLiveFeed items={live} /> : null}

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        ) : null}

        {data ? (
          <CasesCatalogScreen
            cases={cases}
            bannersEnabled={Boolean(data.banners_enabled)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
