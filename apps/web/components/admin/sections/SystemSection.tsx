"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminButton, AdminField, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  getAdminMaintenanceSettings,
  getAdminWithdrawalSettings,
  updateAdminMaintenanceSettings,
  updateAdminWithdrawalSettings,
  type AdminMaintenanceSettings,
  type AdminWithdrawalSettings,
} from "@/lib/api";

const DEFAULT_SETTINGS: AdminMaintenanceSettings = {
  enabled: false,
  message: "",
};

const DEFAULT_WITHDRAWAL: AdminWithdrawalSettings = {
  enabled: false,
};

export default function SystemSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminMaintenanceSettings | null>(null);
  const [withdrawalSettings, setWithdrawalSettings] = useState<AdminWithdrawalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWithdrawals, setSavingWithdrawals] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [maintenance, withdrawals] = await loadCached("admin:system:v2", () =>
        Promise.all([getAdminMaintenanceSettings(), getAdminWithdrawalSettings()]),
      );
      setSettings(maintenance);
      setWithdrawalSettings(withdrawals);
      primeCache("admin:system:v2", [maintenance, withdrawals]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<[AdminMaintenanceSettings, AdminWithdrawalSettings]>("admin:system:v2");
      if (cached) {
        setSettings(cached[0]);
        setWithdrawalSettings(cached[1]);
      }
      load().catch(() => {});
    });
  }, []);

  const form = settings ?? DEFAULT_SETTINGS;
  const withdrawalForm = withdrawalSettings ?? DEFAULT_WITHDRAWAL;

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
                    primeCache("admin:system:v2", [
                      { ...form, message: form.message.trim() },
                      withdrawalForm,
                    ]);
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

      <AdminPanel
        title="Тихий холд выводов"
        description="Игрок не видит блокировку: TON-вывод уходит «в ожидание», подарок — в очередь hold. Одобрять можно в разделе Финансы."
      >
        {loading && !withdrawalSettings ? (
          <div className="h-4 w-56 animate-pulse rounded bg-surface-raised" />
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={withdrawalForm.enabled}
                onChange={(e) =>
                  setWithdrawalSettings({ ...withdrawalForm, enabled: e.target.checked })
                }
              />
              <span className={withdrawalForm.enabled ? "font-medium text-danger" : undefined}>
                Выводы отключены для всех (тихо)
              </span>
            </label>

            <AdminToolbar>
              <AdminButton
                variant={withdrawalForm.enabled ? "danger" : "primary"}
                disabled={savingWithdrawals || (loading && !withdrawalSettings)}
                onClick={async () => {
                  setSavingWithdrawals(true);
                  try {
                    await updateAdminWithdrawalSettings({ enabled: withdrawalForm.enabled });
                    primeCache("admin:system:v2", [form, withdrawalForm]);
                    showToast({
                      variant: "success",
                      title: withdrawalForm.enabled
                        ? "Глобальный холд выводов включён"
                        : "Глобальный холд выводов выключен",
                    });
                  } catch (error) {
                    showToast({
                      variant: "error",
                      title: "Не удалось сохранить",
                      subtitle: error instanceof Error ? error.message : undefined,
                    });
                  } finally {
                    setSavingWithdrawals(false);
                  }
                }}
              >
                {savingWithdrawals ? "Сохранение…" : "Сохранить"}
              </AdminButton>
            </AdminToolbar>

            {withdrawalForm.enabled ? (
              <p className="text-xs text-danger">
                Новые выводы TON и подарков уходят в ожидание. Игрок видит обычный статус «в ожидании».
              </p>
            ) : null}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
