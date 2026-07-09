"use client";

import { useEffect, useState } from "react";
import { ADMIN_SECTIONS, type AdminSectionId } from "./admin-sections";

type Props = {
  active: AdminSectionId;
};

export function AdminSectionHost({ active }: Props) {
  const [visited, setVisited] = useState<Set<AdminSectionId>>(() => new Set([active]));

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  return (
    <div className="relative">
      {Array.from(visited).map((id) => {
        const Section = ADMIN_SECTIONS[id];
        const isActive = id === active;
        return (
          <div key={id} className={isActive ? undefined : "hidden"} aria-hidden={!isActive}>
            <Section />
          </div>
        );
      })}
    </div>
  );
}
