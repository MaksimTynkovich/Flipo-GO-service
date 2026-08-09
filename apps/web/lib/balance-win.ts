export const BALANCE_WIN_EVENT = "flipo:balance-win";

export type BalanceWinDetail = {
  deltaNanoton: number;
};

/** After a local (HTTP) credit, ignore duplicate WS emits briefly. */
let suppressWsUntil = 0;

export function emitBalanceWin(
  deltaNanoton: number,
  opts?: { source?: "local" | "ws" },
) {
  if (deltaNanoton <= 0) return;
  const source = opts?.source ?? "local";
  const now = Date.now();
  if (source === "ws" && now < suppressWsUntil) return;
  if (source === "local") {
    suppressWsUntil = now + 2000;
  }
  window.dispatchEvent(
    new CustomEvent<BalanceWinDetail>(BALANCE_WIN_EVENT, {
      detail: { deltaNanoton },
    }),
  );
}
