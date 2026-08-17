"use client";

import { Copy, Send, X } from "lucide-react";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { useT } from "@/components/providers/I18nProvider";
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

export function ChannelSubscribeSheet({
  channel,
  channelUrl,
  description,
  onClose,
  onOpenChannel,
}: Props) {
  const t = useT();
  const { showToast } = useToast();
  const mention = promoChannelMention(channel) || channel;
  const body = description ?? t("channel.needSub");

  async function copyMention() {
    if (!mention) return;
    try {
      await navigator.clipboard.writeText(mention);
      showToast({ variant: "success", title: t("channel.copied") });
    } catch {
      showToast({ variant: "error", title: t("channel.copyFailed") });
    }
  }

  return (
    <ModalOverlay onClose={onClose} analyticsModalId="channel_subscribe">
      {(close) => (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-subscribe-title"
          className="sheet-panel relative mx-auto w-full max-w-lg px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 sm:px-6"
        >
          <div className="sheet-handle" />

          <button
            type="button"
            onClick={close}
            aria-label={t("common.close")}
            className="absolute right-4 top-3.5 flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground sm:right-5"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <span
              className="mb-4 inline-flex size-14 shrink-0 items-center justify-center rounded-full text-[var(--link)]"
              style={{
                background: "color-mix(in srgb, var(--link) 18%, transparent)",
              }}
              aria-hidden
            >
              <Send className="size-6" strokeWidth={2.25} />
            </span>

            <h2
              id="channel-subscribe-title"
              className="text-[1.125rem] font-semibold tracking-tight text-foreground"
            >
              {t("channel.title")}
            </h2>
            <p className="mt-2 max-w-[20rem] text-sm leading-snug text-muted">
              {body}
            </p>

            {mention ? (
              <button
                type="button"
                onClick={() => {
                  void copyMention();
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-surface-raised px-3.5 py-2 text-[15px] font-medium text-[var(--link)] transition-opacity active:opacity-70"
                aria-label={t("channel.copyAria", { mention })}
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
              )}
            >
              {t("channel.open")}
            </button>

            <button
              type="button"
              onClick={close}
              className="mt-2 flex h-11 w-full items-center justify-center text-[14px] font-medium text-muted transition-colors hover:text-foreground active:opacity-70"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}
