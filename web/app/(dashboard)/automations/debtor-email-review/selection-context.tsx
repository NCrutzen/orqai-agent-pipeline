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
  useState,
  type ReactNode,
} from "react";

interface SelectionContextValue {
  selectedId: string | null;
  setSelected: (id: string | null) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({
  initialSelectedId,
  children,
}: {
  initialSelectedId: string | null;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  // Resync when QueueTree (or any other URL-driven nav) changes the prop.
  useEffect(() => {
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  const setSelected = useCallback((id: string | null) => {
    setSelectedId(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("selected", id);
    else url.searchParams.delete("selected");
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <SelectionContext.Provider value={{ selectedId, setSelected }}>
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
