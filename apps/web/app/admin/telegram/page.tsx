"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/components/providers/ToastProvider";
import {
  createAdminBroadcast,
  getAdminBotSettings,
  getAdminBroadcasts,
  updateAdminBotSettings,
  type AdminBotSettings,
  type TelegramBroadcast,
} from "@/lib/api";

export default function AdminTelegramPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminBotSettings | null>(null);
  const [broadcasts, setBroadcasts] = useState<TelegramBroadcast[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [settingsData, broadcastsData] = await Promise.all([
      getAdminBotSettings(),
      getAdminBroadcasts(),
    ]);
    setSettings(settingsData);
    setBroadcasts(broadcastsData);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!settings) {
    return (
      <PageShell title="Telegram-бот" description="WebApp, рассылки и защита от спама.">
        <p className="text-sm text-muted">Загрузка настроек…</p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Telegram-бот" description="WebApp, рассылки и защита от спама.">
      <section className="panel space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.broadcast_enabled}
            onChange={(e) => setSettings({ ...settings, broadcast_enabled: e.target.checked })}
          />
          Массовые рассылки включены
        </label>

        <label className="block text-sm">
          <span className="text-muted">Уровень anti-spam (1–3)</span>
          <input
            className="input-field mt-1"
            type="number"
            min={1}
            max={3}
            value={settings.spam_protection_level}
            onChange={(e) =>
              setSettings({ ...settings, spam_protection_level: Number(e.target.value) })
            }
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">WebApp URL</span>
          <input
            className="input-field mt-1"
            value={settings.webapp_url}
            onChange={(e) => setSettings({ ...settings, webapp_url: e.target.value })}
            placeholder="https://..."
          />
        </label>

        <button
          className="quick-amount quick-amount-active"
          onClick={async () => {
            await updateAdminBotSettings(settings);
            showToast({ variant: "success", title: "Настройки бота сохранены" });
          }}
        >
          Сохранить настройки
        </button>
      </section>

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Массовая рассылка</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="input-field min-h-28"
          placeholder="Текст сообщения для всех игроков"
        />
        <button
          className="quick-amount quick-amount-active"
          disabled={!message.trim() || !settings.broadcast_enabled}
          onClick={async () => {
            await createAdminBroadcast(message.trim());
            setMessage("");
            showToast({ variant: "success", title: "Рассылка поставлена в очередь" });
            await load();
          }}
        >
          Отправить рассылку
        </button>
        {!settings.broadcast_enabled ? (
          <p className="text-xs text-muted">Сначала включите массовые рассылки.</p>
        ) : null}
      </section>

      <section className="panel space-y-2">
        <p className="text-base font-semibold">История рассылок</p>
        {broadcasts.length === 0 ? (
          <p className="text-sm text-muted">Рассылок пока не было.</p>
        ) : (
          broadcasts.map((item) => (
            <div key={item.id} className="rounded-xl bg-surface-raised/50 px-3 py-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="uppercase text-[10px] text-muted">{item.status}</span>
                <span className="text-xs text-muted">
                  {item.sent_count}/{item.total_users}
                </span>
              </div>
              <p className="mt-1 line-clamp-2">{item.message}</p>
            </div>
          ))
        )}
      </section>
    </PageShell>
  );
}
