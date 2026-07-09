"use client";

import { AdminSectionHost } from "@/components/admin/AdminSectionHost";
import { ADMIN_NAV, resolveAdminSection } from "@/components/admin/admin-sections";
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
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {ADMIN_NAV.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => onNavigate(item.href)}
            className={`rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150 ${
              isActive
                ? "bg-accent/15 font-semibold text-foreground ring-1 ring-inset ring-accent/30"
                : "bg-surface-raised/60 text-muted hover:bg-surface-raised/80 hover:text-foreground"
            }`}
          >
            <span className="block">{item.label}</span>
            <span className="mt-0.5 block text-[10px] opacity-70">{item.hint}</span>
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
    <div className="space-y-4">
      <AdminNav activeSection={activeSection} onNavigate={navigate} />
      <AdminSectionHost active={activeSection} />
      {children}
    </div>
  );
}
