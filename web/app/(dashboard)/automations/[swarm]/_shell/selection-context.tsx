"use client";

// Phase 82 Plan 01 — Selection context for the unified stage shell.
//
// Moved verbatim from stage-3/selection-context.tsx (Phase 76 Plan 06 Task 2)
// per RESEARCH §Selection Context Migration. The Stage 3 implementation
// already covers all consumers: selectedId, setSelected (URL via
// history.replaceState), pendingRemovalIds optimistic removal, and
// markPendingRemoval. Client-side selection updates the URL via
// history.replaceState so server components don't re-run their queries.
//
// Stage 0 / Stage 2 mount the provider with rowIds=[] — the useEffect that
// trims pendingRemovalIds handles empty arrays cleanly.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SelectionContextValue {
  selectedId: string | null;
  setSelected: (id: string | null) => void;
  /** IDs the operator just acted on (Close / Replay / Reclassify) — hidden
   *  optimistically while the server roundtrip flies. Once a fresh server
   *  fetch omits an id, it's dropped from this set automatically. */
  pendingRemovalIds: ReadonlySet<string>;
  /** Mark a row for optimistic removal. Idempotent. */
  markPendingRemoval: (id: string) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({
  initialSelectedId = null,
  rowIds,
  children,
}: {
  initialSelectedId?: string | null;
  /** Current server-side row ids — used to drop pending entries that the
   *  server has already removed. */
  rowIds: string[];
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Resync when URL-driven nav changes the prop.
  useEffect(() => {
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  // Stable key for the rowIds-driven cleanup effect.
  const rowIdsKey = useMemo(() => rowIds.join("|"), [rowIds]);

  // When server data changes, drop any pending ids the server has already
  // removed. Keeps the set bounded across long sessions. If the Server Action
  // failed silently and the row is still present, we keep filtering it
  // (operator hits the action again to retry).
  useEffect(() => {
    setPendingRemovalIds((prev) => {
      if (prev.size === 0) return prev;
      const rowSet = new Set(rowIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (rowSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIdsKey]);

  const setSelected = useCallback((id: string | null) => {
    setSelectedId(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("selected", id);
    else url.searchParams.delete("selected");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const markPendingRemoval = useCallback((id: string) => {
    setPendingRemovalIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ selectedId, setSelected, pendingRemovalIds, markPendingRemoval }),
    [selectedId, setSelected, pendingRemovalIds, markPendingRemoval],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("useSelection must be used inside <SelectionProvider>");
  }
  return ctx;
}
