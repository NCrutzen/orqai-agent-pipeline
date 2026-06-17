# Phase 131: Destination taxonomy + Stage-3 router — Research

**Researched:** 2026-06-17
**Domain:** Registry-driven Stage-3 routing capability on the canonical agentic pipeline (Supabase registry table + Orq closed-list classifier + Inngest coordinator + dedup + shadow measurement)
**Confidence:** HIGH (live schema confirmed via service-role probes; architecture confirmed against locked RFC + live code)

## Summary

Phase 131 stands up the Stage-3 **routing** capability for the `info-routing` swarm: a brand-aware `public.routing_destinations` registry (bucket × brand → verified mailbox), an Orq `info-routing-coordinator` closed-list classifier, a rich destination verdict persisted on `coordinator_runs.decision_details`, a two-layer duplicate-delivery guard, an `unrouted` outcome, and a shadow precision harness. The phase is verdict-only: no Outlook forward, no Stage 2.

The single most important discovery from live-schema probing is that **D-04's data-source assumption is partially wrong for the rows this router actually classifies.** The `info-routing` ingest path (`source='zapier-info-routing-ingest'`, 47 + 13 rows for info@smeba/info@fire-control) leaves the **top-level `recipients`, `internet_message_id`, and (for some rows) `conversation_id` columns NULL** — the To/CC list and message-id live in `raw_json.toRecipients` / `raw_json.ccRecipients` / `raw_json.internetMessageId` (Microsoft Graph shape). Meanwhile the **layer-(b) target mailbox (`order@smeba.nl`, `source='outlook'`) DOES populate the `internet_message_id` column** (with angle brackets + mixed case). So dedup must read from `raw_json` on the source side and normalize message-ids (strip `<>`, lowercase) before matching against the column on the target side. The verdict logic cannot trust the flat `recipients` column for info-routing rows.

The second key discovery is a **wiring gap, not a wiring reuse**: the generic Stage-3 classifier (`debtor-email-coordinator.ts`, despite its name) fires on `pipeline/coordinator.requested`, which today is emitted **only by `stage-2-customer-resolver.ts`**. info-routing has no Stage 2 (`stage2_entity_resolver=null`), and its Stage-1 `unknown` row currently has `action='manual_review'` (dead-ends — nothing dispatches it onward). This phase must wire info-routing's `unknown` fall-through to emit `pipeline/coordinator.requested` directly (Stage-1 `swarm_dispatch` action), bypassing the absent Stage 2.

**Primary recommendation:** Build routing as a composable capability inside the **existing generic coordinator** (`debtor-email-coordinator.ts`), gated on the presence of a `routing_destinations` row for the swarm — mirroring exactly how `swarms.stage3_coordinator_agent_key` + `intentSchemaForSwarm` + `isStage3RoutingGated` already parameterize that file with zero swarm-name literals. Seed `swarms.dry_run_config.stage_3_routing=true` for info-routing (held; verdict visible, no dispatch) so the verdict persists for Phase 132 without any side effect firing.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New table `public.routing_destinations` — **one row per (bucket × brand)**. Minimum fields: `swarm_type`, `destination_key` (bucket), `brand` (smeba | fire-control | berki), `target_mailbox`, `outlook_category` (the category name used as measurement ground truth), `active` (bool), timestamps. NOT modeled as `swarm_intents` rows (keeps the hard-separation invariant clean) and NOT split into two normalized tables (single denormalized row per bucket×brand is simplest to seed/INSERT-grow). RLS + a service-role policy per CLAUDE.md; registry data (source of truth), grows by INSERT, no `swarm_type` literal in code.
- **D-02:** Reuse the existing Stage-3 persistence path (the debtor/sales pattern); do NOT create a `routing_verdicts` table. The rich 6-field verdict (bucket, brand, resolved mailbox, confidence, dedup status + matching layer, unrouted flag) goes in `coordinator_runs.decision_details`; dual-write `pipeline_events` (TELE-01); flip `agent_runs.status` `classifying→predicted` (race-guarded). Bulk Review (Phase 132) reads `coordinator_runs` for free.
- **D-03:** Routing is an **independent, registry-gated Stage-3 capability** in the **generic coordinator**, NOT a dedicated per-swarm worker and NOT a mutually-exclusive "verdict-only mode". Runs **iff the swarm has `routing_destinations`**, independent of Stage 2 and intents, composable for future verkoop@/debiteuren@ with zero per-swarm code.
- **D-04:** Dedup data source = `email_pipeline.emails` (`recipients` jsonb, `internet_message_id`, `conversation_id`, `mailbox`). Layer (a) always: target mailbox in To/CC. Layer (b) opportunistic: `internet_message_id`/`conversation_id` match where `mailbox=target_mailbox`, only for ingested mailboxes (order@ ingested); graceful skip + log coverage gap otherwise.

> **Research note on D-04:** the *intent* is locked and correct; the *field paths* must be corrected per live data (see Summary + Pitfall 2 + Runtime State Inventory). The planner MUST honor D-04's two-layer design but read from `raw_json.*` for the info-routing source rows.

### Claude's Discretion (resolved below in "Discretion Resolutions")

- Confidence threshold for `unrouted` (per-bucket vs single knob).
- Exact `coordinator_runs.decision_details` JSON shape (naming) for the 6 verdict fields.
- The Orq `info-routing-coordinator` prompt + json_schema (closed-list enforcement of bucket+brand).
- The ROUTE-08 shadow measurement harness shape.

### Deferred Ideas (OUT OF SCOPE)

- Outlook forward side-effect + info-routing Bulk Review surface → **Phase 132**.
- Natural-language routing-config UI + verkoop@→order@ routing → **Phase 133**.
- Reworking the noise registry into the shared-pool-with-adoption model → separate future phase.
- Stage 2 + intents + routing composed on verkoop@/debiteuren@ → later onboarding (the seam is built to support it; do not build it here).
- Ingesting the remaining target mailboxes (full dedup layer-b coverage) → opportunistic, not a 131 blocker.
- The 4 dormant info@ mailboxes (smeba-fire.be, berki.nl, sicli-noord/sud.be) → `info_routing_mailbox_settings.ingest_enabled=false` today; registry-flip later.

## Project Constraints (from CLAUDE.md)

- **Orq.ai:** ALWAYS `response_format` strict `json_schema`; ALWAYS `anyOf` for nullable (`{"anyOf":[{"type":"string"},{"type":"null"}]}`, never `"type":["string","null"]`); `list_models` BEFORE create/update to validate primary + every fallback ID; `create_agent` drops `model.parameters.response_format` silently → create bare then PATCH then verify with `get_agent`; Zod-validate all LLM output; XML-tagged prompts; 45s client timeout (already enforced by `invokeOrqAgent`). Model routing: see catalog rules (no `anthropic/claude-sonnet-4-6` ID exists; Opus 4.6 = `aws/eu.anthropic.claude-opus-4-6-v1`). NEVER direct LLM API keys — Orq Router only.
- **Supabase RLS:** every new table in a PostgREST-exposed schema needs `ENABLE ROW LEVEL SECURITY` + ≥1 explicit policy in the SAME migration. Backend-only → `service_role FOR ALL USING(true) WITH CHECK(true)`. UI-readable → add `authenticated FOR SELECT`. NEVER `TO anon`/`TO public` with `USING(true)`. Use `supabase/migrations/_template.sql`. `npm run check:supabase` (pre-push hook) fails on any ERROR-level advisor lint.
- **Inngest replay-safety:** all side effects in `step.run()`; any non-deterministic value used as a DB key (UUIDs, `Date.now()`) MUST be generated INSIDE `step.run()`; never alias/destructure `inngest.send` (loses `this`-binding) — call inline.
- **Registry-as-source-of-truth (SWARM-02):** zero `if swarm_type==='info-routing'` branches; new destination/mailbox = INSERT. Literal-union TS types for registry enums via build-time codegen (`npm run codegen`); CI gate `npm run codegen && git diff --exit-code`; never hand-edit `*.generated.ts`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROUTE-01 | Destination taxonomy frozen as registry data (~6–7 buckets) | New `public.routing_destinations` table (D-01); seed migration mirrors `20260521_info_routing_swarm_smeba_minimum_viable.sql` INSERT-with-`ON CONFLICT` pattern. Buckets enum via codegen (see ROUTE-03). |
| ROUTE-02 | Brand-aware (bucket × brand) → verified mailbox | One denormalized row per (bucket × brand); resolver step `SELECT target_mailbox WHERE swarm_type, destination_key=bucket, brand, active`. Verified mailboxes from charter §2 table. `env_id='BX'`/`scope_key` filter stays; brand comes from the agent (D-03), mailbox from the registry. |
| ROUTE-03 | `info-routing-coordinator` Orq agent (bucket + brand, closed list) | Register in `public.orq_agents` (mirror `debtor-intent-agent` row); strict `response_format` json_schema with `enum` for bucket+brand, `anyOf` nullable; codegen the enum from `routing_destinations`. Invoked via existing `invokeOrqAgent`. |
| ROUTE-04 | Rich persisted verdict (6 fields) — the Phase 132 contract | `coordinator_runs.decision_details.routing` JSON (schema in Discretion Resolutions); + `pipeline_events` TELE-01 (`stage=3`, `decision=bucket`); + `agent_runs.status` flip. No new table (D-02). |
| ROUTE-05 | Two-layer duplicate-delivery guard | Layer (a): parse `raw_json.toRecipients`/`ccRecipients` (NOT the null `recipients` column) for the resolved `target_mailbox`. Layer (b): normalized `internetMessageId` match against `email_pipeline.emails` where `mailbox`≈target & ingested; graceful skip + coverage-gap log otherwise. |
| ROUTE-06 | `unrouted` bucket for low-confidence/no-match | `unrouted` is a reserved `destination_key` (a registry row OR a sentinel constant — see Discretion). Below threshold or no registry match → verdict `unrouted=true`, `bucket='unrouted'`, queryable via `coordinator_runs.decision_details->routing->>'bucket' = 'unrouted'`. |
| ROUTE-07 | Verdict-only — no forward, no Stage 2 | Seed `dry_run_config.stage_3_routing=true` (held: verdict persists, `pipeline/predicted` emit withheld → dispatcher never fires → no Stage 4). `stage2_entity_resolver` stays null. Grep/test gate proves no Graph forward + no Stage-2 invoke reachable. |
| ROUTE-08 | Shadow precision ≥85% vs human-actual destination | `web/scripts/eval/info-routing-precision-shadow.ts` (mirror `info-unknown-pool-noise-baseline.ts` `report` mode): join verdict bucket to delta-synced Outlook category; per-bucket + overall match-rate. **Blocked on the delta-sync-on-info@ prerequisite** (categories are 0/8000 today). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Destination taxonomy storage | Database (registry) | — | D-01 locks a Postgres registry table; source of truth, grows by INSERT |
| (bucket×brand)→mailbox resolution | API/Backend (coordinator step) | Database | Pure registry lookup inside the Inngest coordinator step |
| Destination + brand classification | API/Backend (Orq agent via coordinator) | — | LLM closed-list classification, server-side via Orq Router |
| Verdict persistence | Database (`coordinator_runs`) | API/Backend | D-02 reuses the Stage-3 persistence path |
| Dedup guard | API/Backend (coordinator step) | Database | Reads `email_pipeline.emails`; no UI |
| Shadow measurement | API/Backend (tsx eval script) | Database | Offline report script, mirrors existing eval harness |
| Forward / Bulk Review UI | — (OUT OF SCOPE) | — | Phase 132 |

## Standard Stack

This phase adds **no new external packages.** Everything reuses the in-repo stack.

### Core (existing, reused)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | as in `web/package.json` | Registry + verdict reads/writes via `createAdminClient` | Project standard; service-role for automation writes |
| `inngest` | as in `web/package.json` | Coordinator step orchestration, replay-safe | Project standard for event-driven pipelines |
| Orq.ai `/v2/agents/{key}/responses` | n/a (HTTP) | `info-routing-coordinator` LLM classification via `invokeOrqAgent` | CLAUDE.md mandates Orq Router; never direct LLM keys |
| `zod` | as in `web/package.json` | Validate agent output against the closed-list schema | CLAUDE.md: Zod-validate all LLM output |
| `tsx` | as in `web/package.json` | codegen scripts + ROUTE-08 eval harness | Project codegen + eval standard |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `coordinator_runs.decision_details` (D-02) | New `routing_verdicts` table | Rejected by D-02: a new table duplicates the Stage-3 persistence path and breaks Bulk Review's free read |
| Routing inside the generic coordinator (D-03) | A dedicated `info-routing-coordinator.ts` Inngest function | Rejected by D-03: a per-swarm worker reintroduces a swarm branch and blocks composition with future Stage 2 + intents |
| `routing_destinations` as `swarm_intents` rows | Reuse `swarm_intents` | Rejected by D-01 + hard-separation: destinations are neither noise nor intents |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed in this phase. Audit not applicable.

## Architecture Patterns

### System Architecture Diagram

```
info@smeba / info@fire-control  (zapier-info-routing-ingest → email_pipeline.emails)
        │
        ▼
  STAGE 0 (safety)  ──► STAGE 1 (regex + LLM noise classifier)
        │                         │
        │            ┌────────────┴───────────────┐
        │            ▼ noise keys                  ▼ category_key = 'unknown' (actionable)
        │      categorize_archive            ┌──────────────────────────────────────────┐
        │      (terminal)                    │  ROUTE-07 WIRING (NEW THIS PHASE):        │
        │                                    │  flip info-routing 'unknown' row action   │
        │                                    │  manual_review → swarm_dispatch            │
        │                                    │  swarm_dispatch = 'pipeline/coordinator.   │
        │                                    │  requested'  (BYPASSES Stage 2 — null)    │
        │                                    └───────────────┬──────────────────────────┘
        │                                                    ▼
        │                       ┌────────────────────────────────────────────────────────┐
        │                       │ STAGE 3 GENERIC COORDINATOR (debtor-email-coordinator.ts)│
        │                       │  swarm_type='info-routing' (from payload, no literal)    │
        │                       │  1. create agent_run (status=classifying)                │
        │                       │  2. insert coordinator_runs                              │
        │                       │  3. NEW capability gate: swarm has routing_destinations? │
        │                       │       ├─ invoke info-routing-coordinator (bucket+brand)  │
        │                       │       ├─ resolve (bucket×brand)→target_mailbox (registry)│
        │                       │       ├─ DEDUP layer (a) raw_json.to/ccRecipients        │
        │                       │       │         layer (b) normalized internetMessageId   │
        │                       │       ├─ unrouted gate (confidence < threshold)          │
        │                       │       └─ build routing verdict (6 fields)                │
        │                       │  4. persist verdict → coordinator_runs.decision_details  │
        │                       │       + pipeline_events TELE-01 (stage=3)                │
        │                       │  5. stage_3_routing gate (seeded true=HELD for info-rtg) │
        │                       │       HELD → mark routing_held, NO predicted emit ───────┼─► verdict visible,
        │                       │       (agent_runs stays 'classifying')                   │   no Stage 4
        │                       └──────────────────────────────────────────────────────────┘
        ▼
  (ROUTE-08 shadow) delta-synced Outlook category on the email  ──compare──►  per-bucket + overall match-rate
                    [PREREQUISITE: not in place today — 0 categories captured]
```

### Pattern 1: Registry-gated composable Stage-3 capability (D-03)
**What:** Add a routing capability block to `debtor-email-coordinator.ts` that runs only when `loadRoutingDestinations(swarm_type)` returns rows — exactly parallel to how the file already resolves `stage3AgentKey`, `intentSchemaForSwarm`, and `isStage3RoutingGated` per derived `swarm_type` with no swarm name in code.
**When to use:** Always, for this phase. The block is additive; debtor/sales (no `routing_destinations` rows) skip it → byte-neutral.
**Example (mirror the existing seam at lines 147–156, 466–496):**
```typescript
// Source: web/lib/inngest/functions/debtor-email-coordinator.ts (existing seam pattern)
const routingDestinations = await step.run("load-routing-destinations", async () =>
  loadRoutingDestinations(supabase, swarm_type)); // [] for debtor/sales → block skipped
if (routingDestinations.length > 0) {
  // invoke info-routing-coordinator, resolve mailbox, dedup, build verdict,
  // write into coordinator_runs.decision_details.routing (additive key)
}
```

### Pattern 2: Verdict on `coordinator_runs.decision_details` + TELE-01 (D-02)
**What:** Reuse the `persist-ranked` step's exact dual-write shape — update `coordinator_runs` then `emitPipelineEvent(...)` inside the SAME `step.run` (single replay boundary, per the existing Phase 70 comment).
**Example:**
```typescript
// Source: web/lib/inngest/functions/debtor-email-coordinator.ts:345-414 (persist-ranked)
await emitPipelineEvent(supabase, {
  swarm_type, stage: 3, email_id,
  decision: verdict.bucket,
  confidence: numericConfidence(verdict.confidence),
  decision_details: { routing: verdict },  // the 6-field routing verdict
  agent_run_id, automation_run_id: automation_run_id ?? null,
  triggered_by: "pipeline",
});
```

### Pattern 3: Stage-3 routing HELD gate (ROUTE-07 mechanism — already exists)
**What:** `isStage3RoutingGated(swarmRow)` reads `dry_run_config.stage_3_routing` (fail-closed = held). When held, the coordinator persists the verdict then withholds the `pipeline/predicted` emit → the dispatcher never fires → no Stage 4. Seed info-routing `stage_3_routing=true`. This is exactly the no-forward guarantee ROUTE-07 needs — no new gating code.
**Source:** `web/lib/pipeline-gating/dry-run-gate/index.ts:isStage3RoutingGated`; coordinator lines 466–496.

### Pattern 4: Registry literal-union codegen (CLAUDE.md / Phase 69/78)
**What:** A new `web/scripts/gen-routing-destinations.ts` reads `routing_destinations` and emits `web/lib/swarms/routing-destinations.generated.ts` (`DESTINATION_KEYS_BY_SWARM` map + `DestinationKey` union). Add it to the `codegen` npm script. The Orq agent's json_schema `enum` is built from the same registry read (so bucket list stays single-source). Mirror `gen-intent-types.ts` exactly (alphabetical sort, idempotent skip-if-identical).
**Source:** `web/scripts/gen-intent-types.ts`, `web/scripts/gen-entity-types.ts`.

### Anti-Patterns to Avoid
- **Building a `info-routing-coordinator.ts` Inngest function.** Violates D-03 + reintroduces a swarm branch. The classifier is the existing generic coordinator.
- **Reading the flat `recipients` column for dedup layer (a) on info-routing rows.** It is NULL for `zapier-info-routing-ingest`. Read `raw_json.toRecipients`/`ccRecipients`.
- **Matching raw `internetMessageId` strings directly across sources.** Source rows carry `<...@host>` in `raw_json`; target rows carry `<...@host>` in the column. Normalize (strip `<>`, lowercase, trim) both sides first.
- **Creating a `routing_verdicts` table.** Violates D-02.
- **Modeling destinations in `swarm_intents`.** Violates D-01 + hard-separation.
- **Putting a confidence number literal in the RFC/agent prompt.** Threshold is config/registry data (see Discretion).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM JSON enforcement | Prompt-only "return JSON" | Orq agent `response_format` strict json_schema + Zod | Prompt-only fails 15–20% (CLAUDE.md); strict-mode `anyOf` nullable required |
| Verdict storage + Bulk Review read | New table + new query path | `coordinator_runs.decision_details` (D-02) | Bulk Review already reads `coordinator_runs` |
| Routing hold / no-forward | New `if (verdict_only)` branch | `dry_run_config.stage_3_routing` + `isStage3RoutingGated` | The held-emit mechanism already exists (Phase 113) |
| Bucket enum sync (TS ↔ DB ↔ Orq) | Hand-maintained const | `npm run codegen` from `routing_destinations` | Three-place drift is the exact bug Phase 78 codegen fixed |
| Cross-swarm dispatch | New dispatcher edit | Existing `stage-3-dispatcher.ts` (wildcard `*/predicted`) | Held this phase anyway; never edit the dispatcher |
| Agent transport/timeout | New fetch client | `invokeOrqAgent` (registry-driven, 45s deadline) | Already handles Orq `/responses`, abort, JSON-strip |

**Key insight:** Nearly every "new" piece in 131 already has a registry-driven seam in the live code. The phase is mostly **data (a migration + a seed + an Orq agent row) plus one additive capability block + one codegen script**, not new infrastructure.

## Runtime State Inventory

> This is a registry/wiring phase touching live ingest data — inventory required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (1) `email_pipeline.emails` info-routing rows: top-level `recipients`/`internet_message_id` NULL, payload in `raw_json` (`toRecipients`,`ccRecipients`,`internetMessageId`,`conversationId`). (2) `order@smeba`/`order@fire-control` outlook rows DO populate `internet_message_id` column. (3) `raw_json.categories` empty on all 8000 sampled rows. | Dedup must read `raw_json.*` source-side + normalize ids; ROUTE-08 blocked until categories captured (prereq). **Data edit, not migration.** |
| Live service config | `info_routing_mailbox_settings`: only `info@smeba.nl` (+`info@fire-control.nl` via swarm) have `ingest_enabled=true`; the 4 dormant info@ are `ingest_enabled=false` (out of scope). `swarms.info-routing.dry_run_config = {}` (empty → fail-closed). | Seed `dry_run_config.stage_3_routing=true` for info-routing (ROUTE-07). Migration. |
| OS-registered state | None — no cron/task-scheduler/pm2 state references "routing_destinations" or the new agent. Verified: no new Inngest cron in scope (router is event-driven off Stage 1). | None. |
| Secrets/env vars | `ORQ_API_KEY` already present (used by `invokeOrqAgent`). No new secret. The new Orq agent is referenced by `agent_key` in `orq_agents`/`swarms.stage3_coordinator_agent_key`, not by env var. | None. |
| Build artifacts | `web/lib/swarms/*.generated.ts` (intent, entity, tenant-domains) are codegen outputs. A new `routing-destinations.generated.ts` will be added; `npm run codegen` must include the new script or CI `git diff --exit-code` drifts. | Add `gen-routing-destinations.ts` to the `codegen` npm script; commit generated file atomically with the seed migration. |

**Stage-1 `unknown` dead-end (verified):** info-routing `swarm_noise_categories.unknown` row has `action='manual_review'`, `swarm_dispatch=null` — today the actionable `unknown` pool has no onward dispatch. This phase flips it to `action='swarm_dispatch'`, `swarm_dispatch='pipeline/coordinator.requested'`. **This is a data migration AND the load-bearing wiring change** (without it the coordinator never runs for info-routing).

## Common Pitfalls

### Pitfall 1: Orq strict-mode json_schema rejects array-shorthand nullables
**What goes wrong:** `"type": ["string","null"]` is valid JSON Schema 2020-12 but Orq's json_schema validator + OpenAI strict mode reject it ("Invalid JSON detected").
**Why it happens:** Strict mode requires `anyOf` for unions.
**How to avoid:** `{"anyOf":[{"type":"string"},{"type":"null"}]}` for every nullable field in the `info-routing-coordinator` schema (e.g. a nullable `reasoning` or `brand` when `unrouted`). Mirror `debtor-intent-agent`'s `sub_type` (`anyOf` + null). [CITED: CLAUDE.md Orq.ai block; learning 3970bad9].
**Warning signs:** Agent create/PATCH succeeds but Studio shows empty model dropdown or "Add tool" blocked; per-call returns malformed JSON.

### Pitfall 2: Dedup reads the wrong field path / fails to normalize message-ids
**What goes wrong:** Layer (a) reads the NULL `recipients` column → never matches → every email looks routable; layer (b) compares `<id@host>` (source `raw_json`) to a normalized id and never matches.
**Why it happens:** Heterogeneous ingest sources (`zapier-info-routing-ingest` vs `outlook` vs `sugarcrm`) carry recipients/message-id in different shapes and columns. [VERIFIED: live probe of `email_pipeline.emails`].
**How to avoid:** Layer (a): parse `raw_json.toRecipients`/`ccRecipients` (`{emailAddress:{address}}`) AND fall back to the `recipients` column shape (`{cc,to}` for outlook rows, `[{email}]` for sugarcrm) — write a single `extractRecipientAddresses(emailRow)` helper tolerant of all three shapes. Layer (b): `normalizeMessageId(s) = s.replace(/^<|>$/g,'').trim().toLowerCase()` on BOTH sides before matching; match against the **target mailbox's** rows (`mailbox ILIKE target` or a mailbox-email map, since `mailbox` is sometimes a display name).
**Warning signs:** Unit test with a CC'd target mailbox returns `routable`; layer-b never produces `already_addressed` even on a seeded duplicate.

### Pitfall 3: `mailbox` column is a display name, not an email address
**What goes wrong:** Layer (b) `WHERE mailbox = target_mailbox` matches nothing because the info@ rows' `mailbox` is `"INFO@Smeba New Cases, Smeba Brandbeveiliging BV"` (sugarcrm) while outlook rows are `"order@smeba.nl"`.
**Why it happens:** Mixed ingest provenance. [VERIFIED: live probe — distinct mailbox values include both display-name and address forms].
**How to avoid:** Resolve the target mailbox match on the **address**, not the raw `mailbox` string: prefer matching `order@smeba.nl`-style rows (outlook source, which use the clean address). Document the coverage assumption: layer (b) only works for ingested target mailboxes whose `mailbox` is the clean address (order@ qualifies). Otherwise graceful skip + coverage-gap log (D-04).

### Pitfall 4: Replay-unsafe verdict id generation
**What goes wrong:** Generating `run_id`/any verdict UUID outside `step.run` → Inngest regenerates on replay → INSERT on key A, UPDATE on key B, `.eq()` matches 0 rows, verdict silently lost.
**Why it happens:** Inngest re-executes function body across replays; only `step.run` results are memoized.
**How to avoid:** Reuse the existing `resolve-run-id` step (coordinator lines 163–168) — `run_id` is already replay-safe. Any new non-deterministic value (none needed if you key off `run_id`/`email_id`) goes inside `step.run`. [CITED: CLAUDE.md Inngest block; Phase 65 dd2583a].

### Pitfall 5: RLS missing on `routing_destinations` → CI fails
**What goes wrong:** `CREATE TABLE public.routing_destinations` without `ENABLE ROW LEVEL SECURITY` + a policy → advisor ERROR `rls_disabled_in_public` → `npm run check:supabase` pre-push hook fails.
**How to avoid:** Copy `_template.sql`: create → `ENABLE ROW LEVEL SECURITY` → `service_all` policy in one migration. The registry is read by the coordinator step (service-role via `createAdminClient`) and possibly by Bulk Review (132) — if 132 reads it from the authenticated UI, add a `FOR SELECT TO authenticated` policy too (decide now to avoid a follow-up migration).

### Pitfall 6: False-success on ROUTE-08 because the prerequisite is absent
**What goes wrong:** The measurement reports 100% (or 0/0) because there are no human-applied Outlook categories to grade against — the delta-sync-on-info@ + category-capture prerequisite is not in place (0/8000 rows have categories). [VERIFIED: live probe].
**How to avoid:** The harness MUST report the **denominator** (count of emails with a captured human category) and refuse to emit a pass/fail when it is 0 or below a minimum sample (mirror the Phase 130 baseline's explicit "this is a census/sample-size" discipline). Sequence the prerequisite before the measurement step; the router build itself does not depend on it.

## Code Examples

### Resolve (bucket × brand) → mailbox from the registry
```typescript
// Source: pattern mirrors loadSwarmIntents in web/lib/swarms/registry.ts
export async function loadRoutingDestinations(admin: SupabaseClient, swarmType: string) {
  const { data, error } = await admin
    .from("routing_destinations")
    .select("destination_key, brand, target_mailbox, outlook_category, active")
    .eq("swarm_type", swarmType)
    .eq("active", true);
  if (error) throw new Error(`routing_destinations read: ${error.message}`);
  return data ?? [];
}
// resolve:
const row = destinations.find(d => d.destination_key === bucket && d.brand === brand);
const targetMailbox = row?.target_mailbox ?? null; // null → unrouted fallback
```

### Tolerant recipient extraction (dedup layer a)
```typescript
// Handles all three live shapes: raw_json Graph, outlook {cc,to}, sugarcrm [{email}]
function extractRecipientAddresses(emailRow: { recipients: unknown; raw_json: any }): string[] {
  const out: string[] = [];
  const raw = emailRow.raw_json ?? {};
  for (const r of [...(raw.toRecipients ?? []), ...(raw.ccRecipients ?? [])]) {
    const a = r?.emailAddress?.address; if (a) out.push(a.toLowerCase());
  }
  const rc = emailRow.recipients as any;
  if (rc && !Array.isArray(rc)) {                    // outlook {cc,to}
    for (const r of [...(rc.to ?? []), ...(rc.cc ?? [])]) if (r?.address) out.push(String(r.address).toLowerCase());
  } else if (Array.isArray(rc)) {                    // sugarcrm [{email}]
    for (const r of rc) if (r?.email) out.push(String(r.email).toLowerCase());
  }
  return [...new Set(out)];
}
```

### Migration skeleton (ROUTE-01 / D-01) — from `_template.sql`
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.routing_destinations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type      text NOT NULL,
  destination_key text NOT NULL,                 -- bucket (e.g. 'verkoop','order_entry','inspecties','storingen','opleidingen','sollicitaties','algemeen','unrouted')
  brand           text NOT NULL,                 -- 'smeba' | 'fire-control' | 'berki'
  target_mailbox  text,                          -- NULL allowed for the 'unrouted' sentinel row
  outlook_category text,                         -- ROUTE-08 ground-truth label name
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (swarm_type, destination_key, brand)
);
ALTER TABLE public.routing_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY routing_destinations_service_all ON public.routing_destinations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Add (decide now) for Phase 132 Bulk Review UI reads:
CREATE POLICY routing_destinations_auth_select ON public.routing_destinations
  FOR SELECT TO authenticated USING (true);
COMMIT;
```

## Discretion Resolutions

### 1. Confidence threshold for `unrouted` — RECOMMEND: single config knob (not per-bucket)
Use a single `swarms`-level knob, not a per-bucket column, for v1. Store it in `swarms.resolution_config` (the column already exists) as `resolution_config.routing_unrouted_threshold` (default **0.6** on a low/medium/high → {0.33,0.66,1.0} mapping, i.e. require ≥ medium). Rationale: the agent returns a categorical confidence (`low|medium|high`, mirroring `debtor-intent-agent`), so a per-bucket numeric threshold is over-engineering; the SPEC only requires "below threshold → unrouted." A single knob is one INSERT/UPDATE and keeps SWARM-02 (no code literal). Below-threshold OR no registry match → `unrouted`. `[ASSUMED default value 0.6/medium]` — confirm the medium-floor with the operator; the mechanism is locked, only the number is a guess.

### 2. `coordinator_runs.decision_details.routing` JSON shape — RECOMMEND (Phase-132-readable)
```jsonc
{
  "routing": {
    "bucket": "inspecties",            // destination_key, or "unrouted"
    "brand": "fire-control",           // smeba | fire-control | berki | null when unrouted
    "target_mailbox": "planning@smeba.nl", // resolved; null when unrouted
    "confidence": "high",              // low | medium | high (agent categorical)
    "dedup": {
      "status": "routable",            // routable | already_addressed
      "matched_layer": null            // null | "to_cc" (a) | "message_id" (b) | "conversation" (b)
    },
    "unrouted": false,                 // true when below threshold or no match
    "routing_version": "2026-06-17.v1" // for audit / future schema evolution
  }
}
```
Phase 132 reads `decision_details->routing->>'target_mailbox'`, honors `dedup.status='already_addressed'` (do-not-forward) and `unrouted=true` (human triage). Keep it under a single `routing` key so it composes additively alongside `ranked`/intent telemetry when verkoop@/debiteuren@ later run intents + routing in the same `decision_details` (D-03 composition).

### 3. Orq `info-routing-coordinator` agent — RECOMMEND
- Register in `public.orq_agents` mirroring `debtor-intent-agent` (`agent_key='info-routing-coordinator'`, `swarm_type='info-routing'`, `timeout_ms=90000`, `enabled=true`). Set `swarms.stage3_coordinator_agent_key='info-routing-coordinator'`.
- **Build sequence (CLAUDE.md):** `list_models` → create agent bare → PATCH full `model.parameters` incl. strict `response_format` json_schema → `get_agent` verify. `create_agent` drops `response_format` silently.
- **Model:** primary a capable EU model (e.g. `aws/eu.anthropic.claude-haiku-4-5-...` for cost/latency on a closed-list task) + the standard fallback chain (`openai/gpt-4o-mini`, `google-ai/gemini-2.5-flash`, `mistral/mistral-large-2411`). `[ASSUMED model choice]` — **validate every ID via `list_models` before create/update** (PATCH accepts unknown IDs silently per CLAUDE.md/learning f980a2a1).
- **Output schema (closed-list, codegen-driven enums):**
```jsonc
{
  "type": "object",
  "required": ["bucket", "brand", "confidence", "reasoning"],
  "additionalProperties": false,
  "properties": {
    "bucket":     { "enum": ["order_entry","verkoop","inspecties","storingen","opleidingen","sollicitaties","algemeen","unrouted"], "type": "string" },
    "brand":      { "anyOf": [{ "enum": ["smeba","fire-control","berki"], "type": "string" }, { "type": "null" }] },
    "confidence": { "enum": ["low","medium","high"], "type": "string" },
    "reasoning":  { "type": "string", "maxLength": 200 }
  }
}
```
The `bucket` and `brand` enums are emitted by `gen-routing-destinations.ts` from `routing_destinations` (single source of truth). XML-tagged system prompt (`<role>`,`<task>`,`<constraints>`,`<output_format>`); constraint: "choose `unrouted` rather than guess when no destination clearly applies." Zod-validate with `z.object({ bucket: z.enum([...DESTINATION_KEYS]), brand: z.enum([...]).nullable(), confidence: z.enum(["low","medium","high"]), reasoning: z.string() })`; invalid/empty agent output → `unrouted` verdict (never crash — ROUTE-03 acceptance).

### 4. ROUTE-08 shadow harness — RECOMMEND
`web/scripts/eval/info-routing-precision-shadow.ts`, `report` mode, mirroring `info-unknown-pool-noise-baseline.ts`:
- Pure function `computeMatchRate(rows: {verdict_bucket, human_category, confidence}[])` → `{ overall_match_pct, per_bucket: {bucket, n, match_pct}[], graded_n, ungraded_n }`. IO-free for unit testing.
- `main()` joins `coordinator_runs.decision_details->routing->>'bucket'` (high-confidence only, per the ≥85% gate wording) to the delta-synced Outlook category mapped through `routing_destinations.outlook_category`. Emit JSON; **report `graded_n` and refuse a pass/fail verdict when `graded_n` is below a minimum** (Pitfall 6).
- Gate: overall ≥ 0.85 among high-confidence verdicts. No side effects, no DB writes (shadow).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic coordinator does classify + dispatch | Split: Stage-3 classifier (`*-coordinator.ts`) + Stage-3.5 dispatcher (`*/predicted`) | Phase 80 (2026-05-08) | Routing hold = withhold the `predicted` emit; never edit the dispatcher |
| Per-swarm coordinator functions | Single generic coordinator keyed by payload `swarm_type` + registry lookups | Phase 110/113 | D-03 routing block lives in the generic coordinator, no new function |
| Hardcoded intent/brand consts | Build-time codegen from registry (`npm run codegen`) | Phase 69/78 | Bucket enum must be codegen'd, not hand-written |
| `recipients` assumed uniform jsonb | Heterogeneous per-ingest-source shapes | observed 2026-06-17 | Dedup must tolerate 3 shapes + read `raw_json` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `unrouted` confidence floor = medium (~0.6) | Discretion 1 | Too high → over-routes to human; too low → false routes. Operator-tunable knob mitigates. |
| A2 | Agent returns categorical confidence (`low/medium/high`) like debtor | Discretion 1/3 | If a numeric score is preferred, threshold mapping changes (mechanism unchanged) |
| A3 | Primary model = Haiku 4.5 EU + standard fallbacks | Discretion 3 | Must be validated via `list_models`; wrong ID silently breaks the agent (CLAUDE.md) |
| A4 | Bucket key set (8: order_entry/verkoop/inspecties/storingen/opleidingen/sollicitaties/algemeen/unrouted) | Discretion 3, ROUTE-01 | Charter lists 6–7 + algemeen; operator may want a separate `aanbestedingen` (charter defers it). Confirm exact set before seeding. |
| A5 | Adding `FOR SELECT TO authenticated` now (for Phase 132 UI) | Pitfall 5 | If 132 reads via service-role only, the extra policy is harmless; if omitted and 132 needs it, a follow-up migration is required |
| A6 | `pipeline/coordinator.requested` is the right entry event for info-routing's `unknown` dispatch | Architecture / Runtime Inventory | If a dedicated routing-entry event is preferred, the wiring target changes (still a `swarm_dispatch` string) |
| A7 | order@smeba is the only meaningfully-ingested layer-(b) target | Pitfall 3, ROUTE-05 | Other target mailboxes → graceful skip + coverage-gap log (D-04 already accepts this) |

## Open Questions

1. **Exact frozen bucket set (6 vs 7 vs 8).**
   - What we know: charter §2 lists Verkoop, Order-entry/PO, Fire-Control inspecties (planning@), Opleidingen/BHV, Storingen, Sollicitaties (hrm@), Algemeen/contactformulier; Debiteuren/crediteuren/aanbestedingen are deferred to later INSERT.
   - What's unclear: whether `aanbestedingen` and `debiteuren` are truly excluded from the v1 seed (SPEC says deferred).
   - Recommendation: seed the 7 actionable buckets + `unrouted` (8 keys); confirm with operator before the seed migration.

2. **Brand×bucket mailbox completeness.**
   - What we know: charter §2 verified mailboxes exist per brand for order@/verkoop@ (×3 brands), but planning@/storing.smeba@/opleidingen@/hrm@ are listed for a single brand only.
   - What's unclear: do fire-control/berki inspecties/opleidingen route to the same smeba planning@/opleidingen@, or to brand-specific mailboxes?
   - Recommendation: seed only verified (bucket×brand) rows; rows with no verified mailbox → omit (agent's brand pick with no matching active row → `unrouted` fallback, which is correct behavior).

3. **delta-sync-on-info@ + Outlook-category capture prerequisite status (blocks ROUTE-08 only).**
   - What we know: 0/8000 sampled rows carry `raw_json.categories`; the prerequisite is explicitly OUTSIDE 131.
   - Recommendation: build + unit-test the harness in 131; gate the live measurement run on the prerequisite landing. Do NOT block the router build on it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (service-role) | All registry/verdict ops | ✓ | live | — |
| Orq.ai Router (`ORQ_API_KEY`) | info-routing-coordinator agent | ✓ | live | — |
| Inngest | Coordinator capability block | ✓ | live | — |
| `email_pipeline.emails` ingest for info@ | Router input + dedup | ✓ (`zapier-info-routing-ingest`, 60 rows + growing) | live | — |
| order@ ingest (`source='outlook'`) | Dedup layer (b) | ✓ (1228+537 rows) | live | layer (a) only for non-ingested targets |
| **delta-sync + Outlook-category on info@** | **ROUTE-08 measurement only** | **✗** (0 categories captured) | — | **Build+unit-test harness; live run gated on prerequisite (outside 131)** |

**Missing dependency with no fallback (measurement only):** Outlook-category capture for ROUTE-08. Does NOT block ROUTE-01..07.

## Validation Architecture

> `workflow.nyquist_validation` absent in config.json → treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (per `web/` `*.test.ts` convention; co-located `__tests__/`) |
| Config file | `web/vitest.config.*` (existing; confirm in Wave 0) |
| Quick run command | `cd web && npx vitest run <path>` |
| Full suite command | `cd web && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROUTE-01 | Seed contains exactly the frozen bucket set; no hardcoded bucket list / no swarm_type branch | unit + grep | `npx vitest run lib/swarms/__tests__/routing-destinations-seed.test.ts` + `grep -r "swarm_type === 'info-routing'" web/lib` (expect none) | ❌ Wave 0 |
| ROUTE-02 | (bucket×brand)→mailbox resolves; fire-control-in-info@smeba cross-brand case | unit | `npx vitest run lib/swarms/__tests__/routing-resolve.test.ts` | ❌ Wave 0 |
| ROUTE-03 | Agent output validated by closed-list Zod; invalid/empty → unrouted (no throw) | unit | `npx vitest run lib/.../__tests__/info-routing-coordinator-schema.test.ts` | ❌ Wave 0 |
| ROUTE-04 | Verdict has all 6 fields on `coordinator_runs.decision_details.routing` + TELE-01 | unit (mocked supabase) | `npx vitest run lib/inngest/functions/__tests__/coordinator-routing-verdict.test.ts` | ❌ Wave 0 |
| ROUTE-05 | layer (a) To/CC → already_addressed; layer (b) msg-id → already_addressed; non-dup → routable; id normalization | unit | `npx vitest run lib/.../__tests__/routing-dedup.test.ts` | ❌ Wave 0 |
| ROUTE-06 | Ambiguous/below-threshold → unrouted (not forced bucket); unrouted queryable | unit | `npx vitest run lib/.../__tests__/routing-unrouted.test.ts` | ❌ Wave 0 |
| ROUTE-07 | No Graph forward/move + no Stage-2 invoke reachable from 131 paths; stage_3_routing held | grep + unit | `grep -rn "graph.*forward\|/sendMail\|move" web/lib/inngest/functions/<routing block>` (expect none) + gate test | ❌ Wave 0 |
| ROUTE-08 | per-bucket + overall match-rate vs human-actual; refuses verdict when graded_n too low | unit (pure fn) | `npx vitest run web/scripts/eval/__tests__/info-routing-precision-shadow.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the requirement's unit command above.
- **Per wave merge:** `cd web && npm test` + `npm run codegen && git diff --exit-code` (codegen drift gate).
- **Phase gate:** full suite green + `npm run check:supabase` green (RLS) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `lib/swarms/__tests__/routing-destinations-seed.test.ts` — ROUTE-01 (assert seed migration row set, mirror `sales-noise-calibration.test.ts` migration-parsing style)
- [ ] `lib/swarms/__tests__/routing-resolve.test.ts` — ROUTE-02
- [ ] dedup + verdict + unrouted + schema tests (ROUTE-03/04/05/06) co-located with the routing capability module
- [ ] `web/scripts/eval/__tests__/info-routing-precision-shadow.test.ts` — ROUTE-08 pure-fn test
- [ ] Confirm `web/vitest.config` + add `gen-routing-destinations.ts` to the `codegen` npm script
- [ ] Grep gate fixtures for ROUTE-01 (no bucket literal) + ROUTE-07 (no forward/Stage-2)

## Security Domain

> `security_enforcement` absent → treated as enabled. Backend-only, no auth/session/crypto surface.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; service-role + existing RLS |
| V3 Session Management | no | — |
| V4 Access Control | yes | RLS on `routing_destinations` (service_role FOR ALL; authenticated FOR SELECT for 132 UI). No `anon` policy. |
| V5 Input Validation | yes | Zod-validate `info-routing-coordinator` output against the closed-list enum; reject → `unrouted` (no crash) |
| V6 Cryptography | no | No secrets/crypto introduced; `ORQ_API_KEY` already managed |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM returns a free-text / off-list destination | Tampering | Strict json_schema `enum` + Zod; off-list → `unrouted` |
| Double-forward (customer blasted info@ + order@) | (operational) | Two-layer dedup → `already_addressed` (do-not-forward flag honored by 132) |
| Cross-brand mis-route (fire-control mail → smeba mailbox) | (operational) | Agent classifies brand; registry maps (bucket×brand); `env_id='BX'` hard filter |
| Anon write to the registry | Elevation | RLS service-role-only write; CLAUDE.md anon-revoke + `check:supabase` gate |
| Accidental live side-effect this phase | (scope) | `dry_run_config.stage_3_routing=true` (held); grep/test gate for no Graph forward |

## Recommended Wave / Plan Decomposition

1. **Wave A — Registry + wiring (data):**
   (a) Migration: `routing_destinations` table + RLS (Pitfall 5) + seed rows (confirm bucket set — OQ1/OQ2) + `unrouted` sentinel.
   (b) Migration: set `swarms.info-routing.stage3_coordinator_agent_key='info-routing-coordinator'`, `dry_run_config.stage_3_routing=true`, `resolution_config.routing_unrouted_threshold`.
   (c) Migration: flip info-routing `swarm_noise_categories.unknown` → `action='swarm_dispatch'`, `swarm_dispatch='pipeline/coordinator.requested'` (the load-bearing wiring).
   (d) `gen-routing-destinations.ts` + `routing-destinations.generated.ts` + add to `codegen` script.
2. **Wave B — Orq agent (depends on A.d for enum):** register `orq_agents` row; build agent via `list_models`→create→PATCH→`get_agent`; closed-list strict json_schema (Discretion 3).
3. **Wave C — Coordinator routing capability (depends on A, B):** additive `loadRoutingDestinations` gate in `debtor-email-coordinator.ts`; invoke agent; resolve mailbox; build verdict; persist to `decision_details.routing` + TELE-01; Zod-validate; unrouted gate.
4. **Wave D — Dedup (depends on C, parallelizable with C's verdict build):** `extractRecipientAddresses` (3-shape tolerant) + `normalizeMessageId` + layer (a)/(b); graceful skip + coverage-gap log for non-ingested targets.
5. **Wave E — Shadow measurement (depends on C):** `info-routing-precision-shadow.ts` report harness + pure-fn unit test; graded_n guard. Live run gated on the delta-sync prerequisite (outside 131).
6. **Cross-cutting:** ROUTE-07 grep/test gate (no forward, no Stage-2) added in C; full-suite + codegen-drift + `check:supabase` at phase gate.

Critical path: A → B → C → (D ∥ E).

## Sources

### Primary (HIGH confidence)
- Live Supabase service-role probes (2026-06-17): `public.swarms`, `public.coordinator_runs`, `public.swarm_intents`, `public.swarm_noise_categories`, `public.pipeline_events`, `public.orq_agents`, `public.info_routing_mailbox_settings`, `email_pipeline.emails` (columns, `recipients`/`raw_json` shapes per source, ingested mailbox counts, category absence, `routing_destinations` non-existence).
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — the generic Stage-3 classifier (verdict persistence, routing gate, replay-safe run_id).
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — Stage-3.5 orchestrator (dormant; not the routing seam).
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — `isStage3RoutingGated` / `stage_3_routing` key.
- `web/lib/automations/orq-agents/client.ts` — `invokeOrqAgent` transport + registry.
- `web/scripts/gen-intent-types.ts`, `web/scripts/gen-entity-types.ts` — codegen pattern.
- `web/scripts/eval/info-unknown-pool-noise-baseline.ts` — report-harness style.
- `supabase/migrations/_template.sql`, `20260521_info_routing_swarm_smeba_minimum_viable.sql`, `20260507_phase76_swarm_intents_handler_status.sql`, `20260609c_phase113_stage3_routing_gate.sql` — migration + seed patterns.
- `docs/agentic-pipeline/stage-3-coordinator.md` (RFC, Phase 80 split), `docs/routing-swarm-milestone-charter.md` §2/§4/§5.
- `CLAUDE.md` — Orq/Supabase/Inngest/codegen conventions (authoritative for this codebase).
- `131-SPEC.md`, `131-CONTEXT.md`.

### Secondary (MEDIUM confidence)
- `.claude/skills/spike-findings-agent-workforce/SKILL.md` — Phase 88 info-routing blueprint (registry-driven, cross-swarm transfer).

### Tertiary (LOW confidence)
- None — all claims grounded in live probes, in-repo code, or the locked RFC/CLAUDE.md.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all reuse confirmed in live code.
- Architecture: HIGH — confirmed against the Phase-80 RFC + live coordinator/gate code; the routing-gate mechanism already exists.
- Schema/data findings: HIGH — direct service-role probes (recipients shapes, message-id columns, category absence, `unknown` dead-end, `routing_destinations` non-existence).
- Pitfalls: HIGH — each is grounded in a verified live observation or a cited CLAUDE.md learning.
- Discretion numbers (threshold/model): MEDIUM/ASSUMED — mechanisms locked, specific values flagged for operator confirmation (Assumptions Log).

**Research date:** 2026-06-17
**Valid until:** ~2026-07-17 (stable infra; the delta-sync prerequisite status and the exact bucket set should be re-confirmed at plan time).
