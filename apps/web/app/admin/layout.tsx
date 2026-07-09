"use client";

import { AdminSectionHost } from "@/components/admin/AdminSectionHost";
import { ADMIN_NAV, resolveAdminSection } from "@/components/admin/admin-sections";
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
    <nav className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
      {ADMIN_NAV.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => onNavigate(item.href)}
            className={cn(
              "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
              isActive
                ? "bg-accent/15 font-medium text-foreground ring-1 ring-inset ring-accent/30"
                : "bg-surface-raised/50 text-muted hover:text-foreground",
            )}
          >
            <span className="block text-sm">{item.label}</span>
            <span className="mt-0.5 hidden text-[11px] leading-snug text-muted lg:block">{item.hint}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const routeSection = resolveAdminSection(pathname);
  const [activeSection, setActiveSection] = useState(routeSection);

  useEffect(() => {
    setActiveSection(routeSection);
  }, [routeSection]);

  useEffect(() => {
    ADMIN_NAV.forEach((item) => router.prefetch(item.href));
  }, [router]);

  function navigate(href: string) {
    const next = resolveAdminSection(href);
    setActiveSection(next);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
      <aside className="w-full shrink-0 lg:sticky lg:top-[calc(var(--app-header-offset)+0.5rem)] lg:w-56">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Разделы</p>
        <AdminNav activeSection={activeSection} onNavigate={navigate} />
      </aside>
      <div className="min-w-0 flex-1 space-y-4">
        <AdminSectionHost active={activeSection} />
        {children}
      </div>
    </div>
  );
}
