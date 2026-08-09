"use client";

import { useEffect, useState } from "react";
import { AdminIntField, AdminPercentField, AdminTonField } from "@/components/admin/AdminInputs";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { AdminButton, AdminPage, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  formatTON,
  getAdminGameConfigs,
  getAdminGameStats,
  getAdminRiskSettings,
  rotateAdminGameSeed,
  updateAdminGameConfig,
  updateAdminRiskSettings,
  type AdminGameConfig,
  type AdminGameStat,
  type AdminRiskSettings,
} from "@/lib/api";

const MODE_LABELS: Record<string, string> = {
  crash: "Crash",
  roulette: "Рулетка",
};

const GAME_TYPES = ["crash", "roulette"] as const;

export default function GamesSection() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<AdminGameStat[]>([]);
  const [configs, setConfigs] = useState<AdminGameConfig[]>([]);
  const [risk, setRisk] = useState<AdminRiskSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [statsData, configsData, riskData] = await loadCached(
        "admin:games:v6",
        () =>
          Promise.all([
            getAdminGameStats(),
            getAdminGameConfigs(),
            getAdminRiskSettings(),
          ]),
      );
      setStats(statsData);
      setConfigs(configsData);
      setRisk(riskData);
      primeCache("admin:games:v6", [statsData, configsData, riskData]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleModeEnabled(cfg: AdminGameConfig, enabled: boolean) {
    setSavingMode(cfg.game_type);
    const next = { ...cfg, enabled };
    try {
      await updateAdminGameConfig(next);
      setConfigs((prev) => prev.map((c) => (c.game_type === cfg.game_type ? next : c)));
      showToast({
        variant: "success",
        title: enabled
          ? `${MODE_LABELS[cfg.game_type] ?? cfg.game_type}: включён для всех`
          : `${MODE_LABELS[cfg.game_type] ?? cfg.game_type}: только для админов`,
      });
    } catch (error) {
      showToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Не удалось сохранить",
      });
    } finally {
      setSavingMode(null);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<[AdminGameStat[], AdminGameConfig[], AdminRiskSettings]>("admin:games:v6");
      if (cached) {
        setStats(cached[0]);
        setConfigs(cached[1]);
        setRisk(cached[2]);
      }
      load().catch(() => {});
    });
  }, []);

  return (
    <AdminPage
      title="Игры"
      description="Игровой домен: обзор режимов, конфигурация игр и anti-whale лимиты."
    >
      <AdminPanel title="Статистика игр" description="Фактический RTP и GGR по режимам.">
        {stats.length === 0 && loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
              <div className="h-4 w-28 animate-pulse rounded bg-surface-raised" />
              <div className="mt-2 h-3 w-40 animate-pulse rounded bg-surface-raised" />
            </div>
          ))
        ) : (
          stats.map((game) => (
            <div key={game.game_type} className="rounded-xl bg-surface-raised/50 px-3 py-2 text-sm">
              <div className="flex justify-between font-medium uppercase">
                <span>{game.game_type}</span>
                <span>GGR {formatTON(game.ggr_nanoton)} TON</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                RTP факт {(game.actual_rtp_bps / 100).toFixed(2)}% · теор {(game.theoretical_rtp_bps / 100).toFixed(2)}%
              </p>
            </div>
          ))
        )}
      </AdminPanel>

      {configs.length === 0 && loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-xl bg-surface-raised/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {GAME_TYPES.map((gameType) => {
            const cfg = configs.find((c) => c.game_type === gameType);
            if (!cfg) return null;
            const saving = savingMode === gameType;
            return (
              <AdminPanel
                key={gameType}
                title={MODE_LABELS[gameType] ?? gameType}
                description="Доступность, лимиты, RTP и seed rotation."
              >
                <label
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised/50 px-3 py-3 text-sm"
                  style={{ marginBottom: 12 }}
                >
                  <span className="font-medium">Доступность</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-xs text-muted">{cfg.enabled ? "для всех" : "только админы"}</span>
                    <input
                      type="checkbox"
                      checked={cfg.enabled}
                      disabled={saving}
                      onChange={(event) => void toggleModeEnabled(cfg, event.target.checked)}
                    />
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <AdminTonField
                    label="Мин. ставка (TON)"
                    valueNanoton={cfg.min_bet_nanoton}
                    onChangeNanoton={(value) =>
                      setConfigs((prev) =>
                        prev.map((c) =>
                          c.game_type === cfg.game_type ? { ...c, min_bet_nanoton: value } : c,
                        ),
                      )
                    }
                  />
                  <AdminTonField
                    label="Макс. ставка (TON)"
                    valueNanoton={cfg.max_bet_nanoton}
                    onChangeNanoton={(value) =>
                      setConfigs((prev) =>
                        prev.map((c) =>
                          c.game_type === cfg.game_type ? { ...c, max_bet_nanoton: value } : c,
                        ),
                      )
                    }
                  />
                  <AdminPercentField
                    label="House edge (%)"
                    valueBps={cfg.house_edge_bps}
                    onChangeBps={(value) =>
                      setConfigs((prev) =>
                        prev.map((c) =>
                          c.game_type === cfg.game_type ? { ...c, house_edge_bps: value } : c,
                        ),
                      )
                    }
                  />
                  <AdminPercentField
                    label="RTP (%)"
                    valueBps={cfg.rtp_bps}
                    onChangeBps={(value) =>
                      setConfigs((prev) =>
                        prev.map((c) => (c.game_type === cfg.game_type ? { ...c, rtp_bps: value } : c)),
                      )
                    }
                  />
                </div>

                <AdminToolbar>
                  <AdminButton
                    onClick={async () => {
                      await updateAdminGameConfig(cfg);
                      showToast({ variant: "success", title: `${cfg.game_type} сохранён` });
                    }}
                  >
                    Сохранить
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    onClick={async () => {
                      await rotateAdminGameSeed(cfg.game_type);
                      showToast({ variant: "success", title: `Seed ${cfg.game_type} обновлён` });
                    }}
                  >
                    Ротация seed
                  </AdminButton>
                </AdminToolbar>
              </AdminPanel>
            );
          })}
        </div>
      )}

      {risk ? (
        <AdminPanel title="Anti-whale лимиты" description="Глобальные лимиты риска.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AdminTonField
              label="Макс. выигрыш в день (TON)"
              valueNanoton={risk.max_daily_win_nanoton}
              onChangeNanoton={(v) => setRisk({ ...risk, max_daily_win_nanoton: v })}
            />
            <AdminTonField
              label="Макс. экспозиция раунда (TON)"
              valueNanoton={risk.max_round_exposure_nanoton}
              onChangeNanoton={(v) => setRisk({ ...risk, max_round_exposure_nanoton: v })}
            />
            <AdminTonField
              label="Порог кита (TON)"
              valueNanoton={risk.whale_bet_threshold_nanoton}
              onChangeNanoton={(v) => setRisk({ ...risk, whale_bet_threshold_nanoton: v })}
            />
          </div>
          <AdminToolbar>
            <AdminButton
              onClick={async () => {
                await updateAdminRiskSettings(risk);
                showToast({ variant: "success", title: "Risk settings сохранены" });
              }}
            >
              Сохранить лимиты
            </AdminButton>
          </AdminToolbar>
        </AdminPanel>
      ) : null}

      {risk ? (
        <AdminPanel
          title="Рулетка — отыгрыш дома"
          description="Накопительный банк рулетки. При убытке ниже порога включается recovery: часть раундов после ставок смещается против экспозиции, пока банк не достигнет цели."
        >
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[var(--admin-muted,#8b98a8)]">
            <label className="inline-flex items-center gap-2 text-[var(--admin-fg,#e8eef7)]">
              <input
                type="checkbox"
                checked={Boolean(risk.roulette_recovery_enabled)}
                onChange={(e) =>
                  setRisk({ ...risk, roulette_recovery_enabled: e.target.checked })
                }
              />
              Включить auto-recovery
            </label>
            <span>
              Статус:{" "}
              <strong className="text-[var(--admin-fg,#e8eef7)]">
                {risk.roulette_recovery_active ? "recovery активен" : "обычный режим"}
              </strong>
            </span>
            <AdminInfoHint
              label="Как это работает"
              hint="Банк += ставки − выплаты после каждого раунда. Вход в recovery при банке ≤ порога, выход при банке ≥ цели. Смягчение — % раундов с подкруткой в recovery (остальные честные)."
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AdminTonField
              label="Текущий банк (TON)"
              valueNanoton={risk.roulette_bank_nanoton ?? 0}
              onChangeNanoton={(v) => setRisk({ ...risk, roulette_bank_nanoton: v })}
              allowNegative
              hint="Можно скорректировать вручную. Обновляется автоматически после раундов."
            />
            <AdminTonField
              label="Порог входа (TON)"
              valueNanoton={risk.roulette_loss_threshold_nanoton ?? -50_000_000_000}
              onChangeNanoton={(v) => setRisk({ ...risk, roulette_loss_threshold_nanoton: v })}
              allowNegative
              hint="Обычно отрицательный, напр. -50. Recovery включается при банке ≤ этого значения."
            />
            <AdminTonField
              label="Цель выхода (TON)"
              valueNanoton={risk.roulette_recovery_target_nanoton ?? 0}
              onChangeNanoton={(v) => setRisk({ ...risk, roulette_recovery_target_nanoton: v })}
              allowNegative
              hint="Recovery выключается, когда банк снова ≥ цели (часто 0)."
            />
            <AdminIntField
              label="Смягчение bias (%)"
              value={risk.roulette_recovery_bias_weight ?? 50}
              onChange={(v) =>
                setRisk({
                  ...risk,
                  roulette_recovery_bias_weight: Math.max(0, Math.min(100, v)),
                })
              }
              hint="0 = в recovery без подкрутки, 100 = каждый recovery-раунд против экспозиции."
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--admin-muted,#8b98a8)]">
            Сейчас банк: {formatTON(risk.roulette_bank_nanoton ?? 0)} TON
          </p>
          <AdminToolbar>
            <AdminButton
              variant="secondary"
              onClick={() => setRisk({ ...risk, roulette_bank_nanoton: 0 })}
            >
              Обнулить банк
            </AdminButton>
            <AdminButton
              onClick={async () => {
                await updateAdminRiskSettings(risk);
                showToast({ variant: "success", title: "Recovery settings сохранены" });
                const fresh = await getAdminRiskSettings();
                setRisk(fresh);
              }}
            >
              Сохранить recovery
            </AdminButton>
          </AdminToolbar>
        </AdminPanel>
      ) : null}

      {risk ? (
        <AdminPanel
          title="Crash — отыгрыш дома"
          description="Накопительный банк crash. При убытке ниже порога включается recovery: часть раундов после ставок смещается против экспозиции, пока банк не достигнет цели."
        >
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[var(--admin-muted,#8b98a8)]">
            <label className="inline-flex items-center gap-2 text-[var(--admin-fg,#e8eef7)]">
              <input
                type="checkbox"
                checked={Boolean(risk.crash_recovery_enabled)}
                onChange={(e) =>
                  setRisk({ ...risk, crash_recovery_enabled: e.target.checked })
                }
              />
              Включить auto-recovery
            </label>
            <span>
              Статус:{" "}
              <strong className="text-[var(--admin-fg,#e8eef7)]">
                {risk.crash_recovery_active ? "recovery активен" : "обычный режим"}
              </strong>
            </span>
            <AdminInfoHint
              label="Как это работает"
              hint="Банк += ставки − выплаты. Auto-cashout: случайный crash в окне ниже цели (не вплотную). Крупные manual (≥ порога кита): окно 1.05–1.25×. Смягчение — % раундов с подкруткой."
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AdminTonField
              label="Текущий банк (TON)"
              valueNanoton={risk.crash_bank_nanoton ?? 0}
              onChangeNanoton={(v) => setRisk({ ...risk, crash_bank_nanoton: v })}
              allowNegative
              hint="Можно скорректировать вручную. Обновляется автоматически после раундов."
            />
            <AdminTonField
              label="Порог входа (TON)"
              valueNanoton={risk.crash_loss_threshold_nanoton ?? -50_000_000_000}
              onChangeNanoton={(v) => setRisk({ ...risk, crash_loss_threshold_nanoton: v })}
              allowNegative
              hint="Обычно отрицательный, напр. -50. Recovery включается при банке ≤ этого значения."
            />
            <AdminTonField
              label="Цель выхода (TON)"
              valueNanoton={risk.crash_recovery_target_nanoton ?? 0}
              onChangeNanoton={(v) => setRisk({ ...risk, crash_recovery_target_nanoton: v })}
              allowNegative
              hint="Recovery выключается, когда банк снова ≥ цели (часто 0)."
            />
            <AdminIntField
              label="Смягчение bias (%)"
              value={risk.crash_recovery_bias_weight ?? 50}
              onChange={(v) =>
                setRisk({
                  ...risk,
                  crash_recovery_bias_weight: Math.max(0, Math.min(100, v)),
                })
              }
              hint="0 = в recovery без подкрутки, 100 = каждый recovery-раунд против экспозиции."
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--admin-muted,#8b98a8)]">
            Сейчас банк: {formatTON(risk.crash_bank_nanoton ?? 0)} TON
          </p>
          <AdminToolbar>
            <AdminButton
              variant="secondary"
              onClick={() => setRisk({ ...risk, crash_bank_nanoton: 0 })}
            >
              Обнулить банк
            </AdminButton>
            <AdminButton
              onClick={async () => {
                await updateAdminRiskSettings(risk);
                showToast({ variant: "success", title: "Crash recovery settings сохранены" });
                const fresh = await getAdminRiskSettings();
                setRisk(fresh);
              }}
            >
              Сохранить recovery
            </AdminButton>
          </AdminToolbar>
        </AdminPanel>
      ) : null}
    </AdminPage>
  );
}
