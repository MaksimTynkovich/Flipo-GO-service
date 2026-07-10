"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { getRoundProof, type RoundProof } from "@/lib/api";
import { verifyRoundProof } from "@/lib/provably-fair";

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
    getRoundProof(gameType, roundId)
      .then(async (data) => {
        setProof(data);
        setVerified(await verifyRoundProof(data));
      })
      .catch(() => setProof(null))
      .finally(() => setLoading(false));
  }, [roundId, gameType]);

  return (
    <ModalOverlay onClose={onClose} analyticsModalId="proof_modal">
      {(close) => (
        <div className="sheet-panel relative mx-auto w-full max-w-lg space-y-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold">{title}</p>
              <p className="mt-1 text-xs text-muted">Provably fair — проверка честности раунда</p>
            </div>
            <button className="text-sm text-muted transition-opacity active:opacity-70" onClick={close}>
              Закрыть
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-muted">Загрузка proof…</p>
          ) : !proof ? (
            <p className="text-sm text-muted">Proof недоступен для этого раунда.</p>
          ) : (
            <div className="space-y-2 text-xs">
              <ProofRow label="Раунд" value={`#${proof.round_number}`} />
              <ProofRow label="Server seed hash" value={proof.server_seed_hash} mono />
              <ProofRow label="Server seed" value={proof.server_seed || "скрыт до завершения"} mono />
              <ProofRow label="Client seed" value={proof.client_seed || "—"} mono />
              <ProofRow label="Nonce" value={String(proof.nonce)} />
              <ProofRow label="Результат" value={proof.result || "—"} />
              <div
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  verified ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" : "bg-danger/15 text-danger"
                }`}
              >
                {verified === null ? "—" : verified ? "Проверка пройдена" : "Проверка не пройдена"}
              </div>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={close}>
            Понятно
          </Button>
        </div>
      )}
    </ModalOverlay>
  );
}

function ProofRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-raised/50 px-3 py-2">
      <p className="text-[10px] uppercase text-muted">{label}</p>
      <p className={`mt-1 break-all text-foreground ${mono ? "font-mono text-[11px]" : ""}`}>{value}</p>
    </div>
  );
}
