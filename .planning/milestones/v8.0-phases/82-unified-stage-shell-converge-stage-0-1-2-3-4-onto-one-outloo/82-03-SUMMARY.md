---
phase: 82-unified-stage-shell
plan: 03
subsystem: dashboard/automations/stage-2
tags: [unified-shell, stage-2, ui-migration, banner-preservation]
requires:
  - 82-01 (shared _shell library exists: page-header, stage-tab-strip, row-list, mailbox-filter, detail-pane, selection-context)
  - 82-02 (Stage 0 reference pattern established)
  - 81-02 (loadStage2WeeklyCount head-count loader; D-12 banner shape)
provides:
  - Stage 2 page on unified shell with empty row list
  - Phase 81 D-12 tagging-failures banner preserved ABOVE row list (OQ-3 resolution)
affects:
  - web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx (rewritten)
  - web/app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx (rewritten + expanded)
tech-stack:
  added: []
  patterns:
    - Stage 0 placeholder shape (Plan 82-02) — banner-above + disabled "All 0" chip + empty RowList + UnifiedDetailPane(activeStage, categories=[], intents=[])
    - RSC-page RTL pattern (await async component, render result, mock loaders at module boundary)
key-files:
  created: []
  modified:
    - web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx
decisions:
  - D-02 honored — Stage 2 consumes shared _shell library, no per-stage duplication.
  - D-14 honored — single disabled "All 0" chip strip until Phase 77 wires real counts.
  - D-15 honored — empty-state copy "No rows yet / Stage 2 awaits backend wiring in a follow-up phase."
  - D-17 honored — banner ABOVE shell, NOT folded into empty-state copy (OQ-3 resolved as banner-above).
  - Phase 81-02 A3 carry-forward — em-dash + no ↗ link for non-debtor-email swarms.
metrics:
  duration: ~10 min
  completed: 2026-05-11
  tasks: 1
  files-modified: 2
---

# Phase 82 Plan 03: Stage 2 Unified-Shell Migration Summary

Stage 2 (`/automations/{swarm}/stage-2`) now renders the unified `_shell/` skeleton (same as Stages 0/1/3/4) with the Phase 81 D-12 tagging-failures count banner preserved verbatim above the empty row list — OQ-3 resolved as banner-above, not folded into empty-state copy.

## What Changed

1. **Rewrote `stage-2/page.tsx`** to consume `_shell/{page-header,stage-tab-strip,row-list,mailbox-filter,detail-pane,selection-context}` plus `_shell/_lib/get-swarm-mailboxes` — 8 `_shell/` imports total. Followed the Stage 0 pattern from Plan 82-02 exactly, with these differences:
   - `currentStage={2}` on `StageTabStrip` (+ `counts={{ 2: stage2Count ?? 0 }}` to pipe live count into the tab).
   - `activeStage={2}` on `UnifiedDetailPane`.
   - Banner JSX preserved verbatim from previous placeholder: `Customer-mapping issues this week: <count> ↗ Open`, with em-dash fallback + link omission for non-debtor-email swarms.
   - `loadStage2WeeklyCount(admin)` still gated on `swarmType === "debtor-email"` (Phase 81-02 A3 contract).
   - Empty-state copy from D-15: "No rows yet" / "Stage 2 awaits backend wiring in a follow-up phase."
   - `SelectionProvider rowIds={[]}` (LANDMINE-safe per PATTERNS §295).
   - **No** `AutomationRealtimeProvider` (RESEARCH §Realtime — Stage 2 has no channel today).

2. **Expanded `stage-2/__tests__/page.test.tsx`** to 6 cases:
   - debtor-email banner + ↗ link + StageTabStrip count
   - non-debtor em-dash + no link + loader NOT called
   - empty-state copy assertion (D-15)
   - MailboxFilter trigger present ("All mailboxes")
   - no AutomationRealtimeProvider mounted
   - unknown swarm → `NEXT_NOT_FOUND`

## Verification

- `cd web && npx vitest run --no-coverage 'app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx'` → 6/6 passing.
- `cd web && npx tsc --noEmit` clean for Stage 2 paths (pre-existing errors in `stage-1/__tests__/actions.predictor.test.ts` and `lib/classifier/corpus-mapping.ts` are out of scope; not introduced by this plan).
- Acceptance criteria checks all OK:
  - `loadStage2WeeklyCount` retained.
  - 8 `_shell/` imports (≥5 required).
  - `swarmType === "debtor-email"` branching present.
  - No "Bulk Review" copy (D-18 carry-forward).
  - No `AutomationRealtimeProvider` (only mentioned in a doc comment).

## Decisions Made

- Followed Stage 0 (Plan 82-02) inline pattern rather than importing a `Stage2Widget` from `_shell/components/` (no such file exists — only `stage-0-widget.tsx`). The PATTERNS reference to `Stage2Widget` predates Plan 82-02's resolved approach of inlining the disabled chip strip.

## Deviations from Plan

None — plan executed exactly as written. The `Stage2Widget` placeholder mentioned in the user prompt's "key reminders" is not present in `_shell/components/`; the Stage 0 reference (Plan 82-02) inlines the chip and is the canonical pattern. Followed Stage 0.

## Known Stubs

- Stage 2 rows are intentionally empty (D-15/D-17). Phase 77 will wire the backend. The empty-state copy explicitly tells operators about the follow-up phase, so this stub is acceptable per the plan.

## Commits

- `85aeaf2` — `test(82-03): add failing tests for Stage 2 unified-shell migration` (RED)
- `f190acb` — `feat(82-03): migrate Stage 2 to unified shell, preserve D-12 banner above` (GREEN)

## Self-Check: PASSED

- FOUND: web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx
- FOUND: 85aeaf2
- FOUND: f190acb
