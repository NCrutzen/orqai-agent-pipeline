---
phase: 82-unified-stage-shell
plan: 05
subsystem: ui-bulk-review
tags: [stage-3, unified-shell, bug-fix, duplicate-label, hard-separation]
requires:
  - 82-01-SUMMARY.md  # _shell primitives (RowList, UnifiedDetailPane, SelectionProvider, KeyboardShortcuts, MailboxFilter)
  - 82-04-SUMMARY.md  # Stage 4 client-shell pattern + email_metadata.mailbox_id thread
provides:
  - "Stage 3 page on unified shell — V4 + V9 verification locks satisfied"
  - "D-18 duplicate intent-code label bug fixed structurally (Row has ONE badge slot)"
  - "Stage3ClientShell wrapper bridging KanbanRow → unified Row + UnifiedDetailPane"
affects:
  - web/app/(dashboard)/automations/[swarm]/stage-3/  # 8 files deleted; 1 new client-shell; page.tsx rewritten
tech-stack:
  added: []
  patterns:
    - "RSC page → client-shell wrapper (mirrors Stage 4 pattern from 82-04)"
    - "Both registries (intents + categories) loaded server-side, threaded as SEPARATE props (hard separation)"
    - "Body + timeline server-side pre-fetch (Pitfall 3 / V8)"
key-files:
  created:
    - web/app/(dashboard)/automations/[swarm]/stage-3/client-shell.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/__tests__/page.test.tsx
  modified:
    - web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx
  deleted:
    - web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/filter-chips.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/reason-pill.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/conf-bar.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/inline-editor.tsx
decisions:
  - "D-18 fixed by construction: Row.stage_badge is a single labeled pill; intent code never appears on the row strip. Test asserts ZERO matches for `general_inquiry` (strongest possible structural lock)."
  - "Hard separation: both registries loaded at page boundary, but passed as DISTINCT props (intents, categories) into UnifiedDetailPane — never collapsed into a union."
  - "Stage 3 chip strip kept as a local component (Stage3FilterChips inside client-shell.tsx) — chip semantics (no_handler/low_confidence/all) are Stage 3-specific. The shared _shell/chip-strip.tsx is a presentation primitive; Stage 3 uses a simpler local pill pattern matching Stage 4's idiom."
  - "action-stack.tsx safe to delete (not move): grep confirmed zero external consumers; Stage 4 uses its own footer pattern via UnifiedDetailPane."
metrics:
  duration_minutes: 12
  completed_date: 2026-05-11
  tasks_completed: 1
  files_changed: 11
---

# Phase 82 Plan 05: Stage 3 Unified Shell Migration Summary

Migrate `/automations/[swarm]/stage-3` to the unified `_shell/` library; fix the D-18 duplicate intent-code label bug by construction (unified Row has ONE badge slot, never two).

## Outcome

Stage 3 page now renders the unified 5-stage shell with `activeStage=3`. Each row shows `[no_handler|low_confidence] · Sender · Subject · Timestamp` — a SINGLE badge slot. The intent code is no longer rendered on the row strip itself (the bug source — old `row-list.tsx` L117 + L126 — is deleted).

Both `swarm_intents` and `swarm_noise_categories` are loaded server-side and threaded as SEPARATE props into `UnifiedDetailPane` (`intents={replayIntents}` → Stage3Widget, `categories={reclassifyNoiseCategories}` → Stage1Widget). Hard separation preserved at the type-level API boundary per RFC `docs/agentic-pipeline/README.md`.

8 stage-3-local files deleted; one new `client-shell.tsx` bridges KanbanRow → unified Row and wires the Stage 3 chip filter + mailbox filter + selection-driven detail pane.

## Verification

### V4 + V9 + D-18 — RTL test (`__tests__/page.test.tsx`)

10/10 tests green. The V9 / D-18 regression assertion:

```tsx
// Row with topic = intent = 'general_inquiry' renders the intent code
// ZERO times on the row strip (badge label is kanban_reason, not intent).
const matches = screen.queryAllByText(/general_inquiry/);
expect(matches.length).toBe(0);
const badge = screen.getByTestId("stage-badge");
expect(badge.textContent).toBe("no_handler");
```

The old shape rendered intent code at L117 (mid-row topic) AND L126 (right-aligned mono span) — `getAllByText('general_inquiry').length === 2`. The new shape renders intent code zero times on the row strip; it surfaces only inside the Stage 3 widget in the detail pane (Stage3Widget consumes `intents` prop).

### Grep gates (acceptance criteria from PLAN)

| Gate | Result |
|------|--------|
| `_shell/` imports in page.tsx | 6 (≥5 required) |
| Both registries loaded | `loadSwarmIntents` + `loadSwarmNoiseCategories` present (4 occurrences) |
| Kanban channel preserved | `${swarmType}-kanban` present |
| No review channel leak | clean |
| RFC hard-separation comment | preserved verbatim |
| No "Bulk Review" copy | clean |
| Old files deleted | 8/8 deleted |
| TypeScript | no NEW errors introduced (pre-existing errors in `stage-1/actions.predictor.test.ts` + `lib/classifier/corpus-mapping.ts` are out of scope) |

### Decisions addressed (from PLAN frontmatter)

- D-02 — Stage 3 cell pre-expanded (`activeStage=3`)
- D-03 — body preview pre-fetched server-side
- D-04 — single badge slot
- D-05 — mailbox filter wired
- D-06 — keyboard shortcuts enabled (approve/reject/skip/toggleBody/overrideSubmit/overrideDiscard/stage3Focus)
- D-08 — active cell scroll-into-view (inherited from UnifiedDetailPane)
- D-09 — Stage 3 ranked-intent override semantics preserved via Stage3Widget (already widget-side; page just passes `intents`)
- D-14 — chip strip absorbed into client-shell
- **D-18 — duplicate intent-code label bug FIXED (structural)**
- D-20 — old files deleted

## Deviations from Plan

**None.** Plan executed exactly as written.

Two TypeScript errors observed during `tsc --noEmit` were verified pre-existing (reproduced on clean `git stash`):
1. `stage-1/__tests__/actions.predictor.test.ts:60` — spread argument tuple type
2. `lib/classifier/corpus-mapping.ts:16` — missing `spam` category in Record

These are out-of-scope per the Rule 1-3 Scope Boundary (not caused by Plan 82-05 changes). Logged for a future cleanup plan.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes.

## Known Stubs

None. The Stage 1 cell of the unified detail pane (which Stage 3 mounts because hard separation requires both widgets available for cross-axis overrides) still has the Plan-06-pending widgets for Stages 2/4 — those are pre-existing placeholders from Plan 82-01, not introduced here.

## Self-Check: PASSED

- Created files exist: page.test.tsx, client-shell.tsx — FOUND
- page.tsx modified — FOUND
- 8 old files deleted — VERIFIED (`ls stage-3/` shows only `__tests__/`, `client-shell.tsx`, `page.tsx`)
- Commits exist:
  - `eed93b4` — test(82-05): add failing tests for Stage 3 unified-shell migration
  - `8135242` — feat(82-05): migrate Stage 3 to unified shell; fix duplicate intent-label bug (D-18)
