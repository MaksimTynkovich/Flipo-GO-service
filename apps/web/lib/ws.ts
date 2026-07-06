import { getAuthToken, WS_URL } from "./api";

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

export function connectUserWS(onMessage: (msg: WSMessage) => void): () => void {
  const token = getAuthToken();
  if (!token) {
    return () => {};
  }
  const authToken = token;

  let ws: WebSocket | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (closed) return;
    ws = new WebSocket(`${WS_URL}/ws/user?token=${encodeURIComponent(authToken)}`);

    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      if (!closed) {
        retryTimer = setTimeout(connect, 3000);
      }
    };
  }

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}
