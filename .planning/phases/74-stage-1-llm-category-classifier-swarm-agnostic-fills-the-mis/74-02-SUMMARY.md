---
phase: 74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis
plan: 02
subsystem: stage-0-stage-1-seam
status: complete
tags: [inngest, events, stage-0, swarm-agnostic, debtor-email]
requires:
  - events.ts schema (existing)
  - automation_runs.swarm_type column (existing, populated by stage-0-safety-worker)
provides:
  - swarm_type+entity threaded from debtor-email/ingest route → stage-0/email.received → stage-0-safety-worker → classifier/screen.requested
  - stage-0-safety-worker is now swarm-agnostic (zero "debtor-email" string literals)
  - Plan 04 can read event.data.swarm_type directly from classifier/screen.requested
affects:
  - web/lib/inngest/events.ts
  - web/lib/inngest/functions/stage-0-safety-worker.ts
  - web/app/api/automations/debtor-email/ingest/route.ts
  - web/app/(dashboard)/automations/[swarm]/review/actions.ts (Rule 3 auto-fix — fourth emit-site discovered)
  - web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts (fixtures extended)
tech-stack:
  added: []
  patterns:
    - "Source-of-truth-at-boundary literal: swarm_type='debtor-email' is hardcoded ONLY at the ingest route (where the route path encodes the swarm); shared workers read it from event.data."
    - "Per-call derived const replaces module-level constant — staleChannel = `${swarm_type}-review`."
    - "Required event field with throw-on-missing fail-fast (no silent fallback) so the schema contract is enforced at runtime."
key-files:
  created: []
  modified:
    - web/lib/inngest/events.ts
    - web/lib/inngest/functions/stage-0-safety-worker.ts
    - web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts
    - web/app/api/automations/debtor-email/ingest/route.ts
    - web/app/(dashboard)/automations/[swarm]/review/actions.ts
decisions:
  - "Worker throws on missing event.data.swarm_type instead of silently defaulting to 'debtor-email' — events.ts schema makes the field required, so a missing value indicates a contract bug not a legacy compatibility case."
  - "loadSafetyRow extended to select swarm_type column so the Pitfall 5 operator-override re-emit can thread the original swarm without hardcoding."
  - "The 'debtor-email' literal at the safety-review action falls back only when the source automation_runs row is from before the swarm_type column was populated (legacy rows)."
metrics:
  duration: ~10min
  tasks: 3
  files_modified: 5
  commits: 3
---

# Phase 74 Plan 02: Stage 0 → Stage 1 swarm_type threading — Summary

Threaded `swarm_type` (required) and `entity` (optional/nullable) through the Stage 0 → Stage 1 seam so the new Stage-1 classifier-screen-worker (Plan 04) can read `event.data.swarm_type` directly without a DB lookup. Removed all `"debtor-email"` string literals from `stage-0-safety-worker.ts` (zero matches post-edit).

## Literals Removed and Replaced

| Original location (file:line, pre-edit) | Original literal | Replacement |
|---|---|---|
| stage-0-safety-worker.ts:36 | `const STALE_CHANNEL = "debtor-email-review";` | Deleted; replaced with per-call `const staleChannel = \`${swarm_type}-review\`;` |
| stage-0-safety-worker.ts:120 | `emitAutomationRunStale(admin, STALE_CHANNEL)` | `emitAutomationRunStale(admin, staleChannel)` |
| stage-0-safety-worker.ts:128 | `automation: "debtor-email-review"` | `automation: staleChannel` |
| stage-0-safety-worker.ts:130 | `swarm_type: "debtor-email"` | `swarm_type` (destructured from `event.data`) |
| stage-0-safety-worker.ts:156 | `swarm_type: "debtor-email"` (inside `emitPipelineEvent`) | `swarm_type` (destructured from `event.data`) |
| stage-0-safety-worker.ts:190 | `emitAutomationRunStale(admin, STALE_CHANNEL)` | `emitAutomationRunStale(admin, staleChannel)` |

## Emit-sites updated (`classifier/screen.requested`)

- stage-0-safety-worker.ts:75 (safety_overridden short-circuit) — added `swarm_type, entity` to data.
- stage-0-safety-worker.ts:177 (safe-verdict forward) — added `swarm_type, entity` to data.

## SendFn type alias

Not added. The existing worker calls `inngest.send(...)` inline (no destructure), satisfying CLAUDE.md's never-destructure rule. No need for a `SendFn` cast.

## Test fixture changes

`web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` — five fixtures extended with `swarm_type: "debtor-email"`:
1. `e-safe` (SAFE-02/SAFE-03 happy path)
2. `e-inj` (injection_suspected path)
3. `e-replay` (TELE-01 dual-write idempotency)
4. `e-breach` (BUDG-01 budget breach)
5. `e-override` (Pitfall 5 safety_overridden skip)

No assertions modified. Vitest: **5/5 green**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Fourth emit-site of `stage-0/email.received` discovered in safety-review actions**

- **Found during:** Task 3 (post-edit tsc run)
- **Issue:** Plan listed two emit-sites of `classifier/screen.requested` and one emit-site of `stage-0/email.received`. A repo-wide `tsc --noEmit` revealed a third emit-site of `stage-0/email.received` at `web/app/(dashboard)/automations/[swarm]/review/actions.ts:357` — the Pitfall 5 operator-driven re-emit path (`markSafeAndReprocess`). Required field `swarm_type` made it a tsc error.
- **Fix:** Extended `loadSafetyRow` to include `swarm_type` (and `entity`) in its select; threaded both into the re-emit. Falls back to `"debtor-email"` only for legacy rows where the column may be null.
- **Files modified:** `web/app/(dashboard)/automations/[swarm]/review/actions.ts`
- **Commit:** d94bbc4

### Deferred Issues (out of scope per SCOPE BOUNDARY)

Two pre-existing tsc errors observed (verified pre-existing via `git stash`; not introduced by Plan 74-02):
- `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts(440,48)` — `Argument of type 'null' is not assignable to parameter of type 'string'`.
- `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts(265,44)` — same shape.

Logged to `.planning/phases/74-.../deferred-items.md`.

## Verification

- `grep -c '"debtor-email"' web/lib/inngest/functions/stage-0-safety-worker.ts` → **0**
- `grep -c "STALE_CHANNEL" web/lib/inngest/functions/stage-0-safety-worker.ts` → **0**
- `grep -A 25 'name: "stage-0/email.received"' web/app/api/automations/debtor-email/ingest/route.ts | grep -c 'swarm_type: "debtor-email"'` → **1**
- `cd web && npx vitest run lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` → **5/5 passed**
- `cd web && npx tsc --noEmit` → only the two pre-existing test errors remain (zero new failures introduced by Plan 74-02).

## Self-Check: PASSED

- web/lib/inngest/events.ts: FOUND (lines updated for both event payloads)
- web/lib/inngest/functions/stage-0-safety-worker.ts: FOUND (zero "debtor-email" literals)
- web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts: FOUND (5 fixtures updated, 5/5 tests green)
- web/app/api/automations/debtor-email/ingest/route.ts: FOUND (swarm_type='debtor-email' added)
- web/app/(dashboard)/automations/[swarm]/review/actions.ts: FOUND (loadSafetyRow extended, re-emit threads swarm_type)
- Commits: 1162fc9 (Task 1), 1d6c277 (Task 2), d94bbc4 (Task 3) — all FOUND in `git log`.
