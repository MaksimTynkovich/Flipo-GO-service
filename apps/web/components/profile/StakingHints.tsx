"use client";

import { Eye, UserRound } from "lucide-react";

type Props = {
  showVisibilityHint?: boolean;
};

/** Compact tips for staking — one block instead of two heavy panels. */
export function StakingHints({ showVisibilityHint = true }: Props) {
  return (
    <div className="rounded-xl bg-surface-raised px-3.5 py-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <p className="text-xs leading-relaxed text-muted">
          Стейкать можно из профиля Telegram — без передачи боту.
        </p>
      </div>
      {showVisibilityHint ? (
        <div className="flex items-start gap-2.5">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Включите видимость подарков в профиле, иначе они не появятся здесь.
          </p>
        </div>
      ) : null}
    </div>
  );
}
