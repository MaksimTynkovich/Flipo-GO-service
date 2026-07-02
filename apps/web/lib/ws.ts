import { WS_URL } from "./api";

export type WSMessage = {
  event: string;
  payload: unknown;
};

export function connectGameWS(
  game: "roulette" | "crash" | "pvp",
  onMessage: (msg: WSMessage) => void,
): () => void {
  const ws = new WebSocket(`${WS_URL}/ws/games/${game}`);

  ws.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      // ignore malformed
    }
  };

  return () => ws.close();
}
