"use client";

import { useEffect, useState } from "react";
import { WalletBar } from "@/components/WalletBar";
import { Button, Card } from "@/components/ui/button";
import { connectGameWS } from "@/lib/ws";
import { getCrashState, placeCrashBet } from "@/lib/api";

type CrashState = {
  round_id: string;
  phase: string;
  multiplier: number;
  crash_point?: number;
};

export default function CrashPage() {
  const [state, setState] = useState<CrashState | null>(null);
  const [amount, setAmount] = useState("100000000");
  const [lastBetId, setLastBetId] = useState<string | null>(null);

  useEffect(() => {
    getCrashState().then((s) => setState(s as CrashState)).catch(() => {});
    const disconnect = connectGameWS("crash", (msg) => {
      if (msg.event === "tick") setState(msg.payload as CrashState);
    });
    return disconnect;
  }, []);

  async function bet() {
    const res = await placeCrashBet(Number(amount), crypto.randomUUID()) as { id: string };
    setLastBetId(res.id);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Crash</h1>
      <WalletBar />

      <Card className="py-8 text-center">
        <p className="text-5xl font-bold text-accent">
          {state?.multiplier?.toFixed(2) ?? "1.00"}x
        </p>
        <p className="mt-2 text-sm capitalize text-zinc-400">{state?.phase ?? "waiting"}</p>
        {state?.crash_point && (
          <p className="text-sm text-danger">Crashed at {state.crash_point.toFixed(2)}x</p>
        )}
      </Card>

      <input
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (nanotons)"
      />

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={bet}>Place Bet</Button>
        <Button variant="outline" disabled={!lastBetId || !state?.multiplier}>
          Cash Out (use API)
        </Button>
      </div>
    </div>
  );
}
