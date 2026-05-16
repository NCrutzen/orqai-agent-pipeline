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
  /** Phase 82.7 Plan 04 (D-01) — atomic optimistic-removal + selection-advance
   *  helper. Adds `id` to `pendingRemovalIds` AND calls `setSelected(nextId)`
   *  in one render cycle. Used by detail-pane.tsx `handlePrimary` Approve
   *  branch so the operator can chain Approve clicks without touching the
   *  list. Existing `markPendingRemoval` is preserved for non-Approve callers
   *  (override-submit path, Stage 0/2/3 actions). */
  markPendingRemovalAndAdvance: (id: string, nextId: string | null) => void;
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

  // Phase 82.7 Plan 04 (D-01) — atomic helper: optimistically remove `id` AND
  // advance selection to `nextId` in one render cycle. Pre-computed `nextId`
  // by the caller (detail-pane.tsx) reflects the operator's filtered visible
  // list at the moment of the Approve click. `setSelected` also updates the
  // URL via history.replaceState (see L81-88).
  const markPendingRemovalAndAdvance = useCallback(
    (id: string, nextId: string | null) => {
      setPendingRemovalIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setSelected(nextId);
    },
    [setSelected],
  );

  const value = useMemo(
    () => ({
      selectedId,
      setSelected,
      pendingRemovalIds,
      markPendingRemoval,
      markPendingRemovalAndAdvance,
    }),
    [
      selectedId,
      setSelected,
      pendingRemovalIds,
      markPendingRemoval,
      markPendingRemovalAndAdvance,
    ],
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
