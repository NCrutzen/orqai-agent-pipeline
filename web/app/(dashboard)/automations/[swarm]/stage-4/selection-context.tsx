"use client";

// Phase 76 Plan 07 Task 2 — Selection context for the Stage 4 Kanban surface.
//
// Verbatim copy of stage-3/selection-context.tsx (per CONTEXT.md "different
// row sets, different navigation behavior" — kept as a separate provider so
// Stage 3 and Stage 4 selections stay independent, even if both tabs are
// open across browser history).

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
  /** IDs the operator just acted on (Close / Reclassify) — hidden
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
  rowIds: string[];
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  const rowIdsKey = useMemo(() => rowIds.join("|"), [rowIds]);

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
