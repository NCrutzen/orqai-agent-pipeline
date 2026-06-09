---
phase: 113-stage-3-sales-intent-agent-greenfield
plan: 05
subsystem: stage-3-routing-gate + dead-letter-reconciliation + bulk-review-retry-proof
tags: [stage-3, dry-run-gate, routing-hold, dead-letter, deadletter-reconciliation, bulk-review-retry, swarm-agnostic, debtor-neutral, dispatcher-untouched, sales-email, STAGE3-03]
status: checkpoint-blocked
requires:
  - public.swarms.dry_run_config (Phase 110 — per-stage governance jsonb)
  - web/lib/pipeline-gating/dry-run-gate/index.ts (Phase 110 — isStageBlocked helper family)
  - web/lib/inngest/functions/debtor-email-coordinator.ts (shared Stage 3 classifier; persist-ranked→flip→emit seam)
  - web/app/(dashboard)/automations/[swarm]/_actions/replay.ts (Phase 76 — the Bulk Review retry/re-dispatch action, swarm-parameterized)
  - 113-04-SUMMARY.md (13 sales swarm_intents seeded, all placeholder → Kanban human-lane)
provides:
  - swarm-agnostic Stage-3 ROUTING gate in the coordinator BEFORE the predicted-emit (registry-driven, fail-closed, no swarm literal)
  - dedicated dry_run_config.stage_3_routing key + isStage3RoutingGated helper (distinct from stage_3_labeling — debtor-neutrality)
  - migration 20260609c seeding debtor=open(false) / sales=gated(true) — NOT YET APPLIED (operator checkpoint)
  - routing_held terminal-visible marker on coordinator_runs.decision_details (counted as terminal, not dead-letter)
  - sales-stage3-deadletter-check.ts reconciliation smoke (pure fn + Supabase main, exit 1 on gap) + fixture tests
  - sales-bulk-review-retry.test.ts — proves the Zod-failure retry path accepts swarm_type='sales-email'
affects:
  - Task 3 operator checkpoint (dry-run review + go-live flip + migration apply)
  - V11.0 Stage 4 handlers (each placeholder intent flips to registered when a handler lands; routing must be OPEN by then)
tech-stack:
  added: []
  patterns:
    - per-stage dry-run gate extended with a dedicated stage_3_routing key (TRUE=held, FALSE=open, MISSING=fail-closed)
    - routing hold via WITHHOLDING the predicted-emit in the coordinator (the classifier-owned seam) — shared dispatcher NEVER edited
    - held-state marker (decision_details.routing_held) makes a held verdict count as terminal-visible in dead-letter reconciliation
    - pure-core + Supabase-shell reconciliation script so fixtures test the logic offline (CI-provable zero dead-letter)
    - source-guard: git-diff --exit-code on the shared dispatcher asserts byte-equality inside the test
key-files:
  created:
    - supabase/migrations/20260609c_phase113_stage3_routing_gate.sql
    - web/lib/inngest/functions/__tests__/coordinator-stage3-routing-gate.test.ts
    - web/lib/inngest/functions/__tests__/sales-bulk-review-retry.test.ts
    - web/scripts/eval/sales-stage3-deadletter-check.ts
    - web/scripts/eval/__tests__/sales-stage3-deadletter-check.test.ts
  modified:
    - web/lib/pipeline-gating/dry-run-gate/index.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
decisions:
  - "DEDICATED stage_3_routing key, NOT stage_3_labeling reuse — debtor is seeded stage_3_labeling=true today but its predicted-emit FIRES (labeling is a downstream Stage-2/3 iController write, routing is the emit). Reusing stage_3_labeling would silently hold debtor's emit (T-113-10 regression). stage_3_routing seeded debtor=false (open) / sales=true (gated)."
  - "gate placed BETWEEN persist-ranked and flip-status-predicted — verdict always persisted+visible; only the emit is withheld when gated. GATED returns decision='predicted_held' and stamps decision_details.routing_held=true."
  - "held verdict counts as TERMINAL-visible in the reconciliation (NOT a dead-letter) — Bulk Review reads coordinator_runs.ranked_intents regardless of agent_runs status."
  - "migration filename 20260609c (orders after 20260609b sales swarm_intents seed); merges into dry_run_config via jsonb `||` so existing per-stage flags survive."
  - "remote migration apply + go-live flip DEFERRED to the Task 3 operator checkpoint (blocking-human) — production write fenced per plan production_write_gate; sandbox classifier also denied the direct apply."
metrics:
  duration: 12m
  completed: 2026-06-09
---

# Phase 113 Plan 05: Stage-3 Routing Gate + Dead-Letter Reconciliation + Bulk Review Retry Proof

Landed the STAGE3-03 end-station code: a **swarm-agnostic Stage-3 ROUTING gate** in the SHARED coordinator that withholds the `<swarm>/predicted` emit (→ Kanban routing) behind a registry-driven, fail-closed per-stage dry-run flag, while the verdict stays visible in Bulk Review (dry-run observation, D-08). Debtor behavior is provably unchanged (its emit still fires — seeded OPEN, all debtor coordinator tests green), the shared dispatcher is byte-unchanged (git-diff guard inside the test), and there is no swarm-name literal around the gate. A **dead-letter reconciliation smoke** proves zero silent dead-letters (post-Stage-1 sales email count == terminal-visible count), and a **retry unit test** proves the Bulk Review Zod-failure retry path (the dead-letter sink) accepts `swarm_type='sales-email'`.

**Status: CHECKPOINT-BLOCKED.** Tasks 1 + 2 are fully complete, committed, and verified. Task 3 is the operator dry-run review + go-live routing flip — a `gate="blocking-human"` checkpoint that also requires applying migration `20260609c` to the live `swarms` table (a production config write fenced by the plan, and denied by the sandbox classifier). See "Checkpoint" below.

## What Was Built

### Task 1 — swarm-agnostic Stage-3 routing gate (commit `c433d1d8`)

- **`dry-run-gate/index.ts`** — added the dedicated `stage_3_routing?: boolean` key to `DryRunConfig` + `isStage3RoutingGated(swarm)` helper (fail-closed; `?? true`). Documented WHY it is distinct from `stage_3_labeling`: labeling is the downstream iController write (debtor: gated); routing is the predicted-emit (debtor: live). Conflating them would regress debtor's live emit.
- **`debtor-email-coordinator.ts`** — inserted the gate as step `load-stage3-routing-gate` BETWEEN `persist-ranked` and `flip-status-predicted`. GATED → step `mark-routing-held` stamps `coordinator_runs.decision_details.routing_held=true` + `completed_at`, SKIPS flip+emit, returns `{ decision: "predicted_held" }`. OPEN → flip+emit run exactly as before. Pure registry read keyed by the derived `swarm_type` — no `if (swarm_type === ...)` branch, no `sales-email` literal.
- **`20260609c_phase113_stage3_routing_gate.sql`** — additive jsonb merge (`dry_run_config || {stage_3_routing: …}`): debtor=`false` (OPEN, byte-neutral re-encode of today's live emit) / sales=`true` (GATED, dry-run observation). Idempotent, no new table/policy.
- **`coordinator-stage3-routing-gate.test.ts`** — 7 tests: GATED→no emit+held marker+decision=predicted_held; OPEN→emits `sales-email/predicted`; DEBTOR NON-REGRESSION (seeded stage_3_routing=false, stage_3_labeling=true → still emits `debtor-email/predicted`); MISSING→fail-closed held; dispatcher byte-unchanged (`git diff --exit-code`); no swarm literal/`===` branch; gate-consulted source assertion.
- **`debtor-email-coordinator.test.ts`** — default `loadSwarm` mock updated to carry the seeded `dry_run_config.stage_3_routing=false` so the existing debtor emit-regression assertions reflect production reality (the gate is fail-closed; the seeded OPEN flag is what makes debtor fire).

### Task 2 — dead-letter reconciliation smoke + sales retry proof (commit `a318a5cd`)

- **`sales-bulk-review-retry.test.ts`** — drives `replayKanbanRow` with `swarmType='sales-email'`: same-intent fires the registry-resolved `sales-email/quote-request.requested` (sales-scoped, `data.swarm_type='sales-email'`, NO debtor event), close UPDATE compound-filtered by `swarm_type='sales-email'` (IDOR), `emitAutomationRunStale(admin,'sales-email-kanban')`. Plus an out-of-registry-intent rejection for sales. Plus the BLOCKER-3a swarm-uniformity SOURCE guard: no debtor `swarm_type` query filter in `replay.ts` / `stage-3-read.tsx` / `stage-3-decide.tsx`, and `replay.ts` validates swarm+intents+handler_event against the registry.
- **`sales-stage3-deadletter-check.ts`** — pure exported `reconcileDeadLetters(entered, terminalSets)` (union of Stage-3 verdicts ∪ routing-held verdicts ∪ terminal agent_runs; gap = entered − terminal; names + sorts orphans) + a `main()` that wires it to Supabase over a `[since, until)` window and `process.exit(1)` on any gap. Invoked-directly guard so `import` never triggers the DB query. Scopes to `sales-email`.
- **`sales-stage3-deadletter-check.test.ts`** — 7 fixture cases: gap=0 via verdict / held / kanban / 3-way union; held verdict counts terminal-visible; gap=1 names the orphan; de-dup re-dispatched entered; multi-orphan sorted.

### Task 3 — operator dry-run review + go-live flip — CHECKPOINT (not executed)

Blocking-human. The migration apply (live `swarms` config) + the routing-gate flip are the operator's call. See "Checkpoint".

## Verification

- `npx vitest run …coordinator-stage3-routing-gate.test.ts …sales-bulk-review-retry.test.ts …sales-stage3-deadletter-check.test.ts` → **18 tests green**.
- `npx vitest run lib/inngest/functions/__tests__/` (full coordinator+dispatcher suite) → **298 passed, 14 skipped, 0 failed** (debtor non-regression preserved after the fixture update).
- `git diff --exit-code web/lib/inngest/functions/stage-3-dispatcher.ts` → **exit 0 (dispatcher byte-unchanged, in no plan's files_modified)**.
- `npx tsc --noEmit` → **0 errors**.
- `npm run check:supabase` → **0 ERROR** (6 WARN, 23 INFO) with migration `20260609c` present.
- Acceptance greps: script contains `sales-email`; exports `reconcileDeadLetters`; `process.exit(1)` on gap; coordinator grep `dry_run|isStageBlocked|stage_3_routing` present; coordinator `grep -c '"sales-email"'` in code = 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical / debtor-neutrality] Dedicated `stage_3_routing` key instead of reusing `stage_3_labeling`**
- **Found during:** Task 1 (reading the dry-run-gate + the seed migration + the preservation test).
- **Issue:** The plan's interfaces note suggested the Stage-3 routing hold "maps to the stage_3_labeling gate". But live + seeded config has debtor `stage_3_labeling=true` WHILE debtor's predicted-emit fires every run today (labeling is the downstream Stage-2/3 iController write, which is separately gated; routing is the predicted-emit). Reusing `stage_3_labeling` for the emit-gate would have made the coordinator START holding debtor's live emit — a silent debtor regression (T-113-10).
- **Fix:** added a DEDICATED swarm-agnostic `stage_3_routing` key + `isStage3RoutingGated` helper (fail-closed), seeded debtor=false (open, byte-neutral) / sales=true (gated). The plan explicitly sanctioned this: "if the existing stage_3_labeling key does not cleanly express 'hold Stage-3 routing emit', add a dedicated swarm-agnostic key … in a tiny additive migration folded into this task." The DryRunConfig comment + migration header + coordinator gate comment all document the reasoning.
- **Files modified:** `dry-run-gate/index.ts`, `debtor-email-coordinator.ts`, `20260609c_*.sql`.
- **Commit:** `c433d1d8`.

**2. [Rule 1 - Test fixture] debtor coordinator test fixture missing the seeded routing flag**
- **Found during:** Task 1 (running the full inngest suite).
- **Issue:** 4 existing debtor coordinator tests assert debtor's predicted-emit fires. Their default `loadSwarm` mock omitted `dry_run_config`, so the new fail-closed gate held the emit and the assertions failed. This is a fixture gap (the real debtor swarm is seeded `stage_3_routing=false`), NOT a real regression.
- **Fix:** added `dry_run_config: { stage_3_routing: false }` to the default mock so the fixture mirrors production reality. All 298 inngest tests green after.
- **Files modified:** `debtor-email-coordinator.test.ts`.
- **Commit:** `c433d1d8`.

## Deploy-Ordering Constraint (operator must honor)

⚠️ **Live `swarms.dry_run_config` currently has NO `stage_3_routing` key for either swarm** (verified read-only via Management API 2026-06-09). Because the coordinator gate is FAIL-CLOSED, deploying the Task-1 code BEFORE applying migration `20260609c` would make the coordinator HOLD **debtor's** live predicted-emit (debtor would fail-close to GATED). Therefore:

> **Migration `20260609c` (debtor stage_3_routing=false) MUST be applied to remote BEFORE — or atomically with — the code deploy.** The sales side is safe either way (gated is the intended dry-run state). This is the debtor-neutrality safeguard; it is bundled into the Task 3 operator checkpoint alongside the go-live flip.

## Checkpoint

**Type:** human-verify (gate="blocking-human"). The remaining work is the operator dry-run review + the go-live routing flip, which require production config writes I cannot (and per the plan's `production_write_gate` must not) perform. The sandbox auto-mode classifier also denied the direct Management-API apply of `20260609c`.

**Completed autonomously (committed):**
- The swarm-agnostic routing gate + helper + migration + debtor-neutral tests (`c433d1d8`).
- The dead-letter reconciliation smoke + fixtures + the sales retry proof (`a318a5cd`).

**Awaiting operator (Task 3 steps):**
1. **Apply migration `20260609c` to remote** (`mvqjhlxfvtqqubqgdvhz`) — sets debtor `stage_3_routing=false` (preserve live emit — the deploy-ordering safeguard above) + sales `stage_3_routing=true` (gated). Verify via `select swarm_type, dry_run_config from public.swarms`.
2. **Deploy the Task-1 coordinator code** (gate must read the live flag). Order: migration first/atomic, then deploy.
3. **Dry-run observation:** with sales gated, trigger live sales Stage 3 over a recent window; verdicts persist to `coordinator_runs` + surface in Bulk Review at `/automations/sales-email/review` while the predicted-emit is held (Kanban routing held). Run `cd web && npx tsx scripts/eval/sales-stage3-deadletter-check.ts <since> <until>` → confirm **gap=0**.
4. **Operator review (~100 verdicts):** confirm (a) verdicts render with ranked intents + confidence + the `entity_relationship` axis, (b) any Zod-failure row shows raw output + a working retry (the dead-letter sink — unit-proven for sales in Task 2), (c) axis-3 overrides are recordable (the D-10 correction signal).
5. **On green-light, FLIP** sales `stage_3_routing` to `false` (operator-authorized remote update) → the coordinator resumes emitting `sales-email/predicted` → the dispatcher opens Kanban routing. Reversible by re-gating (D-09). A freshly-classified sales placeholder intent then produces a Kanban human-lane card with `kanban_reason='no_handler'`.
6. **Record** the green-light + reviewed sample size in the phase UAT.

**Resume signal:** Type "go-live approved" (after the dry-run review + flip) or "hold — issues: …".

## Threat Flags

None beyond the planned `<threat_model>`. T-113-08 (dead-letter / verdict-swallowing) mitigated — reconciliation smoke + fixtures assert gap=0 counting the held state as terminal-visible; the sales retry (dead-letter sink) is unit-proven to accept `swarm_type='sales-email'`. T-113-10 (gate regresses debtor) mitigated — dedicated stage_3_routing key + debtor-neutral test + fail-closed + the deploy-ordering safeguard; dispatcher byte-unchanged. T-113-09 (unauthorized routing flip) — the flip + migration apply are operator-authorized blocking-human steps, reversible by re-gating. No new network endpoint or auth path; the migration only ALTERs values on the existing RLS-enabled `swarms` table.

## Self-Check: PASSED

- `supabase/migrations/20260609c_phase113_stage3_routing_gate.sql` — FOUND.
- `web/lib/inngest/functions/__tests__/coordinator-stage3-routing-gate.test.ts` — FOUND.
- `web/lib/inngest/functions/__tests__/sales-bulk-review-retry.test.ts` — FOUND.
- `web/scripts/eval/sales-stage3-deadletter-check.ts` — FOUND.
- `web/scripts/eval/__tests__/sales-stage3-deadletter-check.test.ts` — FOUND.
- Commit `c433d1d8` — present. Commit `a318a5cd` — present.
- 18 plan-05 tests + 298 inngest-suite tests green; dispatcher byte-unchanged; tsc 0; check:supabase 0 ERROR — all verified above.

## Commits

- `c433d1d8` feat(113-05): swarm-agnostic Stage-3 routing gate in coordinator (dispatcher untouched)
- `a318a5cd` feat(113-05): sales Bulk Review retry proof + dead-letter reconciliation smoke
