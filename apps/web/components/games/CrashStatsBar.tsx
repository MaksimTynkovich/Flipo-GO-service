"use client";

import { formatTON } from "@/lib/api";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";

type Props = {
  balanceNanoton?: number;
  roundNumber?: number;
  serverSeedHash?: string;
  className?: string;
};

function IconWallet() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V9h-3.5a3 3 0 1 0 0 6H21v1.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="17.5" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 19c.5-2.8 2.8-4.5 5.5-4.5s5 1.7 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M14.5 19c.4-1.8 1.8-3 3.5-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 5 6v5.5c0 4.1 3 7.9 7 8.5 4-.6 7-4.4 7-8.5V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CrashStatsBar({
  balanceNanoton,
  roundNumber,
  serverSeedHash,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground">
          <span className="text-muted">
            <IconWallet />
          </span>
          <TonAmount amount={balanceNanoton != null ? formatTON(balanceNanoton) : "—"} />
        </div>
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <IconUsers />
          <span className="tabular-nums text-foreground">#{roundNumber ?? "—"}</span>
        </div>
      </div>

      {serverSeedHash ? (
        <button
          type="button"
          title={`Provably fair: ${serverSeedHash.slice(0, 16)}…`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-success"
        >
          <IconShield />
        </button>
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-muted/50">
          <IconShield />
        </div>
      )}
    </div>
  );
}
