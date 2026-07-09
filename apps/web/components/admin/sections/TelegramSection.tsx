"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  createAdminBroadcast,
  getAdminBotSettings,
  getAdminBroadcasts,
  updateAdminBotSettings,
  type AdminBotSettings,
  type TelegramBroadcast,
} from "@/lib/api";

const DEFAULT_SETTINGS: AdminBotSettings = {
  broadcast_enabled: false,
  spam_protection_level: 2,
  webapp_url: "",
};

export default function TelegramSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminBotSettings | null>(null);
  const [broadcasts, setBroadcasts] = useState<TelegramBroadcast[]>([]);
  const [message, setMessage] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const data = await loadCached("admin:telegram:settings", getAdminBotSettings);
      setSettings(data);
      primeCache("admin:telegram:settings", data);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadBroadcasts() {
    setBroadcastsLoading(true);
    try {
      const data = await loadCached("admin:telegram:broadcasts", getAdminBroadcasts);
      setBroadcasts(data);
      primeCache("admin:telegram:broadcasts", data);
    } finally {
      setBroadcastsLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cachedSettings = readCached<AdminBotSettings>("admin:telegram:settings");
      if (cachedSettings) setSettings(cachedSettings);
      const cachedBroadcasts = readCached<TelegramBroadcast[]>("admin:telegram:broadcasts");
      if (cachedBroadcasts) setBroadcasts(cachedBroadcasts);
      loadSettings().catch(() => {});
      loadBroadcasts().catch(() => {});
    });
  }, []);

  const formSettings = settings ?? DEFAULT_SETTINGS;

  return (
    <PageShell title="Telegram-бот" description="WebApp, рассылки и защита от спама.">
      <section className="panel space-y-3">
        {settingsLoading && !settings ? (
          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-surface-raised" />
            <div className="h-10 w-full animate-pulse rounded bg-surface-raised" />
            <div className="h-10 w-full animate-pulse rounded bg-surface-raised" />
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formSettings.broadcast_enabled}
                onChange={(e) =>
                  setSettings({ ...formSettings, broadcast_enabled: e.target.checked })
                }
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
                value={formSettings.spam_protection_level}
                onChange={(e) =>
                  setSettings({
                    ...formSettings,
                    spam_protection_level: Number(e.target.value),
                  })
                }
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted">WebApp URL</span>
              <input
                className="input-field mt-1"
                value={formSettings.webapp_url}
                onChange={(e) => setSettings({ ...formSettings, webapp_url: e.target.value })}
                placeholder="https://..."
              />
            </label>

            <button
              className="quick-amount quick-amount-active"
              disabled={settingsLoading && !settings}
              onClick={async () => {
                await updateAdminBotSettings(formSettings);
                setSettings(formSettings);
                showToast({ variant: "success", title: "Настройки бота сохранены" });
              }}
            >
              Сохранить настройки
            </button>
          </>
        )}
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
          disabled={!message.trim() || !formSettings.broadcast_enabled}
          onClick={async () => {
            await createAdminBroadcast(message.trim());
            setMessage("");
            showToast({ variant: "success", title: "Рассылка поставлена в очередь" });
            await loadBroadcasts();
          }}
        >
          Отправить рассылку
        </button>
        {!formSettings.broadcast_enabled ? (
          <p className="text-xs text-muted">Сначала включите массовые рассылки.</p>
        ) : null}
      </section>

      <section className="panel space-y-2">
        <p className="text-base font-semibold">История рассылок</p>
        {broadcastsLoading && broadcasts.length === 0 ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
              <div className="mt-2 h-4 w-full animate-pulse rounded bg-surface-raised" />
            </div>
          ))
        ) : broadcasts.length === 0 ? (
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
