"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { connectGameWS } from "@/lib/ws";
import { getCrashState, placeCrashBet } from "@/lib/api";

type CrashState = {
  round_id: string;
  phase: string;
  multiplier: number;
  crash_point?: number;
};

const PHASE_LABEL: Record<string, string> = {
  betting: "Ставки",
  flying: "Полёт",
  crashed: "Краш",
  waiting: "Ожидание",
};

export default function CrashPage() {
  const [state, setState] = useState<CrashState | null>(null);
  const [amount, setAmount] = useState("0.1");
  const [lastBetId, setLastBetId] = useState<string | null>(null);

  useEffect(() => {
    getCrashState().then((s) => setState(s as CrashState)).catch(() => {});
    const disconnect = connectGameWS("crash", (msg) => {
      if (msg.event === "tick") setState(msg.payload as CrashState);
    });
    return disconnect;
  }, []);

  async function bet() {
    const nanotons = Math.floor(parseFloat(amount || "0") * 1_000_000_000);
    if (nanotons <= 0) return;
    const res = (await placeCrashBet(nanotons, crypto.randomUUID())) as { id: string };
    setLastBetId(res.id);
  }

  const phase = state?.phase ?? "waiting";

  return (
    <PageShell title="Crash" description="Забери выигрыш до того, как график упадёт">
      <div className="panel py-10 text-center">
        <p className="text-6xl font-bold tabular-nums text-success">
          {state?.multiplier?.toFixed(2) ?? "1.00"}×
        </p>
        <p className="mt-3 text-sm font-medium text-muted">
          {PHASE_LABEL[phase] ?? phase}
        </p>
        {state?.crash_point && (
          <p className="mt-1 text-sm text-danger">
            Краш на {state.crash_point.toFixed(2)}×
          </p>
        )}
      </div>

      <div className="space-y-3">
        <p className="section-label">Сумма ставки</p>
        <div className="flex items-center rounded-xl border border-border bg-surface-raised px-4 py-3">
          <input
            type="number"
            step="0.01"
            min="0"
            className="w-full bg-transparent text-center text-base font-semibold tabular-nums outline-none"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <span className="text-sm text-muted">TON</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={bet}>Поставить</Button>
        <Button variant="outline" disabled={!lastBetId || !state?.multiplier}>
          Забрать
        </Button>
      </div>
    </PageShell>
  );
}
