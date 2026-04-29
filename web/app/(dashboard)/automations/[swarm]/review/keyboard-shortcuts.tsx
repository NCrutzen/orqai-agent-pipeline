"use client";

// Phase 56.7-03 (verbatim move from debtor-email-review/keyboard-shortcuts.tsx).
// Swarm-agnostic. Page-scoped global keyboard handler.
//
// Design:
//   - Single window keydown listener mounted in useEffect with cleanup.
//   - Navigation keys (↑/↓/j/k) mutate URL via setSelected.
//   - Action keys (⏎/Space/n/e/r///?) dispatch CustomEvents on window so
//     detail-pane.tsx can wire up the actual server-action calls without
//     coupling to this file.
//   - Input-focus guard: no-op when document.activeElement is an
//     <input>, <textarea>, or has [contenteditable=true].

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSelection } from "./selection-context";

const ACTION_EVENTS = {
  approve: "bulk-review:approve",
  reject: "bulk-review:reject",
  skip: "bulk-review:skip",
  toggleBody: "bulk-review:toggle-body",
  focusOverride: "bulk-review:focus-override",
  focusNotes: "bulk-review:focus-notes",
  toggleCheatsheet: "bulk-review:toggle-cheatsheet",
} as const;

export const KEYBOARD_EVENTS = ACTION_EVENTS;

function isTypingTarget(el: EventTarget | null): boolean {
  const active =
    typeof document !== "undefined" ? document.activeElement : null;
  const candidate = active instanceof HTMLElement ? active : el;
  if (!(candidate instanceof HTMLElement)) return false;
  const tag = candidate.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (candidate.isContentEditable) return true;
  const ce = candidate.getAttribute("contenteditable");
  if (ce === "" || ce === "true" || ce === "plaintext-only") return true;
  return false;
}

export function KeyboardShortcuts({
  rowIds,
}: {
  rowIds: string[];
}) {
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();

  useEffect(() => {
    const visibleIds =
      pendingRemovalIds.size === 0
        ? rowIds
        : rowIds.filter((id) => !pendingRemovalIds.has(id));
    const navigate = (dir: 1 | -1) => {
      if (visibleIds.length === 0) return;
      const idx = selectedId ? visibleIds.indexOf(selectedId) : -1;
      const nextIdx =
        idx < 0 ? 0 : Math.max(0, Math.min(visibleIds.length - 1, idx + dir));
      const target = visibleIds[nextIdx];
      if (!target || target === selectedId) return;
      setSelected(target);
    };

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        navigate(1);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        navigate(-1);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(ACTION_EVENTS.approve));
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(ACTION_EVENTS.reject));
        return;
      }
      if (e.key === "n") {
        window.dispatchEvent(new CustomEvent(ACTION_EVENTS.skip));
        return;
      }
      if (e.key === "e") {
        window.dispatchEvent(new CustomEvent(ACTION_EVENTS.toggleBody));
        return;
      }
      if (e.key === "r") {
        window.dispatchEvent(new CustomEvent(ACTION_EVENTS.focusOverride));
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(ACTION_EVENTS.focusNotes));
        return;
      }
      if (e.key === "?") {
        window.dispatchEvent(new CustomEvent(ACTION_EVENTS.toggleCheatsheet));
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rowIds, selectedId, setSelected, pendingRemovalIds]);

  return null;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ["↑", "k"], description: "Previous row" },
  { keys: ["↓", "j"], description: "Next row" },
  { keys: ["⏎"], description: "Approve" },
  { keys: ["Space"], description: "Reject" },
  { keys: ["n"], description: "Skip (record reject, advance)" },
  { keys: ["e"], description: "Toggle full email body" },
  { keys: ["r"], description: "Focus override category" },
  { keys: ["/"], description: "Focus notes textarea" },
  { keys: ["?"], description: "Show this cheatsheet" },
];

export function Cheatsheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen((prev) => !prev);
    window.addEventListener(ACTION_EVENTS.toggleCheatsheet, onToggle);
    return () =>
      window.removeEventListener(ACTION_EVENTS.toggleCheatsheet, onToggle);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle>Keyboard shortcuts</SheetTitle>
          <SheetDescription>
            Page-scoped — disabled while typing in a form field.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 px-4 pb-4">
          <table className="w-full text-[13px]">
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.description} className="border-b border-[var(--v7-line)] last:border-b-0">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {s.keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="text-[var(--v7-muted)]"> · </span>}
                        <kbd
                          className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] font-mono text-[12px]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </td>
                  <td className="py-2 text-[var(--v7-muted)]">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
