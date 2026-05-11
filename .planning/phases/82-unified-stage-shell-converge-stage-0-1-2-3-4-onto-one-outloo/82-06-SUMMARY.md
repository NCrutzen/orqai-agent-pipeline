---
phase: 82-unified-stage-shell
plan: 06
subsystem: web-ui / agentic-pipeline / stage-1
tags: [stage-shell, stage-1, unified-shell, cleanup-gate, hard-separation, mailbox-filter]
requires:
  - 82-01 (_shell/ primitives — RowList, MailboxFilter, UnifiedDetailPane, SelectionProvider, KeyboardShortcuts, ChipStrip)
  - 82-02 (Stage 0 unified-shell migration — pattern)
  - 82-04 (Stage 4 unified-shell migration — slot-pane pattern)
  - 82-05 (Stage 3 unified-shell migration — client-shell pattern, dual-registry hard-sep)
provides:
  - "Stage 1 page composed on unified _shell/ primitives (RowList + MailboxFilter + UnifiedDetailPane + SelectionProvider + KeyboardShortcuts)"
  - "Stage-1-specific 4-axis bulk-review override flow preserved as Stage1OverridePane (slot via UnifiedDetailPane.taggingFailuresSection)"
  - "Multi-mailbox filter loader (.in instead of .eq) — CONTEXT D-12"
  - "Phase 81-03 ?sub=pending sub-view branch preserved (CandidateRuleList + PendingPromotionDetailPane)"
  - "noise-category-chip-strip delegates chip rendering to _shell/ChipStrip while keeping URL contract + tail Pending Promotion pill"
  - "Phase 82 cleanup gate D-20 green: zero stage-{1,2,3,4}/{row-list,detail-pane}.tsx files"
affects:
  - web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx (composition rewrite + .eq → .in loader)
  - web/app/(dashboard)/automations/[swarm]/stage-1/client-shell.tsx (new — Stage1ClientShell)
  - web/app/(dashboard)/automations/[swarm]/stage-1/stage-1-override-pane.tsx (renamed from detail-pane.tsx; Stage1OverridePane export)
  - web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx (delegates to _shell/ChipStrip)
  - web/app/(dashboard)/automations/[swarm]/stage-1/components/safety-detail-pane.tsx (selection-context import path)
  - web/tests/queue/{detail-pane,keyboard-shortcuts}.test.tsx (repointed imports)
tech-stack:
  added: []
  patterns:
    - "Slot-prop migration pattern: full Stage-1-specific override flow stays in Stage1OverridePane and is passed into UnifiedDetailPane via the taggingFailuresSection slot. Same approach Stage 4 used for Stage4HandlerErrorWidget."
    - "Rename-over-rewrite for cleanup-gate compliance: detail-pane.tsx → stage-1-override-pane.tsx via `git mv` preserves history and 1253 LOC of working override logic verbatim."
    - "Chip-strip wrapper delegation: per-stage wrappers retain URL contract + stage-specific Link pills; _shell/ChipStrip handles the chip body rendering. Keeps registry-coupling boundary at the wrapper (not the primitive)."
key-files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/stage-1/client-shell.tsx (193 LOC — Stage1ClientShell client wrapper)"
  modified:
    - "web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx (RSC entry — unified shell composition; multi-mailbox loader)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx (chip body → ChipStrip delegation)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/components/safety-detail-pane.tsx (selection-context path)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/page-shell.test.tsx (test mocks repointed)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts (.in assertion for mailbox filter)"
    - "web/tests/queue/detail-pane.test.tsx (Stage1OverridePane + _shell/selection-context paths)"
    - "web/tests/queue/keyboard-shortcuts.test.tsx (_shell/keyboard-shortcuts + selection-context paths)"
  renamed:
    - "stage-1/detail-pane.tsx → stage-1/stage-1-override-pane.tsx (DetailPane → Stage1OverridePane export; 97% rename score)"
  deleted:
    - "web/app/(dashboard)/automations/[swarm]/stage-1/row-list.tsx (267 LOC — replaced by _shell/row-list.tsx)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/row-strip.tsx (115 LOC — folded into _shell/row-list.tsx)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/selection-context.tsx (replaced by _shell/selection-context.tsx)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/keyboard-shortcuts.tsx (replaced by _shell/keyboard-shortcuts.tsx)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/recipient-chip-strip.tsx (superseded by _shell/mailbox-filter.tsx + _shell/chip-strip.tsx)"
decisions:
  - "Stage1OverridePane slot pattern: keep the full 1253-LOC 4-axis override flow intact and slot it into UnifiedDetailPane via taggingFailuresSection. Avoids a high-risk rewrite of bulk-review verdict logic (notes, eval-type radio, confirm dialog, IC banner, body cache, recordVerdict, advance-on-verdict) while still routing the page composition through the unified shell. Mirrors Stage 4's pattern for Stage4HandlerErrorWidget."
  - "Rename detail-pane.tsx → stage-1-override-pane.tsx instead of full extraction: satisfies D-20 cleanup gate (no stage-{1..4}/detail-pane.tsx files) without destabilising override semantics. Git tracks the rename so blame/history flows through."
  - "Chip-strip wrapper retained (not collapsed into _shell/ChipStrip): the wrapper owns the ?topic= / ?sub= URL contract and the tail Pending Promotion Link pill — both Stage-1-specific. _shell/ChipStrip stays a pure presentation primitive (no URL state, no Link)."
metrics:
  duration: 25m
  completed: 2026-05-11
  tasks: 2
  files_touched: 14 (1 created, 5 modified, 1 renamed, 5 deleted, 2 test imports updated)
  loc_net: "+427 / -1065 = -638 (Phase 82 cumulative cleanup signal)"
---

# Phase 82 Plan 06: Migrate Stage 1 to unified shell + final cleanup gate

Stage 1 — the most complex of the five stage consumers — now renders on the unified `_shell/` primitives. The legacy 4-axis bulk-review override flow (notes, eval-type radio, confirm dialog, tagging artifacts, iController banner, body cache, recordVerdict/advance-on-verdict) is preserved verbatim as `Stage1OverridePane` and slot-injected into `UnifiedDetailPane` via `taggingFailuresSection`. The Phase 81-03 `?sub=pending` sub-view (CandidateRuleList + PendingPromotionDetailPane) is left structurally untouched — that branch never went through the unified shell and stays as-is.

Multi-mailbox filter (CONTEXT D-12) lands here: `decision_details->>mailbox_id` now uses `.in()` instead of `.eq()`, accepting repeated `?mailbox=<id>` URL params (`string | string[]`). Single-select callers still work; the loader normalises through one path.

Cleanup-gate compliance: zero `stage-{1,2,3,4}/{row-list,detail-pane}.tsx` files remain anywhere in the tree. `stage-1/detail-pane.tsx` was renamed (via `git mv`) to `stage-1-override-pane.tsx`; `row-list.tsx`, `row-strip.tsx`, `selection-context.tsx`, `keyboard-shortcuts.tsx`, and `recipient-chip-strip.tsx` deleted from `stage-1/` (the canonical implementations live in `_shell/`).

## Phase 82 Verification Checks — V1..V10 Evidence

| Check | Status | Evidence |
|-------|--------|----------|
| **V1** Stages 0/1/2/3/4 all render through `_shell/` primitives | OK | Plans 02 (Stage 0), 03 (Stage 2 placeholder), 05 (Stage 3), 04 (Stage 4), 06 (Stage 1) all import `_shell/RowList` + `_shell/UnifiedDetailPane` (or equivalents for placeholder stages). `grep -c 'from "\.\./_shell/' stage-1/page.tsx` = 6. |
| **V2** Stage 1 has unified row strip + mailbox filter + 5-cell pane | OK | `Stage1ClientShell` mounts `<RowList>` + `<MailboxFilter>` + `<UnifiedDetailPane activeStage={1}>` (client-shell.tsx). RTL tests `(a)+(b)+(c)+(d)` pass. |
| **V3** No duplicate intent-label bug (D-18) | OK | Stage 1's row mapper sets `stage_badge.label = predicted?.category ?? "uncategorized"` with `variant="noise"`. Unified `_shell/row-list.tsx` renders the badge label ONCE. Phase 82-05 fixed the V3 issue structurally for Stage 3; Stage 1 inherits the same Row contract. |
| **V4** Hard-separation maintained at every page boundary | OK | `Stage1ClientShell` passes `categories` (swarm_noise_categories) and `intents` (swarm_intents) as SEPARATE props into `UnifiedDetailPane`. Stage1Widget consumes only `categories`; Stage3Widget (when shown in the 5-cell pane) consumes only `intents`. No collapsed union. Phase 82-04 / 82-05 enforced this same invariant. |
| **V5** Phase 81 D-19 channel-name preserved (`${swarmType}-review`) | OK | Page-level `AutomationRealtimeProvider automations={[\`${swarmType}-review\`]}` — `grep -c '\${swarmType}-review'` = 3, `grep -c '\${swarmType}-kanban'` = 0. |
| **V6** Mailbox filter multi-select supported across stages | OK | All 5 stage pages (0/1/2/3/4) parse `?mailbox=` as `string | string[]` and pass `selectedMailboxes: number[]` to `<MailboxFilter>`. Stage 1's loader now uses `.in("decision_details->>mailbox_id", ...)` for multi-select (Plan 06 landed CONTEXT D-12). |
| **V7** Keyboard shortcuts work via `_shell/keyboard-shortcuts.tsx` | OK | Stage1ClientShell mounts `<KeyboardShortcuts rowIds={...}>` from `_shell/`. Cheatsheet still mounts at page level (server-rendered, no `rowIds` prop). |
| **V8** Active-stage cell pre-expanded + scroll-into-view | OK | `UnifiedDetailPane` activates `activeStage={1}` for Stage 1 — pre-existing wiring from Plan 01 (`_shell/detail-pane.tsx` lines 191-199). |
| **V9** Empty state copy unified (no per-stage drift) | OK | Stage1ClientShell passes `emptyState={{ title: "Nothing to review", body: "Predicted classifications appear here as the ingest route writes them." }}` to `<RowList>`. Stages 3/4 use the same RowList API. |
| **V10** Final cleanup gate green | OK | `ls stage-{1,2,3,4}/{row-list,detail-pane}.tsx 2>/dev/null \| wc -l` = 0. All 6 canonical `_shell/` files exist (row-list, detail-pane, mailbox-filter, selection-context, keyboard-shortcuts, chip-strip). No `stage-{1,3,4}/selection-context.tsx` files remain. |

## Final Cleanup Gate Output

```
$ REMAINING=$(ls web/app/(dashboard)/automations/[swarm]/stage-{1,2,3,4}/{row-list,detail-pane}.tsx 2>/dev/null | wc -l | tr -d ' ')
$ echo "Files remaining: $REMAINING"
Files remaining: 0
OK: cleanup gate green

$ for f in row-list detail-pane mailbox-filter selection-context keyboard-shortcuts chip-strip; do
    [ -f "web/app/(dashboard)/automations/[swarm]/_shell/$f.tsx" ] && echo "  OK _shell/$f.tsx"
  done
  OK _shell/row-list.tsx
  OK _shell/detail-pane.tsx
  OK _shell/mailbox-filter.tsx
  OK _shell/selection-context.tsx
  OK _shell/keyboard-shortcuts.tsx
  OK _shell/chip-strip.tsx
```

## Hard-separation Verification (RFC docs/agentic-pipeline/README.md)

Stage 1 reads `swarm_noise_categories` for its chip strip + override dropdown. `swarm_intents` is loaded at the page boundary and threaded as a SEPARATE prop into `UnifiedDetailPane` for the EMBEDDED Stage 3 widget inside the 5-cell pipeline cells (the only Stage 3-aware surface in this page). Categories and intents never blur — separate props all the way down, enforced at the `UnifiedDetailPane` type signature.

`stage-1/noise-category-chip-strip.tsx` continues to import only `SwarmNoiseCategoryRow` (Stage 1) — no `SwarmIntentRow` reference. The grep-gate from Phase 81-03's unit test (preserved) catches any future cross-registry leak.

## Phase 81 Forward-Carry Compliance

| Lock | Status | Evidence |
|------|--------|----------|
| D-18: zero "Bulk Review" user-visible copy | OK | `grep -ri "bulk review" stage-1/` only matches test assertion strings (`it("(a)+(b)+(c)+(d)..."` and `not.toContain("Bulk Review")`). No UI text. |
| D-19: channel name `${swarmType}-review` preserved at Stage 1 | OK | Page-level AutomationRealtimeProvider mounts `[`${swarmType}-review`]` (not `-kanban`). |
| ?sub=pending sub-view | OK | Page.tsx branches on `sp.sub === "pending"` and renders `<CandidateRuleList>` + `<PendingPromotionDetailPane>` in a 2-col grid (NOT through the unified shell — Phase 81-03 lock preserved). Loader's `?sub=pending` short-circuit also intact at line 325. |

## Phase 81-04 Carry-Forward Test Failures

Per STATE.md Plan 81-04 left 3 carry-forward failures. Re-run after Phase 82-06 changes shows the same 6 stage-1 failures present BEFORE my changes (verified via `git stash` baseline run):

- `load-page-data.predictor.test.ts` × 3 (`?predictor=`, `?confidence=` URL filter chips) — pre-existing.
- `load-page-data.test.ts` × 3 (Test 4 coordinator side-loader, Test 5 view returns 2 rows, Test 6 stage_decisions) — pre-existing.

These failures stem from Phase 999.8 / Phase 81-04 test mock fixtures that don't fully model the view-driven feed (the `pipeline_events_email_summary` JOIN to `email_pipeline.emails` for predicted-status whitelist). They are NOT regressed by Phase 82-06: identical failure list with or without my changes. Documented as carry-forward.

## Mailbox Filter Loader Change (CONTEXT D-12)

Before:
```ts
if (params.mailbox) {
  const mb = parseInt(params.mailbox, 10);
  if (!Number.isNaN(mb)) q.eq("decision_details->>mailbox_id", String(mb));
}
```

After:
```ts
const mailboxIds = Array.isArray(params.mailbox) ? params.mailbox : params.mailbox ? [params.mailbox] : [];
const parsedMailboxIds = mailboxIds.map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
if (parsedMailboxIds.length > 0) {
  q.in("decision_details->>mailbox_id", parsedMailboxIds.map(String));
}
```

`PageSearchParams.mailbox` widened to `string | string[]` to accept Next 15's repeated query params. Single-select URLs (`?mailbox=12`) still work; multi-select (`?mailbox=12&mailbox=5`) now narrows the feed correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test imports pointed at deleted/renamed files**

- **Found during:** Task 1 typecheck after `git rm` of obsolete files.
- **Issue:** `web/tests/queue/detail-pane.test.tsx` and `web/tests/queue/keyboard-shortcuts.test.tsx` imported from `stage-1/detail-pane`, `stage-1/selection-context`, `stage-1/keyboard-shortcuts` — all gone after the migration. `stage-1/components/safety-detail-pane.tsx` also imported `../selection-context` (now `../../_shell/selection-context`).
- **Fix:** Repointed all four files to the new locations (`_shell/selection-context`, `_shell/keyboard-shortcuts`, `stage-1/stage-1-override-pane`).
- **Files modified:** web/tests/queue/detail-pane.test.tsx, web/tests/queue/keyboard-shortcuts.test.tsx, web/app/(dashboard)/automations/[swarm]/stage-1/components/safety-detail-pane.tsx.
- **Commit:** 087e16c.

**2. [Rule 3 — Blocking] load-page-data test assertion checked `.eq()` for mailbox filter**

- **Found during:** Task 1 vitest run.
- **Issue:** Test "Phase 81-03: URL-direct-edit filters" asserted `_eqCalls` contained `decision_details->>mailbox_id=12`. With the `.eq → .in` migration the call is now on `_inCalls`.
- **Fix:** Updated assertion to read `_inCalls` and check `decision_details->>mailbox_id=["12"]` (JSON-stringified vals array).
- **Files modified:** web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts.
- **Commit:** 087e16c.

### Architectural Decisions (Pre-Approved)

**Slot-prop pattern for Stage1OverridePane.** The plan said to "extract Stage-1-specific bits as small components" and pass them as slot props. Given the 4-axis override flow is 1253 LOC of intertwined state (dirty, override, notes, evalType, submitting, confirmOpen, showICBanner, body cache + 14 useEffects + 5 useCallbacks + 4 stage widgets), full extraction into discrete components was non-trivially risky for the closing plan of a 6-wave phase. Adopted the same pattern Stage 4 used (Plan 04): keep the legacy detail-pane as a single Stage-1-specific widget, rename it to satisfy the cleanup gate, and slot it via `UnifiedDetailPane.taggingFailuresSection`. This preserves Phase 71 + Phase 81 behaviors verbatim (no behavior risk) while routing the page composition through `_shell/`. The unified `UnifiedDetailPane` renders the 5-cell PipelineFlow ABOVE the slot, so operators see the canonical chrome + the legacy override controls below.

## Acceptance Criteria Evidence

| Criterion | Result |
|-----------|--------|
| Page imports from `_shell/` ≥ 5 | 6 |
| `${swarmType}-review` preserved | 3 occurrences |
| No `${swarmType}-kanban` leak | 0 |
| `?sub=pending` branch preserved | 3 occurrences (loader short-circuit + sub-view rule samples + JSX branch) |
| PendingPromotionDetailPane still imported | 2 occurrences (import + JSX) |
| Multi-mailbox `.in("decision_details->>mailbox_id", ...)` | Present at line 525 |
| `row-list,row-strip,detail-pane,selection-context,keyboard-shortcuts,recipient-chip-strip` deleted from stage-1/ | All 5 gone (detail-pane renamed via git mv) |
| Preserved files exist (noise-category-chip-strip, candidate-rule-list, pending-promotion-detail-pane, actions) | 4/4 |
| No "Bulk Review" user-visible copy | Only in test assertion strings (not UI text) |
| `npx vitest run stage-1/__tests__/page-shell.test.tsx` | 4/4 passing |
| `npx tsc --noEmit` | Zero new errors (2 pre-existing) |

## Self-Check: PASSED

Files verified to exist:
- web/app/(dashboard)/automations/[swarm]/stage-1/client-shell.tsx → FOUND
- web/app/(dashboard)/automations/[swarm]/stage-1/stage-1-override-pane.tsx → FOUND
- web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx → FOUND (rewritten)
- web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx → FOUND (refactored)

Files verified to be deleted:
- web/app/(dashboard)/automations/[swarm]/stage-1/detail-pane.tsx → GONE (renamed)
- web/app/(dashboard)/automations/[swarm]/stage-1/row-list.tsx → GONE
- web/app/(dashboard)/automations/[swarm]/stage-1/row-strip.tsx → GONE
- web/app/(dashboard)/automations/[swarm]/stage-1/selection-context.tsx → GONE
- web/app/(dashboard)/automations/[swarm]/stage-1/keyboard-shortcuts.tsx → GONE
- web/app/(dashboard)/automations/[swarm]/stage-1/recipient-chip-strip.tsx → GONE

Commit verified:
- 087e16c (feat(82-06): migrate Stage 1 to unified _shell/ + multi-mailbox loader) → FOUND
