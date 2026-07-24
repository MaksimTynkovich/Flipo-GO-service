import fs from "fs";
import path from "path";

function loadTerms(): string {
  const candidates = [
    path.join(process.cwd(), "docs", "TERMS.ru.md"),
    path.join(process.cwd(), "..", "..", "docs", "TERMS.ru.md"),
    path.join(process.cwd(), "content", "TERMS.ru.md"),
  ];
  for (const file of candidates) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      // try next
    }
  }
  return "Пользовательское соглашение Flipo.";
}

export default function TermsPage() {
  const body = loadTerms();

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
