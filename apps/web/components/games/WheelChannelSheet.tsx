"use client";

import type { CSSProperties } from "react";
import { Copy, Send, X } from "lucide-react";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { useToast } from "@/components/providers/ToastProvider";
import { promoChannelMention } from "@/lib/promo-channel";
import { cn } from "@/lib/utils";

type Props = {
  channel: string;
  channelUrl: string;
  description?: string;
  onClose: () => void;
  onOpenChannel: () => void;
};

export function WheelChannelSheet({
  channel,
  channelUrl,
  description = "Для прокрутки колеса нужна подписка на канал",
  onClose,
  onOpenChannel,
}: Props) {
  const { showToast } = useToast();
  const mention = promoChannelMention(channel) || channel;

  async function copyMention() {
    if (!mention) return;
    try {
      await navigator.clipboard.writeText(mention);
      showToast({ variant: "success", title: "Юзернейм скопирован" });
    } catch {
      showToast({ variant: "error", title: "Не удалось скопировать" });
    }
  }

  return (
    <ModalOverlay onClose={onClose} analyticsModalId="wheel_channel_subscribe">
      {(close) => (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wheel-channel-title"
          className="sheet-panel relative mx-auto w-full max-w-lg px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 sm:px-6"
          style={
            {
              "--wheel-cta": "#2a85ff",
              "--wheel-cta-deep": "#1a6fe0",
            } as CSSProperties
          }
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/10" />

          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            className="absolute right-4 top-3.5 flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground sm:right-5"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <span
              className="mb-4 inline-flex size-14 shrink-0 items-center justify-center rounded-full text-[var(--wheel-cta)]"
              style={{
                background:
                  "color-mix(in srgb, var(--wheel-cta) 18%, transparent)",
              }}
              aria-hidden
            >
              <Send className="size-6" strokeWidth={2.25} />
            </span>

            <h2
              id="wheel-channel-title"
              className="text-[1.125rem] font-semibold tracking-tight text-foreground"
            >
              Подпишись на канал
            </h2>
            <p className="mt-2 max-w-[20rem] text-sm leading-snug text-muted">
              {description}
            </p>

            {mention ? (
              <button
                type="button"
                onClick={() => {
                  void copyMention();
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-surface-raised px-3.5 py-2 text-[15px] font-medium text-[var(--link)] transition-opacity active:opacity-70"
                aria-label={`Скопировать ${mention}`}
              >
                <span className="tabular-nums">{mention}</span>
                <Copy className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
              </button>
            ) : null}

            <button
              type="button"
              disabled={!channelUrl}
              onClick={() => {
                onOpenChannel();
              }}
              className={cn(
                "app-control mt-5 flex h-14 w-full items-center justify-center gap-2 text-[15px] font-semibold tracking-tight",
                "wheel-cta wheel-cta--spin",
              )}
            >
              Перейти в канал
            </button>

            <button
              type="button"
              onClick={close}
              className="mt-2 flex h-11 w-full items-center justify-center text-[14px] font-medium text-muted transition-colors hover:text-foreground active:opacity-70"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}
