import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Flipo Casino",
  description: "Telegram Mini App Crypto Casino on TON",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Providers>
          <Header />
          <main className="app-container min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))]">
            {children}
          </main>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}
