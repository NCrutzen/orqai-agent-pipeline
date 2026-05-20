---
phase: 88
plan: "02"
subsystem: review-surface
tags: [stage-2, stage-3, override-widget, _shell, detail-pane, hard-separation]
dependency_graph:
  requires:
    - "_shell/detail-pane.tsx (Phase 82 Plan 01)"
    - "_shell/components/stage-1-widget.tsx (Phase 82.1 Plan 04 — canonical template)"
    - "stage-1/components/stage-2-widget.tsx (Phase 71-04 — async customer picker, wrapped here)"
    - "stage-1/components/stage-3-widget.tsx (Phase 71-04 — intent picker, wrapped here)"
    - "_shell/selection-context.tsx (Phase 82 Plan 01 — markPendingRemoval, setSelected)"
  provides:
    - "Stage 2 customer override flow in unified _shell/ (axis=stage_2_customer)"
    - "Stage 3 intent override flow in unified _shell/ (axis=stage_3_intent)"
    - "Per-stage cancel-override link working on S0/S1/S2/S3 (D-01c)"
    - "Footer 'Cancel override' button clearing all dirty stages in one shot"
  affects:
    - "web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx (Stage 2/3 mount paths)"
tech_stack:
  added: []
  patterns:
    - "Three near-copies of Stage 1 widget pattern (D-01a locked: NO shared StageOverrideWidget primitive)"
    - "Fused note+override form (D-01b): inline Textarea revealed when dirty"
    - "Window-event bus (bulk-review:override-submit / -discard) for footer + keyboard parity"
    - "Hard-separation enforced at file-source level via grep gates in tests"
key_files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/_shell/components/stage-2-widget.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/components/stage-3-widget.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/stage-2-widget.test.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/stage-3-widget.test.tsx"
  modified:
    - "web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/detail-pane.test.tsx"
decisions:
  - "Internal state ownership (dirty/notes/evalType) in S2/S3 widgets — matches Stage 1's pattern verbatim, contrary to the plan's externalised state shape (planner spec misread Stage 1; existing pattern works perfectly with host's boolean dirty map)."
  - "SwarmIntentRow has no display_label — use intent_key as canonical label (real type shape, not the plan's assumed shape)."
metrics:
  duration: "~25m"
  completed: "2026-05-20"
  tasks: 3
  files_touched: 6
---

# Phase 88 Plan 02: Stage 2 + Stage 3 override widgets in unified _shell/ Summary

## One-liner

Wired up the missing Stage 2 customer and Stage 3 intent override widgets in `_shell/detail-pane.tsx` as fused note+override forms, closing the D-01a/b/c gap that left Phase 82.6 placeholders despite a "wired in Plan 06" comment.

## What changed

### Created

- `_shell/components/stage-2-widget.tsx` (Stage2OverrideWidget) — wraps the existing `stage-1/components/stage-2-widget.tsx` (Stage2Widget — async customer search) with: fused note Textarea, EvalTypeRadio, POST /api/automations/debtor-email/override with `axis: "stage_2_customer"` + `decision_details: { customer_account_id, customer_name, re_run_downstream }`, recordVerdict success path, optimistic removal via useSelection(), window-event listeners for `bulk-review:override-submit` / `-discard`.
- `_shell/components/stage-3-widget.tsx` (Stage3OverrideWidget) — wraps the existing intent picker with the same shape; axis `stage_3_intent`; `decision_details: { intent_key }`.
- `_shell/__tests__/stage-2-widget.test.tsx` — 6 RTL behaviour cases (render / dirty reveal / POST shape / discard / notesRequired block / hard-sep grep gate).
- `_shell/__tests__/stage-3-widget.test.tsx` — same 6 cases; hard-sep grep gate checks absence of the Stage 1 noise-registry row type only.

### Modified

- `_shell/detail-pane.tsx` — swapped the Stage 2 placeholder div (`"Stage 2 customer override — wired in Plan 06."`) for `<Stage2OverrideWidget>`, and the Stage 3 stub `onChange: () => { /* Plan 06 */ }` for the full `<Stage3OverrideWidget>` mount. Both gated on `predictedRow` being non-null (mirrors Stage 1 widget pattern).
- `_shell/__tests__/detail-pane.test.tsx` — added 6 new assertions (T10-T15) for the wire-up; fixed pre-existing test bug (no SelectionProvider wrapper, useRouter missing — Rule 3 blocking issue); updated mock paths (Stage 1 widget now lives in `_shell/components/`, not legacy path); extended PipelineFlow mock to expose `onMarkDirty` / `onCancelDirty` trigger buttons.

## Behaviour cases verified (per widget, 6 each)

Stage 2 / Stage 3 widget tests (it1..it6):

1. Renders wrapped picker; no notes textarea until operator picks.
2. Picking a value reveals the inline note textarea (D-01b fused form).
3. `window.dispatchEvent(new Event("bulk-review:override-submit"))` triggers a POST to `/api/automations/debtor-email/override` with the correct axis literal and `decision_details` shape.
4. `bulk-review:override-discard` clears the dirty state (textarea hides, picker resets).
5. `evalType="regression"` with empty notes blocks submit (toast error fires, no POST).
6. Hard-separation grep gate: file source contains neither `SwarmNoiseCategoryRow` (S2 + S3) nor `SwarmIntentRow` (S2 only).

detail-pane tests (T10-T15):

- T10: Stage 2 row renders `Stage2OverrideWidget`, placeholder copy gone.
- T11: Stage 3 row renders `Stage3OverrideWidget`.
- T12: Stage 3 widget receives `intents` prop equal to whatever was passed to `UnifiedDetailPane.intents`.
- T13: `onCancelDirty(2)` clears Stage 2 dirty state (widget unmounts).
- T14: `onCancelDirty(3)` clears Stage 3 dirty state.
- T15: Footer "Cancel override" button (resetAllStageFeedback) clears S0+S1+S2+S3 dirty in one shot.

## Verification

- `cd web && npx vitest run 'app/(dashboard)/automations/[swarm]/_shell/__tests__/stage-2-widget.test.tsx' --no-coverage` → **6/6 green**
- `cd web && npx vitest run 'app/(dashboard)/automations/[swarm]/_shell/__tests__/stage-3-widget.test.tsx' --no-coverage` → **6/6 green**
- `cd web && npx vitest run 'app/(dashboard)/automations/[swarm]/_shell/__tests__/detail-pane.test.tsx' --no-coverage` → **10/10 green** (was 1 passed / 3 failed / 1 skipped pre-Plan 02 — Rule 3 fix landed both pre-existing and new tests)
- `cd web && npx vitest run 'app/(dashboard)/automations/[swarm]/_shell/__tests__' --no-coverage` → **62/62 green** across all 10 _shell test files
- `npx tsc --noEmit` — zero errors in any of the 6 touched files

### Grep gates (all required ZERO hits — all pass)

```
grep "SwarmNoiseCategoryRow|SwarmIntentRow" _shell/components/stage-2-widget.tsx   → 0
grep "SwarmNoiseCategoryRow"                _shell/components/stage-3-widget.tsx   → 0
grep "Stage 2 customer override — wired in Plan 06" _shell/detail-pane.tsx          → 0
grep "/\* Plan 06 \*/"                      _shell/detail-pane.tsx                  → 0
grep -E "categories.*Stage3OverrideWidget|intents.*Stage2OverrideWidget" _shell/detail-pane.tsx → 0
```

### Required positive grep counts (all pass)

```
grep "axis: \"stage_2_customer\""   stage-2-widget.tsx       → ≥1
grep "bulk-review:override-submit"  stage-2-widget.tsx       → ≥1
grep "axis: \"stage_3_intent\""     stage-3-widget.tsx       → ≥1
grep "intents: SwarmIntentRow\[\]"  stage-3-widget.tsx       → ≥1
grep "Stage2OverrideWidget"         _shell/detail-pane.tsx   → 2 (import + mount)
grep "Stage3OverrideWidget"         _shell/detail-pane.tsx   → 2 (import + mount)
```

## Success criteria

- **D-01a** Locked: Three near-copies of Stage 1 pattern. No shared `StageOverrideWidget` primitive added.
- **D-01b** Locked: Note textarea fused inline in both new widgets — revealed on operator-picks-value alongside the picker. Submit writes both atomically.
- **D-01c** Locked: Per-stage cancel-override (`onCancelDirty(2)` / `onCancelDirty(3)`) and footer "Cancel override" button (`resetAllStageFeedback`) now operate correctly on S0/S2/S3 — there are widgets to clear.
- **Hard-separation** Locked at file-source level + grep-verified in three places (stage-2-widget, stage-3-widget, detail-pane cross-prop check).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan-specified component signature did not match the existing Stage 1 widget**

- **Found during:** Task 1 (Stage 2 widget creation)
- **Issue:** Plan §Task 1 action step 10 asked for `export function Stage2OverrideWidget({ row, swarmId, onChange, evalType, setEvalType, notes, setNotes, dirty, setDirty }: Props)` claiming this "matches Stage 1's externalised dirty/notes/evalType state ownership (the host detail-pane owns these via the hooks at lines 333-354)". This is incorrect — the canonical Stage 1 widget (`_shell/components/stage-1-widget.tsx`) owns its own `dirty`/`notes`/`evalType` state INTERNALLY (lines 90-94). The host's per-stage dirty map at lines 262-269 is a boolean (`Record<number, boolean>`) that just controls whether the widget mounts, not the picked-value dirty payload.
- **Fix:** Mirrored Stage 1's actual pattern: internal state ownership. Host wiring (`onMarkDirty` / `onCancelDirty` / `onSubmitDirty` / `resetAllStageFeedback`) works perfectly with this shape — the boolean dirty map gates mounting, the widget's internal dirty owns the picked customer/intent.
- **Files modified:** `_shell/components/stage-2-widget.tsx`, `_shell/components/stage-3-widget.tsx`
- **Commits:** `c18308ac`, `e70cd901`

**2. [Rule 1 - Bug] SwarmIntentRow has no display_label column**

- **Found during:** Task 3 tsc verification
- **Issue:** Plan §Task 2 action step 8 implicitly assumed `SwarmIntentRow` has a `display_label` field (mirroring SwarmNoiseCategoryRow). The actual type at `web/lib/swarms/types.ts:1-15` has only `swarm_type, intent_key, handler_agent_key, handler_event, handler_status, requires_orchestration, created_at, updated_at`. The wrapped `Stage3Widget` already treats `intent_key` as the canonical label (no display_label lookup).
- **Fix:** Replaced `intentLabelByKey` lookup with passthrough (`intent_key → intent_key`) for forward-compat with any future label column. Updated test fixtures across both widget tests and detail-pane test to match the real type shape.
- **Files modified:** `_shell/components/stage-3-widget.tsx`, both test files for the widgets.
- **Commit:** `42804b00`

**3. [Rule 3 - Blocking] Pre-existing detail-pane.test.tsx tests were broken (no SelectionProvider wrapper)**

- **Found during:** Task 3 baseline test run
- **Issue:** Pre-Plan 02 state was 1 passed / 3 failed / 1 skipped. T7/T8/T9 failed with `useSelection must be used inside <SelectionProvider>` because the tests render `<UnifiedDetailPane>` bare. The Phase 82.7 Plan 04 selection-context refactor added `useSelection()` calls inside `DetailPaneInner` that the test never accommodated.
- **Fix:** Wrapped every render in this test file with a `<Harness>` that mounts `SelectionProvider`. Pre-existing T7/T8/T9 + new T10-T15 all now green.
- **Files modified:** `_shell/__tests__/detail-pane.test.tsx`
- **Commit:** `7c3f104e`

### Auth gates

None — no external service calls in this plan.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `c18308ac` | feat | Add Stage 2 override widget for unified _shell/ (widget + 6 tests) |
| `e70cd901` | feat | Add Stage 3 override widget for unified _shell/ (widget + 6 tests) |
| `7c3f104e` | feat | Wire Stage 2 + Stage 3 widgets into _shell/detail-pane.tsx + extend test |
| `42804b00` | fix | Align test fixtures + widget with real SwarmIntentRow type |

## Self-Check: PASSED

Verified all files exist and all commits are present in this worktree's history.

```
FOUND: web/app/(dashboard)/automations/[swarm]/_shell/components/stage-2-widget.tsx
FOUND: web/app/(dashboard)/automations/[swarm]/_shell/components/stage-3-widget.tsx
FOUND: web/app/(dashboard)/automations/[swarm]/_shell/__tests__/stage-2-widget.test.tsx
FOUND: web/app/(dashboard)/automations/[swarm]/_shell/__tests__/stage-3-widget.test.tsx
FOUND: web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx (modified)
FOUND: web/app/(dashboard)/automations/[swarm]/_shell/__tests__/detail-pane.test.tsx (modified)
FOUND: c18308ac feat(88-02): add Stage 2 override widget for unified _shell/
FOUND: e70cd901 feat(88-02): add Stage 3 override widget for unified _shell/
FOUND: 7c3f104e feat(88-02): wire Stage 2 + Stage 3 override widgets into unified detail-pane
FOUND: 42804b00 fix(88-02): align test fixtures + widget with real SwarmIntentRow type
```
