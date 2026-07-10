"use client";

import { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AppHeader } from "./AppHeader";
import { AppTabBar } from "./AppTabBar";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <>
      <AppHeader />
      <main
        className={cn(
          "page-enter min-h-[100dvh] pb-[var(--app-tabbar-offset)] pt-[var(--app-header-offset)]",
          isAdmin ? "admin-container" : "app-container",
        )}
      >
        {children}
      </main>
      <AppTabBar />
    </>
  );
}
