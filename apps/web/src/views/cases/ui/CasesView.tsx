"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { CasesCatalogScreen, CasesLobbySkeleton } from "@/components/cases/CasesCatalogScreen";
import { CasesLiveFeed } from "@/components/cases/CasesLiveFeed";
import { CasesQuestBanner } from "@/components/cases/CasesQuestBanner";
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

const LIVE_FEED_LIMIT = 24;

function dropTimeMs(drop: CaseLiveDrop): number {
  const ms = Date.parse(drop.created_at);
  return Number.isFinite(ms) ? ms : 0;
}

function prependLiveDrop(prev: CaseLiveDrop[], drop: CaseLiveDrop): CaseLiveDrop[] {
  if (prev.some((item) => item.open_id === drop.open_id)) return prev;
  return [drop, ...prev].slice(0, LIVE_FEED_LIMIT);
}

/** Merge HTTP snapshot with in-memory WS drops so reconnect refetch cannot wipe fresher events. */
function mergeLiveFeed(server: CaseLiveDrop[], local: CaseLiveDrop[]): CaseLiveDrop[] {
  const byId = new Map<string, CaseLiveDrop>();
  const consider = (drop: CaseLiveDrop | null | undefined) => {
    const id = drop?.open_id?.trim();
    if (!drop || !id) return;
    const prev = byId.get(id);
    if (!prev || dropTimeMs(drop) >= dropTimeMs(prev)) {
      byId.set(id, drop);
    }
  };
  for (const drop of local) consider(drop);
  for (const drop of server) consider(drop);
  return Array.from(byId.values())
    .sort((a, b) => dropTimeMs(b) - dropTimeMs(a))
    .slice(0, LIVE_FEED_LIMIT);
}

function parseLiveDrop(payload: unknown): CaseLiveDrop | null {
  let raw: unknown = payload;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const drop = raw as CaseLiveDrop;
  if (!drop.open_id?.trim()) return null;
  return drop;
}

export function CasesView() {
  const router = useRouter();
  const { casesVisible, ready: featuresReady } = useCasesFeatures();
  const { showToast } = useToast();
  const [data, setData] = useState<CasesCatalog | null>(null);
  const [live, setLive] = useState<CaseLiveDrop[]>([]);
  const [freshOpenId, setFreshOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!featuresReady) return;
    if (!casesVisible) {
      router.replace(APP_ROUTES.games);
    }
  }, [featuresReady, casesVisible, router]);

  const loadLive = useCallback(async () => {
    try {
      const feed = await getCasesLiveFeed();
      setLive((prev) => mergeLiveFeed(feed, prev));
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
      setLive((prev) => mergeLiveFeed(feed, prev));
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
        if (msg.event !== "drop") return;
        const drop = parseLiveDrop(msg.payload);
        if (!drop) return;
        setFreshOpenId(drop.open_id);
        setLive((prev) => prependLiveDrop(prev, drop));
      },
      { onOpen: () => void loadLive() },
    );
  }, [loadLive, featuresReady, casesVisible]);

  useEffect(() => {
    if (!freshOpenId) return;
    const t = window.setTimeout(() => setFreshOpenId(null), 2200);
    return () => window.clearTimeout(t);
  }, [freshOpenId]);

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

  if (loading && !data) {
    return (
      <PageShell flush>
        <CasesLobbySkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell flush>
      <div className="cases-lobby space-y-4 pb-2">
        {live.length > 0 ? (
          <CasesLiveFeed items={live} freshOpenId={freshOpenId} />
        ) : null}

        <CasesQuestBanner />

        {data ? <CasesCatalogScreen cases={cases} equalGrid /> : null}
      </div>
    </PageShell>
  );
}
