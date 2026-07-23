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
}: {
  activeSection: ReturnType<typeof resolveAdminSection>;
  onNavigate: (href: string) => void;
}) {
  return (
    <nav className="admin-sidebar__nav">
      {ADMIN_NAV.map((item) => {
        const isActive = activeSection === item.id;
        const disabled = Boolean(item.disabled);
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
            {item.label}
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

  useEffect(() => {
    setActiveSection(routeSection);
  }, [routeSection]);

  useEffect(() => {
    ADMIN_NAV.filter((item) => !item.disabled).forEach((item) => router.prefetch(item.href));
  }, [router]);

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
        </div>

        <AdminNav activeSection={activeSection} onNavigate={navigate} />

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
