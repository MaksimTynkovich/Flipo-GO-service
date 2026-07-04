import { Bell, Palette, Smartphone } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { LanguageSelector } from "@/components/profile/LanguageSelector";

const SETTINGS_ITEMS = [
  {
    title: "Telegram Theme",
    description: "Цвета приложения автоматически синхронизируются с параметрами темы Telegram.",
    icon: Palette,
  },
  {
    title: "Haptic Feedback",
    description: "Виброотклик включён для табов и основных пользовательских действий.",
    icon: Smartphone,
  },
  {
    title: "Уведомления",
    description: "Раздел подготовлен как заглушка для будущих игровых и системных уведомлений.",
    icon: Bell,
  },
] as const;

export function ProfileSettingsView() {
  return (
    <PageShell description="Системные параметры профиля и поведение интерфейса в Telegram.">
      <div className="space-y-2">
        {SETTINGS_ITEMS.map((item) => (
          <section key={item.title} className="panel flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-raised">
              <item.icon className="h-5 w-5 text-muted" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
            </div>
          </section>
        ))}
      </div>

      <LanguageSelector />
    </PageShell>
  );
}
