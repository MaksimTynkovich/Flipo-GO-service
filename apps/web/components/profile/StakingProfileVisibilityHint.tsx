"use client";

import { Eye } from "lucide-react";

export function StakingProfileVisibilityHint() {
  return (
    <section className="panel flex items-start gap-3" aria-label="Видимость подарков в профиле">
      <div className="icon-box h-9 w-9 shrink-0 rounded-xl">
        <Eye className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="chip chip-accent">Важно</span>
        <p className="mt-2 text-sm font-semibold leading-snug text-foreground">
          Включи видимость подарков в профиле
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Без этого подарки из профиля не появятся в стейкинге.
        </p>
      </div>
    </section>
  );
}
