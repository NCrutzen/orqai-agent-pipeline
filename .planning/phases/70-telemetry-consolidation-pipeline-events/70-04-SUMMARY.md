---
phase: 70-telemetry-consolidation-pipeline-events
plan: 04
subsystem: telemetry-write-side
tags: [inngest, pipeline_events, dual-write, stage-3, stage-4, wave-2, TELE-01, TELE-02]
requires:
  - "70-02 (public.pipeline_events table + emitPipelineEvent helper + numericConfidence + Stage enum)"
provides:
  - "Stage 3 dual-write inside debtor-email-coordinator.ts persist-ranked step.run"
  - "Stage 4 dual-write inside classifier-invoice-copy-handler.ts write-email-label step.run (success path)"
  - "Stage 4 dual-write inside write-no-invoice-label step.run (no_invoice_reference early-return)"
  - "Stage 4 dual-write inside fresh emit-stage4-failrun step.run (catch-boundary failure)"
affects:
  - "Plan 03 (Wave 2) covers the remaining Stage 0/1/2 emits — orthogonal to this plan"
  - "Plan 06+ (read side / Bulk Review) can rely on Stage 3 + Stage 4 rows landing for every dispatched coordinator + invoice-copy run"
tech-stack:
  added: []
  patterns:
    - "Inline dual-write inside existing step.run (D-06/D-09)"
    - "Catch-boundary emit wrapped in fresh step.run (W-70-01 carve-out from D-09 — top-level body is replayed; plain await would lose the row)"
    - "swarm_type forwarded via swarm_type ?? 'debtor-email' (Phase 69 D-08 cross-cutting handler reuse pattern)"
    - "PII-sanitized failure_reason (T-70-04-02) — only error.message, never full stack"
key-files:
  created: []
  modified:
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
decisions:
  - "Stage 3 emit: confidence mapped via numericConfidence(top.confidence) — high→0.9, medium→0.7, low→0.4, none→null"
  - "Stage 3 email_id: forwarded as event.data.email_id (canonical email_pipeline.emails.id uuid) per W-70-04 fix; no null/text-id fallback — fail loudly if missing"
  - "Stage 4 success path emit lives inside write-email-label step.run alongside the email_labels INSERT (D-09 reuse)"
  - "Stage 4 no_invoice_reference emit lives inside write-no-invoice-label step.run (D-09 reuse — already inside an existing step.run)"
  - "Stage 4 failRun emit wrapped in NEW step.run('emit-stage4-failrun') because the catch boundary at line ~140 is OUTSIDE any existing step.run; W-70-01 deliberate carve-out from D-09 with verbatim rationale comment in source"
  - "swarm_type forwarded via swarm_type ?? 'debtor-email' on every Stage 4 emit so cross-cutting handler reuse (Phase 69 D-08) carries telemetry forward without code change"
metrics:
  duration: ~25m
  completed: 2026-05-05
---

# Phase 70 Plan 04: Wave 2 — Stage 3 + Stage 4 invoice-copy dual-writes Summary

Wired Stage 3 (intent coordinator) and Stage 4 (invoice-copy handler) telemetry dual-writes per CONTEXT D-06/D-09. Stage 3 emits one `pipeline_events` row inside the `persist-ranked` step.run after the `coordinator_runs` UPDATE. Stage 4 emits 3 distinct rows depending on the exit path: `completed` on success (inside `write-email-label`), `failed` with `failure_reason='no_invoice_reference'` on the early-return branch (inside `write-no-invoice-label`), and `failed` with the sanitized error message on the catch-boundary `failRun` branch (inside a NEW `emit-stage4-failrun` step.run — deliberate W-70-01 carve-out from D-09 because the catch boundary has no existing step.run to reuse).

## Tasks Completed

| Task | Name                                                            | Commit  | Files                                                                                                                              |
| ---- | --------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Stage 3 emit inside persist-ranked step.run (coordinator)       | 90f098f | web/lib/inngest/functions/debtor-email-coordinator.ts, web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts        |
| 2    | Stage 4 emits in invoice-copy handler (success + failure paths) | b751fb6 | web/lib/inngest/functions/classifier-invoice-copy-handler.ts, web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts |

## Verification

### Task 1 — Stage 3 coordinator (acceptance-criteria greps)

- `grep -c "emitPipelineEvent" web/lib/inngest/functions/debtor-email-coordinator.ts` → 2 (1 import + 1 call site) ✓
- `grep -c "stage: 3" web/lib/inngest/functions/debtor-email-coordinator.ts` → 1 ✓
- Emit lives inside `persist-ranked` step.run: `awk '/step.run\("persist-ranked"/,/^      \}\)/' … | grep -c emitPipelineEvent` → 1 ✓
- No null-fallback pollution: `grep -c "email_id_text" …` → 0 ✓
- Test asserts `decision_details.ranked`, language, urgency, uuid email_id, numericConfidence(top)=0.9 ✓

### Task 2 — Stage 4 invoice-copy handler (acceptance-criteria greps)

- `grep -c "emitPipelineEvent" web/lib/inngest/functions/classifier-invoice-copy-handler.ts` → 4 (1 import + 3 call sites) ✓
- `grep -c "stage: 4" …` → 3 ✓
- Success-path emit inside `write-email-label` step.run: `awk '/step.run\("write-email-label"/,/^    \}\)/' … | grep -c emitPipelineEvent` → 1 ✓
- failRun-branch step.run with fixed stepId: `grep -c "emit-stage4-failrun" …` → 1 ✓
- Verbatim rationale comment present: `grep -c "doubled step count for the failure branch is acceptable" …` → 1 ✓
- Test asserts both `'completed'` and `'failed'` decisions: count → 3 (≥2 required) ✓

### Test runs (all green)

- `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` → **8 passed, 0 failed**
- `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` → **6 passed, 0 failed** (added 2 new tests)
- `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts` → **6 passed, 0 failed** (regression — Phase 69 single-brand isolation untouched)
- `cd web && npx vitest run lib/pipeline-events/__tests__/emit.test.ts` → **8 passed, 0 failed** (Wave 1 helper still green)
- Combined: **4 test files / 28 tests passed**

### TELE-02 — legacy writes preserved

| Legacy write                                                                                                  | Status                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `coordinator_runs.UPDATE({ranked_intents:…})` in persist-ranked                                               | Untouched (line count + payload shape identical pre/post Plan 04)       |
| `email_labels.INSERT(method='invoice_copy_drafted', confidence='high', …)` in write-email-label              | Untouched                                                               |
| `email_labels.INSERT(method='unresolved', confidence='none', …)` in write-no-invoice-label                   | Untouched                                                               |
| `automation_runs.UPDATE({status:'failed', error_message, completed_at})` via failRun                          | Untouched — invoked AFTER the new emit-stage4-failrun step.run          |

Stage 4 failRun-branch test directly asserts both writes co-occur:
- `pipeline_events` row with `decision='failed'` AND
- `automation_runs` UPDATE with `status='failed'`

## Deviations from Plan

None — plan executed exactly as written. The W-70-01 carve-out (failRun emit wrapped in fresh step.run) was pre-decided in the plan and applied verbatim, including the rationale comment. The W-70-04 fix (no null/text-id fallback for email_id) was likewise applied verbatim.

## Threat Mitigations Verified

| Threat ID  | Mitigation Status                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-70-04-01 | Mitigated upstream — Plan 02 RLS gates reads. decision_details on Stage 4 carries draft_url + invoice_ref + tone but no client-side surface yet (read side lands in a later plan).                                              |
| T-70-04-02 | Mitigated — failRun emit serialises only `err instanceof Error ? err.message : String(err)` into `decision_details.failure_reason`. No full stack frames captured. Inline `// PII: sanitize before exposing in Bulk Review` comment placed above the emit-stage4-failrun step.run so future read-side scrubbing is anchored. |
| T-70-04-03 | Mitigated — Stage 3 emit uses `event.data.email_id` directly (canonical email_pipeline.emails.id uuid). No null/text-id fallback per W-70-04 fix. If the uuid is genuinely missing, emitPipelineEvent throws a Postgres uuid syntax error and Inngest replays the whole step.run — fail loud, not silent pollution. |
| T-70-04-04 | Mitigated — failRun emit lives in a NEW `step.run("emit-stage4-failrun", …)` BEFORE the existing `failRun-on-unhandled` step.run. Top-level catch boundary IS replayed by Inngest; wrapping in step.run is the only replay-safe pattern. Doubled step count on the failure branch is the documented acceptable cost. |

## Known Stubs

None. All emit sites carry full payloads (email_id, decision, confidence/details, automation_run_id, triggered_by). agent_run_id forwarded on Stage 3 only (Stage 4 doesn't have a single canonical agent_run_id at the catch boundary — orchestratorAgentRunId is local to one branch).

## Threat Flags

None new. The Stage 3 + Stage 4 emit sites do not introduce new network endpoints, auth paths, file access patterns, or schema changes. They are additive INSERTs to a table already gated by RLS service-role policy (Plan 02).

## Self-Check: PASSED

- FOUND: web/lib/inngest/functions/debtor-email-coordinator.ts (modified — emitPipelineEvent import + persist-ranked emit)
- FOUND: web/lib/inngest/functions/classifier-invoice-copy-handler.ts (modified — 3 emit paths + emit-stage4-failrun step.run)
- FOUND: web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts (extended — Phase 70 TELE-01 test)
- FOUND: web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts (extended — completed assertion + 2 new failure-branch tests)
- FOUND commit: 90f098f (Task 1 — Stage 3 dual-write)
- FOUND commit: b751fb6 (Task 2 — Stage 4 dual-writes)
- TESTS: 28/28 passed across 4 files (coordinator, invoice-copy, invoice-copy isolation, pipeline-events helper)
