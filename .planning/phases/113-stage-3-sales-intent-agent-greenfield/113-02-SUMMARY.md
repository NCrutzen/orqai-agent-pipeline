---
phase: 113-stage-3-sales-intent-agent-greenfield
plan: 02
subsystem: shared-coordinator/stage-3-dispatch
tags: [stage-3, q1-seam, coordinator, registry-driven, sales-email, attachment-fold, swarm-agnostic]
requires:
  - debtor-email/coordinator/types.ts (intentAgentOutputSchemaAny — debtor V2/V3 union)
  - sales-email/coordinator/types.ts (salesIntentOutputSchema — Plan 01)
  - sales-email/coordinator/invoke-intent.ts (InvokeSalesIntentInput — Plan 01)
  - swarms.stage3_coordinator_agent_key (registry column, live on remote)
  - email_pipeline.email_attachments (Phase 116 — extracted_text)
provides:
  - invokeIntentAgent parameterized with { agent_key, schema } (default debtor — byte-neutral)
  - INTENT_SCHEMA_BY_SWARM swarm-keyed output-schema map + intentSchemaForSwarm() fail-safe lookup
  - coordinator dispatch by registry agent key + schema map (zero literal swarm branch)
  - sales-email/coordinator/assemble-input (re-export of debtor 8k-cap assembler)
  - sales-email/retro/reconstruct-input with byte-comparable Phase 116 attachment fold
affects:
  - Plan 03 (seeds swarm_intents for sales; retro reconstruct feeds discovery)
  - Plan 04 (retro loop consumes reconstructInput)
  - any third swarm onboards via a schema-map entry + a registry row, zero coordinator edits
tech-stack:
  added: []
  patterns:
    - per-swarm classifier dispatch realized as registry agent-key + swarm-keyed schema-map lookup (Phase 110 D-07), never a literal swarm branch
    - additive parameterization (default-preserving) keeps the live debtor path byte-neutral
    - swarm schema imported by a registry file under the debtor coordinator path, not by the coordinator (coordinator names no swarm)
    - retro attachment fold replicates the live Stage 2 delimiter byte-for-byte (Pitfall 4)
    - re-export over copy for the swarm-agnostic 8k-cap assembler (drift-free)
key-files:
  created:
    - web/lib/automations/debtor-email/coordinator/intent-schema-registry.ts
    - web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-agent-key.test.ts
    - web/lib/inngest/functions/__tests__/coordinator-agent-key-dispatch.test.ts
    - web/lib/automations/sales-email/coordinator/assemble-input.ts
    - web/lib/automations/sales-email/retro/reconstruct-input.ts
    - web/lib/automations/sales-email/retro/__tests__/reconstruct-input.test.ts
  modified:
    - web/lib/automations/debtor-email/coordinator/invoke-intent.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
decisions:
  - "agent key read from swarms.stage3_coordinator_agent_key inside step.run('load-swarm-agent-key') with a debtor-intent-agent fail-safe; schema looked up by swarm_type from INTENT_SCHEMA_BY_SWARM with a debtor-schema fail-safe"
  - "debtor schema-map entry is intentAgentOutputSchemaAny (V2/V3 discriminated union) so the coordinator passes ONE schema for the whole invoke; the debtor invoke's own intent_version-sniffing default is only exercised when no schema option is passed"
  - "Group A/B invoke-parameterization tests split into a separate file (real invoke) because the coordinator test mocks invokeIntentAgent in the same module scope"
  - "coordinator C/D schema assertions are behavioural (safeParse accepts own swarm, rejects other) — vi.resetModules duplicates the schema-registry module so reference identity is unreliable"
  - "entity_relationship persisted into pipeline_events.decision_details via a `!= null` guard (additive JSONB, swarm-agnostic, no migration)"
  - "sales retro carries no brand entity into Stage 3 (no MAILBOX_ENTITY_MAP); InvokeSalesIntentInput has no entity field"
metrics:
  duration: 9m
  completed: 2026-06-09
---

# Phase 113 Plan 02: Stage 3 Coordinator Q1 Seam + Sales Retro Reconstruct Summary

Resolved the load-bearing Q1 seam: the shared Stage 3 coordinator now dispatches to the correct per-swarm Orq agent via a SINGLE parameterized invoke — agent key read from `swarms.stage3_coordinator_agent_key`, output schema looked up from a swarm-keyed map — with **zero** `swarm_type === 'sales-email'` literal, the dispatcher byte-unchanged, and debtor runtime behavior byte-neutral. Plus the sales retro `reconstruct-input.ts` that folds extracted attachment text into the body byte-for-byte the way live Stage 2 does (Pitfall 4).

## What Was Built

### Task 1 — Q1 seam (commit `90a51a28`)
- **`invoke-intent.ts`** — additive `agent_key?` (default `"debtor-intent-agent"`) + `schema?` (default the debtor V2/V3 intent_version-sniffing gate) options on `InvokeIntentOptions`. The fetch URL interpolates the per-call key; the Zod gate uses the passed schema when present. Existing debtor callers pass neither → IDENTICAL URL + IDENTICAL gate (byte-neutral). `ORQ_ENDPOINT`, `TIMEOUT_MS=45_000`, fence-strip, `sortKeys`, usage forwarding all unchanged.
- **`intent-schema-registry.ts`** (NEW, under the shared debtor coordinator path — Pitfall 3) — `INTENT_SCHEMA_BY_SWARM` map: `debtor-email → intentAgentOutputSchemaAny`, `sales-email → salesIntentOutputSchema`, plus `intentSchemaForSwarm()` with a debtor-schema fail-safe. The sales schema is imported HERE, keeping the coordinator free of any sales import/literal.
- **`debtor-email-coordinator.ts`** — after `swarm_type` derivation: `step.run("load-swarm-agent-key")` reads `loadSwarm(swarm_type).stage3_coordinator_agent_key` (fail-safe `"debtor-intent-agent"`); `intentSchemaForSwarm(swarm_type)` resolves the schema; the single `invokeIntentAgent(input, { agent_key, schema })` call dispatches per-swarm with no second code path. `entity_relationship` persisted into `pipeline_events.decision_details` via a `!= null` guard (additive). No `if (swarm_type === ...)`, no `invokeSalesIntentAgent` import.
- Tests: `coordinator-agent-key-dispatch.test.ts` (coordinator C/D resolution + E source-guard) and `invoke-intent-agent-key.test.ts` (real-invoke URL + gate swap). Updated `debtor-email-coordinator.test.ts` to mock `loadSwarm`.

### Task 2 — sales assemble-input (commit `b8f71183`)
- **`sales-email/coordinator/assemble-input.ts`** — re-exports `assembleInput` + types from the debtor coordinator and exports `STAGE_3_INPUT_CAP_CHARS = 8000`. No duplicated truncation logic; tenantDomains sourced by the caller.

### Task 3 — sales retro reconstruct (commit `2d164529`)
- **`sales-email/retro/reconstruct-input.ts`** — reads `email_pipeline.emails`, computes `body_full_text ?? body_text ?? ""`, then REPLICATES the live Stage 2 fold (`email_attachments` select → `extraction_status === "extracted" && extracted_text` filter → `"\n\n"` join → exact `--- ATTACHMENTS (UNTRUSTED DATA …` delimiter) so the retro body is byte-comparable to live. Feeds the folded body into the sales `assembleInput`; no brand entity; `resolution_status` default `"unresolved"`. Pure (replay-safe). 7 tests incl. the no-attachment byte-comparability case (RED→GREEN).

## Verification

- `npx vitest run lib/inngest/functions/__tests__/coordinator-agent-key-dispatch.test.ts lib/automations/sales-email/ lib/automations/debtor-email/coordinator/__tests__/` → **20 files, 123 tests green**.
- `npx tsc --noEmit` → **0 errors**.
- `grep -c 'sales-email' web/lib/inngest/functions/debtor-email-coordinator.ts` → **0**.
- `grep -c 'invokeSalesIntentAgent' web/lib/inngest/functions/debtor-email-coordinator.ts` → **0**.
- `git diff --exit-code web/lib/inngest/functions/stage-3-dispatcher.ts` → **byte-unchanged**.
- `coordinator-swarm-branch-guard.test.ts` (SWARM-02 static gate) → still **green**.
- Debtor regression suite (`debtor-email-coordinator.test.ts`, invoke-intent v2/v3/usage) → still **green** (debtor byte-neutral proven).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split the invoke-parameterization tests into a second file**
- **Found during:** Task 1 first test run.
- **Issue:** The plan implied all five behaviour groups in `coordinator-agent-key-dispatch.test.ts`, but that file must `vi.mock("@/.../invoke-intent")` to capture the options the coordinator passes (Groups C/D). A module-scoped mock replaces the real `invokeIntentAgent`, so Groups A/B (which need the REAL function to assert the URL + gate swap) could not coexist.
- **Fix:** Moved Groups A/B into `lib/automations/debtor-email/coordinator/__tests__/invoke-intent-agent-key.test.ts` (real invoke, mocked fetch); kept C/D/E in the coordinator file. Same coverage, correct mock boundaries.
- **Files modified:** test files only.
- **Commit:** `90a51a28`.

**2. [Rule 3 - Blocking] Behavioural schema-identity assertions instead of reference `.toBe`**
- **Found during:** Task 1 first test run.
- **Issue:** The coordinator is re-imported under `vi.resetModules()`, so it resolves a FRESH `intent-schema-registry` module instance. A `.toBe` reference compare of the captured schema against this test file's top-level import spuriously failed (two distinct Zod instances, structurally identical).
- **Fix:** Assert the schema BEHAVIOURALLY — it must `safeParse`-accept its own swarm's sample payload and reject the other swarm's. This is the property the seam actually guarantees and is robust against module duplication.
- **Files modified:** `coordinator-agent-key-dispatch.test.ts`.
- **Commit:** `90a51a28`.

**3. [Rule 2 - Critical] Added `loadSwarm` to the existing debtor coordinator test mock**
- **Found during:** Task 1 regression run.
- **Issue:** `debtor-email-coordinator.test.ts` mocks `@/lib/swarms/registry` but did not export `loadSwarm`. After the seam change the coordinator imports `loadSwarm`, so the mock would have resolved it `undefined` and crashed every debtor regression test.
- **Fix:** Added a `loadSwarmMock` returning a debtor row (`stage3_coordinator_agent_key: "debtor-intent-agent"`) so the regression suite stays byte-neutral.
- **Files modified:** `debtor-email-coordinator.test.ts`.
- **Commit:** `90a51a28`.

## Known Stubs

None. The sales intent enum placeholder (`["other"]` until Plan 03 seeds `swarm_intents` + codegen) is inherited from Plan 01 and is the documented cross-plan handoff, not a stub introduced here. The sales retro reconstruct and the schema-map both work correctly with the placeholder enum and will pick up the real enum automatically post-codegen with zero code change.

## Threat Flags

None beyond the planned `<threat_model>`. The attachment fold reuses the exact live UNTRUSTED delimiter (T-113-01 mitigated); the registry agent-key read is service-role + fail-safe (T-113-03 mitigated); the behavior-neutrality + no-literal-branch source guards + dispatcher `git diff --exit-code` prove the seam stayed swarm-agnostic (T-113-06 mitigated). No new network endpoint, auth path, or schema migration.

## Commits

- `90a51a28` feat(113-02): parameterize Stage 3 coordinator dispatch by registry agent key + swarm-keyed schema map
- `b8f71183` feat(113-02): sales coordinator assemble-input re-exports debtor 8k-cap assembler
- `2d164529` feat(113-02): sales retro reconstruct-input with byte-comparable attachment fold

## Self-Check: PASSED

All 6 created files exist; all 3 task commits present in git history.
