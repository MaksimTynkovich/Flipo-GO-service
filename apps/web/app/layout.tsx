import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Flipo Casino",
  description: "Telegram Mini App Crypto Casino on TON",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="pb-20">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Providers>
          <main className="mx-auto min-h-screen max-w-lg px-4 py-6">{children}</main>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}
