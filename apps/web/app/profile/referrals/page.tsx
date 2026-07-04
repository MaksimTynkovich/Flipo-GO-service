"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Copy, Users } from "lucide-react";

export default function ProfileReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const referralLink = user
    ? `https://t.me/FlipoBot?start=ref_${user.id}`
    : "https://t.me/FlipoBot";

  async function handleCopy() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageShell description="Приглашай друзей и получай бонусы за их активность">
      <div className="panel flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15">
          <Users className="h-8 w-8 text-success" />
        </div>
        <div>
          <p className="font-semibold">Скоро</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Реферальная программа в разработке. Приглашай друзей и получай процент с их ставок.
          </p>
        </div>
      </div>

      <div className="panel space-y-3">
        <p className="section-label">Твоя ссылка</p>
        <p className="break-all text-sm text-muted">{referralLink}</p>
        <Button className="w-full" variant="outline" onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          {copied ? "Скопировано" : "Копировать ссылку"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="panel text-center">
          <p className="text-2xl font-bold tabular-nums">—</p>
          <p className="mt-1 text-xs text-muted">Приглашено</p>
        </div>
        <div className="panel text-center">
          <p className="text-2xl font-bold tabular-nums">—</p>
          <p className="mt-1 text-xs text-muted">Заработано</p>
        </div>
      </div>
    </PageShell>
  );
}
