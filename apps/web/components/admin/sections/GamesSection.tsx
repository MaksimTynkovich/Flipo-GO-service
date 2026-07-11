"use client";

import { AdminButton, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import {
  formatTON,
  getAdminGameConfigs,
  getAdminGameStats,
  getAdminRiskSettings,
  getAdminSocialSimSettings,
  rotateAdminGameSeed,
  updateAdminGameConfig,
  updateAdminRiskSettings,
  updateAdminSocialSimSettings,
  type AdminGameConfig,
  type AdminGameStat,
  type AdminRiskSettings,
  type AdminSocialSimSettings,
} from "@/lib/api";

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
  const [loading, setLoading] = useState(true);
  const onlinePreview = useMemo(() => previewOnline(sim), [sim]);

  async function load() {
    setLoading(true);
    const [statsData, configsData, riskData, simData] = await loadCached("admin:games", () =>
      Promise.all([
        getAdminGameStats(),
        getAdminGameConfigs(),
        getAdminRiskSettings(),
        getAdminSocialSimSettings(),
      ]),
    );
    setStats(statsData);
    setConfigs(configsData);
    setRisk(riskData);
    setSim(simData);
    primeCache("admin:games", [statsData, configsData, riskData, simData]);
    setLoading(false);
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<
        [AdminGameStat[], AdminGameConfig[], AdminRiskSettings, AdminSocialSimSettings]
      >("admin:games");
      if (cached) {
        setStats(cached[0]);
        setConfigs(cached[1]);
        setRisk(cached[2]);
        setSim(cached[3]);
      }
      load().catch(() => {});
    });
  }, []);

  return (
    <PageShell title="Игры" description="Настройки RTP, лимиты ставок и ротация seed.">
      <section className="panel space-y-3">
        <p className="text-base font-semibold">Статистика игр</p>
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
                RTP факт {(game.actual_rtp_bps / 100).toFixed(2)}% · теор{" "}
                {(game.theoretical_rtp_bps / 100).toFixed(2)}%
              </p>
            </div>
          ))
        )}
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
          </div>
        ))}
      </section>

      {sim ? (
        <section className="panel space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold">Соц. симуляция</p>
                <AdminInfoHint
                  label="Соц. симуляция"
                  hint="Только визуальный оверлей: фейк-онлайн, ставки и комнаты не пишутся в БД, не трогают балансы и GGR. Выключите master-тумблер — оверлей мгновенно исчезнет, реальный трафик не изменится."
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                Визуальный онлайн и фейк-ставки без записи в БД и без влияния на GGR.
              </p>
            </div>
            <p className="shrink-0 rounded-lg bg-surface-raised/60 px-2.5 py-1 text-xs font-medium">
              Сейчас ≈ {onlinePreview}
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2">
              Включено
              <AdminInfoHint
                label="Включено"
                hint="Главный выключатель. Off — пустой оверлей сразу. On — симулятор крутит онлайн, ghost-ставки и ghost-комнаты по остальным тумблерам."
              />
            </span>
            <input
              type="checkbox"
              checked={sim.enabled}
              onChange={(e) => setSim({ ...sim, enabled: e.target.checked })}
            />
          </label>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(
              [
                [
                  "lobby_enabled",
                  "Лобби",
                  "Показывает онлайн в шапке и на карточках режимов. Без этого бейджи останутся статичными.",
                ],
                [
                  "crash_enabled",
                  "Crash",
                  "Фейк-ставки в ленте Crash и доля онлайна Crash. Не влияет на реальные ставки и settlement.",
                ],
                [
                  "roulette_enabled",
                  "Рулетка",
                  "Фейк-ставки по цветам в рулетке. После спина статусы won/lost только визуальные.",
                ],
                [
                  "pvp_enabled",
                  "PvP",
                  "Фейк-комнаты ботов + боты заходят в открытые комнаты игроков. Матчи с ботом идут через БД и учитываются в GGR.",
                ],
              ] as const
            ).map(([key, label, hint]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5"
              >
                <span className="inline-flex items-center gap-1.5 text-xs">
                  {label}
                  <AdminInfoHint label={label} hint={hint} />
                </span>
                <input
                  type="checkbox"
                  checked={sim[key]}
                  onChange={(e) => setSim({ ...sim, [key]: e.target.checked })}
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Online min"
              hint="Нижняя граница «живого» онлайна до учёта времени суток. Реальный ползунок плавно тянется к цели между min и max."
              value={sim.online_base_min}
              onChange={(v) => setSim({ ...sim, online_base_min: v })}
            />
            <Field
              label="Online max"
              hint="Верхняя граница онлайна. Вечером (высокий TOD) число ближе к max, ночью — ближе к min×TOD."
              value={sim.online_base_max}
              onChange={(v) => setSim({ ...sim, online_base_max: v })}
            />
            <FloatField
              label="Jitter (0–1)"
              hint="Случайный шум вокруг целевого онлайна. 0 — почти ровная линия, 0.1–0.2 — лёгкая «живость», выше 0.3 — заметные колебания."
              value={sim.online_jitter}
              onChange={(v) => setSim({ ...sim, online_jitter: v })}
            />
            <FloatField
              label="Chaos (0–1)"
              hint="Разброс пауз и «тишины» между событиями. Выше — реже, но пачками; ниже — ровнее поток ставок и комнат."
              value={sim.chaos}
              onChange={(v) => setSim({ ...sim, chaos: v })}
            />
            <FloatField
              label="Bet intensity"
              hint="Сколько примерно фейк-ставок за одно betting-окно Crash/Roulette (ещё умножается на TOD). 6–12 — умеренно, 20+ — очень шумно."
              value={sim.bet_intensity}
              onChange={(v) => setSim({ ...sim, bet_intensity: v })}
            />
            <FloatField
              label="Bet burst chance"
              hint="Вероятность «пачки» ставок сразу (2–3 штуки), особенно в начале окна и за 2–3 с до конца. 0.3–0.4 выглядит естественно."
              value={sim.bet_burst_chance}
              onChange={(v) => setSim({ ...sim, bet_burst_chance: v })}
            />
            <Field
              label="Idle gap min (ms)"
              hint="Минимальная пауза между фейк-ставками. Меньше — плотнее лента. Обычно 300–600 мс."
              value={sim.idle_gap_ms_min}
              onChange={(v) => setSim({ ...sim, idle_gap_ms_min: v })}
            />
            <Field
              label="Idle gap max (ms)"
              hint="Максимальная пауза между ставками. Вместе с chaos даёт «дыхание» ленты. 1500–2500 мс — спокойный ритм."
              value={sim.idle_gap_ms_max}
              onChange={(v) => setSim({ ...sim, idle_gap_ms_max: v })}
            />
            <FloatField
              label="Stake p50 frac"
              hint="Медиана суммы ставки как доля от диапазона min–max bet игры. 0.1–0.2 = чаще мелкие ставки. Не абсолютные TON."
              value={sim.stake_p50}
              onChange={(v) => setSim({ ...sim, stake_p50: v })}
            />
            <FloatField
              label="Stake p90 frac"
              hint="90-й перцентиль доли ставки. Редкие крупные ставки тянутся сюда и выше. Держите выше p50 (например 0.5–0.6)."
              value={sim.stake_p90}
              onChange={(v) => setSim({ ...sim, stake_p90: v })}
            />
            <FloatField
              label="Crash auto-cashout share"
              hint="Доля ботов с авто-кэшаутом. Остальные «вручную» выходят реже во время полёта. ~0.5–0.6 выглядит живо."
              value={sim.crash_auto_cashout_share}
              onChange={(v) => setSim({ ...sim, crash_auto_cashout_share: v })}
            />
            <FloatField
              label="Crash cashout min×"
              hint="Минимальный множитель авто/ручного кэшаута ботов. Обычно от 1.15–1.3."
              value={sim.crash_cashout_min}
              onChange={(v) => setSim({ ...sim, crash_cashout_min: v })}
            />
            <FloatField
              label="Crash cashout max×"
              hint="Максимальный множитель кэшаута ботов. Слишком высокий — много «пролётов» до краша; 3–5× обычно достаточно."
              value={sim.crash_cashout_max}
              onChange={(v) => setSim({ ...sim, crash_cashout_max: v })}
            />
            <Field
              label="PvP max ghost rooms"
              hint="Сколько фейк-комнат максимум видно в лобби одновременно. 3–5 достаточно; больше забивает реальные комнаты."
              value={sim.pvp_max_ghost_rooms}
              onChange={(v) => setSim({ ...sim, pvp_max_ghost_rooms: v })}
            />
            <Field
              label="PvP TTL min (sec)"
              hint="Минимальное время жизни открытой ghost-комнаты, если второй «игрок» не зашёл. Короче — быстрее ротация карточек."
              value={sim.pvp_room_ttl_sec_min}
              onChange={(v) => setSim({ ...sim, pvp_room_ttl_sec_min: v })}
            />
            <Field
              label="PvP TTL max (sec)"
              hint="Максимальное время жизни открытой ghost-комнаты. Вместе с min задаёт разброс появления/исчезновения."
              value={sim.pvp_room_ttl_sec_max}
              onChange={(v) => setSim({ ...sim, pvp_room_ttl_sec_max: v })}
            />
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
        </section>
      ) : null}

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
        </section>
      ) : null}
    </PageShell>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        {label}
        {hint ? <AdminInfoHint label={label} hint={hint} /> : null}
      </span>
      <input
        className="input-field mt-1"
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function FloatField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        {label}
        {hint ? <AdminInfoHint label={label} hint={hint} /> : null}
      </span>
      <input
        className="input-field mt-1"
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
