"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminFloatField, AdminIntField, AdminPercentField, AdminTonField } from "@/components/admin/AdminInputs";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { AdminButton, AdminPage, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  formatTON,
  getAdminGameConfigs,
  getAdminGameStats,
  getAdminRiskSettings,
  getAdminSocialSimSettings,
  getAdminWheelSegments,
  rotateAdminGameSeed,
  updateAdminGameConfig,
  updateAdminRiskSettings,
  updateAdminSocialSimSettings,
  updateAdminWheelSegment,
  type AdminGameConfig,
  type AdminGameStat,
  type AdminRiskSettings,
  type AdminSocialSimSettings,
  type AdminWheelSegment,
} from "@/lib/api";

const MODE_LABELS: Record<string, string> = {
  wheel: "Лаки страйк",
  crash: "Crash",
  roulette: "Рулетка",
  pvp: "Комнаты",
};

const MODE_ORDER = ["wheel", "crash", "roulette", "pvp"] as const;
const NON_WHEEL_GAME_TYPES = ["crash", "roulette", "pvp"] as const;

function previewOnline(sim: AdminSocialSimSettings | null): number {
  if (!sim?.enabled || !sim.lobby_enabled) return 0;
  const hour = new Date().getHours();
  const tod =
    Array.isArray(sim.tod_multipliers) && sim.tod_multipliers.length === 24
      ? sim.tod_multipliers[hour]
      : 1;
  return Math.round(((sim.online_base_min + sim.online_base_max) / 2) * tod);
}

export default function GamesSection() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<AdminGameStat[]>([]);
  const [configs, setConfigs] = useState<AdminGameConfig[]>([]);
  const [risk, setRisk] = useState<AdminRiskSettings | null>(null);
  const [sim, setSim] = useState<AdminSocialSimSettings | null>(null);
  const [wheelSegments, setWheelSegments] = useState<AdminWheelSegment[]>([]);
  const [wheelDrafts, setWheelDrafts] = useState<Record<string, AdminWheelSegment>>({});
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<string | null>(null);
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const onlinePreview = useMemo(() => previewOnline(sim), [sim]);
  const wheelChanceTotal = wheelSegments.reduce((sum, seg) => {
    const draftSeg = wheelDrafts[seg.id] ?? seg;
    return draftSeg.active ? sum + Math.max(0, draftSeg.chance_percent) : sum;
  }, 0);

  async function load() {
    setLoading(true);
    try {
      const [statsData, configsData, riskData, simData, wheelData] = await loadCached(
        "admin:games:v3",
        () =>
          Promise.all([
            getAdminGameStats(),
            getAdminGameConfigs(),
            getAdminRiskSettings(),
            getAdminSocialSimSettings(),
            getAdminWheelSegments(),
          ]),
      );
      setStats(statsData);
      setConfigs(configsData);
      setRisk(riskData);
      setSim(simData);
      setWheelSegments(wheelData);
      setWheelDrafts(Object.fromEntries(wheelData.map((seg) => [seg.id, { ...seg }])));
      primeCache("admin:games:v3", [statsData, configsData, riskData, simData, wheelData]);
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

  function patchWheelDraft(id: string, patch: Partial<AdminWheelSegment>) {
    setWheelDrafts((prev) => {
      const base = prev[id] ?? wheelSegments.find((s) => s.id === id);
      if (!base) return prev;
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  async function handleSaveSegment(id: string) {
    const draftSeg = wheelDrafts[id];
    if (!draftSeg) return;
    setSavingSegmentId(id);
    try {
      const updated = await updateAdminWheelSegment(id, {
        label: draftSeg.label.trim(),
        amount_nanoton: draftSeg.amount_nanoton,
        chance_percent: draftSeg.chance_percent,
        sort_order: draftSeg.sort_order,
        active: draftSeg.active,
      });
      setWheelDrafts((prev) => ({ ...prev, [id]: updated }));
      await load();
      showToast({ variant: "success", title: "Приз сохранён" });
    } catch (error) {
      showToast({
        variant: "error",
        title: error instanceof Error ? error.message : "Не удалось сохранить приз",
      });
    } finally {
      setSavingSegmentId(null);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<
        [AdminGameStat[], AdminGameConfig[], AdminRiskSettings, AdminSocialSimSettings, AdminWheelSegment[]]
      >("admin:games:v3");
      if (cached) {
        setStats(cached[0]);
        setConfigs(cached[1]);
        setRisk(cached[2]);
        setSim(cached[3]);
        setWheelSegments(cached[4]);
        setWheelDrafts(Object.fromEntries(cached[4].map((seg) => [seg.id, { ...seg }])));
      }
      load().catch(() => {});
    });
  }, []);

  return (
    <AdminPage
      title="Игры"
      description="Игровой домен: обзор режимов, конфигурация игр, Лаки страйк, social sim и anti-whale лимиты."
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
          {NON_WHEEL_GAME_TYPES.map((gameType) => {
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

      <AdminPanel title="Призы Лаки страйк" description={`Сумма активных шансов: ${wheelChanceTotal.toFixed(2)}%`}>
        {loading && wheelSegments.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-surface-raised/50" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {wheelSegments.map((seg) => {
              const row = wheelDrafts[seg.id] ?? seg;
              const saving = savingSegmentId === seg.id;
              return (
                <div key={seg.id} className="space-y-2 rounded-xl bg-surface-raised/50 px-3 py-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs text-muted">
                      Название
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
                        value={row.label}
                        onChange={(e) => patchWheelDraft(seg.id, { label: e.target.value })}
                      />
                    </label>
                    <AdminTonField
                      label="Приз (TON)"
                      valueNanoton={row.amount_nanoton}
                      onChangeNanoton={(v) => patchWheelDraft(seg.id, { amount_nanoton: v })}
                    />
                    <AdminFloatField
                      label="Шанс %"
                      min={0.01}
                      step={0.01}
                      value={row.chance_percent}
                      onChange={(v) => patchWheelDraft(seg.id, { chance_percent: v })}
                    />
                    <AdminIntField
                      label="Порядок"
                      min={0}
                      value={row.sort_order}
                      onChange={(v) => patchWheelDraft(seg.id, { sort_order: v })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(e) => patchWheelDraft(seg.id, { active: e.target.checked })}
                      />
                      Активен
                    </label>
                    <AdminButton disabled={saving} onClick={() => void handleSaveSegment(seg.id)}>
                      {saving ? "…" : "Сохранить"}
                    </AdminButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminPanel>

      {sim ? (
        <AdminPanel title="Соц. симуляция" description={`Сейчас визуальный онлайн ≈ ${onlinePreview}`}>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2">
              Включено
              <AdminInfoHint
                label="Включено"
                hint="Только визуальный оверлей, без влияния на реальные ставки и GGR."
              />
            </span>
            <input
              type="checkbox"
              checked={sim.enabled}
              onChange={(event) => setSim({ ...sim, enabled: event.target.checked })}
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AdminIntField label="Online min" value={sim.online_base_min} onChange={(v) => setSim({ ...sim, online_base_min: v })} />
            <AdminIntField label="Online max" value={sim.online_base_max} onChange={(v) => setSim({ ...sim, online_base_max: v })} />
            <AdminFloatField label="Jitter" value={sim.online_jitter} onChange={(v) => setSim({ ...sim, online_jitter: v })} />
            <AdminFloatField label="Chaos" value={sim.chaos} onChange={(v) => setSim({ ...sim, chaos: v })} />
          </div>
          <AdminToolbar>
            <AdminButton
              onClick={async () => {
                await updateAdminSocialSimSettings(sim);
                showToast({ variant: "success", title: "Соц. симуляция сохранена" });
              }}
            >
              Сохранить симуляцию
            </AdminButton>
          </AdminToolbar>
        </AdminPanel>
      ) : null}

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
    </AdminPage>
  );
}
