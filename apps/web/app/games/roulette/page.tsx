"use client";

import { useEffect, useState } from "react";
import { WalletBar } from "@/components/WalletBar";
import { Button, Card } from "@/components/ui/button";
import { connectGameWS } from "@/lib/ws";
import { getRouletteState, placeRouletteBet } from "@/lib/api";

type RoundState = {
  round_id: string;
  round_number: number;
  phase: string;
  ends_at: string;
  result?: string;
};

export default function RoulettePage() {
  const [state, setState] = useState<RoundState | null>(null);
  const [amount, setAmount] = useState("100000000");
  const [betting, setBetting] = useState(false);

  useEffect(() => {
    getRouletteState().then((s) => setState(s as RoundState)).catch(() => {});
    const disconnect = connectGameWS("roulette", (msg) => {
      if (msg.event === "tick") setState(msg.payload as RoundState);
    });
    return disconnect;
  }, []);

  async function bet(color: string) {
    setBetting(true);
    try {
      await placeRouletteBet(color, Number(amount), crypto.randomUUID());
    } finally {
      setBetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Roulette</h1>
      <WalletBar />

      <Card className="text-center">
        <p className="text-xs text-zinc-400">Round #{state?.round_number ?? "—"}</p>
        <p className="text-2xl font-bold capitalize">{state?.phase ?? "waiting"}</p>
        {state?.result && <p className="text-lg text-accent">Result: {state.result}</p>}
      </Card>

      <input
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (nanotons)"
      />

      <div className="grid grid-cols-3 gap-2">
        <Button className="bg-red-600 hover:bg-red-700" disabled={betting} onClick={() => bet("red")}>
          Red 2x
        </Button>
        <Button className="bg-green-600 hover:bg-green-700" disabled={betting} onClick={() => bet("green")}>
          Green 14x
        </Button>
        <Button className="bg-zinc-800 hover:bg-zinc-700" disabled={betting} onClick={() => bet("black")}>
          Black 2x
        </Button>
      </div>
    </div>
  );
}
