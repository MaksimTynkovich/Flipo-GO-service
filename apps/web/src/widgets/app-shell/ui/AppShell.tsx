"use client";

import { PropsWithChildren } from "react";
import { AppHeader } from "./AppHeader";
import { AppTabBar } from "./AppTabBar";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <>
      <AppHeader />
      <main className="app-container min-h-[100dvh] pb-[var(--app-tabbar-offset)] pt-[var(--app-header-offset)]">
        {children}
      </main>
      <AppTabBar />
    </>
  );
}
