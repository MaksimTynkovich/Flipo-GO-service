"use client";

import { PropsWithChildren, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AppHeader } from "./AppHeader";
import { AppTabBar } from "./AppTabBar";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const mainRef = useRef<HTMLElement>(null);
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;
    const main = mainRef.current;
    if (!main) return;
    main.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="app-frame">
      <AppHeader />
      <main
        ref={mainRef}
        className={cn(
          "app-frame__main pb-[var(--app-tabbar-offset)] pt-[var(--app-header-offset)]",
          isAdmin ? "admin-container" : "app-container",
        )}
      >
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </main>
      <AppTabBar />
    </div>
  );
}
