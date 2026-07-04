import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { AppLayout } from "@/src/widgets/app-shell/ui/AppLayout";

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
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
