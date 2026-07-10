"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DEBUG_AUTH } from "@/lib/api";
import { hasTelegramInitData } from "@/src/shared/lib/twa";

const TELEGRAM_INIT_WAIT_MS = 300;

export function useTelegramAccess() {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const isAdmin = pathname.startsWith("/admin");
    if (DEBUG_AUTH || isAdmin) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    if (hasTelegramInitData()) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setAllowed(hasTelegramInitData());
      setChecking(false);
    }, TELEGRAM_INIT_WAIT_MS);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return { checking, allowed };
}
