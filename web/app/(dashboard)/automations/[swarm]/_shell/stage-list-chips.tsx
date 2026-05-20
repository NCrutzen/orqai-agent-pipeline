"use client";

// Phase 82.4 Plan 06 — URL-param-driven wrapper around MineOnlyChip.
//
// Phase 88 Plan 03 (D-02 cleanup): the prior needs-action toggle chip was
// dropped. The verdict-pending axis collapsed into the "Needs review" chip
// on Stage 1's NoiseCategoryChipStrip (one filter axis, not two). The URL
// param that drove the toggle is no longer in the keyspace. Stage 0's
// hardcoded server-side `needsActionOnly: true` filter on
// loadStageFeedbackList is unchanged — that lives on the loader, not the
// chip wrapper.
//
// Mounts on Stages 0/1/2/3 pages above the row list. Stage 4 is OUT OF SCOPE
// per 82.4-CONTEXT.md and never mounts this wrapper.
//
// URL contract:
//   ?mine_only=1    → "My feedback only" toggle on
//   ?before=<iso>   → pagination cursor (managed by page-level Load more link)
//
// Toggle semantics:
//   - Default OFF on every tab (audit-first culture).
//   - Toggling RESETS `?before` (cursor reset when filters change) so
//     pagination state never desyncs from the active filter.
//   - Uses router.replace (not push) so back-button doesn't accumulate filter
//     toggles in history — matches the mailbox-filter.tsx idiom.

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { MineOnlyChip } from "./needs-action-chip";

export interface StageListChipsProps {
  mineOnly: boolean;
}

export function StageListChips({ mineOnly }: StageListChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const toggleMineOnly = useCallback(
    (currentlyActive: boolean) => {
      const qs = new URLSearchParams(search?.toString() ?? "");
      if (currentlyActive) {
        qs.delete("mine_only");
      } else {
        qs.set("mine_only", "1");
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
      <MineOnlyChip
        active={mineOnly}
        onToggle={() => toggleMineOnly(mineOnly)}
      />
    </div>
  );
}
