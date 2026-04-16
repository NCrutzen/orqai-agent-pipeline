"use client";

/**
 * React hook over the module-scoped EventBufferStore. Uses
 * `useSyncExternalStore` so component re-renders are batched and
 * snapshot identity is preserved across no-op pushes.
 */

import { useSyncExternalStore, useCallback } from "react";
import type { AgentEvent } from "@/lib/v7/types";
import { getStore } from "@/lib/v7/terminal/event-buffer";

export interface EventBufferHandle {
  events: AgentEvent[];
  paused: boolean;
  setPaused: (paused: boolean) => void;
  clear: () => void;
  pushMany: (events: AgentEvent[]) => void;
}

export function useEventBuffer(swarmId: string): EventBufferHandle {
  const store = getStore(swarmId);

  // The same `subscribe` reference is stable across re-renders because
  // it is bound on the store instance. React requires this.
  const events = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  // `paused` is read directly off the instance; setPaused emits, so
  // listeners (including useSyncExternalStore subscribers) re-render.
  const paused = store.paused;

  const setPaused = useCallback(
    (value: boolean) => store.setPaused(value),
    [store],
  );
  const clear = useCallback(() => store.clear(), [store]);
  const pushMany = useCallback(
    (next: AgentEvent[]) => store.pushMany(next),
    [store],
  );

  return { events, paused, setPaused, clear, pushMany };
}
