"use client";

import { AdminSectionHost } from "@/components/admin/AdminSectionHost";
import { ADMIN_NAV, resolveAdminSection } from "@/components/admin/admin-sections";
import { AdminButton } from "@/components/admin/admin-ui";
import { useAdminAuth } from "@/components/providers/AdminAuthProvider";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

function AdminNav({
  activeSection,
  onNavigate,
  unreadCount,
}: {
  activeSection: ReturnType<typeof resolveAdminSection>;
  onNavigate: (href: string) => void;
  unreadCount: number;
}) {
  return (
    <nav className="admin-sidebar__nav">
      {ADMIN_NAV.map((item) => {
        const isActive = activeSection === item.id;
        const disabled = Boolean(item.disabled);
        const showBadge = item.id === "notifications" && unreadCount > 0;
        return (
          <button
            key={item.href}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onNavigate(item.href);
            }}
            className={cn(
              "admin-nav-item",
              isActive && !disabled && "admin-nav-item--active",
              disabled && "admin-nav-item--disabled",
            )}
          >
            <span className="admin-nav-item__label">{item.label}</span>
            {showBadge ? (
              <span className="admin-nav-item__badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuth();
  const routeSection = resolveAdminSection(pathname);
  const [activeSection, setActiveSection] = useState(routeSection);
  const [unreadCount, setUnreadCount] = useState(0);
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    setActiveSection(routeSection);
  }, [routeSection]);

  useEffect(() => {
    ADMIN_NAV.filter((item) => !item.disabled).forEach((item) => router.prefetch(item.href));
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function refreshUnread() {
      try {
        const { getAdminNotificationUnreadCount } = await import("@/lib/api");
        const res = await getAdminNotificationUnreadCount();
        if (!cancelled) setUnreadCount(res.count);
      } catch {
        /* ignore */
      }
    }
    refreshUnread();
    // Rare HTTP fallback if WS drops; primary updates come from admin WS.
    const timer = window.setInterval(refreshUnread, 120_000);
    function onUnread(e: Event) {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === "number") setUnreadCount(detail);
    }
    window.addEventListener("admin-notifications-unread", onUnread);

    let disconnect: (() => void) | undefined;
    void import("@/lib/ws").then(({ connectAdminWS, ADMIN_NOTIFICATIONS_UNREAD_EVENT }) => {
      if (cancelled) return;
      disconnect = connectAdminWS((msg) => {
        if (msg.event !== "admin.notification") return;
        const payload = msg.payload as { unread_count?: number; notification?: unknown };
        if (typeof payload.unread_count === "number") {
          setUnreadCount(payload.unread_count);
          window.dispatchEvent(
            new CustomEvent(ADMIN_NOTIFICATIONS_UNREAD_EVENT, { detail: payload.unread_count }),
          );
        }
        if (payload.notification) {
          window.dispatchEvent(
            new CustomEvent("admin-notification", { detail: payload.notification }),
          );
        }
      });
    });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("admin-notifications-unread", onUnread);
      disconnect?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refreshOnline() {
      try {
        const { getAdminOnlineNow } = await import("@/lib/api");
        const res = await getAdminOnlineNow();
        if (!cancelled) setOnline(res.online);
      } catch {
        /* ignore */
      }
    }
    refreshOnline();
    const timer = window.setInterval(refreshOnline, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function navigate(href: string) {
    const item = ADMIN_NAV.find((entry) => entry.href === href);
    if (item?.disabled) return;
    const next = resolveAdminSection(href);
    setActiveSection(next);
    startTransition(() => {
      router.push(href);
    });
  }

  const activeLabel = ADMIN_NAV.find((item) => item.id === activeSection)?.label ?? "Дашборд";
  const todayLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <p className="admin-sidebar__brand-mark">Flipo</p>
          <p className="admin-sidebar__online" title="Реальные пользователи в приложении (без админов)">
            <span className="admin-sidebar__online-dot" aria-hidden />
            <span className="admin-sidebar__online-label">Онлайн</span>
            <span className="admin-sidebar__online-value">{online == null ? "—" : online}</span>
          </p>
        </div>

        <AdminNav activeSection={activeSection} onNavigate={navigate} unreadCount={unreadCount} />

        <div className="admin-sidebar__footer">
          <p className="admin-sidebar__user truncate">
            {user?.first_name || user?.username || "Admin"}
          </p>
          <AdminButton variant="secondary" onClick={logout} className="w-full !h-9 text-xs">
            Выйти
          </AdminButton>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-workspace__header">
          <div>
            <h1 className="admin-workspace__title">{activeLabel}</h1>
            <p className="admin-workspace__date">{todayLabel}</p>
          </div>
        </header>
        <main className="admin-workspace__main">
          <AdminSectionHost active={activeSection} />
          {children}
        </main>
      </div>
    </div>
  );
}
