"use client";

// Phase 61-02 stub. Real implementation lands in Task 3 (TDD) + Task 5
// (Cheatsheet sheet). Exports kept minimal so page.tsx typechecks.

export function KeyboardShortcuts(_props: {
  rowIds: string[];
  selectedId: string | null;
}) {
  void _props;
  return null;
}

export function Cheatsheet() {
  return null;
}

export const KEYBOARD_EVENTS = {
  approve: "bulk-review:approve",
  reject: "bulk-review:reject",
  skip: "bulk-review:skip",
  toggleBody: "bulk-review:toggle-body",
  focusOverride: "bulk-review:focus-override",
  focusNotes: "bulk-review:focus-notes",
  toggleCheatsheet: "bulk-review:toggle-cheatsheet",
} as const;
