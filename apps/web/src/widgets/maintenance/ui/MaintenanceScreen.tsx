"use client";

import { Wrench } from "lucide-react";

const DEFAULT_MESSAGE = "Проводим техническое обслуживание. Скоро вернёмся.";

export function MaintenanceScreen({ message }: { message?: string }) {
  const text = (message || "").trim() || DEFAULT_MESSAGE;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-[1.75rem] bg-accent/15 text-accent">
        <Wrench className="h-9 w-9" strokeWidth={1.75} />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Техническое обслуживание</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{text}</p>
    </div>
  );
}
