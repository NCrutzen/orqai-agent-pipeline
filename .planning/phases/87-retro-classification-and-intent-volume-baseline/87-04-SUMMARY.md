---
phase: 87-retro-classification-and-intent-volume-baseline
plan: 04
subsystem: infra
tags: [phase-87, inngest, retro-classify, cli, side-channel-isolation]

requires:
  - phase: 87-plan-01
    provides: stage_3_retro_runs + intent_volume_baselines tables
  - phase: 87-plan-02
    provides: selectCandidates, reconstructInput, aggregateBaseline helpers
  - phase: 87-plan-03
    provides: InvokeIntentResult.usage telemetry

provides:
  - debtor-email-stage-3-retro-classify Inngest function (registered on /api/inngest)
  - debtor-email/retro-classify.requested event type
  - web/scripts/run-retro-classify.ts CLI ingress
  - 4 architectural-lock test files (precondition, cache-isolation, side-channel-isolation, function spec)

affects: [phase-87-plan-05, V8.2]

tech-stack:
  added: []
  patterns:
    - "Side-Channel Isolation pattern: source-grep + runtime spy guards enforce that a retro/shadow function never touches live-pipeline state"
    - "vi.hoisted() wrapper for top-level mutable state referenced inside vi.mock factories"

key-files:
  created:
    - web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts
    - web/lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts
    - web/lib/automations/debtor-email/__tests__/retro-classify-precondition.test.ts
    - web/lib/automations/debtor-email/__tests__/retro-classify-cache-isolation.test.ts
    - web/lib/automations/debtor-email/__tests__/retro-classify-side-channel-isolation.test.ts
    - web/scripts/run-retro-classify.ts
  modified:
    - web/lib/inngest/events.ts (added retro-classify.requested event)
    - web/app/api/inngest/route.ts (registered debtorEmailStage3RetroClassify)

key-decisions:
  - "Wave 0 guard tests for architectural rules — three independent suites (precondition / cache / side-channel) rather than a monolithic function spec"
  - "Side-Channel Isolation enforced by BOTH source-grep AND runtime spy — source-grep catches imports, runtime spy catches dynamic calls"
  - "Idempotent upsert (onConflict run_id,email_id + ignoreDuplicates) — Inngest retry produces no 23505 noise"
  - "Precondition gate fails with operator-readable text: 'Phase 87 precondition gate failed: cluster surface has N rows, need ≥5' etc."
  - "CLI confirmation prompt fires when sample-limit > 50 or absent; --yes bypass for automation"

patterns-established:
  - "Source-grep architectural guard: read the impl file as a string in the spec, assert it does NOT contain forbidden tokens (agent_runs, /predicted, etc.). Cheap to write, hard to forget."
  - "Runtime side-channel spy: chainable supabase mock tracks every .from(table) call; assertion is `expect(tableCalls).not.toContain('agent_runs')`."

requirements-completed: [REQ-87-01, REQ-87-02, REQ-87-06, REQ-87-07]

duration: 18min
completed: 2026-05-21
status: tasks-1-2-3-complete-task-4-deferred
---

# Phase 87 Plan 04: Inngest fn + CLI (Tasks 1–3 of 4)

**Inngest function `debtor-email-stage-3-retro-classify` is registered and triggerable. Four architectural locks (precondition / cache / side-channel / replay) enforced by 21 automated tests, not just code review. Task 4 (50-email production smoke) deferred to operator per user-scoped execution stop.**

## Performance

- **Duration:** ~18 min
- **Tasks completed:** 3 of 4
- **Task 4 status:** ⏸ deferred — production smoke needs PR #33 merged + Vercel redeploy + Phase 86 7-day observation window per R-04 precondition gate
- **Files modified:** 8 (1 function + 1 function spec + 3 guards + 1 CLI + 2 wiring)

## Accomplishments

### Task 1 — Wave 0 architectural guards (RED before impl)
- `retro-classify-precondition.test.ts` (4 cases): R-04 gate throws on cluster count < 5, throws on stale (>7d), passes on fresh+sufficient, invokeIntentAgent never called on gate failure
- `retro-classify-cache-isolation.test.ts` (3 cases): source-grep — no `findCachedOutput`, no `debtor-email-coordinator` import, direct `invokeIntentAgent` path
- `retro-classify-side-channel-isolation.test.ts` (10 cases): 7 forbidden-token source-grep + 2 runtime spies + 1 file-exists

### Task 2 — Function + event + spec
- `debtor-email-stage-3-retro-classify` registered on `/api/inngest`
- Event type `debtor-email/retro-classify.requested` added to `events.ts`
- Function spec (`debtor-email-stage-3-retro-classify.test.ts`, 4 cases): happy path, token-sum invariant, idempotent re-run with explicit run_id, precondition short-circuit

### Task 3 — CLI ingress
- `web/scripts/run-retro-classify.ts` parses argv, validates dates + sample-limit, prints PRODUCTION banner, confirms when >50 or absent, calls `inngest.send` INLINE

## Task Commits

1. **Task 1 RED:** `8d23968` (or per-file commit chain) — 3 guard suites failing
2. **Task 2:** function + event + index registration + spec → GREEN on all 4 guard suites
3. **Task 3:** CLI script + tsc clean

## Verification (Tasks 1–3)

- ✓ `cd web && npx vitest run lib/automations/debtor-email/__tests__/retro-classify- lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts` — **21/21 green**
- ✓ Full retro+coordinator suite — **49/49 green** across 10 files (helpers + invoke-intent V2/V3/usage + Plan 04 guards + function spec)
- ✓ `cd web && npx tsc --noEmit` — clean
- ✓ CLI `--help` runs cleanly; file checks confirm `inngest.send` inline (no destructure)
- ✓ Source-grep guards confirm function file contains zero forbidden tokens

## Task 4 (deferred — operator action)

**50-email production smoke** — runs only AFTER three prerequisites clear:

1. PR #33 (v8.1 → main) merged + Vercel redeployed — currently `MERGEABLE / BLOCKED` (branch protection awaiting reviewer / checks)
2. Phase 86 cluster surface has ≥5 rows AND last refresh ≤7d ago — R-04 precondition gate will refuse to run otherwise
3. Phase 86 R-04 observation window elapsed (≥7d of live cluster data)

When all three clear, operator runs:
```
cd web && npx tsx scripts/run-retro-classify.ts \
  --since 2026-05-13 --until 2026-05-20 \
  --sample-limit 50 --yes
```

Then verifies via Inngest dashboard + Supabase SQL per Plan 04 Task 4 `how-to-verify` checklist. Side-channel sanity check: `SELECT count(*) FROM agent_runs WHERE created_at >= now() - interval '10 minutes' AND status='predicted'` must NOT show the smoke's 50 rows.

## Carry-forward to Plan 05

Plan 05 is the operator-authored deliverable — full 5000-email run, hand-graded 20-row diff, `87-BASELINE-REPORT.md` synthesis. All deferred to operator post-deploy + observation window.

## Architectural notes

**Side-Channel Isolation pattern** is the headline takeaway from this plan. Source-grep + runtime spy guards make it impossible for future edits to drift the retro path back into live-pipeline state. The pattern transfers to any shadow-mode or analysis function that must never affect production behaviour.

**vi.hoisted() lesson:** vitest hoists `vi.mock` factories to the top of the file, ABOVE top-level `const` declarations. Any mock helper / mutable state referenced inside `vi.mock` must be wrapped in `vi.hoisted(() => ({ ... }))` or the test crashes with `ReferenceError: X is not defined`. Three tests needed this wrap; pattern captured in `retro-classify-precondition.test.ts` for future reference.
