import { getRuntimeLocale, translate, type MessageKey } from "@/lib/i18n";

function t(key: MessageKey): string {
  return translate(getRuntimeLocale(), key);
}

export function crashBetClosedLabel(phase: string | undefined): string {
  switch (phase) {
    case "running":
      return t("crash.cta.running");
    case "crashed":
      return t("crash.cta.wait");
    case "waiting":
      return t("crash.cta.wait");
    case "betting":
      return t("crash.cta.bet");
    default:
      return t("crash.cta.wait");
  }
}
