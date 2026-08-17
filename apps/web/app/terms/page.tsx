import fs from "fs";
import path from "path";

function loadTerms(lang: string): string {
  const fileName = lang === "ru" ? "TERMS.ru.md" : "TERMS.en.md";
  const candidates = [
    path.join(process.cwd(), "docs", fileName),
    path.join(process.cwd(), "..", "..", "docs", fileName),
    path.join(process.cwd(), "content", fileName),
  ];
  for (const file of candidates) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      // try next
    }
  }
  return lang === "ru"
    ? "Пользовательское соглашение Flipo."
    : "Flipo Terms of Service.";
}

export default function TermsPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = searchParams?.lang === "ru" ? "ru" : "en";
  const body = loadTerms(lang);

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px 48px",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.55,
        color: "#e8eef4",
        background: "#0c141c",
        minHeight: "100vh",
        whiteSpace: "pre-wrap",
      }}
    >
      {body}
    </main>
  );
}
