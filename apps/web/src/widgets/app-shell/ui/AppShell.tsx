"use client";

import { PropsWithChildren } from "react";
import { AppHeader } from "./AppHeader";
import { AppTabBar } from "./AppTabBar";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <>
      <AppHeader />
      <main className="app-container min-h-screen pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))]">
        {children}
      </main>
      <AppTabBar />
    </>
  );
}
