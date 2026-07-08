"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/components/providers/ToastProvider";
import {
  formatTON,
  getAdminLedger,
  getAdminTransfers,
  getAdminTreasuryStatus,
  reviewAdminTransfer,
  type AdminLedgerEntry,
  type AdminTreasuryStatus,
  type WalletTransfer,
} from "@/lib/api";

export default function AdminFinancePage() {
  const { showToast } = useToast();
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [ledger, setLedger] = useState<AdminLedgerEntry[]>([]);
  const [treasury, setTreasury] = useState<AdminTreasuryStatus | null>(null);
  const [note, setNote] = useState("approved by admin");

  async function load() {
    const [transferData, ledgerData, treasuryData] = await Promise.all([
      getAdminTransfers(),
      getAdminLedger(),
      getAdminTreasuryStatus(),
    ]);
    setTransfers(transferData);
    setLedger(ledgerData);
    setTreasury(treasuryData);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const reviewQueue = useMemo(
    () => transfers.filter((t) => t.status === "pending_review"),
    [transfers],
  );

  return (
    <PageShell title="Финансы" description="TON транзакции, hot/cold кошельки и ручная проверка выводов.">
      {treasury ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Hot balance" value={`${formatTON(treasury.hot_balance_nanoton ?? 0)} TON`} />
          <Stat label="Hot wallet" value={treasury.hot_wallet_address || "—"} />
          <Stat label="Cold wallet" value={treasury.cold_wallet_address || "не задан"} />
          <Stat label="Pending liability" value={`${formatTON(treasury.pending_liability_nanoton)} TON`} />
          <Stat label="Sweep needed" value={treasury.requires_sweep ? "Да" : "Нет"} />
        </section>
      ) : null}

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Очередь ручной проверки ({reviewQueue.length})</p>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="input-field" placeholder="Комментарий" />
        {reviewQueue.length === 0 ? (
          <p className="text-sm text-muted">Нет выводов на review.</p>
        ) : (
          reviewQueue.map((transfer) => (
            <div key={transfer.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{formatTON(transfer.net_nanoton)} TON</p>
                  <p className="mt-1 break-all text-xs text-muted">{transfer.wallet_address}</p>
                  <p className="mt-1 text-xs text-muted">
                    {transfer.review_reason || transfer.risk_flags?.join(", ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="quick-amount quick-amount-active"
                    onClick={async () => {
                      await reviewAdminTransfer(transfer.id, true, note);
                      showToast({ variant: "success", title: "Вывод одобрен" });
                      await load();
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="quick-amount"
                    onClick={async () => {
                      await reviewAdminTransfer(transfer.id, false, note);
                      showToast({ variant: "success", title: "Вывод отклонён" });
                      await load();
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="panel space-y-2">
          <p className="text-base font-semibold">Последние транзакции</p>
          {transfers.slice(0, 12).map((t) => (
            <div key={t.id} className="rounded-xl bg-surface-raised/50 px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="uppercase">{t.status}</span>
                <span className="font-semibold">{formatTON(t.net_nanoton)} TON</span>
              </div>
            </div>
          ))}
        </div>
        <div className="panel space-y-2">
          <p className="text-base font-semibold">Ledger</p>
          {ledger.slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex justify-between rounded-xl bg-surface-raised/50 px-3 py-2 text-xs">
              <span>{entry.type}</span>
              <span className="font-semibold">{formatTON(entry.amount_nanoton)} TON</span>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel space-y-1 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="break-all text-sm font-semibold">{value}</p>
    </div>
  );
}
