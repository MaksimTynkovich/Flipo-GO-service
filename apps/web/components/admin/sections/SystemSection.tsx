"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminButton, AdminField, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  getAdminMaintenanceSettings,
  updateAdminMaintenanceSettings,
  type AdminMaintenanceSettings,
} from "@/lib/api";

const DEFAULT_SETTINGS: AdminMaintenanceSettings = {
  enabled: false,
  message: "",
};

export default function SystemSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminMaintenanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await loadCached("admin:maintenance", getAdminMaintenanceSettings);
      setSettings(data);
      primeCache("admin:maintenance", data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<AdminMaintenanceSettings>("admin:maintenance");
      if (cached) setSettings(cached);
      load().catch(() => {});
    });
  }, []);

  const form = settings ?? DEFAULT_SETTINGS;

  return (
    <AdminPage
      title="Система"
      description="Глобальные переключатели платформы. Режим обслуживания сразу закрывает приложение для игроков."
    >
      <AdminPanel
        title="Техническое обслуживание"
        description="Когда включено, игроки видят экран обслуживания, а игровой API отвечает 503. Админы продолжают пользоваться проектом как обычно."
      >
        {loading && !settings ? (
          <div className="space-y-3">
            <div className="h-4 w-48 animate-pulse rounded bg-surface-raised" />
            <div className="h-10 w-full animate-pulse rounded bg-surface-raised" />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setSettings({ ...form, enabled: e.target.checked })}
              />
              <span className={form.enabled ? "font-medium text-danger" : undefined}>
                Проект выключен (тех.обслуживание)
              </span>
            </label>

            <AdminField
              label="Сообщение на экране"
              hint="Если пусто — покажем стандартный текст «Проводим техническое обслуживание…»."
            >
              <textarea
                className="input-field min-h-24"
                value={form.message}
                maxLength={500}
                onChange={(e) => setSettings({ ...form, message: e.target.value })}
                placeholder="Проводим техническое обслуживание. Скоро вернёмся."
              />
            </AdminField>

            <AdminToolbar>
              <AdminButton
                variant={form.enabled ? "danger" : "primary"}
                disabled={saving || (loading && !settings)}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateAdminMaintenanceSettings({
                      enabled: form.enabled,
                      message: form.message.trim(),
                    });
                    setSettings({ ...form, message: form.message.trim() });
                    primeCache("admin:maintenance", {
                      ...form,
                      message: form.message.trim(),
                    });
                    showToast({
                      variant: "success",
                      title: form.enabled
                        ? "Тех.обслуживание включено"
                        : "Тех.обслуживание выключено",
                    });
                  } catch (error) {
                    showToast({
                      variant: "error",
                      title: "Не удалось сохранить",
                      subtitle: error instanceof Error ? error.message : undefined,
                    });
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </AdminButton>
            </AdminToolbar>

            {form.enabled ? (
              <p className="text-xs text-danger">
                Сейчас игроки не смогут пользоваться приложением. Для админов всё работает без ограничений.
              </p>
            ) : null}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
