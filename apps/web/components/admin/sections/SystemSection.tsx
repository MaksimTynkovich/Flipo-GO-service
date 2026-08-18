"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminButton, AdminField, AdminLocalizedField, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminTonField } from "@/components/admin/AdminInputs";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  getAdminDepositSettings,
  getAdminMaintenanceSettings,
  getAdminWithdrawalSettings,
  updateAdminDepositSettings,
  updateAdminMaintenanceSettings,
  updateAdminWithdrawalSettings,
  type AdminDepositSettings,
  type AdminMaintenanceSettings,
  type AdminWithdrawalSettings,
} from "@/lib/api";

const DEFAULT_SETTINGS: AdminMaintenanceSettings = {
  enabled: false,
  accept_bets: true,
  message: "",
  message_en: "",
  message_ru: "",
};

const DEFAULT_WITHDRAWAL: AdminWithdrawalSettings = {
  enabled: false,
  gifts_manual: false,
  auto_withdraw_daily_limit_nanoton: 0,
};

const DEFAULT_DEPOSIT: AdminDepositSettings = {
  stars_usd_rate: 0.013,
};

type SystemCache = [AdminMaintenanceSettings, AdminWithdrawalSettings, AdminDepositSettings];

const CACHE_KEY = "admin:system:v5";

export default function SystemSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminMaintenanceSettings | null>(null);
  const [withdrawalSettings, setWithdrawalSettings] = useState<AdminWithdrawalSettings | null>(null);
  const [depositSettings, setDepositSettings] = useState<AdminDepositSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWithdrawals, setSavingWithdrawals] = useState(false);
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [starsRateInput, setStarsRateInput] = useState("0.013");

  async function load() {
    setLoading(true);
    try {
      const [maintenance, withdrawals, deposits] = await loadCached(CACHE_KEY, () =>
        Promise.all([
          getAdminMaintenanceSettings(),
          getAdminWithdrawalSettings(),
          getAdminDepositSettings(),
        ]),
      );
      const nextMaintenance = {
        ...DEFAULT_SETTINGS,
        ...maintenance,
        accept_bets: maintenance.accept_bets !== false,
        message_en: maintenance.message_en || maintenance.message || "",
        message_ru: maintenance.message_ru || maintenance.message || "",
      };
      const nextWithdrawal = {
        ...DEFAULT_WITHDRAWAL,
        ...withdrawals,
        gifts_manual: Boolean(withdrawals.gifts_manual),
        enabled: Boolean(withdrawals.enabled),
        auto_withdraw_daily_limit_nanoton: Math.max(0, Number(withdrawals.auto_withdraw_daily_limit_nanoton || 0)),
      };
      const nextDeposit = {
        ...DEFAULT_DEPOSIT,
        ...deposits,
        stars_usd_rate:
          typeof deposits.stars_usd_rate === "number" && deposits.stars_usd_rate > 0
            ? deposits.stars_usd_rate
            : DEFAULT_DEPOSIT.stars_usd_rate,
      };
      setSettings(nextMaintenance);
      setWithdrawalSettings(nextWithdrawal);
      setDepositSettings(nextDeposit);
      setStarsRateInput(String(nextDeposit.stars_usd_rate));
      primeCache(CACHE_KEY, [nextMaintenance, nextWithdrawal, nextDeposit]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<SystemCache>(CACHE_KEY);
      if (cached) {
        setSettings(cached[0]);
        setWithdrawalSettings(cached[1]);
        setDepositSettings(cached[2]);
        setStarsRateInput(String(cached[2]?.stars_usd_rate ?? DEFAULT_DEPOSIT.stars_usd_rate));
      }
      load().catch(() => {});
    });
  }, []);

  const form = settings ?? DEFAULT_SETTINGS;
  const withdrawalForm: AdminWithdrawalSettings = {
    ...DEFAULT_WITHDRAWAL,
    ...(withdrawalSettings ?? {}),
    gifts_manual: Boolean(withdrawalSettings?.gifts_manual),
    enabled: Boolean(withdrawalSettings?.enabled),
    auto_withdraw_daily_limit_nanoton: Math.max(0, Number(withdrawalSettings?.auto_withdraw_daily_limit_nanoton || 0)),
  };
  const depositForm: AdminDepositSettings = {
    ...DEFAULT_DEPOSIT,
    ...(depositSettings ?? {}),
  };

  function cacheSnapshot(
    nextMaintenance = form,
    nextWithdrawal = withdrawalForm,
    nextDeposit = depositForm,
  ) {
    primeCache(CACHE_KEY, [nextMaintenance, nextWithdrawal, nextDeposit]);
  }

  return (
    <AdminPage
      title="Система"
      description="Глобальные переключатели платформы. Сначала можно остановить новые ставки, затем включить полное тех.обслуживание перед деплоем."
    >
      <AdminPanel
        title="Приём ставок"
        description="Когда выключено, новые ставки crash / roulette не принимаются. Cashout и доигрыш текущих раундов работают. Кейсы, маркет и стейкинг не затрагиваются."
      >
        {loading && !settings ? (
          <div className="h-4 w-56 animate-pulse rounded bg-surface-raised" />
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={form.accept_bets}
                onChange={(e) => setSettings({ ...form, accept_bets: e.target.checked })}
              />
              <span className={!form.accept_bets ? "font-medium text-danger" : undefined}>
                Принимать новые ставки
              </span>
            </label>

            <AdminToolbar>
              <AdminButton
                variant={!form.accept_bets ? "danger" : "primary"}
                disabled={saving || (loading && !settings)}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateAdminMaintenanceSettings({
                      enabled: form.enabled,
                      accept_bets: form.accept_bets,
                      message: form.message_en.trim() || form.message_ru.trim(),
                      message_en: form.message_en.trim(),
                      message_ru: form.message_ru.trim(),
                    });
                    const next = {
                      ...form,
                      message: form.message_en.trim() || form.message_ru.trim(),
                      message_en: form.message_en.trim(),
                      message_ru: form.message_ru.trim(),
                    };
                    setSettings(next);
                    cacheSnapshot(next);
                    showToast({
                      variant: "success",
                      title: form.accept_bets
                        ? "Приём ставок включён"
                        : "Приём новых ставок остановлен",
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

            {!form.accept_bets ? (
              <p className="text-xs text-danger">
                Новые ставки закрыты. Дождитесь доигрыша раундов, затем включайте тех.обслуживание и
                деплойте.
              </p>
            ) : null}
          </div>
        )}
      </AdminPanel>

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

            <AdminLocalizedField
              label="Сообщение на экране"
              hint="Если оба поля пустые — игрок увидит стандартный текст на своём языке."
              en={form.message_en}
              ru={form.message_ru}
              onEnChange={(message_en) => setSettings({ ...form, message_en })}
              onRuChange={(message_ru) => setSettings({ ...form, message_ru })}
              multiline
              maxLength={500}
              enPlaceholder="We'll be back soon."
              ruPlaceholder="Скоро вернёмся."
            />

            <AdminToolbar>
              <AdminButton
                variant={form.enabled ? "danger" : "primary"}
                disabled={saving || (loading && !settings)}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateAdminMaintenanceSettings({
                      enabled: form.enabled,
                      accept_bets: form.accept_bets,
                      message: form.message_en.trim() || form.message_ru.trim(),
                      message_en: form.message_en.trim(),
                      message_ru: form.message_ru.trim(),
                    });
                    const next = {
                      ...form,
                      message: form.message_en.trim() || form.message_ru.trim(),
                      message_en: form.message_en.trim(),
                      message_ru: form.message_ru.trim(),
                    };
                    setSettings(next);
                    cacheSnapshot(next);
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
        title="Депозит Stars"
        description="Курс Telegram Stars → USD. Вместе с живым TON/USD из Crypto Bot считает, сколько TON игрок получит за Stars."
      >
        {loading && !depositSettings ? (
          <div className="h-4 w-56 animate-pulse rounded bg-surface-raised" />
        ) : (
          <div className="space-y-4">
            <AdminField
              label="USD за 1 Star"
              hint="Лист-прайс Telegram ~0.013. Ниже — выгоднее игроку (больше TON за те же Stars), выше — дороже."
            >
              <input
                className="input-field"
                type="number"
                inputMode="decimal"
                min={0.0001}
                max={10}
                step={0.001}
                value={starsRateInput}
                onChange={(e) => setStarsRateInput(e.target.value.replace(",", "."))}
              />
            </AdminField>

            <AdminToolbar>
              <AdminButton
                disabled={savingDeposit || (loading && !depositSettings)}
                onClick={async () => {
                  const rate = Number(starsRateInput);
                  if (!Number.isFinite(rate) || rate <= 0 || rate > 10) {
                    showToast({
                      variant: "error",
                      title: "Некорректный курс",
                      subtitle: "Укажите число больше 0 и не больше 10.",
                    });
                    return;
                  }
                  setSavingDeposit(true);
                  try {
                    await updateAdminDepositSettings({ stars_usd_rate: rate });
                    const next = { ...depositForm, stars_usd_rate: rate };
                    setDepositSettings(next);
                    setStarsRateInput(String(rate));
                    cacheSnapshot(form, withdrawalForm, next);
                    showToast({
                      variant: "success",
                      title: "Курс Stars сохранён",
                      subtitle: `$${rate} за 1 Star`,
                    });
                  } catch (error) {
                    showToast({
                      variant: "error",
                      title: "Не удалось сохранить",
                      subtitle: error instanceof Error ? error.message : undefined,
                    });
                  } finally {
                    setSavingDeposit(false);
                  }
                }}
              >
                {savingDeposit ? "Сохранение…" : "Сохранить"}
              </AdminButton>
            </AdminToolbar>
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Тихий холд выводов"
        description="Игрок не видит блокировку: статусы выглядят как обычное ожидание. Одобрять заявки — в разделе Операции."
      >
        {loading && !withdrawalSettings ? (
          <div className="h-4 w-56 animate-pulse rounded bg-surface-raised" />
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={withdrawalForm.gifts_manual}
                onChange={(e) =>
                  setWithdrawalSettings({ ...withdrawalForm, gifts_manual: e.target.checked })
                }
              />
              <span className={withdrawalForm.gifts_manual ? "font-medium text-danger" : undefined}>
                Ручной вывод подарков
              </span>
            </label>
            <p className="text-xs text-muted -mt-2 ml-7">
              Все выводы подарков уходят в очередь. Игрок видит «Вывод в обработке», без упоминания проверки.
            </p>

            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={withdrawalForm.enabled}
                onChange={(e) =>
                  setWithdrawalSettings({ ...withdrawalForm, enabled: e.target.checked })
                }
              />
              <span className={withdrawalForm.enabled ? "font-medium text-danger" : undefined}>
                Тихий холд TON (и подарков)
              </span>
            </label>
            <p className="text-xs text-muted -mt-2 ml-7">
              Новые выводы TON уходят на ручную проверку. Подарки тоже ставятся в очередь.
            </p>

            <AdminTonField
              label="Суточный авто-лимит TON"
              hint="До этого суммарного лимита в сутки вывод TON идёт автоматически. Если пользователь превышает лимит, заявка уходит на ручное ревью."
              valueNanoton={withdrawalForm.auto_withdraw_daily_limit_nanoton || 0}
              onChangeNanoton={(auto_withdraw_daily_limit_nanoton) =>
                setWithdrawalSettings({
                  ...withdrawalForm,
                  auto_withdraw_daily_limit_nanoton: Math.max(0, auto_withdraw_daily_limit_nanoton),
                })
              }
              decimals={3}
            />

            <AdminToolbar>
              <AdminButton
                variant={withdrawalForm.enabled || withdrawalForm.gifts_manual ? "danger" : "primary"}
                disabled={savingWithdrawals || (loading && !withdrawalSettings)}
                onClick={async () => {
                  setSavingWithdrawals(true);
                  try {
                    await updateAdminWithdrawalSettings({
                      enabled: withdrawalForm.enabled,
                      gifts_manual: withdrawalForm.gifts_manual,
                      auto_withdraw_daily_limit_nanoton: withdrawalForm.auto_withdraw_daily_limit_nanoton || 0,
                    });
                    cacheSnapshot(form, withdrawalForm);
                    showToast({
                      variant: "success",
                      title: "Настройки выводов сохранены",
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

            {withdrawalForm.gifts_manual || withdrawalForm.enabled || (withdrawalForm.auto_withdraw_daily_limit_nanoton || 0) > 0 ? (
              <p className="text-xs text-danger">
                {[
                  withdrawalForm.gifts_manual ? "подарки — ручная очередь" : null,
                  withdrawalForm.enabled ? "TON — тихий холд" : null,
                  (withdrawalForm.auto_withdraw_daily_limit_nanoton || 0) > 0
                    ? `TON авто до ${(withdrawalForm.auto_withdraw_daily_limit_nanoton || 0) / 1_000_000_000} в сутки`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                . Очередь: Операции.
              </p>
            ) : null}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
