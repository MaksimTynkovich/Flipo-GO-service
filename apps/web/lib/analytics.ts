"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const TOKEN_KEY = "flipo_token";
const SESSION_KEY = "flipo_analytics_session_id";
const SESSION_AT_KEY = "flipo_analytics_session_at";
const ANON_KEY = "flipo_analytics_anonymous_id";
/** After this idle gap a new Mini App open counts as a new visit/session. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

export type ErrorSurface = "api" | "ui" | "validation" | "ws" | "risk";

export type ScreenExitType = "navigation" | "tab_hidden" | "unload";

export type AnalyticsEventInput = {
  event_name: string;
  event_category: string;
  source?: "web" | "api" | "worker";
  path?: string;
  screen?: string;
  previous_screen?: string;
  status?: "success" | "error" | "info";
  error_code?: string;
  error_message?: string;
  start_param?: string;
  staking_tier?: string;
  properties?: Record<string, unknown>;
  occurred_at?: string;
};

type QueuedEvent = AnalyticsEventInput & {
  session_id: string;
  anonymous_id: string;
};

const queue: QueuedEvent[] = [];
let flushTimer: number | null = null;

function storageGet(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function storageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function ensureId(key: string) {
  const existing = storageGet(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  storageSet(key, next);
  return next;
}

function touchSessionActivity() {
  storageSet(SESSION_AT_KEY, String(Date.now()));
}

/** Start a fresh analytics session when idle gap is large enough (repeat visit). */
export function rotateAnalyticsSessionIfNeeded(force = false): boolean {
  if (typeof window === "undefined") return false;
  const lastRaw = storageGet(SESSION_AT_KEY);
  const lastAt = lastRaw ? Number(lastRaw) : 0;
  const idle = !lastAt || !Number.isFinite(lastAt) || Date.now() - lastAt >= SESSION_IDLE_MS;
  if (!force && !idle) {
    touchSessionActivity();
    return false;
  }
  const next = crypto.randomUUID();
  storageSet(SESSION_KEY, next);
  touchSessionActivity();
  return true;
}

export function getAnalyticsSessionId() {
  rotateAnalyticsSessionIfNeeded(false);
  return ensureId(SESSION_KEY);
}

export function getAnalyticsAnonymousId() {
  return ensureId(ANON_KEY);
}

export function getCurrentPath() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

function getToken() {
  return storageGet(TOKEN_KEY);
}

function scheduleFlush() {
  if (typeof window === "undefined" || flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalyticsEvents();
  }, 1500);
}

let lastActionBeforeError = "";
let lastSessionError: { code: string; at: number } | null = null;
const SESSION_ERROR_WINDOW_MS = 30 * 60 * 1000;

type ActiveInputState = {
  inputId: string;
  flow?: string;
  startedAt: number;
  dirty: boolean;
  completed: boolean;
};

const activeInputs = new Map<string, ActiveInputState>();

function noteSessionError(code: string) {
  if (!code) return;
  lastSessionError = { code, at: Date.now() };
}

function shouldTrackSessionEndAfterError() {
  if (!lastSessionError) return false;
  return Date.now() - lastSessionError.at <= SESSION_ERROR_WINDOW_MS;
}

function emitSessionEndAfterError(exitType: ScreenExitType) {
  if (!shouldTrackSessionEndAfterError() || !lastSessionError) return;
  trackEvent({
    event_name: "session_end_after_error",
    event_category: "error",
    status: "info",
    error_code: lastSessionError.code,
    properties: {
      last_error_code: lastSessionError.code,
      journey_path: journeyPath(),
      exit_type: exitType,
      time_since_error_ms: Date.now() - lastSessionError.at,
      screen: currentScreen || undefined,
    },
  });
}

function flushActiveInputAbandons() {
  for (const [inputId, state] of Array.from(activeInputs.entries())) {
    if (state.dirty && !state.completed) {
      trackEvent({
        event_name: "input_abandon",
        event_category: "hesitation",
        status: "info",
        properties: {
          input_id: inputId,
          flow: state.flow,
          time_in_input_ms: Date.now() - state.startedAt,
          reason: "screen_exit",
        },
      });
    }
    activeInputs.delete(inputId);
  }
}

export function trackInputFocus(inputId: string, flow?: string) {
  if (!inputId) return;
  if (!activeInputs.has(inputId)) {
    activeInputs.set(inputId, {
      inputId,
      flow,
      startedAt: Date.now(),
      dirty: false,
      completed: false,
    });
    trackEvent({
      event_name: "input_started",
      event_category: "interaction",
      status: "info",
      properties: { input_id: inputId, flow },
    });
  }
}

export function trackInputChange(inputId: string) {
  const state = activeInputs.get(inputId);
  if (state) {
    state.dirty = true;
  }
}

export function markInputCompleted(inputId: string) {
  const state = activeInputs.get(inputId);
  if (!state) return;
  state.completed = true;
  activeInputs.delete(inputId);
  trackEvent({
    event_name: "input_completed",
    event_category: "interaction",
    status: "success",
    properties: {
      input_id: inputId,
      flow: state.flow,
      time_in_input_ms: Date.now() - state.startedAt,
    },
  });
}

export function trackInputBlur(inputId: string) {
  const state = activeInputs.get(inputId);
  if (!state || state.completed) return;
  if (state.dirty) {
    trackEvent({
      event_name: "input_abandon",
      event_category: "hesitation",
      status: "info",
      properties: {
        input_id: inputId,
        flow: state.flow,
        time_in_input_ms: Date.now() - state.startedAt,
        reason: "blur",
      },
    });
  }
  activeInputs.delete(inputId);
}

export function getLastAnalyticsAction() {
  return lastActionBeforeError;
}

export function trackEvent(event: AnalyticsEventInput) {
  if (typeof window === "undefined" || !event.event_name) return;
  if (event.status === "error") {
    noteSessionError(event.error_code || event.event_name);
  }
  if (
    event.status === "success" &&
    event.event_category !== "navigation" &&
    event.event_name !== "error_surface"
  ) {
    lastActionBeforeError = event.event_name;
  }
  queue.push({
    session_id: getAnalyticsSessionId(),
    anonymous_id: getAnalyticsAnonymousId(),
    source: "web",
    path: event.path || getCurrentPath(),
    screen: event.screen || window.location.pathname,
    occurred_at: event.occurred_at || new Date().toISOString(),
    ...event,
  });
  if (queue.length >= 10) {
    void flushAnalyticsEvents();
    return;
  }
  scheduleFlush();
}

export function trackErrorSurface(params: {
  surface: ErrorSurface;
  error_code: string;
  error_message?: string;
  action?: string;
  event_category?: string;
  properties?: Record<string, unknown>;
}) {
  noteSessionError(params.error_code);
  trackEvent({
    event_name: "error_surface",
    event_category: params.event_category || "error",
    status: "error",
    error_code: params.error_code,
    error_message: params.error_message,
    properties: {
      error_surface: params.surface,
      action_before_error: params.action || lastActionBeforeError || undefined,
      ...params.properties,
    },
  });
}

export async function flushAnalyticsEvents() {
  if (typeof window === "undefined" || queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Session-ID": getAnalyticsSessionId(),
    "X-Client-Path": getCurrentPath(),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    await fetch(`${API_URL}/api/v1/analytics/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch (error) {
    queue.unshift(...events.slice(-50));
    trackErrorSurface({
      surface: "api",
      error_code: "analytics_flush_failed",
      error_message: error instanceof Error ? error.message : "analytics flush failed",
      event_category: "analytics",
    });
  }
}

let previousScreen = "";
let currentScreen = "";
let screenEnteredAt = 0;
const sessionJourney: string[] = [];
const JOURNEY_MAX = 6;

const openModals = new Map<string, number>();
const completedModals = new Set<string>();

function pushJourney(screen: string) {
  if (!screen) return;
  if (sessionJourney.length === 0 || sessionJourney[sessionJourney.length - 1] !== screen) {
    sessionJourney.push(screen);
    if (sessionJourney.length > JOURNEY_MAX) {
      sessionJourney.shift();
    }
  }
}

function journeyPath() {
  return sessionJourney.join(" → ");
}

export function trackModalOpen(modalId: string) {
  completedModals.delete(modalId);
  openModals.set(modalId, Date.now());
  trackEvent({
    event_name: "modal_open",
    event_category: "interaction",
    status: "info",
    properties: { modal_id: modalId },
  });
}

export function markModalCompleted(modalId: string) {
  if (!openModals.has(modalId) || completedModals.has(modalId)) return;
  completedModals.add(modalId);
  const openedAt = openModals.get(modalId);
  openModals.delete(modalId);
  trackEvent({
    event_name: "modal_completed",
    event_category: "interaction",
    status: "success",
    properties: {
      modal_id: modalId,
      time_in_modal_ms: openedAt ? Date.now() - openedAt : undefined,
    },
  });
}

export function trackModalAbandon(modalId: string) {
  if (!openModals.has(modalId) || completedModals.has(modalId)) return;
  const openedAt = openModals.get(modalId);
  openModals.delete(modalId);
  trackEvent({
    event_name: "modal_abandon",
    event_category: "hesitation",
    status: "info",
    properties: {
      modal_id: modalId,
      time_in_modal_ms: openedAt ? Date.now() - openedAt : undefined,
    },
  });
}

export function trackDisabledClick(actionId: string, reason?: string) {
  trackEvent({
    event_name: "disabled_click",
    event_category: "hesitation",
    status: "info",
    properties: {
      action_id: actionId,
      reason,
    },
  });
}

export function trackFlowViewed(flowId: string, category: string) {
  trackEvent({
    event_name: `${flowId}_viewed`,
    event_category: category,
    status: "info",
    properties: { flow_id: flowId },
  });
}

function emitScreenExit(exitType: ScreenExitType, nextScreen?: string) {
  if (!currentScreen || !screenEnteredAt) return;
  const timeOnScreenMs = Date.now() - screenEnteredAt;
  const isAbandon = exitType === "tab_hidden" || exitType === "unload";
  flushActiveInputAbandons();
  if (isAbandon) {
    emitSessionEndAfterError(exitType);
  }
  trackEvent({
    event_name: isAbandon ? "screen_abandon" : "screen_leave",
    event_category: "navigation",
    screen: currentScreen,
    previous_screen: previousScreen || undefined,
    status: "info",
    properties: {
      time_on_screen_ms: timeOnScreenMs,
      exit_type: exitType,
      next_screen: nextScreen,
      mode: currentScreen,
      ...(isAbandon ? { journey_path: journeyPath() } : {}),
    },
  });
}

export function flushCurrentScreenExit(exitType: ScreenExitType) {
  emitScreenExit(exitType);
  screenEnteredAt = 0;
}

export function resumeCurrentScreen() {
  if (currentScreen && !screenEnteredAt) {
    screenEnteredAt = Date.now();
  }
}

export function trackScreenView(pathname: string) {
  if (currentScreen && currentScreen !== pathname) {
    flushActiveInputAbandons();
    emitScreenExit("navigation", pathname);
    trackEvent({
      event_name: "route_change",
      event_category: "navigation",
      screen: pathname,
      previous_screen: currentScreen,
      status: "info",
      properties: {
        from_screen: currentScreen,
        to_screen: pathname,
      },
    });
  }

  trackEvent({
    event_name: "screen_enter",
    event_category: "navigation",
    screen: pathname,
    previous_screen: previousScreen || currentScreen || undefined,
    status: "success",
    properties: {
      mode: pathname,
    },
  });

  trackEvent({
    event_name: "screen_view",
    event_category: "navigation",
    screen: pathname,
    previous_screen: previousScreen || currentScreen || undefined,
    status: "success",
    properties: {
      mode: pathname,
    },
  });

  previousScreen = currentScreen || previousScreen;
  currentScreen = pathname;
  screenEnteredAt = Date.now();
  pushJourney(pathname);
}

let clientErrorLoggingInstalled = false;

export function installClientErrorLogging() {
  if (typeof window === "undefined" || clientErrorLoggingInstalled) return;
  clientErrorLoggingInstalled = true;

  window.addEventListener("error", (event) => {
    trackErrorSurface({
      surface: "ui",
      error_code: "uncaught_error",
      error_message: event.message,
      properties: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    trackErrorSurface({
      surface: "ui",
      error_code: "unhandled_rejection",
      error_message: reason instanceof Error ? reason.message : String(reason),
    });
  });
}
