"use client";

// Phase 82 Plan 01 — Keyboard shortcuts for the unified stage shell.
//
// Moved verbatim from stage-1/keyboard-shortcuts.tsx. Single addition:
//   stage0Focus: "bulk-review:stage-0-focus" (per CONTEXT D-04).
// Single new feature: optional `enabledShortcuts?: Set<keyof typeof ACTION_EVENTS>`
// prop to short-circuit actions per stage mount (RESEARCH §Keyboard Shortcuts
// Mounting). When omitted, ALL shortcuts are enabled (backwards compatible).
//
// Design (preserved verbatim):
//   - Single window keydown listener mounted in useEffect with cleanup.
//   - Navigation keys (↑/↓/j/k) mutate URL via setSelected.
//   - Action keys (⏎/Space/n/e/r///?) dispatch CustomEvents on window so
//     detail-pane.tsx can wire up the actual server-action calls without
//     coupling to this file.
//   - Input-focus guard: no-op when document.activeElement is an
//     <input>, <textarea>, or has [contenteditable=true].
//
// Hard-separation reminder: window-dispatched `bulk-review:*` event names are
// backend identifiers (Phase 81 D-19 lock). DO NOT rename them — Stage 1's
// detail-pane wires into these by string.

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
  // Phase 71-05 — 4-axis Bulk Review keyboard hooks.
  stage1Focus: "bulk-review:stage-1-focus",
  stage2Focus: "bulk-review:stage-2-focus",
  stage3Focus: "bulk-review:stage-3-focus",
  stage4Focus: "bulk-review:stage-4-focus",
  // Phase 82 Plan 01 — Stage 0 focus hook (added per CONTEXT D-04).
  stage0Focus: "bulk-review:stage-0-focus",
  evalTypeCapability: "bulk-review:eval-type-capability",
  evalTypeRegression: "bulk-review:eval-type-regression",
  overrideSubmit: "bulk-review:override-submit",
  overrideDiscard: "bulk-review:override-discard",
} as const;

export const KEYBOARD_EVENTS = ACTION_EVENTS;

export type ShortcutAction = keyof typeof ACTION_EVENTS;

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
  enabledShortcuts,
}: {
  rowIds: string[];
  /** Optional whitelist of shortcut actions to enable. When omitted, ALL
   *  shortcuts are active. Navigation keys (↑/↓/j/k) are always active
   *  (they don't have a corresponding ACTION_EVENTS entry — they mutate
   *  selection state directly). */
  enabledShortcuts?: Set<ShortcutAction>;
}) {
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();

  useEffect(() => {
    const isEnabled = (action: ShortcutAction): boolean =>
      enabledShortcuts === undefined || enabledShortcuts.has(action);

    const dispatch = (action: ShortcutAction) => {
      if (!isEnabled(action)) return;
      window.dispatchEvent(new CustomEvent(ACTION_EVENTS[action]));
    };

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

      // Phase 71-05 — Cmd/Ctrl+Enter MUST be checked before bare Enter so the
      // override-submit shortcut isn't shadowed by the legacy Approve action.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        dispatch("overrideSubmit");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        dispatch("approve");
        return;
      }
      // Phase 71-05 — Esc => Discard changes (matches submit-bar button).
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch("overrideDiscard");
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        dispatch("reject");
        return;
      }
      if (e.key === "n") {
        dispatch("skip");
        return;
      }
      if (e.key === "e") {
        dispatch("toggleBody");
        return;
      }
      if (e.key === "r") {
        dispatch("focusOverride");
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        dispatch("focusNotes");
        return;
      }
      if (e.key === "?") {
        dispatch("toggleCheatsheet");
        return;
      }
      // Phase 71-05 — focus per-stage override widgets.
      // Phase 82 — Stage 0 hook added (key "0").
      if (e.key === "0") {
        dispatch("stage0Focus");
        return;
      }
      if (e.key === "1") {
        dispatch("stage1Focus");
        return;
      }
      if (e.key === "2") {
        dispatch("stage2Focus");
        return;
      }
      if (e.key === "3") {
        dispatch("stage3Focus");
        return;
      }
      if (e.key === "4") {
        dispatch("stage4Focus");
        return;
      }
      // Phase 71-05 — eval-type toggles.
      if (e.key === "c") {
        dispatch("evalTypeCapability");
        return;
      }
      if (e.key === "g") {
        dispatch("evalTypeRegression");
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rowIds, selectedId, setSelected, pendingRemovalIds, enabledShortcuts]);

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
  // Phase 71-05 — 4-axis Bulk Review bindings.
  { keys: ["0"], description: "Override Stage 0 (safety)" },
  { keys: ["1"], description: "Override Stage 1 (category)" },
  { keys: ["2"], description: "Override Stage 2 (customer)" },
  { keys: ["3"], description: "Override Stage 3 (intent)" },
  { keys: ["4"], description: "Override Stage 4 (handler output)" },
  { keys: ["c"], description: "Eval type — capability" },
  { keys: ["g"], description: "Eval type — regression" },
  { keys: ["⌘⏎", "Ctrl+⏎"], description: "Submit override" },
  { keys: ["Esc"], description: "Discard changes" },
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
