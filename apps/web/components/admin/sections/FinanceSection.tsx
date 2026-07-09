"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { AdminButton, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
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

export default function FinanceSection() {
  const { showToast } = useToast();
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [ledger, setLedger] = useState<AdminLedgerEntry[]>([]);
  const [treasury, setTreasury] = useState<AdminTreasuryStatus | null>(null);
  const [note, setNote] = useState("approved by admin");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [transferData, ledgerData, treasuryData] = await loadCached("admin:finance", () =>
      Promise.all([getAdminTransfers(), getAdminLedger(), getAdminTreasuryStatus()]),
    );
    setTransfers(transferData);
    setLedger(ledgerData);
    setTreasury(treasuryData);
    primeCache("admin:finance", [transferData, ledgerData, treasuryData]);
    setLoading(false);
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<[WalletTransfer[], AdminLedgerEntry[], AdminTreasuryStatus]>("admin:finance");
      if (cached) {
        setTransfers(cached[0]);
        setLedger(cached[1]);
        setTreasury(cached[2]);
      }
      load().catch(() => {});
    });
  }, []);

  const reviewQueue = useMemo(
    () => transfers.filter((t) => t.status === "pending_review"),
    [transfers],
  );

  return (
    <PageShell title="Финансы" description="Кошельки проекта, журнал операций и ручная проверка выводов.">
      {treasury ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Hot balance" value={`${formatTON(treasury.hot_balance_nanoton ?? 0)} TON`} hint="Сколько TON сейчас лежит в горячем кошельке для быстрых депозитов и выводов." />
          <Stat label="Hot wallet" value={treasury.hot_wallet_address || "—"} hint="Горячий кошелёк проекта. Используется для текущих операций и потому считается операционно рискованнее." />
          <Stat label="Cold wallet" value={treasury.cold_wallet_address || "не задан"} hint="Холодный кошелёк для хранения резерва. Обычно туда уводят излишек средств из hot wallet." />
          <Stat label="Pending liability" value={`${formatTON(treasury.pending_liability_nanoton)} TON`} hint="Обязательства перед пользователями, которые ещё не закрыты: pending и queued выводы, требующие покрытия." />
          <Stat label="Sweep needed" value={treasury.requires_sweep ? "Да" : "Нет"} hint="Нужно ли перевести излишек средств из hot wallet в cold wallet по текущим лимитам." />
        </section>
      ) : loading ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="panel space-y-2 p-3">
              <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
              <div className="h-5 w-full animate-pulse rounded bg-surface-raised" />
            </div>
          ))}
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
                <AdminToolbar className="shrink-0">
                  <AdminButton
                    onClick={async () => {
                      await reviewAdminTransfer(transfer.id, true, note);
                      showToast({ variant: "success", title: "Вывод одобрен" });
                      await load();
                    }}
                  >
                    Approve
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    onClick={async () => {
                      await reviewAdminTransfer(transfer.id, false, note);
                      showToast({ variant: "success", title: "Вывод отклонён" });
                      await load();
                    }}
                  >
                    Reject
                  </AdminButton>
                </AdminToolbar>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel space-y-1 p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted">{label}</p>
        {hint ? <AdminInfoHint label={label} hint={hint} /> : null}
      </div>
      <p className="break-all text-sm font-semibold">{value}</p>
    </div>
  );
}
