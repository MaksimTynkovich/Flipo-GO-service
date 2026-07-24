"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminButton, AdminField, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
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
  webapp_button_text: "",
  terms_url: "",
  terms_button_text: "",
};

export default function TelegramSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminBotSettings | null>(null);
  const [broadcasts, setBroadcasts] = useState<TelegramBroadcast[]>([]);
  const [message, setMessage] = useState("");
  const [includeChannelButton, setIncludeChannelButton] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const data = await loadCached("admin:telegram:settings", getAdminBotSettings);
      setSettings({
        ...DEFAULT_SETTINGS,
        ...data,
        terms_url: data.terms_url ?? "",
        terms_button_text: data.terms_button_text ?? "",
      });
      primeCache("admin:telegram:settings", {
        ...DEFAULT_SETTINGS,
        ...data,
        terms_url: data.terms_url ?? "",
        terms_button_text: data.terms_button_text ?? "",
      });
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

  useEffect(() => {
    const active = broadcasts.some((item) => item.status === "queued" || item.status === "running");
    if (!active) return;
    const timer = window.setInterval(() => {
      loadBroadcasts().catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, [broadcasts]);

  const formSettings = settings ?? DEFAULT_SETTINGS;

  return (
    <AdminPage title="Telegram-бот" description="Настройки бота, массовые рассылки и история отправок.">
      <AdminPanel title="Настройки бота" description="Параметры бота и массовых рассылок.">
        {settingsLoading && !settings ? (
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-surface-raised" />
            <div className="h-10 w-full animate-pulse rounded bg-surface-raised" />
            <div className="h-10 w-full animate-pulse rounded bg-surface-raised" />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={formSettings.broadcast_enabled}
                onChange={(e) => setSettings({ ...formSettings, broadcast_enabled: e.target.checked })}
              />
              Массовые рассылки включены
            </label>

            <AdminField label="Уровень anti-spam (1–3)" hint="Чем выше — тем быстрее рассылка, но выше риск лимитов Telegram.">
              <input
                className="input-field"
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
            </AdminField>

            <AdminField
              label="WebApp URL"
              hint="Кнопка в рассылке. Можно указать https://t.me/ваш_бот/app или прямой HTTPS. Если пусто — возьмём ссылку из BOT_USERNAME и WEBAPP_SHORT_NAME."
            >
              <input
                className="input-field"
                value={formSettings.webapp_url}
                onChange={(e) => setSettings({ ...formSettings, webapp_url: e.target.value })}
                placeholder="https://..."
              />
            </AdminField>

            <AdminField
              label="Текст кнопки"
              hint="Подпись на кнопке открытия приложения в рассылке и в /start. Если пусто — «🚀 Открыть приложение»."
            >
              <input
                className="input-field"
                value={formSettings.webapp_button_text}
                onChange={(e) => setSettings({ ...formSettings, webapp_button_text: e.target.value })}
                placeholder="🚀 Открыть приложение"
                maxLength={64}
              />
            </AdminField>

            <AdminField
              label="Ссылка на соглашение"
              hint="Inline-кнопка в /start. Укажите публичный URL (например https://ваш-домен/terms). Если пусто — кнопка не показывается."
            >
              <input
                className="input-field"
                value={formSettings.terms_url}
                onChange={(e) => setSettings({ ...formSettings, terms_url: e.target.value })}
                placeholder="https://..."
              />
            </AdminField>

            <AdminField
              label="Текст кнопки соглашения"
              hint="Если пусто — «📄 Пользовательское соглашение»."
            >
              <input
                className="input-field"
                value={formSettings.terms_button_text}
                onChange={(e) => setSettings({ ...formSettings, terms_button_text: e.target.value })}
                placeholder="📄 Пользовательское соглашение"
                maxLength={64}
              />
            </AdminField>

            <AdminToolbar>
              <AdminButton
                disabled={settingsLoading && !settings}
                onClick={async () => {
                  try {
                    await updateAdminBotSettings(formSettings);
                    setSettings(formSettings);
                    primeCache("admin:telegram:settings", formSettings);
                    showToast({ variant: "success", title: "Настройки бота сохранены" });
                  } catch (error) {
                    showToast({
                      variant: "error",
                      title: "Не удалось сохранить настройки",
                      subtitle: error instanceof Error ? error.message : undefined,
                    });
                  }
                }}
              >
                Сохранить настройки
              </AdminButton>
            </AdminToolbar>
          </div>
        )}
      </AdminPanel>

      <AdminPanel title="Массовая рассылка" description="Сообщение уйдёт всем игрокам с привязанным Telegram.">
        <div className="space-y-4">
          <AdminField label="Текст сообщения">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input-field min-h-28"
              placeholder="Текст сообщения для всех игроков"
            />
          </AdminField>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={includeChannelButton}
              onChange={(e) => setIncludeChannelButton(e.target.checked)}
            />
            Добавить кнопку канала
          </label>
          <p className="text-xs text-muted -mt-2">
            Вторая кнопка в inline-клавиатуре ведёт на TELEGRAM_CHANNEL_URL из .env (как в /start).
          </p>

          <AdminToolbar>
            <AdminButton
              disabled={!message.trim() || sending}
              onClick={async () => {
                const text = message.trim();
                if (!text) return;

                setSending(true);
                try {
                  const nextSettings = { ...formSettings, broadcast_enabled: true };
                  if (!formSettings.broadcast_enabled) {
                    setSettings(nextSettings);
                  }
                  await updateAdminBotSettings(nextSettings);
                  primeCache("admin:telegram:settings", nextSettings);
                  setSettings(nextSettings);

                  await createAdminBroadcast(text, includeChannelButton);
                  setMessage("");
                  setIncludeChannelButton(false);
                  showToast({ variant: "success", title: "Рассылка запущена" });
                  await loadBroadcasts();
                } catch (error) {
                  showToast({
                    variant: "error",
                    title: "Не удалось запустить рассылку",
                    subtitle: error instanceof Error ? error.message : undefined,
                  });
                } finally {
                  setSending(false);
                }
              }}
            >
              {sending ? "Отправка…" : "Отправить рассылку"}
            </AdminButton>
          </AdminToolbar>

          {!formSettings.broadcast_enabled ? (
            <p className="text-xs text-muted">
              Рассылки выключены — при отправке включим автоматически и сохраним настройки.
            </p>
          ) : null}
          {!formSettings.webapp_url.trim() ? (
            <p className="text-xs text-muted">
              WebApp URL не задан — к рассылке добавится кнопка t.me из настроек бота, если они есть в .env.
            </p>
          ) : null}
        </div>
      </AdminPanel>

      <AdminPanel title="История рассылок">
        {broadcastsLoading && broadcasts.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
                <div className="mt-2 h-4 w-full animate-pulse rounded bg-surface-raised" />
              </div>
            ))}
          </div>
        ) : broadcasts.length === 0 ? (
          <p className="text-sm text-muted">Рассылок пока не было.</p>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((item) => (
              <div key={item.id} className="rounded-xl bg-surface-raised/50 px-3 py-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="uppercase text-[10px] text-muted">
                    {item.status === "queued"
                      ? "в очереди"
                      : item.status === "running"
                        ? "отправляется"
                        : item.status === "completed"
                          ? "завершена"
                          : item.status === "failed"
                            ? "ошибка"
                            : item.status}
                  </span>
                  <span className="text-xs text-muted">
                    {item.sent_count}/{item.total_users}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2">{item.message}</p>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
