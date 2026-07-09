"use client";

import { useCallback, useRef } from "react";
import { markInputCompleted, trackInputBlur, trackInputChange, trackInputFocus } from "@/lib/analytics";

type InputHandlers = {
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
};

export function useAnalyticsInput(inputId: string, flow?: string) {
  const completedRef = useRef(false);

  const bind = useCallback(
    (handlers: InputHandlers = {}) => ({
      onFocus: (event: React.FocusEvent<HTMLInputElement>) => {
        trackInputFocus(inputId, flow);
        handlers.onFocus?.(event);
      },
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        trackInputChange(inputId);
        handlers.onChange?.(event);
      },
      onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
        if (!completedRef.current) {
          trackInputBlur(inputId);
        }
        handlers.onBlur?.(event);
      },
    }),
    [flow, inputId],
  );

  const complete = useCallback(() => {
    completedRef.current = true;
    markInputCompleted(inputId);
  }, [inputId]);

  return { bind, complete };
}
