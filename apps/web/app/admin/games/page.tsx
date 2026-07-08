"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
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

export default function AdminGamesPage() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<AdminGameStat[]>([]);
  const [configs, setConfigs] = useState<AdminGameConfig[]>([]);
  const [risk, setRisk] = useState<AdminRiskSettings | null>(null);

  async function load() {
    const [statsData, configsData, riskData] = await Promise.all([
      getAdminGameStats(),
      getAdminGameConfigs(),
      getAdminRiskSettings(),
    ]);
    setStats(statsData);
    setConfigs(configsData);
    setRisk(riskData);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <PageShell title="Игры и RTP" description="Лимиты ставок, house edge и ротация seed.">
      <section className="panel space-y-3">
        <p className="text-base font-semibold">Статистика игр</p>
        {stats.map((game) => (
          <div key={game.game_type} className="rounded-xl bg-surface-raised/50 px-3 py-2 text-sm">
            <div className="flex justify-between font-medium uppercase">
              <span>{game.game_type}</span>
              <span>GGR {formatTON(game.ggr_nanoton)} TON</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              RTP факт {(game.actual_rtp_bps / 100).toFixed(2)}% · теор {(game.theoretical_rtp_bps / 100).toFixed(2)}%
            </p>
          </div>
        ))}
      </section>

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Конфигурация игр</p>
        {configs.map((cfg) => (
          <div key={cfg.game_type} className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <p className="font-semibold uppercase">{cfg.game_type}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Min bet (nanoton)
                <input
                  className="input-field mt-1"
                  type="number"
                  value={cfg.min_bet_nanoton}
                  onChange={(e) =>
                    setConfigs((prev) =>
                      prev.map((c) =>
                        c.game_type === cfg.game_type
                          ? { ...c, min_bet_nanoton: Number(e.target.value) }
                          : c,
                      ),
                    )
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Max bet (nanoton)
                <input
                  className="input-field mt-1"
                  type="number"
                  value={cfg.max_bet_nanoton}
                  onChange={(e) =>
                    setConfigs((prev) =>
                      prev.map((c) =>
                        c.game_type === cfg.game_type
                          ? { ...c, max_bet_nanoton: Number(e.target.value) }
                          : c,
                      ),
                    )
                  }
                />
              </label>
              <label className="text-xs text-muted">
                House edge (bps)
                <input
                  className="input-field mt-1"
                  type="number"
                  value={cfg.house_edge_bps}
                  onChange={(e) =>
                    setConfigs((prev) =>
                      prev.map((c) =>
                        c.game_type === cfg.game_type
                          ? { ...c, house_edge_bps: Number(e.target.value) }
                          : c,
                      ),
                    )
                  }
                />
              </label>
              <label className="text-xs text-muted">
                RTP (bps)
                <input
                  className="input-field mt-1"
                  type="number"
                  value={cfg.rtp_bps}
                  onChange={(e) =>
                    setConfigs((prev) =>
                      prev.map((c) =>
                        c.game_type === cfg.game_type ? { ...c, rtp_bps: Number(e.target.value) } : c,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                className="quick-amount quick-amount-active"
                onClick={async () => {
                  await updateAdminGameConfig(cfg);
                  showToast({ variant: "success", title: `${cfg.game_type} сохранён` });
                }}
              >
                Сохранить
              </button>
              <button
                className="quick-amount"
                onClick={async () => {
                  await rotateAdminGameSeed(cfg.game_type);
                  showToast({ variant: "success", title: `Seed ${cfg.game_type} обновлён` });
                }}
              >
                Ротация seed
              </button>
            </div>
          </div>
        ))}
      </section>

      {risk ? (
        <section className="panel space-y-3">
          <p className="text-base font-semibold">Anti-whale лимиты</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Max daily win (nanoton)"
              value={risk.max_daily_win_nanoton}
              onChange={(v) => setRisk({ ...risk, max_daily_win_nanoton: v })}
            />
            <Field
              label="Max round exposure (nanoton)"
              value={risk.max_round_exposure_nanoton}
              onChange={(v) => setRisk({ ...risk, max_round_exposure_nanoton: v })}
            />
            <Field
              label="Whale bet threshold"
              value={risk.whale_bet_threshold_nanoton}
              onChange={(v) => setRisk({ ...risk, whale_bet_threshold_nanoton: v })}
            />
          </div>
          <button
            className="quick-amount quick-amount-active"
            onClick={async () => {
              await updateAdminRiskSettings(risk);
              showToast({ variant: "success", title: "Risk settings сохранены" });
            }}
          >
            Сохранить лимиты
          </button>
        </section>
      ) : null}
    </PageShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-xs text-muted">
      {label}
      <input
        className="input-field mt-1"
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
