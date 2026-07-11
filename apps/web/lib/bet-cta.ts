/** Short CTA copy when bets are closed — shown on place-bet buttons. */

export function crashBetClosedLabel(phase: string | undefined): string {
  switch (phase) {
    case "running":
      return "Раунд идёт";
    case "crashed":
      return "Ждём раунд";
    case "waiting":
      return "Ждём раунд";
    case "betting":
      return "Поставить";
    default:
      return "Ждём раунд";
  }
}
