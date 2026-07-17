"use client";

import { AdminPage, AdminButton, AdminField, AdminPanel } from "@/components/admin/admin-ui";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import {
  createOutcomeOverride,
  deleteOutcomeOverride,
  listOutcomeOverrides,
  type AdminOutcomeOverride,
  type AdminOutcomeCrashTarget,
  type AdminOutcomePvPTarget,
  type AdminOutcomeRouletteTarget,
} from "@/lib/api";

type GameType = "roulette" | "crash" | "pvp";
type Mode = "force" | "bias";

const ROULETTE_COLORS = [
  { value: "red", label: "Красное" },
  { value: "black", label: "Чёрное" },
  { value: "green", label: "Зелёное" },
];

export default function OutcomeSection() {
  const { showToast } = useToast();
  const [overrides, setOverrides] = useState<AdminOutcomeOverride[]>([]);
  const [loading, setLoading] = useState(true);

  const [game, setGame] = useState<GameType>("roulette");
  const [mode, setMode] = useState<Mode>("force");
  const [weight, setWeight] = useState("100");
  const [duration, setDuration] = useState("0");

  const [rouletteColor, setRouletteColor] = useState("red");
  const [rouletteNumber, setRouletteNumber] = useState("");
  const [crashExact, setCrashExact] = useState("");
  const [crashMin, setCrashMin] = useState("1.5");
  const [crashMax, setCrashMax] = useState("3");
  const [pvpWinner, setPvpWinner] = useState("");

  const [rounds, setRounds] = useState("1");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setOverrides(await listOutcomeOverrides());
    } catch (e) {
      showToast({ title: "Не удалось загрузить назначения", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    const w = Math.min(100, Math.max(0, Number(weight) || 0));
    let target: AdminOutcomeRouletteTarget | AdminOutcomeCrashTarget | AdminOutcomePvPTarget;
    if (game === "roulette") {
      const t: AdminOutcomeRouletteTarget = { color: rouletteColor, mode, weight: w };
      if (rouletteNumber.trim() !== "") {
        const n = Number(rouletteNumber);
        if (!Number.isNaN(n)) t.number = n;
      }
      target = t;
    } else if (game === "crash") {
      const t: AdminOutcomeCrashTarget = {
        min_point: Math.max(1, Number(crashMin) || 1),
        max_point: Math.max(1, Number(crashMax) || 1),
        mode,
        weight: w,
      };
      if (crashExact.trim() !== "") {
        const ep = Number(crashExact);
        if (!Number.isNaN(ep) && ep >= 1) t.exact_point = ep;
      }
      target = t;
    } else {
      if (!pvpWinner.trim()) {
        showToast({ title: "Укажите ID победителя", variant: "error" });
        return;
      }
      target = { winner_id: pvpWinner.trim(), mode, weight: w };
    }
    setSubmitting(true);
    try {
      await createOutcomeOverride(game, target, Number(rounds) || 1, Number(duration) || 0, note.trim());
      showToast({ title: "Исход назначен", variant: "success" });
      setNote("");
      setPvpWinner("");
      await load();
    } catch (e) {
      showToast({ title: "Не удалось назначить исход", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteOutcomeOverride(id);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      showToast({ title: "Не удалось удалить", variant: "error" });
    }
  }

  function describeTarget(o: AdminOutcomeOverride): string {
    const t = o.target as any;
    const modeLabel = t?.mode === "bias" ? `bias ${t?.weight ?? 100}%` : "force";
    if (o.game_type === "roulette") {
      const label = ROULETTE_COLORS.find((c) => c.value === t?.color)?.label ?? t?.color;
      return `${label}${t?.number != null ? ` (${t.number})` : ""} · ${modeLabel}`;
    }
    if (o.game_type === "crash") {
      const pt = t?.exact_point ? `${t.exact_point}×` : `${t?.min_point}×–${t?.max_point}×`;
      return `crash ${pt} · ${modeLabel}`;
    }
    return `победитель ${t?.winner_id?.slice(0, 8)}… · ${modeLabel}`;
  }

  return (
    <AdminPage title="Управление исходами">
      <div className="space-y-4">
        <AdminPanel
          title="Назначить исход"
          description="Движок подбирает server seed, который естественным образом даёт нужный результат — provably-fair проверка остаётся валидной (флаг admin_influenced в proof)."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="Игра">
                <select className="input-field" value={game} onChange={(e) => setGame(e.target.value as GameType)}>
                  <option value="roulette">Рулетка</option>
                  <option value="crash">Crash</option>
                  <option value="pvp">PvP</option>
                </select>
              </AdminField>
              <AdminField label="Режим" hint="force — всегда; bias — с заданной вероятностью">
                <select className="input-field" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  <option value="force">Точно (force)</option>
                  <option value="bias">С вероятностью (bias)</option>
                </select>
              </AdminField>
            </div>

            {mode === "bias" && (
              <AdminField label="Сила влияния, %" hint="Доля раундов, которые будут подкручены">
                <input className="input-field" type="number" min="0" max="100" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </AdminField>
            )}

            {game === "roulette" && (
              <div className="grid grid-cols-2 gap-3">
                <AdminField label="Цвет">
                  <select className="input-field" value={rouletteColor} onChange={(e) => setRouletteColor(e.target.value)}>
                    {ROULETTE_COLORS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Число (необязательно)">
                  <input className="input-field" type="number" min="0" max="14" value={rouletteNumber} onChange={(e) => setRouletteNumber(e.target.value)} placeholder="любое" />
                </AdminField>
              </div>
            )}

            {game === "crash" && (
              <>
                <AdminField label="Точный множитель (необязательно)" hint="Если задан — раунд выпадет ровно на нём">
                  <input className="input-field" type="number" step="0.01" min="1" value={crashExact} onChange={(e) => setCrashExact(e.target.value)} placeholder="напр. 2.50" />
                </AdminField>
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="Мин. множитель">
                    <input className="input-field" type="number" step="0.1" min="1" value={crashMin} onChange={(e) => setCrashMin(e.target.value)} />
                  </AdminField>
                  <AdminField label="Макс. множитель">
                    <input className="input-field" type="number" step="0.1" min="1" value={crashMax} onChange={(e) => setCrashMax(e.target.value)} />
                  </AdminField>
                </div>
              </>
            )}

            {game === "pvp" && (
              <AdminField label="ID победителя (user_id)">
                <input className="input-field" value={pvpWinner} onChange={(e) => setPvpWinner(e.target.value)} placeholder="uuid победителя" />
              </AdminField>
            )}

            <div className="grid grid-cols-3 gap-3">
              <AdminField label="Кол-во раундов">
                <input className="input-field" type="number" min="1" value={rounds} onChange={(e) => setRounds(e.target.value)} />
              </AdminField>
              <AdminField label="Длительность, мин" hint="0 — без лимита">
                <input className="input-field" type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </AdminField>
              <AdminField label="Заметка">
                <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" />
              </AdminField>
            </div>

            <AdminButton onClick={submit} disabled={submitting}>
              {submitting ? "Назначение…" : "Назначить исход"}
            </AdminButton>
          </div>
        </AdminPanel>

        <AdminPanel title="Активные назначения" description="Расходуются по одному на следующие раунды/комнаты выбранной игры.">
          {loading ? (
            <p className="text-sm text-muted">Загрузка…</p>
          ) : overrides.length === 0 ? (
            <p className="text-sm text-muted">Нет активных назначений.</p>
          ) : (
            <ul className="space-y-2">
              {overrides.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-lg bg-surface-raised/50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium capitalize">{o.game_type}</span> — {describeTarget(o)} · осталось {o.rounds_remaining}
                    {o.note ? <span className="text-muted"> · {o.note}</span> : null}
                  </span>
                  <AdminButton variant="danger" onClick={() => remove(o.id)}>
                    Удалить
                  </AdminButton>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
