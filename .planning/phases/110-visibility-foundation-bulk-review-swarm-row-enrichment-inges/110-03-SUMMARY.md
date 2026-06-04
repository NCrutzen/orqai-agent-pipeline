---
phase: 110-visibility-foundation-bulk-review-swarm-row-enrichment-inges
plan: 03
subsystem: inngest-stage-3-coordinator
tags: [swarm-02, stage-3, coordinator, cross-swarm, wildcard-trigger]
requires:
  - "110-01 (swarm_type-parity tests + branch guard)"
provides:
  - "swarm-generic Stage-3 coordinator (derives swarm_type from payload, wildcard trigger)"
  - "113 sales-intent-agent dispatch seam through the shared coordinator (zero further edits)"
affects:
  - "web/lib/inngest/functions/debtor-email-coordinator.ts"
tech-stack:
  added: []
  patterns:
    - "wildcard Inngest trigger via cast-through-unknown (mirrors stage-3-dispatcher */predicted)"
    - "swarm_type derived from event.data with event-name-prefix fallback"
    - "fail-closed registry lookup: TENANT_DOMAINS_BY_SWARM[swarm_type] ?? []"
key-files:
  created: []
  modified:
    - "web/lib/inngest/functions/debtor-email-coordinator.ts"
decisions:
  - "events.ts needs NO */coordinator.requested entry — the wildcard cast-through-unknown handles it, identical to the dispatcher's */predicted (no literal wildcard key exists in events.ts)"
  - "event.data cast once to the declared debtor-email/coordinator.requested data shape (+ optional swarm_type) because the wildcard trigger widens event.data to the full Events union, breaking field narrowing"
  - "Task 2 produced no code change — the refactor disturbed no adjacent shared worker; verification-only"
metrics:
  duration: ~18m
  tasks: 2
  files: 1
  completed: 2026-06-03
---

# Phase 110 Plan 03: Swarm-Generic Stage-3 Coordinator Summary

Generalized the Stage-3 coordinator from a hardcoded `const SWARM_TYPE = "debtor-email"` to deriving `swarm_type` from the event payload (event-name-prefix fallback) and switched its trigger to the wildcard `*/coordinator.requested`, mirroring the already-generic `stage-3-dispatcher`. Debtor Stage-3 behavior is provably unchanged (Plan 01 parity tests green); 113's sales-intent-agent can now dispatch through the coordinator with zero further edits. This was the highest-risk change in Phase 110 (D-09) — it crosses the live debtor Stage-3 path.

## What Was Built

### Task 1 — Derive swarm_type from payload + wildcard trigger (commit 362d1bfb)

`web/lib/inngest/functions/debtor-email-coordinator.ts`:

- **Retired** the module-level swarm-type constant and the const-keyed `TENANT_DOMAINS`.
- **Derive** `swarm_type` inside the handler: `const swarm_type = email.swarm_type ?? eventName.split("/")[0];` — deterministic (pure function of the event), so safe outside `step.run` per the dispatcher's proven pattern.
- **Trigger** switched `{ event: "debtor-email/coordinator.requested" }` → `{ event: "*/coordinator.requested" } as unknown as { event: keyof Events }`. The debtor producer's existing `debtor-email/coordinator.requested` event still matches the wildcard — **no producer change needed**.
- **TENANT_DOMAINS** now keyed off the derived `swarm_type` with a fail-closed empty default: `[...(TENANT_DOMAINS_BY_SWARM[swarm_type] ?? [])]` (T-110-07 — unknown swarm_type yields empty domains, never throws).
- **Replaced every SWARM_TYPE reference**: `coordinator_runs.swarm_type`, `emitPipelineEvent({ swarm_type })`, and the emitted `` `${swarm_type}/predicted` `` event name.
- **Entity coercion preserved**: `email.entity ?? "smeba"` debtor default kept (sales ingest writes `entity: null` — covered by the declared `string | null` shape; the debtor default is NOT dropped).
- **Preserved**: the `resolve-run-id` `step.run` (replay-safety, Phase 65 / T-110-08) and the DynamicSend cast-through-unknown for `inngest.send` (never aliased).
- **events.ts**: no change required — verified no `*/`-literal key exists in events.ts; the dispatcher's `*/predicted` uses the same cast-through-unknown with no events.ts entry, so the coordinator mirrors it.

A secondary type adjustment was required by the wildcard cast (see Deviations): `event.data` is widened to the full `Events` union under the wildcard trigger, so it was cast once to the declared `debtor-email/coordinator.requested` data shape (extended with optional `swarm_type`) to restore field narrowing — identical to how `stage-3-dispatcher` casts `event.data` to a concrete shape immediately after its wildcard trigger.

### Task 2 — Full debtor regression + dispatcher integration check (no commit)

Verification-only. The coordinator refactor disturbed no adjacent shared worker, so no fix code was needed:

- `classifier-screen-worker.test.ts` (original SWARM-02 grep guard) — GREEN
- `out-of-band.test.ts` (hydrator import guard) — GREEN
- `coordinator-swarm-branch-guard.test.ts` — GREEN
- `stage-3-dispatcher.ts` — **unmodified** (`git diff HEAD~1 HEAD` clean) — STAGE3-01 honored.

## Verification Results

| Check | Result |
|-------|--------|
| `debtor-email-coordinator.test.ts` (incl. Plan 01 parity block, 5 D-07/D-09 tests) | PASS (13 active, 13 pre-existing Phase-80 skips) |
| `coordinator-swarm-branch-guard.test.ts` | PASS |
| `classifier-screen-worker.test.ts` | PASS |
| `out-of-band.test.ts` | PASS |
| `npm run typecheck` | exit 0 |
| `grep "const SWARM_TYPE"` | no match |
| `grep "event.data.swarm_type"` | match |
| trigger `*/coordinator.requested` | present |
| `resolve-run-id` step.run | present |
| `stage-3-dispatcher.ts` git-diff | clean |

Parity tests confirmed green: (1) coordinator_runs carries `swarm_type='debtor-email'`, (2) pipeline_events row `swarm_type='debtor-email'` + stage=3, (3) emitted event exactly `debtor-email/predicted`, (4) TENANT_DOMAINS resolves from the registry map (non-empty), (5) entity defaults to `smeba` when null.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cast `event.data` to a concrete shape to restore field narrowing under the wildcard trigger**
- **Found during:** Task 1 (typecheck after switching to the wildcard trigger)
- **Issue:** The `*/coordinator.requested` cast-through-unknown widens `event.data` to the full `Events` union, so every concrete payload field access (`subject`, `body_text`, `run_id`, `automation_run_id`, `agent_run_id`, …) failed to typecheck — exactly the situation `stage-3-dispatcher` already handles.
- **Fix:** Cast `event.data` once to the declared `Events["debtor-email/coordinator.requested"]["data"] & { swarm_type?: string }` shape at the top of the handler (`const email = event.data as unknown as …`) and routed the few direct `event.data.X` reads through `email`. Mirrors the dispatcher's `const data = (event …).data as {…}` pattern. No runtime behavior change.
- **Files modified:** `web/lib/inngest/functions/debtor-email-coordinator.ts`
- **Commit:** 362d1bfb

**2. [Rule 3 - Blocking] Test environment: missing node_modules in worktree**
- **Found during:** Task 1 verification
- **Issue:** Gitignored `node_modules` does not propagate into Claude-Code worktrees (workspace-topology memo), so `npx vitest` resolved a stale temp-cache vite and failed to load `vitest.config.ts`.
- **Fix:** Symlinked the worktree's `node_modules` to the canonical repo's `node_modules` (`/Users/nickcrutzen/Developer/Agent Workforce/web/node_modules`) after confirming `package.json` is byte-identical to canonical. Ran tests via `./node_modules/.bin/vitest` (not `npx`). The symlink is gitignored and not committed; it is test-harness setup, not a dependency install.
- **Files modified:** none committed (symlink only)
- **Commit:** n/a

## Deferred Issues (out of scope)

- `dry-run-gate-preservation.test.ts` — 2 tests fail with assertion messages explicitly tagged **"RED until 110-04"** / "Plan 04 must export a resolver". These are pre-authored failing tests driving the NEXT plan (110-04 per-stage dry-run gate); they fail independent of this plan's change (different files, different concern) and are NOT a regression from the coordinator refactor. Left RED for Plan 04 to satisfy.

## Threat Surface Scan

No new security-relevant surface introduced. The change is a refactor of an existing internal worker:
- `swarm_type` derives from trusted internal Inngest producers only (T-110-07 mitigated: fail-closed empty domain list on unknown swarm_type; no privilege attached to swarm_type beyond a registry-data lookup).
- Replay-safety preserved: `resolve-run-id` stays inside `step.run`; `swarm_type` derivation is deterministic so it is safe outside `step.run` (T-110-08 mitigated).
- Debtor behavior pinned by the Plan 01 parity tests (T-110-09 mitigated).
- No package installs (T-110-SC N/A).

## Self-Check: PASSED

- `web/lib/inngest/functions/debtor-email-coordinator.ts` — FOUND (modified)
- Commit 362d1bfb — FOUND in git log
