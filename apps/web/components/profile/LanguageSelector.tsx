"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
] as const;

type LangCode = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "flipo_language";

export function LanguageSelector() {
  const [lang, setLang] = useState<LangCode>("ru");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (saved && LANGUAGES.some((l) => l.code === saved)) {
      setLang(saved);
    }
  }, []);

  function handleChange(code: LangCode) {
    setLang(code);
    localStorage.setItem(STORAGE_KEY, code);
  }

  return (
    <div className="panel space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted" />
        <p className="section-label">Язык</p>
      </div>
      <p className="text-xs text-muted">Скоро — переключение языка интерфейса</p>
      <div className="segment-control">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => handleChange(l.code)}
            className={cn("segment-item", lang === l.code && "segment-item-active")}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
