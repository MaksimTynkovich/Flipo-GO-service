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
    <div className="app-frame">
      <AppHeader />
      <main
        className={cn(
          "app-frame__main page-enter pb-[var(--app-tabbar-offset)] pt-[var(--app-header-offset)]",
          isAdmin ? "admin-container" : "app-container",
        )}
      >
        {children}
      </main>
      <AppTabBar />
    </div>
  );
}
