"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";

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
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => handleChange(l.code)}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
              lang === l.code
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
