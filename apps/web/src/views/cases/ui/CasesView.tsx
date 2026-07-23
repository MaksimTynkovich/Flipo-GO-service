"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { CasesCatalogScreen } from "@/components/cases/CasesCatalogScreen";
import { getCasesCatalog, type CaseView, type CasesCatalog } from "@/lib/api";
import { formatUserError } from "@/lib/user-errors";

export function CasesView() {
  const [data, setData] = useState<CasesCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCasesCatalog());
    } catch (e) {
      setError(formatUserError(e, "Не удалось загрузить кейсы"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cases: CaseView[] = data
    ? [
        ...data.featured,
        ...(data.daily ? [data.daily] : []),
        ...data.catalog,
      ]
    : [];

  return (
    <PageShell flush>
      <div className="space-y-5 pb-2">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

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
