---
phase: 74
phase-slug: stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis
date: 2026-05-06
source: extracted from 74-RESEARCH.md §"Validation Architecture"
---

# Phase 74: Validation Architecture

This file is the Nyquist validation contract for Phase 74. Every SPEC requirement (REQ-1..REQ-7) and every pitfall flagged in 74-RESEARCH.md has at least one row below mapping it to a verifiable test or operator check.

## Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (existing in project) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && pnpm vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` |
| Full suite command | `cd web && pnpm vitest run` |
| Type check | `cd web && pnpm tsc --noEmit` |

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-1 | Orq agent persists strict response_format | manual + smoke | `mcp__orq__get_agent` after `update_agent` shows `model.parameters.response_format` populated | ❌ Wave 0 (manual operator step in Plan 74-03) |
| REQ-1 | Agent on auto-reply fixture returns `category_key='auto_reply'` with `confidence ∈ {medium,high}` | smoke | One-shot fixture send via Orq Studio playground OR `tests/smoke/stage1-classifier.test.ts` | ❌ Wave 0 |
| REQ-2 | Worker registered with `event: classifier/screen.requested`, `retries: 0`, side effects in step.run | unit | `vitest` test asserting `__config.retries === 0` and emit-classifier mock called | ❌ Plan 74-04 Task 1 |
| REQ-2 | Auto-reply fixture → exactly one `classifier/verdict.recorded` with `predicted_category='auto_reply'` | unit | `inngestSend` mock asserts call args | ❌ Plan 74-04 Task 1 |
| REQ-3 | Regex hit on `payment_admittance` → no `agent_runs` insert | unit | Mock supabase from('agent_runs').insert never called | ❌ Plan 74-04 Task 1 |
| REQ-3 | `swarms.stage1_regex_module=null` → LLM invoked unconditionally | unit | Mock `loadSwarm` returns `stage1_regex_module=null`, assert `invokeOrqAgent` called | ❌ Plan 74-04 Task 1 |
| REQ-4 | LLM `confidence='low'` → `predicted_category='unknown'` | unit | Mock `invokeOrqAgent` returns low conf, assert verdict event has `predicted_category='unknown'` | ❌ Plan 74-04 Task 1 |
| REQ-4 | LLM `confidence='medium', category_key='auto_reply'` → `predicted_category='auto_reply'` | unit | Same shape, different fixture | ❌ Plan 74-04 Task 1 |
| REQ-5 | Each Stage-1 decision writes exactly one `pipeline_events` row | unit | Mock `emitPipelineEvent` asserts call count = 1 per worker invocation | ❌ Plan 74-04 Task 1 |
| REQ-5 | LLM-invoked branch additionally writes one `agent_runs` row | unit | Mock supabase from('agent_runs').insert call count = 1 (LLM path), 0 (regex-hit path) | ❌ Plan 74-04 Task 1 |
| REQ-5 | `agent_runs.swarm_type='sales-email'` row insert succeeds (DB schema) | integration | Test against test Supabase OR migration smoke that asserts insert with `swarm_type='sales-email', entity=null` succeeds | ❌ Plan 74-01 Task 2 (entity nullable migration) |
| REQ-6 | `select count(*) from swarm_categories where swarm_type='sales-email'` returns 5 | migration smoke | post-migration `psql` query OR vitest integration test | ❌ Plan 74-01 Task 3 (sales-email seed) |
| REQ-6 | No string literal `'sales-email'` or `'debtor-email'` in `classifier-screen-worker.ts` | static check | `grep -E "'(sales\|debtor)-email'" web/lib/inngest/functions/classifier-screen-worker.ts` returns nothing in branch conditions | ❌ Plan 74-04 Task 1 (assertion case #11) |
| REQ-6 | Worker successfully processes `swarm_type='sales-email'` payload | unit | Test invokes handler with `swarm_type='sales-email'`, asserts no throw + verdict emitted | ❌ Plan 74-04 Task 1 |
| REQ-7 | 24-hour `pipeline_events` query for each of 3 mailboxes | manual / operator | Post-deploy SQL query | manual-only (Plan 74-05 Task 4 checkpoint, per D-20) |
| REQ-7 | No `automation_runs.status='failed'` rows caused by new worker for 3 mailboxes | manual / operator | Post-deploy SQL query | manual-only (Plan 74-05 Task 4 checkpoint) |
| Pitfall 4 (replay-id) | Replay does not double-insert `agent_runs` | unit | Re-invoke handler with same `event.id`, assert insert call count == 1 | ❌ Plan 74-04 Task 1 |
| Pitfall 6 (empty categories) | Worker handles `categories.length === 0` gracefully | unit | Mock `loadSwarmCategories` returns `[]`, assert verdict emitted with `predicted_category='unknown'` and no LLM call | ❌ Plan 74-04 Task 1 |
| D-09 (create→PATCH→get_agent) | `model.parameters.response_format` persisted post-PATCH | manual / smoke | Operator runs `mcp__orq__get_agent` and asserts response_format JSON has the schema | manual-only (Plan 74-03 Task 1 STEP 6) |

## Sampling Rate

- **Per task commit:** `cd web && pnpm vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts`
- **Per wave merge:** `cd web && pnpm tsc --noEmit && pnpm vitest run`
- **Phase gate:** Full suite green + manual operator confirmations (REQ-1 Studio JSON Schema, REQ-7 post-deploy 24h queries) before `/gsd-verify-work 74`.

## Wave 0 Gaps

- [ ] `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` — covers REQ-2, REQ-3, REQ-4, REQ-5, REQ-6 (all unit-test rows above) AND Pitfalls 4 + 6
- [ ] `supabase/migrations/{date}_phase74_agent_runs_entity_nullable.sql` — Pitfall 1 fix; required before sales-email LLM tests can pass
- [ ] `supabase/migrations/{date}_phase74_sales_email_seed.sql` — D-17 seed
- [ ] `supabase/migrations/{date}_phase74_stage1_classifier_agent.sql` — `orq_agents` registry row (placeholder slug, `enabled=false`)
- [ ] `web/lib/inngest/events.ts` schema extension — add `swarm_type: string` to BOTH `stage-0/email.received` and `classifier/screen.requested`
- [ ] `web/app/api/inngest/route.ts` (or function-aggregator file) — register `classifierScreenWorker`
- [ ] Lint/grep CI gate — fail build if `swarm_type === 'sales-email'` or `swarm_type === 'debtor-email'` literal appears in `classifier-screen-worker.ts` (REQ-6 acceptance check)

## Phase Gate (must all pass before /gsd-verify-work 74)

1. `cd web && pnpm tsc --noEmit` exits 0
2. `cd web && pnpm vitest run` exits 0 (full suite green)
3. `mcp__orq__get_agent` for `stage-1-category-classifier` returns persisted `model.parameters.response_format` (manual)
4. `select count(*) from swarm_categories where swarm_type='sales-email'` returns exactly 5
5. `grep -E "'(sales|debtor)-email'" web/lib/inngest/functions/classifier-screen-worker.ts` returns nothing in branch conditions
6. Post-deploy 24h: `pipeline_events` shows ≥1 stage='stage-1' row for each of (firecontrol@, SMEBA fire@, +1 sales mailbox)
7. Post-deploy 24h: no `automation_runs.status='failed'` rows attributable to the new worker for the 3 target mailboxes
