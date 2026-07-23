"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminButton,
  AdminChip,
  AdminEmpty,
  AdminPage,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";
import {
  formatTON,
  getAdminNotifications,
  getAdminNotificationUnreadCount,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
  type AdminNotificationCategory,
} from "@/lib/api";

const CATEGORIES: { id: AdminNotificationCategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "finance", label: "Финансы" },
  { id: "gifts", label: "Подарки" },
  { id: "cases", label: "Кейсы" },
  { id: "game", label: "Игры" },
  { id: "referral", label: "Рефералы" },
  { id: "promo", label: "Промо" },
  { id: "system", label: "Система" },
];

const CATEGORY_LABEL: Record<string, string> = {
  finance: "Финансы",
  gifts: "Подарки",
  cases: "Кейсы",
  game: "Игры",
  referral: "Рефералы",
  promo: "Промо",
  system: "Система",
};

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} д`;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function actorDisplay(n: AdminNotification): string {
  const name = [n.actor_first_name, n.actor_last_name].filter(Boolean).join(" ").trim();
  if (n.actor_username) {
    return name ? `${name} (@${n.actor_username})` : `@${n.actor_username}`;
  }
  if (name) return name;
  if (n.actor_telegram_id) return `id ${n.actor_telegram_id}`;
  return "—";
}

function parseMeta(meta: AdminNotification["meta"]): Record<string, unknown> {
  if (!meta) return {};
  if (typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, unknown>;
  return {};
}

function metaRows(n: AdminNotification): Array<{ label: string; value: string }> {
  const meta = parseMeta(n.meta);
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, key: string) => {
    const v = meta[key];
    if (v === undefined || v === null || v === "") return;
    rows.push({ label, value: String(v) });
  };
  push("Статус", "status");
  push("Transfer", "transfer_id");
  push("Ошибка", "error");
  push("Код", "code");
  push("Причина", "reason");
  push("Подарок", "gift_name");
  push("Коллекция", "collection");
  push("Сектор", "segment");
  push("Спин", "spin_source_label");
  push("Действие", "action_label");
  push("Игра", "game");
  push("Событие", "event");
  push("Исход", "outcome");
  push("Выбор", "selection");
  push("Результат", "result");
  push("Кейс", "case_title");
  push("Приз", "prize_name");
  push("Источник", "source_label");
  if (typeof meta.backed === "boolean") {
    rows.push({ label: "Обеспечен", value: meta.backed ? "да" : "нет (claim)" });
  }
  if (typeof meta.price_nanoton === "number" && meta.price_nanoton > 0) {
    rows.push({ label: "Цена кейса", value: `${formatTON(meta.price_nanoton as number)} TON` });
  }
  if (typeof meta.prize_floor_nanoton === "number" && meta.prize_floor_nanoton > 0) {
    rows.push({ label: "Оценка приза", value: `${formatTON(meta.prize_floor_nanoton as number)} TON` });
  }
  if (typeof meta.stake_nanoton === "number") {
    rows.push({ label: "Ставка", value: `${formatTON(meta.stake_nanoton as number)} TON` });
  }
  if (typeof meta.payout_nanoton === "number" && meta.payout_nanoton > 0) {
    rows.push({ label: "Выплата", value: `${formatTON(meta.payout_nanoton as number)} TON` });
  }
  if (typeof meta.profit_nanoton === "number") {
    const profit = meta.profit_nanoton as number;
    const sign = profit > 0 ? "+" : profit < 0 ? "−" : "";
    rows.push({
      label: "P&L",
      value: `${sign}${formatTON(Math.abs(profit))} TON`,
    });
  }
  if (typeof meta.multiplier === "number") {
    rows.push({ label: "Кэшаут", value: `×${meta.multiplier}` });
  }
  if (typeof meta.crash_point === "number") {
    rows.push({ label: "Краш", value: `×${meta.crash_point}` });
  }
  if (meta.referrer_telegram_id || meta.referrer_username) {
    const refName = [meta.referrer_first_name, meta.referrer_last_name].filter(Boolean).join(" ").trim();
    const uname = meta.referrer_username ? `@${meta.referrer_username}` : "";
    const id = meta.referrer_telegram_id ? `id ${meta.referrer_telegram_id}` : "";
    rows.push({
      label: "Реферер",
      value: [refName, uname, id].filter(Boolean).join(" · ") || "—",
    });
  }
  return rows;
}

export default function NotificationsSection() {
  const router = useRouter();
  const [category, setCategory] = useState<AdminNotificationCategory>("all");
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function load(nextCategory = category) {
    setLoading(true);
    try {
      const [list, countRes] = await Promise.all([
        getAdminNotifications({ category: nextCategory, limit: 150 }),
        getAdminNotificationUnreadCount(),
      ]);
      setItems(list);
      setUnread(countRes.count);
      window.dispatchEvent(new CustomEvent("admin-notifications-unread", { detail: countRes.count }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    const timer = window.setInterval(() => {
      load().catch(() => {});
    }, 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on category via setCategory handler
  }, []);

  async function selectCategory(next: AdminNotificationCategory) {
    setCategory(next);
    setSelectedId(null);
    setLoading(true);
    try {
      const list = await getAdminNotifications({ category: next, limit: 150 });
      setItems(list);
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: AdminNotification) {
    setSelectedId(item.id);
    if (item.read_at) return;
    try {
      await markAdminNotificationRead(item.id);
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row,
        ),
      );
      setUnread((n) => {
        const next = Math.max(0, n - 1);
        window.dispatchEvent(new CustomEvent("admin-notifications-unread", { detail: next }));
        return next;
      });
    } catch {
      /* ignore */
    }
  }

  async function markAll() {
    await markAllAdminNotificationsRead(category);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((row) => ({ ...row, read_at: row.read_at || now })));
    const countRes = await getAdminNotificationUnreadCount();
    setUnread(countRes.count);
    window.dispatchEvent(new CustomEvent("admin-notifications-unread", { detail: countRes.count }));
  }

  const detailMeta = selected ? metaRows(selected) : [];
  const detailLink =
    selected && typeof parseMeta(selected.meta).link === "string"
      ? String(parseMeta(selected.meta).link)
      : selected?.category === "finance"
        ? "/admin/finance"
        : null;

  return (
    <AdminPage description="Лента событий: финансы, подарки, ставки и исходы игр (crash / roulette / pvp), промо и активность пользователей.">
      <AdminToolbar className="justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((item) => (
            <AdminChip
              key={item.id}
              active={category === item.id}
              onClick={() => {
                selectCategory(item.id).catch(() => {});
              }}
            >
              {item.label}
            </AdminChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unread > 0 ? (
            <span className="admin-notif-badge-count">{unread} новых</span>
          ) : (
            <span className="text-xs text-[var(--admin-muted)]">Нет новых</span>
          )}
          <AdminButton
            variant="secondary"
            className="!h-9 text-xs"
            onClick={() => load().catch(() => {})}
          >
            {loading ? "Обновляем…" : "Обновить"}
          </AdminButton>
          <AdminButton
            variant="secondary"
            className="!h-9 text-xs"
            disabled={unread === 0}
            onClick={() => {
              markAll().catch(() => {});
            }}
          >
            Прочитать все
          </AdminButton>
        </div>
      </AdminToolbar>

      <div className={cn("admin-notif-layout", selected && "admin-notif-layout--split")}>
        <div className="admin-notif-feed">
          {items.length === 0 ? (
            <AdminEmpty>{loading ? "Загрузка…" : "Уведомлений пока нет"}</AdminEmpty>
          ) : (
            items.map((item) => {
              const unreadRow = !item.read_at;
              const active = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    openItem(item).catch(() => {});
                  }}
                  className={cn(
                    "admin-notif-row",
                    unreadRow && "admin-notif-row--unread",
                    active && "admin-notif-row--active",
                    item.severity === "critical" && "admin-notif-row--critical",
                    item.severity === "warning" && "admin-notif-row--warning",
                  )}
                >
                  <div className="admin-notif-row__main">
                    <div className="admin-notif-row__top">
                      <span className={cn("admin-notif-pill", `admin-notif-pill--${item.category}`)}>
                        {CATEGORY_LABEL[item.category] ?? item.category}
                      </span>
                      <span className="admin-notif-row__title">{item.title}</span>
                    </div>
                    <p className="admin-notif-row__summary">{item.summary}</p>
                  </div>
                  <div className="admin-notif-row__meta">
                    {item.amount_nanoton != null ? (
                      <span className="admin-notif-row__amount">
                        {formatTON(item.amount_nanoton)} TON
                      </span>
                    ) : null}
                    <span className="admin-notif-row__time">{relativeTime(item.created_at)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {selected ? (
          <aside className="admin-notif-detail">
            <div className="admin-notif-detail__head">
              <span className={cn("admin-notif-pill", `admin-notif-pill--${selected.category}`)}>
                {CATEGORY_LABEL[selected.category] ?? selected.category}
              </span>
              <h2 className="admin-notif-detail__title">{selected.title}</h2>
              <p className="admin-notif-detail__time">
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date(selected.created_at))}
              </p>
            </div>

            <div className="admin-notif-detail__block">
              <p className="admin-notif-detail__label">Пользователь</p>
              <p className="admin-notif-detail__value">{actorDisplay(selected)}</p>
              {selected.actor_telegram_id ? (
                <p className="admin-notif-detail__sub">Telegram ID: {selected.actor_telegram_id}</p>
              ) : null}
            </div>

            {selected.amount_nanoton != null ? (
              <div className="admin-notif-detail__block">
                <p className="admin-notif-detail__label">Сумма</p>
                <p className="admin-notif-detail__value admin-notif-detail__value--accent">
                  {formatTON(selected.amount_nanoton)} TON
                </p>
              </div>
            ) : null}

            {detailMeta.length > 0 ? (
              <div className="admin-notif-detail__block space-y-2">
                <p className="admin-notif-detail__label">Детали</p>
                {detailMeta.map((row) => (
                  <div key={row.label} className="admin-notif-detail__kv">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="admin-notif-detail__block">
              <p className="admin-notif-detail__label">Полный лог</p>
              <pre className="admin-notif-detail__body">{selected.body}</pre>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {detailLink ? (
                <AdminButton
                  className="!h-9 text-xs"
                  onClick={() => router.push(detailLink)}
                >
                  Открыть в Операциях
                </AdminButton>
              ) : null}
              <AdminButton
                variant="secondary"
                className="!h-9 text-xs"
                onClick={() => setSelectedId(null)}
              >
                Закрыть
              </AdminButton>
            </div>
          </aside>
        ) : null}
      </div>
    </AdminPage>
  );
}
