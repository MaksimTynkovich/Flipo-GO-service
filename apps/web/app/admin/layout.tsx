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
    <nav className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-0.5 lg:flex-col lg:overflow-visible lg:pb-0">
      {ADMIN_NAV.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => onNavigate(item.href)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors lg:w-full",
              isActive
                ? "bg-surface-raised font-medium text-foreground"
                : "text-muted hover:text-foreground",
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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      <aside className="w-full shrink-0 lg:sticky lg:top-[calc(var(--app-header-offset)+0.5rem)] lg:w-44">
        <AdminNav activeSection={activeSection} onNavigate={navigate} />
      </aside>
      <div className="min-w-0 flex-1 space-y-3">
        <AdminSectionHost active={activeSection} />
        {children}
      </div>
    </div>
  );
}
