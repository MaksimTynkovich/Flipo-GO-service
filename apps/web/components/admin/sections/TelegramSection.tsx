"use client";

import { useEffect, useState } from "react";
import { Upload, X } from "lucide-react";
import { AdminPage, AdminButton, AdminField, AdminLocalizedField, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  createAdminBroadcast,
  getAdminBotSettings,
  getAdminBroadcastDeliveries,
  getAdminBroadcasts,
  resolveAsset,
  updateAdminBotSettings,
  uploadAdminCaseImage,
  type AdminBotSettings,
  type TelegramBroadcast,
  type TelegramBroadcastDelivery,
} from "@/lib/api";

const DEFAULT_SETTINGS: AdminBotSettings = {
  broadcast_enabled: false,
  spam_protection_level: 2,
  webapp_url: "",
  webapp_button_text: "",
  webapp_button_text_en: "",
  webapp_button_text_ru: "",
  welcome_text_en: "",
  welcome_text_ru: "",
  terms_url: "",
  terms_button_text: "",
  terms_button_text_en: "",
  terms_button_text_ru: "",
};

const MAX_PHOTO_CAPTION = 1024;
const MAX_BROADCAST_IMAGES = 5;
const DELIVERY_PAGE = 50;

type DeliveryFilter = "" | "sent" | "skipped" | "failed";

function deliveryStatusLabel(status: string) {
  switch (status) {
    case "sent":
      return "доставлено";
    case "skipped":
      return "пропущено";
    case "failed":
      return "ошибка";
    default:
      return status;
  }
}

export default function TelegramSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminBotSettings | null>(null);
  const [broadcasts, setBroadcasts] = useState<TelegramBroadcast[]>([]);
  const [messageEn, setMessageEn] = useState("");
  const [messageRu, setMessageRu] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [includeChannelButton, setIncludeChannelButton] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [expandedBroadcastId, setExpandedBroadcastId] = useState<string | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("");
  const [deliveries, setDeliveries] = useState<TelegramBroadcastDelivery[]>([]);
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const data = await loadCached("admin:telegram:settings", getAdminBotSettings);
      setSettings({
        ...DEFAULT_SETTINGS,
        ...data,
        terms_url: data.terms_url ?? "",
        terms_button_text: data.terms_button_text ?? "",
        terms_button_text_en: data.terms_button_text_en || data.terms_button_text || "",
        terms_button_text_ru: data.terms_button_text_ru || data.terms_button_text || "",
        webapp_button_text_en: data.webapp_button_text_en || data.webapp_button_text || "",
        webapp_button_text_ru: data.webapp_button_text_ru || data.webapp_button_text || "",
        welcome_text_en: data.welcome_text_en ?? "",
        welcome_text_ru: data.welcome_text_ru ?? "",
      });
      primeCache("admin:telegram:settings", {
        ...DEFAULT_SETTINGS,
        ...data,
        terms_url: data.terms_url ?? "",
        terms_button_text: data.terms_button_text ?? "",
        terms_button_text_en: data.terms_button_text_en || data.terms_button_text || "",
        terms_button_text_ru: data.terms_button_text_ru || data.terms_button_text || "",
        webapp_button_text_en: data.webapp_button_text_en || data.webapp_button_text || "",
        webapp_button_text_ru: data.webapp_button_text_ru || data.webapp_button_text || "",
        welcome_text_en: data.welcome_text_en ?? "",
        welcome_text_ru: data.welcome_text_ru ?? "",
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

  async function loadDeliveries(broadcastId: string, filter: DeliveryFilter, offset = 0) {
    setDeliveriesLoading(true);
    try {
      const data = await getAdminBroadcastDeliveries(broadcastId, {
        status: filter || undefined,
        limit: DELIVERY_PAGE,
        offset,
      });
      const items = Array.isArray(data?.items) ? data.items : [];
      setDeliveries((prev) => (offset > 0 ? [...prev, ...items] : items));
      setDeliveriesTotal(typeof data?.total === "number" ? data.total : items.length);
    } catch (error) {
      showToast({
        variant: "error",
        title: "Не удалось загрузить журнал",
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeliveriesLoading(false);
    }
  }

  async function openBroadcastJournal(broadcastId: string) {
    if (expandedBroadcastId === broadcastId) {
      setExpandedBroadcastId(null);
      setDeliveries([]);
      setDeliveriesTotal(0);
      return;
    }
    setExpandedBroadcastId(broadcastId);
    setDeliveryFilter("");
    setDeliveries([]);
    setDeliveriesTotal(0);
    await loadDeliveries(broadcastId, "");
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
  const canSend = Boolean(messageEn.trim() || messageRu.trim() || imageUrls.length) && !sending && !uploadingImage;

  async function onPickImages(files: File[]) {
    if (!files.length) return;
    const remaining = MAX_BROADCAST_IMAGES - imageUrls.length;
    if (remaining <= 0) {
      showToast({
        variant: "error",
        title: "Лимит изображений",
        subtitle: `Можно прикрепить не больше ${MAX_BROADCAST_IMAGES}`,
      });
      return;
    }
    const batch = files.slice(0, remaining);
    setUploadingImage(true);
    try {
      const uploaded: string[] = [];
      for (const file of batch) {
        const res = await uploadAdminCaseImage(file);
        const url = res.image_url || res.url;
        if (url) uploaded.push(url);
      }
      if (uploaded.length) {
        setImageUrls((prev) => [...prev, ...uploaded].slice(0, MAX_BROADCAST_IMAGES));
        showToast({
          variant: "success",
          title: uploaded.length === 1 ? "Изображение загружено" : `Загружено: ${uploaded.length}`,
        });
      }
      if (files.length > remaining) {
        showToast({
          variant: "error",
          title: "Часть файлов пропущена",
          subtitle: `Лимит — ${MAX_BROADCAST_IMAGES} изображений`,
        });
      }
    } catch (error) {
      showToast({
        variant: "error",
        title: "Не удалось загрузить изображение",
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingImage(false);
    }
  }

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

            <AdminLocalizedField
              label="Приветствие /start"
              hint="Если оба поля пустые — возьмём TELEGRAM_WELCOME_TEXT из .env, затем стандартный текст бота."
              en={formSettings.welcome_text_en}
              ru={formSettings.welcome_text_ru}
              onEnChange={(welcome_text_en) => setSettings({ ...formSettings, welcome_text_en })}
              onRuChange={(welcome_text_ru) => setSettings({ ...formSettings, welcome_text_ru })}
              multiline
              enPlaceholder="Welcome to Flipo!"
              ruPlaceholder="Добро пожаловать в Flipo!"
            />

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

            <AdminLocalizedField
              label="Текст кнопки приложения"
              hint="Подпись на кнопке открытия приложения в рассылке и в /start. Если пусто — стандартный текст бота."
              en={formSettings.webapp_button_text_en}
              ru={formSettings.webapp_button_text_ru}
              onEnChange={(webapp_button_text_en) => setSettings({ ...formSettings, webapp_button_text_en })}
              onRuChange={(webapp_button_text_ru) => setSettings({ ...formSettings, webapp_button_text_ru })}
              maxLength={64}
              enPlaceholder="🚀 Open app"
              ruPlaceholder="🚀 Открыть приложение"
            />

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

            <AdminLocalizedField
              label="Текст кнопки соглашения"
              hint="Если пусто — стандартный текст бота."
              en={formSettings.terms_button_text_en}
              ru={formSettings.terms_button_text_ru}
              onEnChange={(terms_button_text_en) => setSettings({ ...formSettings, terms_button_text_en })}
              onRuChange={(terms_button_text_ru) => setSettings({ ...formSettings, terms_button_text_ru })}
              maxLength={64}
              enPlaceholder="📄 Terms of service"
              ruPlaceholder="📄 Пользовательское соглашение"
            />

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
          <AdminLocalizedField
            label="Текст сообщения"
            hint={
              imageUrls.length
                ? `С изображениями текст идёт подписью (до ${MAX_PHOTO_CAPTION} символов в каждом языке).`
                : "Каждый игрок получит версию на своём языке."
            }
            en={messageEn}
            ru={messageRu}
            onEnChange={setMessageEn}
            onRuChange={setMessageRu}
            multiline
            maxLength={imageUrls.length ? MAX_PHOTO_CAPTION : undefined}
            enPlaceholder="Message for English-speaking players"
            ruPlaceholder="Сообщение для русскоязычных игроков"
          />

          <AdminField
            label="Изображения"
            hint={`До ${MAX_BROADCAST_IMAGES} шт., JPEG/PNG/WebP/GIF до 5 МБ каждое. Можно только картинки без текста.`}
          >
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="sr-only"
                    disabled={uploadingImage || sending || imageUrls.length >= MAX_BROADCAST_IMAGES}
                    onChange={(e) => {
                      // FileList is live — snapshot before clearing the input.
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      e.target.value = "";
                      void onPickImages(files);
                    }}
                  />
                  <span
                    className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-surface-raised px-3 text-sm ${
                      uploadingImage || imageUrls.length >= MAX_BROADCAST_IMAGES
                        ? "pointer-events-none opacity-50"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingImage
                      ? "Загрузка…"
                      : imageUrls.length
                        ? `Ещё (${imageUrls.length}/${MAX_BROADCAST_IMAGES})`
                        : "Прикрепить"}
                  </span>
                </label>
                {imageUrls.length ? (
                  <AdminButton
                    variant="secondary"
                    className="!h-9"
                    disabled={uploadingImage || sending}
                    onClick={() => setImageUrls([])}
                  >
                    <X className="h-3.5 w-3.5" />
                    Убрать все
                  </AdminButton>
                ) : null}
              </div>
              {imageUrls.length ? (
                <div className="flex flex-wrap gap-2">
                  {imageUrls.map((url) => {
                    const preview = resolveAsset(url) || "";
                    return (
                      <div
                        key={url}
                        className="relative h-20 w-20 overflow-hidden rounded-xl border border-white/10 bg-surface-raised"
                      >
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt="" className="h-full w-full object-cover" />
                        ) : null}
                        <button
                          type="button"
                          className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                          disabled={uploadingImage || sending}
                          onClick={() => setImageUrls((prev) => prev.filter((item) => item !== url))}
                          aria-label="Убрать изображение"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
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
              disabled={!canSend}
              onClick={async () => {
                const textEn = messageEn.trim();
                const textRu = messageRu.trim();
                const images = imageUrls.map((u) => u.trim()).filter(Boolean);
                if (!textEn && !textRu && !images.length) return;
                if (
                  images.length &&
                  (textEn.length > MAX_PHOTO_CAPTION || textRu.length > MAX_PHOTO_CAPTION)
                ) {
                  showToast({
                    variant: "error",
                    title: "Слишком длинная подпись",
                    subtitle: `С изображениями максимум ${MAX_PHOTO_CAPTION} символов`,
                  });
                  return;
                }

                setSending(true);
                try {
                  const nextSettings = { ...formSettings, broadcast_enabled: true };
                  if (!formSettings.broadcast_enabled) {
                    setSettings(nextSettings);
                  }
                  await updateAdminBotSettings(nextSettings);
                  primeCache("admin:telegram:settings", nextSettings);
                  setSettings(nextSettings);

                  await createAdminBroadcast(textEn, textRu, includeChannelButton, images);
                  setMessageEn("");
                  setMessageRu("");
                  setImageUrls([]);
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
            {broadcasts.map((item) => {
              const thumbs = (item.image_urls ?? []).map((url) => resolveAsset(url) || "").filter(Boolean);
              const expanded = expandedBroadcastId === item.id;
              return (
                <div key={item.id} className="rounded-xl bg-surface-raised/50 px-3 py-2.5 text-sm">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => void openBroadcastJournal(item.id)}
                  >
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
                        {item.failed_count > 0 ? ` · ошибок ${item.failed_count}` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-2.5">
                      {thumbs.length ? (
                        <div className="flex shrink-0 gap-1">
                          {thumbs.slice(0, 3).map((thumb) => (
                            <div
                              key={thumb}
                              className="h-12 w-12 overflow-hidden rounded-lg bg-surface-raised"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumb} alt="" className="h-full w-full object-cover" />
                            </div>
                          ))}
                          {thumbs.length > 3 ? (
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-raised text-xs text-muted">
                              +{thumbs.length - 3}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2">
                          {item.message_ru || item.message_en || item.message || (thumbs.length ? `Изображения (${thumbs.length})` : "")}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          {expanded ? "Скрыть журнал доставок" : "Журнал доставок"}
                        </p>
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            { id: "" as DeliveryFilter, label: "Все" },
                            { id: "sent" as DeliveryFilter, label: "Доставлено" },
                            { id: "skipped" as DeliveryFilter, label: "Пропущено" },
                            { id: "failed" as DeliveryFilter, label: "Ошибки" },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id || "all"}
                            type="button"
                            className={`rounded-lg px-2.5 py-1 text-xs ${
                              deliveryFilter === tab.id
                                ? "bg-white/10 text-white"
                                : "bg-surface-raised text-muted hover:bg-white/5"
                            }`}
                            onClick={() => {
                              setDeliveryFilter(tab.id);
                              setDeliveries([]);
                              void loadDeliveries(item.id, tab.id);
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {deliveriesLoading && deliveries.length === 0 ? (
                        <div className="space-y-1.5">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="h-8 animate-pulse rounded-lg bg-surface-raised" />
                          ))}
                        </div>
                      ) : deliveries.length === 0 ? (
                        <p className="text-xs text-muted">
                          Записей пока нет. Для старых рассылок журнал не сохранялся.
                        </p>
                      ) : (
                        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                          {deliveries.map((row) => (
                            <div
                              key={row.id}
                              className="rounded-lg bg-black/20 px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-mono tabular-nums">{row.telegram_id}</span>
                                <span
                                  className={
                                    row.status === "failed"
                                      ? "text-red-300"
                                      : row.status === "skipped"
                                        ? "text-amber-200/80"
                                        : "text-emerald-300/80"
                                  }
                                >
                                  {deliveryStatusLabel(row.status)}
                                </span>
                              </div>
                              {row.error_message ? (
                                <p className="mt-0.5 break-words text-[11px] text-muted">
                                  {row.error_message}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {deliveries.length < deliveriesTotal ? (
                        <AdminButton
                          variant="secondary"
                          className="!h-8"
                          disabled={deliveriesLoading}
                          onClick={() => void loadDeliveries(item.id, deliveryFilter, deliveries.length)}
                        >
                          {deliveriesLoading
                            ? "Загрузка…"
                            : `Ещё (${deliveries.length}/${deliveriesTotal})`}
                        </AdminButton>
                      ) : deliveriesTotal > 0 ? (
                        <p className="text-[11px] text-muted">
                          Показано {deliveries.length} из {deliveriesTotal}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
