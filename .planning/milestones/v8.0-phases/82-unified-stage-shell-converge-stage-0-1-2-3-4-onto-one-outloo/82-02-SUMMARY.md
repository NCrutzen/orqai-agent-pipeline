---
phase: 82-unified-stage-shell
plan: 02
subsystem: web/automations/stage-shell
tags: [stage-0, unified-shell, ui, rtl]
type: execute
wave: 2
depends_on: [82-01]
requires:
  - "_shell/ presentation primitives (Phase 82-01)"
  - "loadSwarm + createAdminClient"
provides:
  - "/automations/{swarm}/stage-0 rendered via unified _shell/ skeleton"
  - "RSC-page RTL test for Stage 0 empty-state shell"
affects:
  - "web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx"
tech-stack:
  added: []
  patterns:
    - "RSC-page RTL pattern (await async component, mock loaders at module boundary)"
    - "TDD RED → GREEN per Plan task (two atomic commits)"
key-files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/stage-0/__tests__/page.test.tsx"
  modified:
    - "web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx"
decisions:
  - "Stage 0 page passes categories=[] AND intents=[] to UnifiedDetailPane — hard-separation lock honored (Stage 0 is upstream of the noise/intent split)"
  - "Single disabled 'All' chip with count=0 used as Stage 0's chip strip until backend wiring lands (D-14/D-15)"
  - "No AutomationRealtimeProvider mounted — Stage 0 has no realtime channel today (RESEARCH §Realtime); Phase 82 explicitly does NOT unify channels"
  - "STAGE_0_INFO_BANNER copy locked to current placeholder wording with one minor tweak: 'Bulk Review queue' → 'queue' (D-18 forward-carry from Phase 81 — purge Bulk Review noun)"
metrics:
  duration: 4m
  completed_date: "2026-05-11"
  tasks: 1
  files: 2
requirements: []
decisions_addressed: [D-02, D-14, D-15, D-16, D-19]
---

# Phase 82 Plan 02: Stage 0 — Unified Shell Migration Summary

Migrated `/automations/{swarm}/stage-0` from the Phase 76 placeholder
paragraph onto the unified `_shell/` library: PageHeader + StageTabStrip +
info banner + single 'All' chip + MailboxFilter + RowList (empty-state) +
UnifiedDetailPane (empty) — the same shell shape Stages 1/3/4 use, even
with zero row data.

## Verification

| Check | Status | Evidence |
|-------|--------|----------|
| V1 (Stage 0 renders unified shell) | PASS | RTL test `stage-0/__tests__/page.test.tsx` — 5/5 |
| D-15 empty-state copy | PASS | `screen.getByText(/No rows yet/i)` + `/Stage 0 awaits backend wiring/i` |
| D-16 banner above row list | PASS | banner div precedes RowList in JSX, RTL asserts both `Stage 0 (Safety)` and `prompt-injection filter` strings present |
| MailboxFilter mounted | PASS | `screen.getByRole("button", { name: /Filter by mailbox/i })` + "All mailboxes" trigger |
| No AutomationRealtimeProvider | PASS | RTL asserts absence of `[data-testid='automation-realtime']` |
| Spoofing gate | PASS | unknown swarm throws `NEXT_NOT_FOUND` |
| No "Bulk Review" copy | PASS | `grep -ic "bulk review" stage-0/page.tsx` = 0 (D-18 forward-carry) |
| `_shell/` imports | PASS | 8 imports from `../_shell/` (acceptance ≥ 5) |
| tsc clean (this plan's files) | PASS | All 5 test-file errors that existed before my edit are resolved; pre-existing `stage-1/__tests__/actions.predictor.test.ts` error unchanged (out of scope) |
| Stage 2 regression | PASS | `stage-2/__tests__/page.test.tsx` — 3/3 |

## Commits

| Phase | Hash | Message |
|-------|------|---------|
| RED | `a5e7719` | `test(82-02): add failing RTL test for Stage 0 unified-shell page` |
| GREEN | `d8a65c4` | `feat(82-02): migrate Stage 0 page to unified _shell/ library` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Banner copy "Bulk Review queue" → "queue"**
- **Found during:** Task 1 (Action step)
- **Issue:** Plan said preserve banner copy verbatim, but the legacy copy
  contained "Bulk Review queue (stage 1)" — Phase 81 D-18 explicitly purges
  "Bulk Review" from user-visible copy.
- **Fix:** Replaced with "the existing queue (stage 1)". Banner still says
  "Stage 0 (Safety) — prompt-injection filter..." which is what D-16 actually
  requires (the safety-stage explanation, not the verbatim Phase 76 wording).
- **Files modified:** `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx`
- **Commit:** `d8a65c4`

### Out-of-scope items observed (logged, not fixed)

- `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/actions.predictor.test.ts:60` — pre-existing `TS2556` error (spread argument). Unrelated to Stage 0 migration. Confirmed pre-existing via stash check.
- Working-tree drift on `stage-1/actions.ts`, `categories.ts`, `detail-pane.tsx`, `race-cohort-banner.tsx`, `row-list.tsx`, `tests/queue/actions.test.ts`, `supabase/.temp/cli-latest`, `web/scripts/replay-stage1-unknown-failures.ts`, plus untracked `.planning/debug/`, `exec-briefings/2026-05-08-week-19-recap/`, `web/scripts/replay-invoice-33050836.ts` — all pre-existing on `main` per gitStatus snapshot at session start. NOT touched.

## Architectural Notes

**Hard-separation contract:** Stage 0 is upstream of the noise/intent split.
This page passes `categories=[]` AND `intents=[]` to UnifiedDetailPane —
Stage 0 touches NEITHER `swarm_noise_categories` NOR `swarm_intents`. The
hard-separation lock holds at the prop boundary as designed in Plan 01.

**Realtime:** Stage 0 has no realtime channel today (RESEARCH §Realtime
Channels Per Stage). No `AutomationRealtimeProvider` mounted. Phase 82
explicitly does NOT unify channels.

**Empty-data shell:** Zero rows → unified-shell skeleton still renders.
UX consistency wins over hiding the surface (D-15).

## Known Stubs

| File | Line | Reason |
|------|------|--------|
| `stage-0/page.tsx` | `const rows: Row[] = []` | Stage 0 backend data wiring deferred to a future phase. Plan 02 scope is shell migration only; backend ingest of `pipeline_events` rows with `stage=0` / `decision='injection_suspected'` is explicitly out of scope per `<objective>`. |
| `stage-0/page.tsx` | Single 'All' chip with count=0 | Full chip taxonomy lands when Stage 0 backend wiring exposes per-decision counts. |

These stubs are **intentional and documented** in the plan's objective:
"empty data, info banner preserved". V1 verification check is about shell
shape parity, not backend data.

## Self-Check: PASSED

- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` — FOUND
- `web/app/(dashboard)/automations/[swarm]/stage-0/__tests__/page.test.tsx` — FOUND
- Commit `a5e7719` (RED) — FOUND in `git log --oneline`
- Commit `d8a65c4` (GREEN) — FOUND in `git log --oneline`
- Test run: 5/5 pass
- Stage 2 regression: 3/3 pass
