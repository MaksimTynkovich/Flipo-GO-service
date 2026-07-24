"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage, AdminButton, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  fulfillAdminGiftWithdrawal,
  getAdminPendingGiftWithdrawals,
  getAdminTransfers,
  getAdminTreasuryStatus,
  reviewAdminGiftWithdrawal,
  reviewAdminTransfer,
  type AdminPendingGiftWithdraw,
  type AdminTreasuryStatus,
  type WalletTransfer,
} from "@/lib/api";

type FinancePayload = [
  WalletTransfer[],
  AdminTreasuryStatus,
  AdminPendingGiftWithdraw[],
];

export default function FinanceSection() {
  const { showToast } = useToast();
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [treasury, setTreasury] = useState<AdminTreasuryStatus | null>(null);
  const [giftQueue, setGiftQueue] = useState<AdminPendingGiftWithdraw[]>([]);
  const [reviewNote, setReviewNote] = useState("одобрено админом");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [transferData, treasuryData, giftData] = await loadCached(
      "admin:operations:v1",
      () =>
        Promise.all([
          getAdminTransfers(),
          getAdminTreasuryStatus(),
          getAdminPendingGiftWithdrawals(),
        ]),
    );
    setTransfers(transferData);
    setTreasury(treasuryData);
    setGiftQueue(giftData);
    primeCache("admin:operations:v1", [transferData, treasuryData, giftData]);
    setLoading(false);
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<FinancePayload>("admin:operations:v1");
      if (cached) {
        setTransfers(cached[0]);
        setTreasury(cached[1]);
        setGiftQueue(cached[2]);
      }
      load().catch(() => {});
    });
  }, []);

  const reviewQueue = useMemo(
    () => transfers.filter((t) => t.status === "pending_review"),
    [transfers],
  );

  return (
    <AdminPage
      title="Операции"
      description="Ручная обработка выводов и контроль текущих обязательств проекта."
    >
      {treasury ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="TON на проверке"
            value={String(reviewQueue.length)}
            hint="Выводы, которые ждут решения администратора."
          />
          <Stat
            label="Подарков в очереди"
            value={String(giftQueue.length)}
            hint="Заявки на вывод подарков, включая закупку и ручную отправку."
          />
          <Stat
            label="Pending liability"
            value={`${formatTON(treasury.pending_liability_nanoton)} TON`}
            hint="Обязательства перед пользователями, которые ещё не закрыты."
          />
          <Stat
            label="Hot balance"
            value={`${formatTON(treasury.hot_balance_nanoton ?? 0)} TON`}
            hint="Доступный баланс горячего кошелька для текущих выводов."
          />
        </section>
      ) : loading ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel space-y-2 p-3">
              <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
              <div className="h-5 w-full animate-pulse rounded bg-surface-raised" />
            </div>
          ))}
        </section>
      ) : null}

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Подтверждение выводов TON ({reviewQueue.length})</p>
        <input
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          className="input-field"
          placeholder="Комментарий к решению"
        />
        {reviewQueue.length === 0 ? (
          <p className="text-sm text-muted">Сейчас нет выводов на ручной проверке.</p>
        ) : (
          reviewQueue.map((transfer) => (
            <div key={transfer.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{formatTON(transfer.net_nanoton)} TON</p>
                  <p className="mt-1 break-all text-xs text-muted">{transfer.wallet_address}</p>
                  <p className="mt-1 text-xs text-muted">
                    {transfer.review_reason || transfer.risk_flags?.join(", ") || "ручная проверка"}
                  </p>
                </div>
                <AdminToolbar className="shrink-0">
                  <AdminButton
                    onClick={async () => {
                      await reviewAdminTransfer(
                        transfer.id,
                        true,
                        reviewNote || "одобрено админом",
                      );
                      showToast({ variant: "success", title: "Вывод одобрен" });
                      await load();
                    }}
                  >
                    Одобрить
                  </AdminButton>
                  <AdminButton
                    variant="danger"
                    onClick={async () => {
                      await reviewAdminTransfer(
                        transfer.id,
                        false,
                        reviewNote || "отклонено админом",
                      );
                      showToast({ variant: "success", title: "Вывод отклонён" });
                      await load();
                    }}
                  >
                    Отклонить
                  </AdminButton>
                </AdminToolbar>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Очередь вывода подарков ({giftQueue.length})</p>
        <p className="text-xs text-muted">
          Silent hold и закупка для case-claim. Если нужна закупка, укажите slug подарка на боте и подтвердите выдачу.
          Если подарок уже привязан, его можно сразу отправить или отклонить заявку.
        </p>
        {giftQueue.length === 0 ? (
          <p className="text-sm text-muted">Нет подарков в ожидании.</p>
        ) : (
          giftQueue.map((item) => (
            <div key={item.item_id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{item.name}</p>
                  {item.needs_purchase ? (
                    <p className="mt-1 text-xs font-medium text-amber-400">Нужна закупка</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {item.first_name || item.username || `TG ${item.telegram_id}`}
                    {item.username ? ` · @${item.username}` : ""}
                    {item.collection_slug ? ` · ${item.collection_slug}` : ""}
                    {` · ${formatTON(item.floor_price_nanoton)} TON`}
                  </p>
                  <p className="mt-1 break-all text-[11px] text-muted">
                    {item.telegram_gift_id || "slug не привязан"}
                  </p>
                  {item.needs_purchase ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                        placeholder="telegram gift slug (plushpepe-123)"
                        id={`fulfill-${item.item_id}`}
                      />
                      <AdminButton
                        onClick={async () => {
                          const input = document.getElementById(
                            `fulfill-${item.item_id}`,
                          ) as HTMLInputElement | null;
                          const slug = input?.value?.trim() || "";
                          if (!slug) {
                            showToast({ variant: "error", title: "Укажите slug подарка" });
                            return;
                          }
                          await fulfillAdminGiftWithdrawal(item.item_id, slug, reviewNote);
                          showToast({ variant: "success", title: "Подарок выдан" });
                          await load();
                        }}
                      >
                        Выдать
                      </AdminButton>
                    </div>
                  ) : null}
                </div>
                <AdminToolbar className="shrink-0">
                  {!item.needs_purchase ? (
                    <AdminButton
                      onClick={async () => {
                        await reviewAdminGiftWithdrawal(item.item_id, true, reviewNote);
                        showToast({ variant: "success", title: "Подарок отправлен" });
                        await load();
                      }}
                    >
                      Отправить
                    </AdminButton>
                  ) : null}
                  <AdminButton
                    variant="secondary"
                    onClick={async () => {
                      await reviewAdminGiftWithdrawal(item.item_id, false, reviewNote);
                      showToast({ variant: "success", title: "Вывод подарка отклонён" });
                      await load();
                    }}
                  >
                    Отклонить
                  </AdminButton>
                </AdminToolbar>
              </div>
            </div>
          ))
        )}
      </section>
    </AdminPage>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel space-y-1 p-3">
      <p className="inline-flex items-center gap-1.5 text-xs text-muted">
        {label}
        {hint ? <AdminInfoHint label={label} hint={hint} /> : null}
      </p>
      <p className="break-all text-sm font-semibold">{value}</p>
    </div>
  );
}
