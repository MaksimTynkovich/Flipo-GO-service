"use client";

import { PropsWithChildren } from "react";
import { AppHeader } from "./AppHeader";
import { AppTabBar } from "./AppTabBar";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <>
      <AppHeader />
      <main className="app-container min-h-[100dvh] pb-[calc(3.75rem+env(safe-area-inset-bottom))] pt-[calc(4.25rem+env(safe-area-inset-top))]">
        {children}
      </main>
      <AppTabBar />
    </>
  );
}
