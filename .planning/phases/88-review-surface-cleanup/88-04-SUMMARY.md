---
phase: 88
plan: 04
subsystem: review-surface
tags: [stage-4, chip-strip, ui, frontend]
requires:
  - 88-01  # Wave 0 width-regression finding
provides:
  - stage-4-chip-strip-outcome-filter
  - url-contract-outcome
affects:
  - web/app/(dashboard)/automations/[swarm]/stage-4
tech-stack:
  added: []
  patterns: [chip-strip-from-_shell, url-driven-filter, router-replace-on-chip-click]
key-files:
  created: []
  modified:
    - web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx
decisions:
  - "D-03c dropped — Wave 0 Q3 confirmed NO width regression (Branch A); sticky wrapper retained"
  - "Outcome chip set bounded by code: all / handler_error / needs_review / auto_archived (CONTEXT D-03a + RESEARCH Q2)"
  - "Chip click uses router.replace, not router.push (chip toggles are not back-button history)"
  - "Counts on chips are pre-mailbox-filter (swarm-wide outcome distribution); visible rows respect mailbox filter"
metrics:
  duration: 12m
  completed: 2026-05-20
---

# Phase 88 Plan 04: Stage 4 layout parity (chip-strip swap) Summary

**One-liner:** Stage 4 collapsibles replaced with outcome-state ChipStrip + filtered RowList, URL contract `?outcome=`, hard-separation lock holds.

## Width-fix branch chosen

**Branch A — NO regression.** Per `88-WAVE0-FINDINGS.md` Q3 (code-evidence verdict): all five stages use identical `gridTemplateColumns: "minmax(640px, 1fr) 540px"`. The Stage-4-unique `position: sticky` + `minHeight: 320` wrapper at `client-shell.tsx:435` affects vertical behaviour only, not width. D-03c dropped from unconditional scope; sticky wrapper retained unchanged.

Wave 0 reference: `.planning/phases/88-review-surface-cleanup/88-WAVE0-FINDINGS.md` Q3 "Conclusion".

## Chip-strip behaviour assertions covered by tests

Test file: `web/app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx` — 17/17 pass.

New D-03 cases (8 added):

| # | Case | Verifies |
|---|------|----------|
| 1 | `?outcome=handler_error` → handler_error chip aria-selected=true + row visible | Task 2 parse + Task 3 render |
| 2 | `?outcome=needs_review` → needs_review chip aria-selected=true | Task 2 parse |
| 3 | `?outcome=auto_archived` → auto_archived chip aria-selected=true | Task 2 parse |
| 4 | Missing `?outcome` → All chip active (default) | Task 2 default |
| 5 | `?outcome=foo` (unknown) → All chip active (coerce) | Task 2 defensive |
| 6 | Four chips in order: All / Handler error / Needs review / Auto-archived | Task 3 D-03a chip set |
| 7 | client-shell.tsx has NO `swarm_intents` / `SwarmIntentRow` refs + `intents={[]}` retained | Hard-sep lock |
| 8 | client-shell.tsx has NO `Collapsible` refs + has `ChipStrip` | Layout swap |

Pre-existing 9 tests still green.

## Hard-sep grep results

```
$ grep -E "swarm_intents|SwarmIntentRow" web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
(no matches — 0 hits)

$ grep "intents={\[\]}" web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
1 hit (UnifiedDetailPane mount, Stage 4 has NO Replay path)

$ grep "Collapsible" web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
(no matches — 0 hits)

$ grep -c "ChipStrip" web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
3 (import + JSX + type ChipStripChip)

$ grep -c "activeOutcome" web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
11 hits (interface, destructure, callback dependency, chip render, filter switch, etc.)

$ grep -c "activeOutcome" web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx
3 hits (declaration, comment, prop assignment)
```

All acceptance-criteria grep gates satisfied.

## Implementation notes

- `Stage4ClientShell` gained one prop: `activeOutcome: "all" | "handler_error" | "needs_review" | "auto_archived"`.
- `chips[]` data structure (ChipStripChip): "All" (no brand token), then three colour-coded chips with `brandToken` set to `--v7-red` / `--v7-amber` / `--v7-lime` for visual continuity with the prior section header colours.
- `visibleRows` switch resolves to one of the three mailbox-filtered subsets (`visibleUnified` / `visibleNeedsReview` / `visibleAutoArchived`) or their union for the "All" branch — keeps the existing mailbox-filter memoisation intact.
- `emptyState` switch routes the right empty-state copy to the unified RowList based on `activeOutcome`.
- `KeyboardShortcuts` now scopes `rowIds` to `visibleRows` (not just handler-error) so j/k nav follows the chip selection.
- `selectedId` cross-section resolution at lines 188-198 is unchanged — operates on the full row union, so a selected row in a hidden bucket still resolves the detail-pane data (existing behaviour preserved).
- Mock fixed in test file: admin builder gained `.not()` / `.limit()` / `.maybeSingle()` / `.single()` to satisfy `loadMailboxLabels` (Rule 3 — was crashing pre-existing tests).

## Hard-separation lock (RFC compliance)

- Stage 4 detail-pane mount: `intents={[]}` retained (Stage 4 has NO Replay path — RFC line 8-15 lock).
- `categories` prop still sources from `swarm_noise_categories` (Reclassify-to-noise widget; the auto-archived bucket is Stage 1 output surfaced as Stage 4 telemetry).
- Grep gates confirm zero `swarm_intents` / `SwarmIntentRow` references in `stage-4/client-shell.tsx`.

## Operator UAT screenshot path

**Deferred to live deploy** (auto-mode disposition mirrors Wave 0 Q3's approach). Code-level acceptance criteria all green. Screenshot landing folder: `.planning/phases/88-review-surface-cleanup/screenshots/stage-4-chipstrip.png` (operator captures during preview-deploy UAT).

`Auto-approved: Task 4 (checkpoint:human-verify) — code-level criteria green; operator UAT screenshot deferred to preview-deploy session.`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking test infrastructure] Admin client mock missing methods**
- **Found during:** Task 2 verification (running existing page.test.tsx)
- **Issue:** Test stub for `createAdminClient` exposed only `.select/.eq/.in/.order/.then`, but `loadMailboxLabels` (added in earlier phase) chains `.not("mailbox_id", "is", null).not("entity", "is", null).limit(5000)` and `loadEntityBrand` chains `.eq().maybeSingle()`. 5 tests crashed with `TypeError: ...not is not a function` / `...maybeSingle is not a function` independent of my Plan 04 changes.
- **Fix:** Extended the builder mock with `.not()`, `.limit()`, `.maybeSingle()`, `.single()` (terminal methods resolve to `{ data: null, error: null }`; chainables return `builder`).
- **Files modified:** `web/app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx`
- **Commit:** `a1bd8f75` (folded into the Plan 04 single-commit since the test infra fix is required to verify Plan 04 work).

No other deviations.

## Commits

| Hash | Files | Notes |
|------|-------|-------|
| `a1bd8f75` | client-shell.tsx, page.tsx, __tests__/page.test.tsx | Single semantic commit — page.tsx + client-shell.tsx couple via the new `activeOutcome` prop; tsc would fail on a half-commit. Test file co-committed because it includes both the mock fix (Rule 3) and the 8 new D-03 cases. |

## Success Criteria

- [x] D-03a (locked): outcome-state chips, not per-handler. Set bounded by code (4 chips fixed).
- [x] D-03b: chip set = `all / handler_error / needs_review / auto_archived` with `all` default.
- [x] D-03c: Branch A per Wave 0 Q3 (NO width regression — sticky wrapper retained).
- [x] selectedId cross-section model preserved (lines 165-198 unchanged).
- [x] Hard-sep lock holds (`intents={[]}` on Stage 4 detail-pane; zero `swarm_intents` refs).
- [x] `cd web && npx tsc --noEmit` exit 0.
- [x] vitest stage-4/__tests__/page.test.tsx: 17/17 pass.

## Self-Check: PASSED

- File `.planning/phases/88-review-surface-cleanup/88-04-SUMMARY.md` exists.
- Commit `a1bd8f75` exists in `git log --oneline`.
- `web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx` modified — verified.
- `web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx` modified — verified.
- `web/app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx` modified — verified.
- All grep gates green (Collapsible 0, ChipStrip 3, swarm_intents 0, intents={[]} 1).
- vitest 17/17 pass.
- tsc clean.
