import type { SessionSnapshot, SessionStore } from "../controller/session-store.js";
import type { SessionSummary } from "../types/session.js";

export interface InitialSessionResolution {
  snapshot?: SessionSnapshot;
  sessions?: SessionSummary[];
  statusMessage?: string;
}

export function resolveInitialSession(
  sessionStore: SessionStore,
  initialSessionId?: string,
): InitialSessionResolution {
  try {
    const snapshot = initialSessionId
      ? sessionStore.loadSession(initialSessionId)
      : sessionStore.ensureSession();

    return {
      snapshot,
      sessions: sessionStore.listSessions(),
    };
  } catch (error) {
    if (initialSessionId) {
      try {
        const fallbackSnapshot = sessionStore.ensureSession();
        return {
          snapshot: fallbackSnapshot,
          sessions: sessionStore.listSessions(),
          statusMessage: `Could not load session ${initialSessionId}. Opened the most recent session.`,
        };
      } catch (fallbackError) {
        const primaryMessage = error instanceof Error ? error.message : String(error);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return {
          statusMessage: `Error: ${primaryMessage}; fallback failed: ${fallbackMessage}`,
        };
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      statusMessage: `Error: ${message}`,
    };
  }
}
