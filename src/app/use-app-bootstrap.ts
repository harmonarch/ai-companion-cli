import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { resolveInitialSession } from "#src/app/resolve-initial-session.js";
import { formatSetupStatus } from "#src/app/setup-flow.js";
import type { UiAction } from "#src/app/ui-state.js";
import type { SessionSnapshot, SessionStore } from "#src/controller/session-store.js";
import type { RuntimeConfigService } from "#src/infra/config/runtime-config-service.js";
import type { SessionSummary } from "#src/types/session.js";

export function useAppBootstrap({
  dispatch,
  initialSessionId,
  runtimeConfig,
  sessionStore,
  setSessions,
  setSnapshot,
}: {
  dispatch: Dispatch<UiAction>;
  initialSessionId: string | undefined;
  runtimeConfig: RuntimeConfigService | null;
  sessionStore: SessionStore | null;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}) {
  useEffect(() => {
    if (!sessionStore || !runtimeConfig) {
      return;
    }

    const resolution = resolveInitialSession(sessionStore, initialSessionId);

    if (resolution.snapshot) {
      setSnapshot(resolution.snapshot);
    }

    if (resolution.sessions) {
      setSessions(resolution.sessions);
    }

    const setup = runtimeConfig.getSetupState();
    const providerId = resolution.snapshot?.session.provider ?? runtimeConfig.getConfig().defaultProvider;
    const model = resolution.snapshot?.session.model ?? runtimeConfig.getConfig().defaultModel;

    if (setup.setupReason === "missing_api_key") {
      dispatch({ type: "setup/input/await-api-key", providerId, model });
    } else {
      dispatch({ type: "setup/input/clear" });
    }

    dispatch({
      type: "status/set",
      value: resolution.statusMessage ?? formatSetupStatus(setup, { providerId, model }),
    });
  }, [dispatch, initialSessionId, runtimeConfig, sessionStore, setSessions, setSnapshot]);
}
