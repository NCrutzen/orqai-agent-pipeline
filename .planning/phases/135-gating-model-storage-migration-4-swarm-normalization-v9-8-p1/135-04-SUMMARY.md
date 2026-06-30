---
phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1
plan: 04
subsystem: pipeline-gating
tags: [gating, shadow, deriveMailboxMode, intent-label-worker, inngest, graph-patch, tdd-green, model-05]

# Dependency graph
requires:
  - phase: 135-01
    provides: RED Shadow-suppression assertion in the intent-label worker test (D-03)
  - phase: 135-02
    provides: deriveMailboxMode() + gating_config tri-state + worker reads gating_config
provides:
  - D-03 Shadow runtime suppression at the single Graph-PATCH site of stage-3-intent-label-worker
  - shadow_suppressed decision (held operator-visible AI: label, internal persistence intact)
  - MODEL-05 realized end-to-end (fail-closed {} swarm → Shadow → label held by default)
affects: [135-05, 136, 137, 138]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strict-subset gate ordering: Shadow (label-held subset) must precede the stage-3 gate or it is masked"
    - "Suppress-only-the-surface: hold the Graph PATCH while still emitting the internal audit pipeline_event (Pitfall 4)"

key-files:
  created: []
  modified:
    - web/lib/inngest/functions/stage-3-intent-label-worker.ts
    - web/lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts

key-decisions:
  - "Shadow gate placed BEFORE the stage_3_intent_label gate (plan said after) — Shadow is a strict subset of the held stage flag, so 'after' would mask it"
  - "Shadow branch emits an internal intent_label_shadow_suppressed pipeline_event (Pitfall 4: internal persistence not suppressed)"
  - "Repaired stale dry_run_config fixtures left RED by 135-02's gating_config cutover"

requirements-completed: [MODEL-05]

# Metrics
duration: 6min
completed: 2026-06-30
---

# Phase 135 Plan 04: D-03 Shadow Runtime Suppression Summary

**Wired the D-03 Shadow gate into `stage-3-intent-label-worker.ts`: a swarm whose derived mailbox mode is `Shadow` now returns `shadow_suppressed` and makes NO operator-visible Graph `AI:`-category PATCH, while still emitting the internal audit pipeline_event — making MODEL-05 ("a newly-added mailbox is safe-by-default end-to-end") real at runtime, not store-only. Turned 135-01's Shadow RED assertion GREEN.**

## Performance
- **Duration:** ~6 min
- **Completed:** 2026-06-30
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Imported `deriveMailboxMode` alongside `isStageBlocked`; added `"shadow_suppressed"` to the `LabelDecision` union.
- Added a `step.run("derive-mode")` Shadow gate that loads the swarm row and derives the mode (replay-safe — read inside `step.run`, CLAUDE.md Inngest rule). When `mode === "Shadow"`, the worker emits an internal `intent_label_shadow_suppressed` pipeline_event (best-effort, try/catch) and early-returns `shadow_suppressed` — BEFORE `resolve-message` / `write-category`, so the Graph PATCH is held (Pitfall 4: only the operator-visible surface is suppressed).
- Existing stage gate (`isStageBlocked` → `gated`) kept intact: Dry/Live swarms are unaffected (the gate still governs); a Dry mailbox with intent_label live still writes the label.

## Task Commits
1. **Task 1: wire D-03 Shadow suppression + repair fixtures** — `7fb36573` (feat)

## Verification
- `cd web && npx vitest run lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts` → **11/11 passed** (135-01's Shadow assertion GREEN: `shadow_suppressed`, 0 Graph PATCH, `emitPipelineEvent` still fires).
- `cd web && npx vitest run lib/pipeline-gating` → 4 files, **24 passed** (no regression in derive-mode / tri-state / forward-bucket / intent-label-gate).
- `cd web && npx tsc --noEmit` → exit 0 (LabelDecision union extended cleanly).
- grep: worker `contains shadow_suppressed` + `contains deriveMailboxMode`; `deriveMailboxMode` read inside the `derive-mode` `step.run`; Shadow early-return (~L113) precedes `resolve-message` (L130) and `write-category` (L189).

## Decisions Made
- **Shadow gate placed BEFORE the stage gate, not after (plan deviation — Rule 1).** `deriveMailboxMode` returns `Shadow` only when nothing is live AND the AI:-label write is held (`stage_3_intent_label !== false`). That makes `Shadow` a STRICT SUBSET of the existing `isStageBlocked(stage_3_intent_label)` gate. The plan instructed inserting the Shadow branch immediately AFTER the `gated` return — but in every Shadow case `gated` is also true, so the generic `gated` return would fire first and (a) never produce `shadow_suppressed` and (b) never emit the internal suppression audit. The Shadow test (135-01) is the locked TDD contract and requires both, so the gate must precede the stage gate. Verified: Dry swarms (label live → not gated → PATCH) and Live-with-label-held swarms (mode Live → skip Shadow → `gated`) are unchanged.
- **Shadow branch emits an internal pipeline_event.** 135-01's RED asserts `emitPipelineEvent` is still called under Shadow (Pitfall 4 — only the Graph PATCH is held, internal Bulk Review persistence stays visible). The branch emits `decision: "intent_label_shadow_suppressed"` best-effort before returning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan inaccuracy] Shadow gate placed before (not after) the stage gate**
- **Found during:** Task 1
- **Issue:** The plan's action specified inserting the Shadow early-return immediately AFTER the `if (gated) return { decision: "gated" }` block. Because `deriveMailboxMode → Shadow` implies `stage_3_intent_label` is held, the `gated` return always fires first in Shadow, so `shadow_suppressed` (and its internal audit emit) would be unreachable.
- **Fix:** Placed the `derive-mode` step + Shadow early-return BEFORE the stage gate (still before any Graph-touching step). The acceptance criterion that mattered ("Shadow return positioned before `resolve-message`/`write-category`") holds; only the position relative to the `gated` return changed.
- **Files modified:** web/lib/inngest/functions/stage-3-intent-label-worker.ts
- **Commit:** 7fb36573

**2. [Rule 3 - Blocking test drift] Stale `dry_run_config` fixtures left RED by 135-02**
- **Found during:** Task 1 (running the worker test showed 8 failures, not the 1 RED the plan assumed)
- **Issue:** 135-02 flipped the worker to read `gating_config` but did NOT update this test file's Phase-117 fixtures (still `dry_run_config`). After the cutover those fixtures fail-closed to `gated`, so 7 non-Shadow tests + the Shadow test were RED. The plan's GREEN acceptance ("vitest … exits 0") could not be met without repairing them.
- **Fix:** Converted all fixtures to `gating_config`. The 7 Dry-mode tests (`stage_3_intent_label: false`) convert verbatim. The two held-stage `GATED` tests were given a live handler (`stage_4_handlers: { ...: "live" }`) so they derive `Live` and correctly return `gated` (Shadow is a stricter subset checked first). The "MISSING config" test now genuinely derives `Shadow` (MODEL-05 fail-closed safe-by-default) and asserts `shadow_suppressed` — the fail-closed no-PATCH property is preserved; only the decision label refines from `gated` to `shadow_suppressed`.
- **Files modified:** web/lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts
- **Commit:** 7fb36573

## Known Stubs
None — single-file runtime gate on existing deps; no placeholder data flows to UI.

## Threat Flags
None — no new network endpoint, auth path, or trust-boundary surface. The plan's three `mitigate` threats (T-135-04-01 internal-audit-not-suppressed, T-135-04-02 replay-safe derive inside step.run, T-135-04-03 fail-closed `{}`→Shadow) are all pinned green by the worker suite.

## Issues Encountered
- `gsd-sdk query state.add-decision` requires `--summary` (not a positional arg) — re-ran with the flag (same as 135-02's note).

## Next Phase Readiness
- 135-05 (apply): the SQL migration apply + `phase135-trigger-smoke.ts` / `phase135-seed-readback.ts`; reconcile `EXPECTED_SEED` with the operator (sales OQ-2 [ASSUMED] values). No mailbox is in Shadow at cutover (all existing are Dry/Live), so this gate is inert for today's traffic — it governs the next newly-added mailbox.

## Self-Check: PASSED
- `web/lib/inngest/functions/stage-3-intent-label-worker.ts` present, contains `shadow_suppressed` + `deriveMailboxMode`.
- `web/lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts` present, 11/11 green.
- Commit `7fb36573` found in git log.

---
*Phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1*
*Completed: 2026-06-30*
