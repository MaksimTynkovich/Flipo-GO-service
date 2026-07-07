import { AUTH_SESSION_REFRESHED, getAuthToken, silentReauth, WS_URL } from "./api";

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
  let ws: WebSocket | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let authRetryPending = false;

  function scheduleReconnect(delayMs: number) {
    if (closed) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, delayMs);
  }

  async function connect() {
    if (closed) return;

    const token = getAuthToken();
    if (!token) {
      if (!authRetryPending) {
        authRetryPending = true;
        const user = await silentReauth();
        authRetryPending = false;
        if (user) {
          connect();
          return;
        }
      }
      scheduleReconnect(3000);
      return;
    }

    ws = new WebSocket(`${WS_URL}/ws/user?token=${encodeURIComponent(token)}`);

    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      if (!closed) {
        scheduleReconnect(3000);
      }
    };
  }

  function onSessionRefreshed() {
    ws?.close();
    if (retryTimer) clearTimeout(retryTimer);
    connect();
  }

  window.addEventListener(AUTH_SESSION_REFRESHED, onSessionRefreshed);
  connect();

  return () => {
    closed = true;
    window.removeEventListener(AUTH_SESSION_REFRESHED, onSessionRefreshed);
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}
