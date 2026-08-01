"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Copy, Loader2, Share2, UserRound, X } from "lucide-react";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/utils";

export type CaseQuestStep = "share" | "name";

const SHARE_CONTINUE_DELAY_MS = 5_000;

type Props = {
  step: CaseQuestStep;
  nameTag?: string;
  busy?: boolean;
  /** Share was sent — waiting for manual continue. */
  awaitingReturn?: boolean;
  onClose: () => void;
  onShare: () => void;
  onContinueAfterShare: () => void;
  onCheckName: () => void;
};

export function CaseQuestSheet({
  step,
  nameTag = "",
  busy = false,
  awaitingReturn = false,
  onClose,
  onShare,
  onContinueAfterShare,
  onCheckName,
}: Props) {
  const { showToast } = useToast();
  const isShare = step === "share";
  const tag = nameTag.trim() || "@flipoGameBot";
  const [continueReady, setContinueReady] = useState(false);

  useEffect(() => {
    if (!awaitingReturn || !isShare) {
      setContinueReady(false);
      return;
    }
    setContinueReady(false);
    const id = window.setTimeout(() => setContinueReady(true), SHARE_CONTINUE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [awaitingReturn, isShare]);

  async function copyTag() {
    try {
      await navigator.clipboard.writeText(tag);
      showToast({ variant: "success", title: "Тег скопирован" });
    } catch {
      showToast({ variant: "error", title: "Не удалось скопировать" });
    }
  }

  const shareWaiting = isShare && awaitingReturn;

  return (
    <ModalOverlay
      onClose={onClose}
      analyticsModalId={isShare ? "case_quest_share" : "case_quest_name"}
    >
      {(close) => (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="case-quest-title"
          className="sheet-panel relative mx-auto w-full max-w-lg px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 sm:px-6"
          style={
            {
              "--quest-cta": "#2a85ff",
              "--quest-cta-deep": "#1a6fe0",
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
              className="mb-4 inline-flex size-14 shrink-0 items-center justify-center rounded-full text-[var(--quest-cta)]"
              style={{
                background: "color-mix(in srgb, var(--quest-cta) 18%, transparent)",
              }}
              aria-hidden
            >
              {isShare ? (
                <Share2 className="size-6" strokeWidth={2.25} />
              ) : (
                <UserRound className="size-6" strokeWidth={2.25} />
              )}
            </span>

            <h2
              id="case-quest-title"
              className="text-[1.125rem] font-semibold tracking-tight text-foreground"
            >
              {isShare
                ? "Поделитесь с друзьями"
                : "Добавьте бота в имя"}
            </h2>
            <p className="mt-2 max-w-[20rem] text-sm leading-relaxed text-muted">
              {isShare ? (
                awaitingReturn ? (
                  "Когда вернётесь — нажмите «Продолжить», чтобы открыть кейс"
                ) : (
                  "Разошлите ссылку 5 друзьям, чтобы открыть кейс"
                )
              ) : (
                <>
                  Добавьте <span className="font-semibold text-foreground">{tag}</span> в имя
                  Telegram, затем нажмите «Проверить»
                </>
              )}
            </p>

            {!isShare ? (
              <button
                type="button"
                onClick={() => void copyTag()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                {tag}
              </button>
            ) : null}

            <button
              type="button"
              disabled={busy || (shareWaiting && !continueReady)}
              onClick={
                isShare
                  ? awaitingReturn
                    ? onContinueAfterShare
                    : onShare
                  : onCheckName
              }
              className={cn(
                "mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[0.95rem] font-semibold text-white transition-opacity",
                "disabled:opacity-55",
              )}
              style={{
                background:
                  "linear-gradient(180deg, var(--quest-cta) 0%, var(--quest-cta-deep) 100%)",
              }}
            >
              {busy ? (
                "…"
              ) : shareWaiting && !continueReady ? (
                <Loader2 className="size-5 animate-spin" aria-label="Загрузка" />
              ) : isShare ? (
                awaitingReturn ? (
                  "Продолжить"
                ) : (
                  "Поделиться"
                )
              ) : (
                "Проверить и продолжить"
              )}
            </button>

            {!isShare ? (
              <p className="mt-3 text-[11px] leading-relaxed text-muted/80">
                После смены имени перезайдите в приложение, если проверка не проходит
              </p>
            ) : null}
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}
