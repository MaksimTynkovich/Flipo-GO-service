export const BALANCE_WIN_EVENT = "flipo:balance-win";

export type BalanceWinDetail = {
  deltaNanoton: number;
};

export function emitBalanceWin(deltaNanoton: number) {
  if (deltaNanoton <= 0) return;
  window.dispatchEvent(
    new CustomEvent<BalanceWinDetail>(BALANCE_WIN_EVENT, {
      detail: { deltaNanoton },
    }),
  );
}
