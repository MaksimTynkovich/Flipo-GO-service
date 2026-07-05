"use client";

import { Package, UserRound } from "lucide-react";

export function StakingNoTransferHint() {
  return (
    <section className="panel space-y-3" aria-label="Стейкинг без передачи боту">
      <div className="flex items-start gap-3">
        <div className="icon-box h-9 w-9 shrink-0 rounded-xl">
          <UserRound className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="chip chip-accent">Без передачи</span>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Стейкать подарки можно сразу из профиля — без передачи боту.
          </p>
        </div>
      </div>

    </section>
  );
}
