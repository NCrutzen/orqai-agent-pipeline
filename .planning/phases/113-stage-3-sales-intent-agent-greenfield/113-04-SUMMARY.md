---
phase: 113-stage-3-sales-intent-agent-greenfield
plan: 04
subsystem: stage-3-vocabulary-seed + orq-agent-finalize
tags: [stage-3, swarm-intents, vocabulary-seed, hard-separation, dead-letter-guard, codegen, orq-agent, sales-email, 3-way-invariant]
status: complete
requires:
  - public.swarm_intents (Phase 68 registry — RLS-enabled, sales rows previously empty)
  - 113-03-SUMMARY.md promoted_intents yaml block (operator-promoted vocabulary, 2026-06-09)
  - web/scripts/gen-intent-types.ts (codegen reads swarm_intents post-apply)
  - web/scripts/orq/manage-sales-intent-agent.ts (Plan 03 — buildResponseFormat from codegen enum)
  - sales-intent-agent (live Orq agent, Smeba sales mails project)
provides:
  - 12 operator-promoted sales intents + mandatory 'other' residual seeded into swarm_intents (all placeholder)
  - regenerated intent.generated.ts with the sales-email key populated (13 values)
  - sales-intent-agent json_schema intent enum finalized to the 13 promoted values
  - the 3-way enum invariant closed: registry ⇄ TS ⇄ Orq json_schema
  - hard-separation + other-routes guard tests
affects:
  - Plan 05 (consumes the seeded vocabulary; agent now returns only routable intents)
  - V11.0 Stage 4 handlers (each placeholder intent flips to 'registered' when a handler lands)
tech-stack:
  added: []
  patterns:
    - registry-as-source-of-truth seed → codegen → agent json_schema (3-way invariant)
    - mandatory 'other' residual so the dispatcher placeholder branch routes to Kanban, never throws
    - hard-separation guard parses the migration file + a noise-key fixture (∅ intersection)
    - current-date migration prefix (20260609b) to order after existing 20260609_* migrations
key-files:
  created:
    - supabase/migrations/20260609b_phase113_sales_swarm_intents.sql
    - web/lib/inngest/functions/__tests__/sales-hard-separation.test.ts
    - web/lib/inngest/functions/__tests__/sales-other-routes.test.ts
  modified:
    - web/lib/automations/debtor-email/coordinator/intent.generated.ts
decisions:
  - "migration renamed from the plan's 20260605 prefix to 20260609b — the 20260605* slots were already taken by attachment migrations; 20260609b orders after 20260609_email_attachments_grants_fix.sql"
  - "promoted vocabulary sourced from the 113-03-SUMMARY.md promoted_intents yaml block (non-empty after operator promotion 2026-06-09); the DB-fallback path was NOT needed"
  - "live sales-intent-agent response_format was {type:text} (not the bootstrap [other] enum the live-note assumed); PATCH overwrote it to the 13-value strict json_schema regardless"
  - "agent finalized via a direct PATCH+get-verify (the script's create-first flow 400s on the project-path lookup for the already-existing agent; PATCH path is what mutates the live agent)"
metrics:
  duration: 7m
  completed: 2026-06-09
---

# Phase 113 Plan 04: Stage 3 Sales Vocabulary Seed + Agent Finalize Summary

Materialized the operator-promoted sales Stage 3 vocabulary as ONE atomic migration (12 intents + the mandatory `other` residual, all `handler_status='placeholder'`), applied it to the remote DB, regenerated `intent.generated.ts`, and re-PATCHed the live `sales-intent-agent` json_schema so its `intent` enum mirrors the seeded registry. The 3-way enum invariant (registry ⇄ TS literal-union ⇄ Orq json_schema) is now closed, hard separation against the 13 sales noise keys is test-guarded, and the residual bucket routes to the Kanban human-lane instead of dead-lettering.

## What Was Built

### Task 1 — seed migration + guard tests (commit `92a35892`)

- **`20260609b_phase113_sales_swarm_intents.sql`** — single idempotent migration. INSERTs 13 rows for `swarm_type='sales-email'`: the 12 operator-promoted intents (`quote_request`, `quote_acceptance`, `quote_rejection`, `purchase_order`, `order_status`, `service_request`, `billing_dispute`, `documentation_request`, `complaint`, `contract`, `portal_access`, `product_question`) plus the mandatory `other` residual (STAGE3-03 dead-letter guard). `handler_agent_key=null`, `handler_event='sales-email/<intent>.requested'`, `requires_orchestration=false`; `on conflict (swarm_type, intent_key) do nothing`. A final `update … set handler_status='placeholder'` marks all sales intents handler-less (no Stage 4 handlers until V11.0). No new table → no RLS block (swarm_intents already RLS-enabled). Header documents the yaml source + the ~80% coverage threshold (D-02) + the hard-separation lock.
- **`sales-hard-separation.test.ts`** — parses the migration's `('sales-email', '<key>'` rows and asserts ∅ intersection (both directions) with a fixture of the 13 sales `swarm_noise_categories` keys (the 8 Phase-84 AP-noise keys + the 5 generic Stage 1 noise keys). Also asserts the seed is non-trivial and contains `other`.
- **`sales-other-routes.test.ts`** — drives the real `stage3Dispatcher` with a registry fixture containing `('sales-email','other',placeholder)`. Asserts it resolves to the placeholder branch (Kanban `automation_runs` insert with `kanban_reason='no_handler'`, `agent_runs.status='routed_human_queue'`) and does NOT throw. A second case proves the dispatcher throws `no swarm_intents row` ONLY when `other` is absent — exactly what the seed prevents.

### Task 2 — remote apply + codegen + agent finalize (commit `d802e54d`)

The atomic D-04 close (operator-authorized production write):

1. **Remote apply** — `20260609b_phase113_sales_swarm_intents.sql` applied to project `mvqjhlxfvtqqubqgdvhz` via the Management API (`POST /v1/projects/.../database/query`, **HTTP 201**). Verified: 13 sales rows, all `handler_status='placeholder'`, including `other`.
2. **Codegen** — `npm run codegen` read the now-seeded rows and wrote `intent.generated.ts` (27 total intent rows = debtor's 14 + sales' 13); the `"sales-email"` key is now `[billing_dispute, complaint, contract, documentation_request, order_status, other, portal_access, product_question, purchase_order, quote_acceptance, quote_rejection, quote_request, service_request]`.
3. **Agent finalize** — the live `sales-intent-agent` json_schema `response_format` re-PATCHed (Haiku 4.5 EU, temp 0, max_tokens 1000, the 3-model fallback chain + retry under `model`) so the `intent` enum equals the 13 seeded values. Verified via `get_agent`: `rf.type=json_schema`, enum length 13, model id intact.
4. **Atomic commit** — the regenerated `intent.generated.ts` committed (the migration landed in Task 1's commit).

## Verification

- `npx vitest run …sales-hard-separation.test.ts …sales-other-routes.test.ts` → **5 tests green**.
- `npx tsc --noEmit` → **0 errors** with the 13-value enum flowing in.
- Remote `swarm_intents` for `sales-email` → **13 rows, all placeholder, incl. `other`**.
- `get_agent sales-intent-agent` → json_schema `intent` enum = the 13 seeded keys (length 13).
- `npm run codegen && git diff --exit-code` post-commit → **exit 0 (no drift)** — registry, TS, and json_schema agree.
- `npm run check:supabase` → **0 ERROR** (6 WARN, 23 INFO).
- `git diff --exit-code web/lib/inngest/functions/stage-3-dispatcher.ts` → **exit 0 (dispatcher untouched)**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration filename prefix collision + agent finalize path**
- **Found during:** Task 1 (filename) + Task 2 (finalize).
- **Issue (a):** The plan's pre-named `20260605_phase113_sales_swarm_intents.sql` prefix was already consumed by four attachment migrations (`20260605`, `20260605b/c/d`) and would order OUT of sequence. **Fix:** renamed to `20260609b_phase113_sales_swarm_intents.sql` — current-date prefix, orders after `20260609_email_attachments_grants_fix.sql`. The codegen/dispatcher coupling is content-based (intent_keys), not filename-based, so no downstream reference broke.
- **Issue (b):** `manage-sales-intent-agent.ts --finalize` runs create→PATCH→verify, but the `sales-intent-agent` ALREADY EXISTS; its create step returned **HTTP 400 "Project Smeba sales mails not found in your workspace"** (a project-path lookup failure on the existing agent), which the script treats as fatal before reaching the PATCH. **Fix:** ran the PATCH+get-verify directly (same body the script's `createPatchVerify` builds — `buildResponseFormat` from the codegen'd enum) against the existing agent. The throwaway helper was deleted after a successful verify; no repo artifact left behind. The persisted result is identical to what `--finalize` would write.
- **Files modified:** migration filename only (Issue a); no source change (Issue b).
- **Commits:** `92a35892` (Task 1), `d802e54d` (Task 2).

### Live-state correction

- The live `sales-intent-agent` `response_format` was `{"type":"text"}` at the start of this plan — NOT the bootstrap `["other"]` json_schema enum the prompt's live-state note assumed. The PATCH overwrote it to the full 13-value strict json_schema regardless, so the end state is correct either way.

## Threat Flags

None beyond the planned `<threat_model>`. T-113-05 (out-of-enum / noise-key leakage) mitigated — hard-separation test + codegen no-drift + agent re-PATCH from the seeded registry. T-113-08 (missing `other` → dispatcher throw) mitigated — `other` seeded placeholder + the other-routes test proves the Kanban landing. T-113-09 (unauthorized remote write) — operator-authorized, applied via Management API, `check:supabase` 0 ERROR post-apply. T-113-SC (seed integrity) — `on conflict do nothing`, only `swarm_intents` touched (noise registry untouched). No new network endpoint, auth path, or schema migration (no new table).

## Self-Check: PASSED

- `supabase/migrations/20260609b_phase113_sales_swarm_intents.sql` — FOUND.
- `web/lib/inngest/functions/__tests__/sales-hard-separation.test.ts` — FOUND.
- `web/lib/inngest/functions/__tests__/sales-other-routes.test.ts` — FOUND.
- `web/lib/automations/debtor-email/coordinator/intent.generated.ts` (sales-email key) — FOUND.
- Commit `92a35892` — present. Commit `d802e54d` — present.
- Remote swarm_intents=13, agent enum=13, codegen no-drift, check:supabase 0 ERROR, tsc clean — all verified above.

## Commits

- `92a35892` feat(113-04): seed promoted sales swarm_intents + hard-separation & other-routes guards
- `d802e54d` feat(113-04): regen intent.generated.ts with seeded sales-email enum (3-way invariant closed)
