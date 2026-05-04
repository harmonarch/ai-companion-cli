import { useEffect } from "react";
import type { Dispatch } from "react";
import type { UiAction, UiState } from "#src/app/ui-state.js";
import type { SessionSnapshot } from "#src/controller/session-store.js";

export function useMemoryOverlaySync({
  dispatch,
  memoryOverlay,
  snapshot,
}: {
  dispatch: Dispatch<UiAction>;
  memoryOverlay: Extract<UiState["overlay"], { kind: "memory" }> | null;
  snapshot: SessionSnapshot | null;
}) {
  useEffect(() => {
    if (!memoryOverlay || !snapshot) {
      return;
    }

    const memoryIds = new Set(snapshot.memories.map((memory) => memory.id));
    const maxIndex = Math.max(0, snapshot.memories.length - 1);

    if (memoryOverlay.selectedIndex > maxIndex) {
      dispatch({ type: "overlay/memory/select", selectedIndex: maxIndex });
    }

    if (memoryOverlay.deleteConfirmMemoryId && !memoryIds.has(memoryOverlay.deleteConfirmMemoryId)) {
      dispatch({ type: "overlay/memory/delete-confirm", memoryId: null });
    }

    if (memoryOverlay.viewMemoryId && !memoryIds.has(memoryOverlay.viewMemoryId)) {
      dispatch({ type: "overlay/memory/view", memoryId: null });
    }

    if (memoryOverlay.editState && !memoryIds.has(memoryOverlay.editState.memoryId)) {
      dispatch({ type: "overlay/memory/edit", value: null });
    }
  }, [dispatch, memoryOverlay, snapshot]);
}
