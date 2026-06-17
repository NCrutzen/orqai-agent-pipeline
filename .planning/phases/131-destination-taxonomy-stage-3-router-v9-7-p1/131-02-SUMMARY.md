---
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
plan: 02
subsystem: orq-agent
tags: [orq, supabase, registry, json-schema, zod, info-routing, stage-3-router, codegen]

# Dependency graph
requires:
  - phase: 131-01
    provides: routing_destinations registry + DestinationKey codegen (DESTINATION_KEYS_BY_SWARM['info-routing']) + info-routing Stage-3 wiring (agent key set, stage_3_routing held, unknown→coordinator dispatch)
provides:
  - public.orq_agents row for info-routing-coordinator (swarm_type=info-routing, enabled, strict json_schema output_schema, anyOf nullable brand, codegen'd bucket enum) — migration written, apply DEFERRED to operator checkpoint
  - list_models→create-bare→PATCH→get_agent build/verify script (manage-info-routing-coordinator.ts) + Studio json_schema printer
  - closed-list Zod validator (coordinator-schema.ts) — invalid/empty agent output → unrouted outcome, never throws
  - co-located strict Orq response_format json_schema (single-source enum consumed by the build script)
affects: [131-03, stage-3-coordinator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source agent json_schema: the Orq response_format const lives next to the Zod gate in coordinator-schema.ts and is IMPORTED by the build script, so the agent's bucket enum and the Zod bucket enum read the same codegen'd DESTINATION_KEYS — no drift, no hand-written enum in the script"
    - "Router-swarm agent prompt: XML-tagged destination-classifier (bucket+brand+confidence) with an explicit 'choose unrouted rather than guess' constraint and a reserved unrouted bucket"

key-files:
  created:
    - web/lib/automations/info-routing/coordinator-schema.ts
    - web/lib/automations/info-routing/__tests__/info-routing-coordinator-schema.test.ts
    - supabase/migrations/20260617d_phase131_info_routing_coordinator_agent.sql
    - web/scripts/orq/manage-info-routing-coordinator.ts
    - web/scripts/orq/info-routing-coordinator.instructions.md
  modified: []

key-decisions:
  - "The Orq response_format json_schema is exported FROM coordinator-schema.ts (not built inside the manage script), so the agent enum and the Zod enum are the literal same INFO_ROUTING_BUCKET_KEYS = DESTINATION_KEYS_BY_SWARM['info-routing'] — guaranteeing the TS⇄DB⇄Orq three-way agreement with zero hand-written lists"
  - "UNROUTED_OUTCOME is a frozen singleton {unrouted:true} returned on ANY safeParse failure; parseAgentOutputOrUnrouted never throws (ROUTE-03 acceptance). The full unrouted VERDICT (mailbox=null, dedup, etc.) is intentionally left to Plan 03's verdict.ts — this module gates the raw agent output only"
  - "Migration orqai_id is a PLACEHOLDER (PLACEHOLDER_INFO_ROUTING_COORDINATOR_ID) filled from Studio at the Task 3 checkpoint before remote apply; ON CONFLICT (agent_key) DO UPDATE keeps the apply idempotent"

patterns-established:
  - "Co-located single-source response_format: schema module owns BOTH the Zod gate and the Orq json_schema const; the manage script imports the const rather than re-declaring the enum (prevents the classic agent-vs-validator enum drift)"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-06-17
---

# Phase 131 Plan 02: info-routing-coordinator agent + closed-list validator Summary

**The `info-routing-coordinator` Orq agent registration (orq_agents row migration + list_models-first build/verify script + XML-tagged router prompt) and the closed-list Zod validator that collapses any invalid/empty agent output to the unrouted outcome without throwing — the agent's bucket enum and the Zod enum both single-sourced from the Plan-01 codegen. Tasks 1-2 done + committed; Task 3 (Orq build + Studio Response Format + remote migration apply) is a BLOCKING operator checkpoint, deferred to the orchestrator (MCP/Orq tools stripped from this session).**

## Performance

- **Duration:** ~4 min (autonomous portion; Task 3 blocking-human checkpoint pending)
- **Tasks:** 2 of 3 buildable tasks complete + committed; Task 3 is operator-only (Orq + remote apply)
- **Files created:** 5

## Accomplishments

- **Closed-list Zod gate (Task 1, ROUTE-03 / T-131B-01):** `coordinator-schema.ts` exports `infoRoutingAgentOutputSchema` (bucket `z.enum` from the codegen'd `DESTINATION_KEYS_BY_SWARM['info-routing']`, brand `z.enum(['smeba','fire-control','berki']).nullable()`, confidence, reasoning) plus `parseAgentOutputOrUnrouted(raw)` which `safeParse`s and returns the frozen `UNROUTED_OUTCOME` on ANY failure — off-list bucket, missing field, malformed type, null/empty input — **never throws**. 11 unit tests green (valid parse, brand=null, off-list→unrouted, null/empty/missing/malformed→unrouted, plus a single-source assertion that the schema's bucket enum equals the codegen array).
- **orq_agents row (Task 2):** `20260617d` INSERTs the `info-routing-coordinator` row (`swarm_type='info-routing'`, `version='2026-06-17.v1'`, `timeout_ms=90000`, `enabled=true`) with a strict `output_schema` using the Discretion-3 shape — bucket enum = codegen'd `DESTINATION_KEYS`, **brand nullable via `anyOf`** (never the `["string","null"]` shorthand the legacy debtor row uses), single-value literals via enum. `ON CONFLICT (agent_key) DO UPDATE`. orqai_id is a placeholder for the operator.
- **Build/verify script (Task 2, T-131B-02):** `manage-info-routing-coordinator.ts` mirrors `manage-sales-intent-agent.ts`: **list_models FIRST** (validates primary `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0` + all three fallbacks by bare model_id) → **create_agent bare** → **PATCH** full `model.parameters` incl. the strict `response_format` (imported verbatim from `coordinator-schema.ts`) → **get_agent verify** → prints the json_schema for Studio + the agent id to backfill into the migration.
- **Router prompt:** `info-routing-coordinator.instructions.md` — XML-tagged (`<role>`/`<task>`/`<closed_list>`/`<brand>`/`<constraints>`/`<output_format>`/`<examples>`) with the explicit constraint **"choose unrouted rather than guess when no destination clearly applies"** and the reserved `unrouted` bucket.

## Task Commits

1. **Task 1 RED: failing closed-list schema test** — `10481efb` (test)
2. **Task 1 GREEN: coordinator-schema.ts + unrouted fallback** — `d5814f21` (feat)
3. **Task 2: orq_agents row migration + list_models build script + instructions** — `3491896c` (feat)

## Files Created

- `web/lib/automations/info-routing/coordinator-schema.ts` — Zod closed-list gate + `parseAgentOutputOrUnrouted` + co-located strict Orq `response_format` json_schema (single source: `INFO_ROUTING_BUCKET_KEYS = DESTINATION_KEYS_BY_SWARM['info-routing']`)
- `web/lib/automations/info-routing/__tests__/info-routing-coordinator-schema.test.ts` — 11 assertions (valid/null-brand/off-list/empty/malformed/missing + single-source enum equality + full-coverage probe)
- `supabase/migrations/20260617d_phase131_info_routing_coordinator_agent.sql` — orq_agents INSERT, anyOf nullable brand, codegen'd bucket enum, ON CONFLICT DO UPDATE, placeholder orqai_id
- `web/scripts/orq/manage-info-routing-coordinator.ts` — list_models→create-bare→PATCH→get_agent + Studio json_schema printer
- `web/scripts/orq/info-routing-coordinator.instructions.md` — XML-tagged router system prompt

## Decisions Made

- **Single-source response_format.** The Orq `response_format` json_schema const (`INFO_ROUTING_RESPONSE_FORMAT`) is exported from `coordinator-schema.ts` and IMPORTED by the build script rather than re-declared there. This makes the agent's `bucket.enum` and the Zod `bucket` enum the literal same `DESTINATION_KEYS` array — the agent-vs-validator drift class is structurally impossible, not just convention.
- **Unrouted gate scope.** `parseAgentOutputOrUnrouted` returns a minimal `{unrouted:true}` marker, not the full 6-field routing verdict. The verdict builder (resolved mailbox, dedup status, unrouted flag) is Plan 03's `verdict.ts` per the plan's read_first note. This module's one job is to prove the model returned a closed-list destination or fall back.
- **Model + timeout parity.** Primary/fallbacks in the migration `model_config` and the build script match exactly (Haiku 4.5 EU + the three standard fallbacks); `timeout_ms=90000` per 131-PATTERNS §4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc rejected the empty-enum guard as a dead comparison**
- **Found during:** Task 2 (`npx tsc --noEmit` on `manage-info-routing-coordinator.ts`)
- **Issue:** `INFO_ROUTING_BUCKET_KEYS.length === 0` compared a literal type `8` (the codegen array is `as const`, so its length is statically known) against `0` — `error TS2367: This comparison appears to be unintentional because the types '8' and '0' have no overlap`. The empty-enum guard is dead code at the type level, which broke `tsc`.
- **Fix:** Widened the length to `number` (`const bucketCount: number = INFO_ROUTING_BUCKET_KEYS.length`) before the `=== 0` check, preserving the runtime safety assertion (in case the generated file is ever hand-broken) while satisfying the type checker. No behavior change.
- **Files modified:** web/scripts/orq/manage-info-routing-coordinator.ts
- **Verification:** `npx tsc --noEmit` clean on both new info-routing files; schema test still 11/11 green.
- **Committed in:** `3491896c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (blocking). No scope creep — the guard's runtime intent is preserved.

## Known Stubs

- **`orqai_id = 'PLACEHOLDER_INFO_ROUTING_COORDINATOR_ID'`** in `20260617d`. Intentional: the real Orq agent id is produced by the build script at the Task 3 operator checkpoint and filled in before the migration is applied to remote. ON CONFLICT DO UPDATE makes the post-fill re-apply idempotent. Resolved at Task 3 (this plan's blocking checkpoint), not deferred to a future plan.

## Threat Flags

None — no new network endpoints or trust-boundary surface beyond the planned orq_agents row. T-131B-01/02/03 are mitigated as designed (closed-list Zod + strict json_schema enum; list_models-first model validation; anyOf nullable, 0 array-shorthand verified by grep).

## Task 3 — BLOCKING OPERATOR CHECKPOINT (Orq build + remote apply) — PENDING

Tasks 1-2 are code-complete, committed, and locally verified. Task 3 requires Orq.ai + Supabase MCP operations that are NOT available in this executor session (stripped). Deferred to the orchestrator.

**Remaining remote operations (in order):**

1. **Run the build script:** `cd web && npx tsx scripts/orq/manage-info-routing-coordinator.ts --finalize`
   - Validates every model id via list_models, creates the agent bare, PATCHes `model.parameters` incl. the strict `response_format`, `get_agent`-verifies persistence, and prints both the json_schema and the new agent id.
2. **Studio JSON-schema Response Format:** Orq Studio → Tools → Add → JSON Schema → paste the printed schema (name `info-routing-coordinator`); then agent → Model parameters → Response Format dropdown = "JSON Schema" → select it. Confirm the Model dropdown is non-empty (validates model ids persisted).
3. **Backfill orqai_id:** replace `PLACEHOLDER_INFO_ROUTING_COORDINATOR_ID` in `supabase/migrations/20260617d_phase131_info_routing_coordinator_agent.sql` with the real agent id from step 1.
4. **Apply migration to remote** (`mvqjhlxfvtqqubqgdvhz`) via Supabase MCP `apply_migration`: `20260617d_phase131_info_routing_coordinator_agent`.
5. **`npm run check:supabase`** → expect 0 ERROR.
6. **Verify live:** `select agent_key, swarm_type, enabled from public.orq_agents where agent_key='info-routing-coordinator'` returns the enabled info-routing row; a one-shot `invokeOrqAgent('info-routing-coordinator', <sample>)` returns a parseable bucket+brand+confidence within the closed list.

**Resume signal:** "agent created" (with the orqai_id recorded), or describe issues.

## Self-Check: PASSED

All 5 created files verified present on disk; all 3 task commits (`10481efb`, `d5814f21`, `3491896c`) verified in git log. Schema test 11/11 green; tsc clean on both new info-routing files; acceptance grep gates pass (codegen import present, 0 array-shorthand in schema + migration, list_models present, ON CONFLICT DO UPDATE present, create-bare→PATCH→get_agent sequence present).

---
*Phase: 131-destination-taxonomy-stage-3-router-v9-7-p1*
*Completed (Tasks 1-2): 2026-06-17 — Task 3 blocking operator checkpoint pending (Orq build + remote apply, deferred to orchestrator)*
