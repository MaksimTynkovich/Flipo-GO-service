"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Shield, XCircle } from "lucide-react";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { getRoundProof, type RoundProof } from "@/lib/api";
import { verifyRoundProof } from "@/lib/provably-fair";
import { cn } from "@/lib/utils";

type Props = {
  roundId: string;
  gameType: string;
  title: string;
  onClose: () => void;
};

export function ProofModal({ roundId, gameType, title, onClose }: Props) {
  const [proof, setProof] = useState<RoundProof | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Let the sheet finish its enter animation before crypto/network work
    // so the slide stays smooth on mobile WebViews.
    const start = window.setTimeout(() => {
      getRoundProof(gameType, roundId)
        .then(async (data) => {
          if (cancelled) return;
          setProof(data);
          const ok = await verifyRoundProof(data);
          if (!cancelled) setVerified(ok);
        })
        .catch(() => {
          if (!cancelled) setProof(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [roundId, gameType]);

  return (
    <ModalOverlay onClose={onClose} analyticsModalId="proof_modal">
      {(close) => (
        <div className="sheet-panel proof-sheet relative mx-auto w-full max-w-lg">
          <div className="proof-sheet__handle" aria-hidden />

          <div className="flex items-start justify-between gap-3 px-4 pt-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="proof-sheet__icon">
                  <Shield className="h-4 w-4" />
                </span>
                <p className="text-base font-semibold tracking-tight">{title}</p>
              </div>
              <p className="mt-1 text-xs text-muted">
                Provably fair — независимая проверка раунда
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted transition-opacity active:opacity-70"
              onClick={close}
            >
              Закрыть
            </button>
          </div>

          <div className="mt-4 space-y-2 px-4">
            {loading ? (
              <>
                <div className="proof-sheet__status proof-sheet__status--pending">
                  <span className="proof-sheet__status-dot" />
                  Проверяем раунд…
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="proof-sheet__skeleton" />
                ))}
              </>
            ) : !proof ? (
              <div className="proof-sheet__status proof-sheet__status--fail">
                <XCircle className="h-4 w-4 shrink-0" />
                Proof недоступен для этого раунда
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "proof-sheet__status",
                    verified ? "proof-sheet__status--ok" : "proof-sheet__status--fail",
                  )}
                >
                  {verified ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0" />
                  )}
                  {verified === null
                    ? "—"
                    : verified
                      ? "Проверка пройдена"
                      : "Проверка не пройдена"}
                </div>

                <ProofRow label="Раунд" value={`#${proof.round_number}`} />
                <ProofRow label="Server seed hash" value={proof.server_seed_hash} mono />
                <ProofRow
                  label="Server seed"
                  value={proof.server_seed || "скрыт до завершения"}
                  mono
                />
                <ProofRow label="Client seed" value={proof.client_seed || "—"} mono />
                <ProofRow label="Nonce" value={String(proof.nonce)} />
                <ProofRow label="Результат" value={proof.result || "—"} emphasize />
              </>
            )}
          </div>

          <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <button type="button" className="proof-sheet__cta" onClick={close}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}

function ProofRow({
  label,
  value,
  mono,
  emphasize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="proof-sheet__row">
      <p className="proof-sheet__row-label">{label}</p>
      <p
        className={cn(
          "proof-sheet__row-value",
          mono && "font-mono text-[11px] leading-snug",
          emphasize && "font-semibold text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
