import type { Dispatch, SetStateAction } from "react";
import type { SessionSnapshot } from "#src/controller/session-store.js";
import type { SessionSummary } from "#src/types/session.js";
import type { UiAction } from "#src/app/ui-state.js";

export type AppCommandEffect =
  | { type: "dispatch"; action: UiAction }
  | { type: "setSnapshot"; snapshot: SessionSnapshot | null }
  | { type: "setSessions"; sessions: SessionSummary[] }
  | { type: "requestExit" };

export interface AppCommandResult {
  effects: AppCommandEffect[];
}

export function applyAppCommandResult({
  dispatch,
  onExitRequested,
  result,
  setSessions,
  setSnapshot,
}: {
  dispatch: Dispatch<UiAction>;
  onExitRequested(): void;
  result: AppCommandResult;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
}) {
  for (const effect of result.effects) {
    switch (effect.type) {
      case "dispatch":
        dispatch(effect.action);
        break;
      case "setSnapshot":
        setSnapshot(effect.snapshot);
        break;
      case "setSessions":
        setSessions(effect.sessions);
        break;
      case "requestExit":
        onExitRequested();
        break;
    }
  }
}
