---
phase: 70-telemetry-consolidation-pipeline-events
plan: 03
subsystem: telemetry-write-side
tags: [inngest, dual-write, stage-0, stage-2, wave-2, TELE-01, TELE-02]
requires:
  - "70-02 (emitPipelineEvent + numericConfidence + live pipeline_events table)"
provides:
  - "Stage 0 safety worker dual-write inside persist-verdict step.run"
  - "Stage 2 label-resolver dual-write inside write-email-label step.run (resolved / unresolved / resolver-error branches)"
affects:
  - "Plans 70-04 (Stage 1 ingest), 70-05 (Stage 3 coordinator), 70-06 (Stage 4 invoice-copy handler) — share the same emitPipelineEvent helper and supabaseInserts mock pattern"
  - "Plan 70-07 read-side (Bulk Review) — Stage 0 + Stage 2 rows now flowing into pipeline_events on every safe/injection_suspected and resolved/unresolved/error decision"
tech-stack:
  added: []
  patterns:
    - "Inline second admin.from('pipeline_events').insert(...) inside the same step.run that holds the legacy-table INSERT (D-06, D-09)"
    - "supabaseInserts:Array<{table,payload}> mock pattern for cross-table dual-write assertions (mirrors classifier-invoice-copy-handler.test.ts)"
    - "numericConfidence(text-conf) -> numeric(4,3) at the emit boundary; null for resolver-error to avoid mapping a hallucinated 'none'"
key-files:
  created: []
  modified:
    - web/lib/inngest/functions/stage-0-safety-worker.ts
    - web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts
    - web/lib/inngest/functions/classifier-label-resolver.ts
    - web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts
decisions:
  - "Stage 0 confidence is null (Stage 0 LLM verdict is categorical 'safe'|'injection_suspected', not a numeric score) — RESEARCH §Example: Stage 0 emit"
  - "Stage 0 emit lives inside persist-verdict (after the automation_runs INSERT throws-on-error, before the step.run callback returns) — D-06"
  - "Stage 2 resolver-error branch emits decision='unresolved' with decision_details.failure_reason populated and confidence=null — Open Question Q2 recommendation in RESEARCH"
  - "Stage 2 swarm_type uses the event payload's swarm_type ?? 'debtor-email' fallback — matches the legacy automation_runs.update path's swarm_type usage"
  - "Test mock harness is single-pass (no step.run memoization). Idempotency test asserts one row per invocation; replay-double-insert prevention is enforced by Inngest runtime, not unit test (TODO comment in test)"
metrics:
  duration: ~12m
  completed: 2026-05-05
  tasks: 2
  files: 4
---

# Phase 70 Plan 03: Wave 2 — Stage 0 Safety + Stage 2 Label-Resolver Dual-Writes Summary

Wired two of the four "in-step.run" emit sites identified by RESEARCH §System Architecture Diagram: Stage 0 (safety verdict) inside `persist-verdict`, and Stage 2 (entity/customer resolution) inside `write-email-label`. Both add a single `INSERT` next to an existing legacy INSERT — no logic refactor, zero consumer breakage on the legacy path. All branch coverage (safe/injection_suspected for Stage 0; resolved/unresolved/resolver-error for Stage 2) is exercised by extended unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Stage 0 emit inside persist-verdict step.run | b98ef8f | web/lib/inngest/functions/stage-0-safety-worker.ts, web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts |
| 2 | Stage 2 emit inside write-email-label step.run (label-resolver) | 9344bf2 | web/lib/inngest/functions/classifier-label-resolver.ts, web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts |

## Verification

### Task 1 — Stage 0 (acceptance-criteria greps)

- `grep -c "emitPipelineEvent" web/lib/inngest/functions/stage-0-safety-worker.ts` → 2 (import + call)
- `grep -c "stage: 0" web/lib/inngest/functions/stage-0-safety-worker.ts` → 1
- `awk '/step.run\("persist-verdict"/,/^  \}\)/' … | grep -c emitPipelineEvent` → 1 (call IS inside persist-verdict step.run)
- `grep -c "stage.*0" web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` → 15
- `npx vitest run lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` → **5 passed, 0 failed, exit 0**

### Task 2 — Stage 2 (acceptance-criteria greps)

- `grep -c "emitPipelineEvent" web/lib/inngest/functions/classifier-label-resolver.ts` → 2
- `grep -c "numericConfidence" web/lib/inngest/functions/classifier-label-resolver.ts` → 4
- `grep -c "stage: 2" web/lib/inngest/functions/classifier-label-resolver.ts` → 1
- `awk '/step.run\("write-email-label"/,/^  \}\)/' … | grep -c emitPipelineEvent` → 1 (call IS inside write-email-label step.run)
- `grep -E "decision.*(resolved|unresolved)" __tests__/classifier-label-resolver.test.ts | wc -l` → 7 (≥2 required)
- `npx vitest run lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` → **9 passed, 0 failed, exit 0**

### TELE-02 (legacy-table INSERTs untouched)

- `git diff HEAD~2 -- web/lib/inngest/functions/stage-0-safety-worker.ts` shows the `automation_runs.insert({...})` block unchanged; only an additional `await emitPipelineEvent(...)` was added between the throws-on-error check and the closing brace.
- `git diff HEAD~1 -- web/lib/inngest/functions/classifier-label-resolver.ts` shows the `email_labels.insert(...)...select("id").single()` chain unchanged; the dual-write is appended after the throws-on-error check, before `return data as { id: string }`.

## Deviations from Plan

None — plan executed exactly as written. Both emits live inside the existing step.run blocks named in the plan; field shapes match RESEARCH §Example: Stage 0 emit and §Pattern 1 verbatim; all four explicit acceptance-criteria greps return ≥ the expected counts.

## Threat Mitigations Verified

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-70-03-01 (PII in decision_details) | Mitigated upstream by Plan 02's RLS service_role-all + authenticated-select policies; this plan's writes go via the service-role admin client only. No new client-side surface. |
| T-70-03-02 (uuid vs text drift on email_id) | Mitigated — both emits use canonical uuids: Stage 0 uses `event.data.email_id` (already documented as email_pipeline UUID); Stage 2 uses `emailRow.id` (loaded from `email_pipeline.emails`, type uuid). No Outlook string id reaches `pipeline_events.email_id`. |
| T-70-03-03 (replay double-insert) | Mitigated by D-06 + D-09 — both emits live inside the SAME step.run as the legacy INSERT; on Inngest replay neither is repeated. Unit-test harness is single-pass (no memoization); the explicit idempotency test in Stage 0 documents that replay-safety is enforced by Inngest runtime. |

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: web/lib/inngest/functions/stage-0-safety-worker.ts (modified)
- FOUND: web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts (modified)
- FOUND: web/lib/inngest/functions/classifier-label-resolver.ts (modified)
- FOUND: web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts (modified)
- FOUND commit: b98ef8f (Task 1 — Stage 0 dual-write)
- FOUND commit: 9344bf2 (Task 2 — Stage 2 dual-write)
- VERIFIED: focused vitest runs both pass (5 + 9 tests, 0 failed)
