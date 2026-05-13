"use client";

// Phase 82.4 Plan 06 — URL-param-driven wrapper around NeedsActionChip +
// MineOnlyChip.
//
// Mounts on Stages 0/1/2/3 pages above the row list. Stage 4 is OUT OF SCOPE
// per 82.4-CONTEXT.md and never mounts this wrapper.
//
// URL contract:
//   ?needs_action=1 → "Needs action" toggle on
//   ?mine_only=1    → "My feedback only" toggle on
//   ?before=<iso>   → pagination cursor (managed by page-level Load more link)
//
// Toggle semantics:
//   - Default OFF on every tab (audit-first culture).
//   - Toggling a filter RESETS `?before` (cursor reset when filters change) so
//     pagination state never desyncs from the active filter.
//   - Uses router.replace (not push) so back-button doesn't accumulate filter
//     toggles in history — matches the mailbox-filter.tsx idiom.

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { NeedsActionChip, MineOnlyChip } from "./needs-action-chip";

export interface StageListChipsProps {
  needsAction: boolean;
  mineOnly: boolean;
}

export function StageListChips({ needsAction, mineOnly }: StageListChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const toggleParam = useCallback(
    (key: "needs_action" | "mine_only", currentlyActive: boolean) => {
      const qs = new URLSearchParams(search?.toString() ?? "");
      if (currentlyActive) {
        qs.delete(key);
      } else {
        qs.set(key, "1");
      }
      // Cursor reset on filter change — pagination state must not survive
      // a filter toggle (would produce a stale "before" against the new set).
      qs.delete("before");
      const q = qs.toString();
      router.replace(q ? `${pathname}?${q}` : (pathname ?? ""));
    },
    [router, pathname, search],
  );

  return (
    <div
      role="group"
      aria-label="Stage list filters"
      className="inline-flex items-center gap-2"
    >
      <NeedsActionChip
        active={needsAction}
        onToggle={() => toggleParam("needs_action", needsAction)}
      />
      <MineOnlyChip
        active={mineOnly}
        onToggle={() => toggleParam("mine_only", mineOnly)}
      />
    </div>
  );
}
