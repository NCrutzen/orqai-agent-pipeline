---
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
verified: 2026-06-17T08:05:26Z
status: passed
human_items_resolved: 2026-06-17
score: 8/8
overrides_applied: 0
deferred:
  - truth: "Live shadow precision measurement run reports ≥85% overall match-rate"
    addressed_in: "Post-Phase-131 (prerequisite phase — delta-sync-on-info@ + Outlook category capture)"
    evidence: "SPEC §Constraints: 'Hard prerequisite (outside 131): delta-sync must run on the info@ mailboxes … SPEC treats this as a dependency, not a 131 deliverable.' VALIDATION.md Manual-Only table entry: 'Blocked on the delta-sync-on-info@ + Outlook-category prerequisite (outside 131); 0/8000 sampled rows currently carry categories.' Harness self-reports insufficient_sample (graded_n=0) by design."
human_verification:
  - test: "Confirm algemeen@smeba.nl mailbox is verified as an active departmental mailbox"
    expected: "The mailbox exists and actively receives contactformulier mail for smeba brand"
    why_human: "The migration comment explicitly flags: 'NOT in charter §2 verified-mailbox table; OPERATOR CONFIRMS this address at the Task 3 checkpoint before apply.' The migration was applied (orchestrator confirmed) but the verification of the actual mailbox existence requires operator confirmation against the charter §2 source of truth."
  - test: "Confirm Orq Studio JSON-schema Response Format is set on the info-routing-coordinator agent"
    expected: "In Orq Studio, the agent's Model parameters Response Format dropdown shows 'JSON Schema' referencing the info_routing_destination schema resource"
    why_human: "The Orq MCP exposes no tool CRUD. The json_schema Response Format configuration is set manually in Studio. The manage script creates and PATCHes the agent, but Studio-side confirmation that the Response Format dropdown is set (not just the model.parameters in the API response) requires human eyeball. VALIDATION.md Manual-Only: 'Orq MCP exposes no tool CRUD; the json_schema Response Format is set in Studio.'"
---

# Phase 131: Destination Taxonomy + Stage-3 Router — Verification Report

**Phase Goal:** Freeze the destination bucket taxonomy (6-7 actionable buckets + unrouted sentinel) with verified mailboxes; build the info-routing-coordinator Orq agent that classifies a Stage-1-cleared actionable email onto a destination bucket + brand from a closed destination registry (no Stage 2); wire it into the generic Stage-3 coordinator with the ROUTE-07 no-forward held gate, a two-layer dedup guard, and the ROUTE-08 shadow precision harness.

**Verified:** 2026-06-17T08:05:26Z
**Status:** passed (both human-verification items resolved 2026-06-17)
**Re-verification:** No — initial verification

> **Human-verification items resolved (2026-06-17, post-verification gap-closure):**
> 1. `algemeen@smeba.nl` — operator confirmed the mailbox does NOT exist. Design corrected: `algemeen` is now a classified "no-forward / stays in info@" outcome (registry `target_mailbox=NULL` via migration `20260617e`, applied + live-verified; swarm-agnostic `UNROUTED_BUCKET` + `{matched,target_mailbox}` resolver, zero bucket literal). No dead-address risk.
> 2. Orq Studio Response Format — operator configured it; `get_agent` confirms the strict `info_routing_destination` schema is live on primary + all 3 fallbacks (agent v1.1.4). Agent instructions also strengthened (read body; contactformulier can be `verkoop`; `algemeen` only as true rest) — repo file == live.
> Full suite after gap-closure: 2825 passed, tsc clean, no codegen drift.

---

## Goal Achievement

### Observable Truths (ROUTE-01 through ROUTE-08)

| # | Requirement | Truth | Status | Evidence |
|---|-------------|-------|--------|----------|
| 1 | ROUTE-01 | Destination taxonomy frozen as registry data | VERIFIED | `public.routing_destinations` table exists with 12 rows (8 destination_key values: 7 actionable + unrouted sentinel). No hardcoded bucket list — `DESTINATION_KEYS_BY_SWARM` is codegen-generated. `grep -rn "swarm_type === 'info-routing'"` returns only a comment in `actionable-tokens.ts`, zero code branches. |
| 2 | ROUTE-02 | Brand-aware (bucket × brand) → mailbox mapping | VERIFIED | `resolveRoutingDestination` in `registry.ts` (lines 152-169) implements 3-tier resolution: exact match → single-tenant fallback → null. CR-02 bug fixed: `resolveRoutingDestination` now returns the sole-row mailbox for null-brand single-tenant buckets. Test `routing-resolve.test.ts` asserts the cross-brand case (inspecties × fire-control → planning@fire-control.nl, not smeba). |
| 3 | ROUTE-03 | Stage-3 destination coordinator agent built | VERIFIED | `info-routing-coordinator` Orq agent registered in `public.orq_agents` (id: 01KVA6BAVS6QWJBHQVENB74R8S, enabled, Haiku-EU primary + 3 fallbacks). `coordinator-schema.ts` exports `infoRoutingAgentOutputSchema` (closed-list Zod gate) + `parseAgentOutputOrUnrouted` (never throws) + `unroutedFromError` (CR-01 fix). `swarms.stage3_coordinator_agent_key='info-routing-coordinator'`. |
| 4 | ROUTE-04 | Rich persisted destination verdict — all 6 fields | VERIFIED | `verdict.ts` `buildRoutingVerdict` returns `{bucket, brand, target_mailbox, confidence, dedup:{status,matched_layer}, unrouted, routing_version}`. Coordinator persists to `coordinator_runs.decision_details.routing` + TELE-01 dual-write via `emitPipelineEvent`. Test `coordinator-routing-verdict.test.ts` asserts all 6 fields on the persisted patch. |
| 5 | ROUTE-05 | Duplicate-delivery guard — both layers | VERIFIED | `dedup.ts` implements layer (a) To/CC match (`extractRecipientAddresses` on `raw_json.toRecipients/ccRecipients`) and layer (b) cross-mailbox `internet_message_id`/`conversation_id` match (DB read, graceful skip for non-ingested targets). Tests in `routing-dedup.test.ts` assert `already_addressed/to_cc`, `already_addressed/message_id`, `already_addressed/conversation`, and `routable` for non-duplicate. |
| 6 | ROUTE-06 | Unrouted bucket for low-confidence / no-match | VERIFIED | `buildRoutingVerdict` produces `{bucket:'unrouted', brand:null, target_mailbox:null, unrouted:true}` for 3 cases: `parsed.unrouted=true` (invalid agent output), `CONFIDENCE_NUMERIC[confidence] < threshold`, and no active registry row match. Test `routing-unrouted.test.ts` covers all 3 cases including ambiguous-input scenario. Queryable via `coordinator_runs.decision_details->routing->>'bucket' = 'unrouted'`. |
| 7 | ROUTE-07 | Verdict-only scope — no forward, no Stage 2 | VERIFIED | The routing capability block (`debtor-email-coordinator.ts` lines 252-453) ends with `return { run_id, email_id, decision: "predicted_held" }` when `isStage3RoutingGated=true`. No Outlook forward/send/move call exists in `info-routing/` or the routing path. Stage-2 entity resolver not invoked (no `resolveEntity` call; `stage2_entity_resolver` stays NULL in migrations). `inngest.send` call for `pipeline/predicted` is guarded by `if (!routingGatedForRouting)` — currently unreachable since `stage_3_routing=true`. |
| 8 | ROUTE-08 | Shadow precision measurement harness | VERIFIED | `info-routing-precision-shadow.ts` ships with: `computeMatchRate` (per-bucket + overall), `gradeVerdict` with `MIN_GRADED_N=50` false-success guard, `MATCH_RATE_GATE=0.85`, `COORDINATOR_RUNS_SELECT` selecting only real columns (WR-05 fix), `mapRowToShadow` (human_category=null until prerequisite lands → `insufficient_sample`). Unit tests in `scripts/eval/__tests__/info-routing-precision-shadow.test.ts` cover pure functions. Live measurement is prerequisite-gated (see Deferred Items). |

**Score:** 8/8 truths verified

---

### Deferred Items

Items not yet met but explicitly addressed in a later milestone phase or a stated prerequisite outside Phase 131.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Live ROUTE-08 precision run ≥85% overall match-rate | Post-Phase-131 prerequisite | SPEC §Constraints: "Hard prerequisite (outside 131): delta-sync must run on the info@ mailboxes … SPEC treats this as a dependency, not a 131 deliverable." Harness reports `insufficient_sample` (graded_n=0) by design when the prerequisite is absent — the false-success guard works correctly. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260617_phase131_routing_destinations.sql` | routing_destinations table + RLS + frozen seed | VERIFIED | CREATE TABLE, ENABLE ROW LEVEL SECURITY, `routing_destinations_service_all` (service_role FOR ALL), `routing_destinations_auth_select` (authenticated FOR SELECT), no anon policy. 12 seed rows (8 distinct destination_key values). UNIQUE (swarm_type, destination_key, brand). ON CONFLICT idempotent. |
| `supabase/migrations/20260617b_phase131_info_routing_stage3_wiring.sql` | swarms UPDATE: agent key + stage_3_routing held + threshold | VERIFIED | Sets `stage3_coordinator_agent_key='info-routing-coordinator'`, `dry_run_config \|\| jsonb_build_object('stage_3_routing', true)` (jsonb merge, not overwrite), `resolution_config \|\| jsonb_build_object('routing_unrouted_threshold', 0.6)`. Scoped to `WHERE swarm_type='info-routing'`. |
| `supabase/migrations/20260617c_phase131_info_routing_unknown_dispatch.sql` | Flip unknown noise row to swarm_dispatch | VERIFIED | Sets `action='swarm_dispatch'`, `swarm_dispatch='pipeline/coordinator.requested'` WHERE `swarm_type='info-routing' AND category_key='unknown'`. Hard-separation honored: row stays in `swarm_noise_categories`. |
| `supabase/migrations/20260617d_phase131_info_routing_coordinator_agent.sql` | orq_agents row for info-routing-coordinator | VERIFIED | Inserts `agent_key='info-routing-coordinator'`, `orqai_id='01KVA6BAVS6QWJBHQVENB74R8S'`, `enabled=true`, 8-bucket output_schema with anyOf-nullable brand. ON CONFLICT idempotent. |
| `web/lib/automations/info-routing/coordinator-schema.ts` | Closed-list Zod gate + Orq json_schema | VERIFIED | Exports `infoRoutingAgentOutputSchema`, `parseAgentOutputOrUnrouted` (never throws), `unroutedFromError` (CR-01 fix), `INFO_ROUTING_OUTPUT_JSON_SCHEMA`, `INFO_ROUTING_RESPONSE_FORMAT`. Bucket enum sourced from codegen, not hardcoded. brand nullable via `anyOf` per CLAUDE.md learning 3970bad9. |
| `web/lib/automations/info-routing/verdict.ts` | 6-field routing verdict builder | VERIFIED | `buildRoutingVerdict` returns all 6 required fields. `ROUTING_VERSION` stamp. Three unrouted gates implemented. Pure/IO-free. |
| `web/lib/automations/info-routing/dedup.ts` | Two-layer dedup guard | VERIFIED | Layer (a) `extractRecipientAddresses` from raw_json. Layer (b) cross-mailbox message-id/conversation-id match with graceful non-ingested skip. `normalizeMessageId` strips `<>` brackets, lowercases. |
| `web/lib/swarms/registry.ts` | loadRoutingDestinations + resolveRoutingDestination | VERIFIED | `loadRoutingDestinations` clones loadSwarmIntents TTL+last-known-good pattern, ROUTING_DEST_CACHE. `resolveRoutingDestination` 3-tier resolution with CR-02 fix. |
| `web/lib/swarms/routing-destinations.generated.ts` | Codegen-generated bucket enum | VERIFIED | Emits `DESTINATION_KEYS_BY_SWARM["info-routing"]` = 8 keys (alphabetical). DO-NOT-EDIT header. |
| `web/scripts/gen-routing-destinations.ts` | Codegen script | VERIFIED | Reads `routing_destinations` active rows, groups by swarm_type, emits generated file, skip-if-identical, alphabetical sort. |
| `web/scripts/eval/info-routing-precision-shadow.ts` | ROUTE-08 shadow harness | VERIFIED | Pure functions: `computeMatchRate`, `gradeVerdict` with MIN_GRADED_N=50 false-success guard and MATCH_RATE_GATE=0.85. WR-05 fix: selects only `COORDINATOR_RUNS_SELECT="decision_details"`, human_category=null until prerequisite. Shadow-only (no DB writes). |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` | Routing capability block wired | VERIFIED | `loadRoutingDestinations` imported and called. Routing block (`if (routingDestinations.length > 0)`) implements: classify-routing with CR-01 try/catch, load-routing-threshold, check-duplicate-delivery, buildRoutingVerdict, persist-routing-verdict (+ TELE-01), load-stage3-routing-gate-routing, mark-routing-verdict-held. Returns `predicted_held` when gated. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `registry.ts` | `routing_destinations` (DB) | `from("routing_destinations").select(...).eq("swarm_type"...).eq("active", true)` | WIRED | Lines 119-124 of registry.ts |
| `web/package.json` | `gen-routing-destinations.ts` | `codegen` npm script | WIRED | Line 15: `"codegen": "tsx scripts/gen-entity-types.ts && ... && tsx scripts/gen-routing-destinations.ts"` |
| `coordinator-schema.ts` | `routing-destinations.generated.ts` | `import { DESTINATION_KEYS_BY_SWARM }` | WIRED | Line 22: direct named import feeds BUCKET_ENUM for Zod schema and INFO_ROUTING_OUTPUT_JSON_SCHEMA |
| `debtor-email-coordinator.ts` | routing capability block | `if (routingDestinations.length > 0)` | WIRED | Lines 252-453: the entire routing capability fires iff the swarm has registry rows — no swarm_type literal |
| `debtor-email-coordinator.ts` | `isStage3RoutingGated` | `dry_run_config.stage_3_routing` | WIRED | Lines 397-418: ROUTE-07 held gate; `stage_3_routing=true` → `predicted_held`, no `pipeline/predicted` emit |
| `swarm_noise_categories(unknown)` | `pipeline/coordinator.requested` | `action='swarm_dispatch', swarm_dispatch=...` | WIRED | Migration 20260617c: flip makes info-routing Stage-1 unknown fall-through dispatch the coordinator fan-in event |
| `orq_agents` row | Orq cloud agent | `orqai_id='01KVA6BAVS6QWJBHQVENB74R8S'` | WIRED (DB confirmed by orchestrator) | orq_agents row enabled=true; agent confirmed live by orchestrator |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `verdict.ts` `buildRoutingVerdict` | `destinations: RoutingDestinationRow[]` | `loadRoutingDestinations` from `routing_destinations` DB table (12 live rows, orchestrator-confirmed) | Yes | FLOWING |
| `debtor-email-coordinator.ts` routing block | `routingDestinations` | `step.run("load-routing-destinations", () => loadRoutingDestinations(...))` | Yes | FLOWING |
| `info-routing-precision-shadow.ts` report mode | `rawRows` from `coordinator_runs` | `admin.from("coordinator_runs").select(COORDINATOR_RUNS_SELECT).eq("swarm_type", SWARM).not(...)` | Yes (real columns only after WR-05 fix) | FLOWING |
| `info-routing-precision-shadow.ts` report mode | `human_category` | Not yet wired — `mapRowToShadow` returns `null` for all rows (prerequisite absent) | No — by design (graded_n=0 → insufficient_sample) | STATIC by design, guarded by false-success gate |

---

### Behavioral Spot-Checks

Step 7b: Skipped for the coordinator Inngest function (requires Inngest runtime). The test suite provides equivalent behavioral coverage — `coordinator-routing-verdict.test.ts` runs the full handler with mocked steps.

For the shadow harness (runnable script), a live run is prerequisite-gated. The pure-function unit test suite provides full behavioral coverage of `computeMatchRate`, `gradeVerdict`, and `mapRowToShadow`.

---

### Requirements Coverage (Phase-local ROUTE-0x)

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| ROUTE-01 | Destination taxonomy frozen as registry data; no hardcoded bucket list | SATISFIED | `routing_destinations` table with 8 keys; codegen-generated enum; zero `swarm_type==='info-routing'` code branches |
| ROUTE-02 | Brand-aware (bucket × brand) → mailbox mapping | SATISFIED | `resolveRoutingDestination` 3-tier resolution; cross-brand test green; CR-02 null-brand fallback implemented |
| ROUTE-03 | Stage-3 destination coordinator agent | SATISFIED | Orq agent live (01KVA6BAVS6QWJBHQVENB74R8S); `swarms.stage3_coordinator_agent_key` set; Zod closed-list gate; invalid/empty → unrouted (CR-01 fix) |
| ROUTE-04 | Rich persisted destination verdict — 6 fields | SATISFIED | `buildRoutingVerdict` returns all 6 fields; persisted to `coordinator_runs.decision_details.routing`; TELE-01 dual-write |
| ROUTE-05 | Duplicate-delivery guard — both layers | SATISFIED | Layer (a) To/CC pure check; layer (b) cross-mailbox message-id/conversation-id DB match; graceful non-ingested skip |
| ROUTE-06 | Unrouted bucket for low-confidence / no-match | SATISFIED | 3 unrouted gates in `buildRoutingVerdict`; explicit `{bucket:'unrouted', unrouted:true}` shape; queryable |
| ROUTE-07 | Verdict-only scope — no forward, no Stage 2 | SATISFIED | `stage_3_routing=true` held gate; no Outlook forward/move call reachable; `stage2_entity_resolver` stays NULL |
| ROUTE-08 | Shadow precision measurement harness | SATISFIED (build) | Harness ships with false-success guard; pure-fn tests green; live run deferred on prerequisite (documented, by design) |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `coordinator-schema.ts` | 39-43 | `INFO_ROUTING_BUCKET_KEYS.length === 0` degrades silently to `["unrouted"]` enum instead of throwing | Info (IN-01 from REVIEW) | Broken codegen produces silent global-unrouted instead of loud load-time error; CI codegen gate mitigates |
| `dedup.ts` | 158 | `.ilike("mailbox", normalizedTarget)` — ILIKE is semantically wrong for exact address match; `_` acts as wildcard | Info (WR-04 from REVIEW) | Low risk today (registry-controlled addresses have no `_`); could widen match if address naming changes |
| `debtor-email-coordinator.ts` | 370-416 | `decision_details` whole-object overwrite on persist-routing-verdict + mark-routing-verdict-held | Info (WR-01 from REVIEW, pre-existing Phase 113) | The routing path re-spreads `verdict` in the held marker so no actual data loss today; the pre-existing intent path has a latent data-loss bug — out of scope for Phase 131 |

No `TBD`, `FIXME`, or `XXX` debt markers found in any Phase 131 file.

---

### Human Verification Required

#### 1. Confirm algemeen@smeba.nl mailbox

**Test:** Contact the operator / verify against `docs/routing-swarm-milestone-charter.md` §2 that `algemeen@smeba.nl` is a real, active departmental mailbox that receives contactformulier mail for the smeba brand.

**Expected:** The mailbox exists, is monitored, and is the correct landing address for the `algemeen/contactformulier` destination bucket for the smeba brand.

**Why human:** The migration comment explicitly flags this address as "NOT in charter §2's verified-mailbox table" and specifies operator confirmation at the Task 3 checkpoint before apply. The migration was applied (orchestrator confirmed), but the mailbox existence itself is an operator fact — not verifiable from code. If the address is wrong, the `algemeen` bucket will route to a dead or wrong mailbox; Phase 132's forwarding would forward to it without further checks.

#### 2. Confirm Orq Studio JSON-schema Response Format setting

**Test:** Open Orq Studio, navigate to the `info-routing-coordinator` agent, open Model Parameters, verify the Response Format dropdown shows "JSON Schema" and the selected schema is `info_routing_destination`.

**Expected:** Response Format is set to JSON Schema referencing the correct schema resource (not just configured via API `model.parameters` but also set in the Studio UI dropdown).

**Why human:** The CLAUDE.md Orq pattern (learning cba7352b) notes that `create_agent` drops `response_format` silently and `update_agent` persists it — the manage script does `create-bare` then PATCH. The API-level `get_agent` response can show the correct `model.parameters.response_format` even when the Studio dropdown is not set (Studio renders independently). A broken Studio state could allow the Response Format dropdown to show empty and block the JSON Schema tool from activating. This needs eyeball verification in Studio.

---

### Gaps Summary

No blocking gaps found. All 8 ROUTE-0x requirements are verified by codebase evidence:

- ROUTE-01: Registry table exists, codegen-sourced enum, zero hardcoded branch
- ROUTE-02: `resolveRoutingDestination` 3-tier resolution with CR-02 null-brand fix; cross-brand test green
- ROUTE-03: Orq agent live; Zod closed-list gate; CR-01 try/catch ensures never-crash
- ROUTE-04: 6-field verdict persisted to `coordinator_runs.decision_details.routing` + TELE-01
- ROUTE-05: Both dedup layers implemented and tested
- ROUTE-06: 3 unrouted gates; explicit unrouted shape; queryable
- ROUTE-07: `stage_3_routing=true` held; no Outlook forward reachable; Stage-2 not invoked
- ROUTE-08: Harness built with false-success guard; live measurement deferred on prerequisite (by design, documented)

Two human verification items remain (see above). The phase goal is substantively achieved in code; the human checks are confirmatory, not blocking on architecture.

---

_Verified: 2026-06-17T08:05:26Z_
_Verifier: Claude (gsd-verifier)_
_Depth: goal-backward, per-requirement (ROUTE-01..08), 4-level artifact check_
