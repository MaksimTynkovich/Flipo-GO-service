import { AUTH_SESSION_REFRESHED, getAuthToken, resolvePublicWsUrl, silentReauth } from "./api";
import { trackErrorSurface } from "./analytics";

export type WSMessage = {
  event: string;
  payload: unknown;
};

function trackWSIssue(
  channel: string,
  code: string,
  message?: string,
  properties?: Record<string, unknown>,
) {
  trackErrorSurface({
    surface: "ws",
    error_code: code,
    error_message: message,
    event_category: "realtime",
    properties: {
      channel,
      ...properties,
    },
  });
}

export function connectGameWS(
  game: "roulette" | "crash" | "pvp",
  onMessage: (msg: WSMessage) => void,
  options?: { onOpen?: () => void },
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function scheduleReconnect() {
    if (closed) return;
    if (retryTimer) clearTimeout(retryTimer);
    // 1s, 2s, 4s … capped at 8s — games need faster recovery than user channel.
    const delayMs = Math.min(8000, 1000 * 2 ** Math.min(attempt, 3));
    attempt += 1;
    retryTimer = setTimeout(connect, delayMs);
  }

  function connect() {
    if (closed) return;

    const base = resolvePublicWsUrl();
    ws = new WebSocket(`${base}/ws/games/${game}`);

    ws.onopen = () => {
      attempt = 0;
      // Resync on every open so a reconnect mid-round does not keep a stale phase
      // (e.g. roulette stuck on «Крутим» after spin with a dead socket).
      options?.onOpen?.();
    };

    ws.onerror = () => {
      trackWSIssue(`games/${game}`, `ws_${game}_error`, "WebSocket connection error");
    };

    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        trackWSIssue(`games/${game}`, `ws_${game}_malformed`, "Malformed WebSocket payload");
      }
    };

    ws.onclose = (event) => {
      if (event.code !== 1000) {
        trackWSIssue(`games/${game}`, `ws_${game}_close`, event.reason || "connection closed", {
          close_code: event.code,
        });
      }
      if (!closed) {
        scheduleReconnect();
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

    const base = resolvePublicWsUrl();
    ws = new WebSocket(`${base}/ws/user?token=${encodeURIComponent(token)}`);

    ws.onerror = () => {
      trackWSIssue("user", "ws_user_error", "User WebSocket connection error");
    };

    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        trackWSIssue("user", "ws_user_malformed", "Malformed WebSocket payload");
      }
    };

    ws.onclose = (event) => {
      if (!closed) {
        if (event.code !== 1000) {
          trackWSIssue("user", "ws_user_close", event.reason || "connection closed", {
            close_code: event.code,
          });
        }
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
