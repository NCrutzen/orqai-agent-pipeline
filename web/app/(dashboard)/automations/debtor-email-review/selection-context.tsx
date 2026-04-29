"use client";

// Phase 61 hotfix. Selection state is client-side: row clicks, ↑/↓
// navigation, and post-verdict auto-advance update local state and patch the
// URL via `history.replaceState`. No router.push, no server re-render, no
// re-running the 4 Supabase queries on every keypress.
//
// Filter changes (topic/entity/mailbox/rule via QueueTree links) STILL go
// through Next's router because they need a fresh row list. The provider
// resyncs `selectedId` to the URL on filter-driven navigation via the
// `initialSelectedId` prop changing.

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
  /** IDs the reviewer just verdict'd — hidden optimistically while the
   *  server roundtrip flies. Once fresh server data omits an id, it's
   *  dropped from this set automatically. */
  pendingRemovalIds: ReadonlySet<string>;
  /** Mark a row for optimistic removal. Idempotent. */
  markPendingRemoval: (id: string) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({
  initialSelectedId,
  rowIds,
  children,
}: {
  initialSelectedId: string | null;
  /** Current server-side row ids — used to drop pending entries that the
   *  server has already removed. Stable join ensures shallow equality. */
  rowIds: string[];
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Resync when QueueTree (or any other URL-driven nav) changes the prop.
  useEffect(() => {
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  // Stable key for the rowIds-driven cleanup effect — the parent passes
  // a fresh array reference on every render, but we only care when the
  // contents change.
  const rowIdsKey = useMemo(() => rowIds.join("|"), [rowIds]);

  // When server data changes, drop any pending ids the server has
  // already removed. Keeps the set bounded so a long session doesn't
  // accumulate stale entries. If recordVerdict failed silently and the
  // row is still in rows[], we keep filtering it (reviewer hits Approve
  // again to retry).
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
    // rowIdsKey captures the meaningful identity of the array.
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
