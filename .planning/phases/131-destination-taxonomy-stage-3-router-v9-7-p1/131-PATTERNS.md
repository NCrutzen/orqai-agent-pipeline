# Phase 131: Destination taxonomy + Stage-3 router - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 12 (4 migrations · 1 codegen + 1 generated · 1 Orq agent registration · 1 coordinator capability edit · 1 registry loader edit · 2 helper modules · 1 eval harness · co-located Vitest tests)
**Analogs found:** 12 / 12 (every new/modified file has a confirmed in-repo analog)

> Read order for the executor: `131-SPEC.md` → `131-CONTEXT.md` (D-01..D-04) → `131-RESEARCH.md` (corrected field paths, verdict JSON shape, 6-wave decomposition) → this file. This file maps each locked decision to concrete reusable code; it does NOT relitigate decisions.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/<ts>_phase131_routing_destinations.sql` (CREATE) | DB migration (table + RLS + seed) | CRUD / registry | `_template.sql` + `20260521_info_routing_swarm_smeba_minimum_viable.sql` (seed/ON CONFLICT) | exact |
| `supabase/migrations/<ts>b_phase131_info_routing_stage3_wiring.sql` (CREATE) | DB migration (swarms UPDATE: agent key + routing gate + threshold) | registry mutate | `20260609c_phase113_stage3_routing_gate.sql` (jsonb `\|\|` merge) | exact |
| `supabase/migrations/<ts>c_phase131_info_routing_unknown_dispatch.sql` (CREATE) | DB migration (flip `unknown` action → `swarm_dispatch`) | registry mutate | `20260521b_info_routing_unknown_noise_row.sql` (the same row, INSERT…ON CONFLICT) | exact |
| Orq `info-routing-coordinator` row in `public.orq_agents` (seed migration `<ts>d_…`) | Orq-agent registration | request-response (LLM) | `20260429g_orq_agents_registry.sql` `debtor-intent-agent` row | exact |
| `web/scripts/gen-routing-destinations.ts` (CREATE) | codegen (registry → literal-union TS) | transform / batch | `web/scripts/gen-intent-types.ts` | exact |
| `web/lib/.../routing-destinations.generated.ts` (CREATE, auto) | generated build artifact | n/a | `…/coordinator/intent.generated.ts` (emitted by gen-intent-types) | exact |
| `web/package.json` `codegen` script (MODIFY: append `&& tsx scripts/gen-routing-destinations.ts`) | config | n/a | existing `codegen` chain (gen-entity → gen-tenant → gen-intent) | exact |
| `web/lib/swarms/registry.ts` (MODIFY: add `loadRoutingDestinations`) | registry loader (pure-fn + cached read) | CRUD read | `loadSwarmIntents` in same file (lines 80-100) | exact |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` (MODIFY: additive routing capability block) | Inngest coordinator capability | event-driven / request-response | the existing routing-gate seam in the same file (lines 147-156, 445-496) | exact |
| `web/lib/.../routing/dedup.ts` (CREATE: `extractRecipientAddresses`, `normalizeMessageId`, layer a/b) | pure-fn helper | transform | RESEARCH §Code Examples (no exact in-repo analog — pure new helper) | new (research-specified) |
| `web/lib/.../routing/verdict.ts` (CREATE: build 6-field verdict + Zod schema) | pure-fn helper | transform | `persist-ranked` decision_details shape (coordinator 345-414) + `intent-schema-registry` Zod | role-match |
| `web/scripts/eval/info-routing-precision-shadow.ts` (CREATE) | eval harness (report-mode metric) | batch / transform | `web/scripts/eval/info-unknown-pool-noise-baseline.ts` | exact |
| Co-located `__tests__/*.test.ts` (CREATE ×N) | test | n/a | `web/lib/swarms/__tests__/sales-noise-calibration.test.ts` (migration-parse) + `web/lib/inngest/functions/__tests__/*` (mocked-supabase) | exact |

---

## Pattern Assignments

### 1. `<ts>_phase131_routing_destinations.sql` (DB migration — table + RLS + seed)

**Analog A (table + RLS):** `supabase/migrations/_template.sql`
**Analog B (idempotent seed):** `supabase/migrations/20260521_info_routing_swarm_smeba_minimum_viable.sql` (lines 113-122, 157-167)

**RLS block to copy** (`_template.sql:21-58`) — the mandatory create → ENABLE RLS → service_role policy triad in one `BEGIN/COMMIT`:
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.routing_destinations ( ... );  -- see RESEARCH §Migration skeleton for exact columns
ALTER TABLE public.routing_destinations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS routing_destinations_service_all ON public.routing_destinations;
CREATE POLICY routing_destinations_service_all
  ON public.routing_destinations FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Phase-132 UI read (A5 — decide now to avoid a follow-up migration):
DROP POLICY IF EXISTS routing_destinations_auth_select ON public.routing_destinations;
CREATE POLICY routing_destinations_auth_select
  ON public.routing_destinations FOR SELECT TO authenticated USING (true);
COMMIT;
```
**Seed shape to copy** (`20260521_…minimum_viable.sql:113-122`) — one `INSERT … VALUES (…) ON CONFLICT (unique_key) DO UPDATE SET … updated_at = now()` per row group; alphabetical ordering for stable codegen diff:
```sql
insert into public.routing_destinations
  (swarm_type, destination_key, brand, target_mailbox, outlook_category, active)
values
  ('info-routing','order_entry','smeba','order@smeba.nl','Order-entry', true)
  -- … one row per (bucket × brand) from charter §2 verified mailboxes …
on conflict (swarm_type, destination_key, brand) do update set
  target_mailbox = excluded.target_mailbox,
  outlook_category = excluded.outlook_category,
  active = excluded.active,
  updated_at = now();
```
**What to copy:** the RLS triad verbatim from `_template.sql`; the `INSERT…ON CONFLICT…DO UPDATE` idempotency from the info-routing minimum-viable seed. The UNIQUE constraint is `(swarm_type, destination_key, brand)`.
**What to change:** columns per RESEARCH §Migration skeleton (`destination_key`, `brand`, `target_mailbox` nullable for the `unrouted` sentinel, `outlook_category`, `active`); seed exactly the frozen bucket set (OQ1: confirm 7 buckets + `unrouted` = 8 keys with operator before seeding); only seed verified (bucket×brand) rows (OQ2 — omit rows with no verified mailbox so the agent's pick → `unrouted` fallback). Add `FOR SELECT TO authenticated` (commented-out in the template — uncomment for 132).

---

### 2. `<ts>b_phase131_info_routing_stage3_wiring.sql` (swarms UPDATE — agent key + routing gate + threshold)

**Analog:** `supabase/migrations/20260609c_phase113_stage3_routing_gate.sql`

**jsonb-merge pattern to copy** (lines 33-47) — preserve existing per-stage flags with `||`, idempotent:
```sql
BEGIN;
UPDATE public.swarms
   SET stage3_coordinator_agent_key = 'info-routing-coordinator',
       dry_run_config   = dry_run_config   || jsonb_build_object('stage_3_routing', true),  -- HELD (ROUTE-07)
       resolution_config = resolution_config || jsonb_build_object('routing_unrouted_threshold', 0.6),  -- Discretion 1, A1
       updated_at = now()
 WHERE swarm_type = 'info-routing';
COMMIT;
```
**What to copy:** the `dry_run_config || jsonb_build_object(...)` merge (never overwrite the whole jsonb); `updated_at = now()`; the `WHERE swarm_type = …` scope.
**What to change:** set `stage_3_routing=true` (= HELD — fail-closed, verdict persists, no predicted-emit → no Stage 4; this IS the ROUTE-07 no-forward guarantee, no new gating code); leave `stage2_entity_resolver` NULL (already null — do not touch). `[A1: threshold 0.6/medium is ASSUMED — confirm with operator; mechanism locked]`.

---

### 3. `<ts>c_phase131_info_routing_unknown_dispatch.sql` (the load-bearing wiring flip)

**Analog:** `supabase/migrations/20260521b_info_routing_unknown_noise_row.sql` (the exact row this phase flips)

**Current state** (from analog, lines 28-39): `('info-routing','unknown', … ,'manual_review', NULL, …)` — dead-ends, nothing dispatches it onward.
**Flip to copy the same INSERT…ON CONFLICT shape:**
```sql
BEGIN;
UPDATE public.swarm_noise_categories
   SET action = 'swarm_dispatch',
       swarm_dispatch = 'pipeline/coordinator.requested',
       updated_at = now()
 WHERE swarm_type = 'info-routing' AND category_key = 'unknown';
COMMIT;
```
**What to copy:** the `(swarm_type, category_key)` scoping + `updated_at = now()`.
**What to change:** `action` `manual_review → swarm_dispatch`; `swarm_dispatch` `NULL → 'pipeline/coordinator.requested'`. **This is the load-bearing change** — without it the coordinator never fires for info-routing (it bypasses the absent Stage 2 and emits the canonical fan-in event the coordinator subscribes to). Hard-separation invariant honored: `unknown` stays a `swarm_noise_categories` (Stage 1) row; destinations live in the NEW `routing_destinations` table, never in `swarm_intents`. `[A6: `pipeline/coordinator.requested` is the assumed entry event — it is exactly what the coordinator's wildcard fan-in trigger matches, confirmed at debtor-email-coordinator.ts:97]`.

---

### 4. `info-routing-coordinator` row in `public.orq_agents` (`<ts>d_…` seed migration)

**Analog:** `supabase/migrations/20260429g_orq_agents_registry.sql` — `debtor-intent-agent` row (lines 54-88)

**Row shape to mirror** (INSERT…ON CONFLICT (agent_key) DO UPDATE, lines 51-167):
```sql
insert into public.orq_agents
  (agent_key, orqai_id, description, swarm_type, version, input_schema, output_schema, model_config, timeout_ms, enabled, notes)
values
  ('info-routing-coordinator', '<ORQAI_ID_FROM_STUDIO>', '…', 'info-routing', '2026-06-17.v1',
   <input_schema jsonb>, <output_schema jsonb>, <model_config jsonb>, 90000, true, '…')
on conflict (agent_key) do update set orqai_id = excluded.orqai_id, …, updated_at = now();
```
**output_schema closed-list block to copy** (mirror `debtor-intent-agent` output_schema, lines 69-78) — but use the RESEARCH §Discretion 3 shape with **`anyOf` for nullable `brand`** (NOT the array-shorthand the old debtor row used at line 75 — that pre-dates the strict-mode rule):
```jsonc
{ "type":"object", "required":["bucket","brand","confidence","reasoning"], "additionalProperties":false,
  "properties":{
    "bucket":     {"enum":[…codegen'd from routing_destinations…],"type":"string"},
    "brand":      {"anyOf":[{"enum":["smeba","fire-control","berki"],"type":"string"},{"type":"null"}]},
    "confidence": {"enum":["low","medium","high"],"type":"string"},
    "reasoning":  {"type":"string","maxLength":200} } }
```
**Transport (no code change):** invoked via the existing `invokeOrqAgent(agent_key, inputs)` (`web/lib/automations/orq-agents/client.ts:143`) — registry-driven, 45s `CLIENT_DEADLINE_MS`, strips ```` ```json ```` fences, JSON.parse, returns `{ raw, agent, usage }`. The coordinator already resolves the agent key from `swarms.stage3_coordinator_agent_key` (debtor-email-coordinator.ts:147-152).
**What to copy:** the full row column set + `ON CONFLICT (agent_key) DO UPDATE` from the debtor row.
**What to change:** `anyOf`-nullable `brand` (Pitfall 1 — array-shorthand is rejected by Orq strict mode); `timeout_ms=90000`; **build sequence per CLAUDE.md** (`list_models` FIRST to validate every model ID → `create_agent` bare → PATCH full `model.parameters` incl. `response_format` strict json_schema → `get_agent` verify; `create_agent` silently DROPS `response_format`). `[A3: primary model Haiku 4.5 EU + standard fallbacks — validate every ID via list_models; PATCH accepts unknown IDs silently]`. The `bucket` enum is codegen-sourced from `routing_destinations` (single source of truth — see #5).

---

### 5. `web/scripts/gen-routing-destinations.ts` + `routing-destinations.generated.ts`

**Analog:** `web/scripts/gen-intent-types.ts` (full file — copy structure verbatim)

**Idempotency + stable-diff block to copy** (gen-intent-types.ts:78-92, 128-145):
```typescript
// Stable diff: sort swarm_type keys and inner arrays alphabetically.
const sortedSwarms = [...bySwarm.keys()].sort((a, b) => a.localeCompare(b));
// … render `export const DESTINATION_KEYS_BY_SWARM = {…} as const;`
//      + `export type DestinationKey = (typeof …)[keyof …][number];`
const next = HEADER + renderBody(rows);
const existing = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, "utf8") : null;
if (existing === next) { console.log("[gen-routing-destinations] already up-to-date — no write"); return; }
writeFileSync(OUTPUT_PATH, next, "utf8");
```
**Auto-run guard to copy** (gen-intent-types.ts:151-156): `if (require.main === module) { main().catch(…process.exit(1)); }`.
**What to copy:** the dotenv load, the `SUPABASE_URL/SERVICE_ROLE_KEY` resolution, the group-by-swarm map, alphabetical sort, the skip-if-identical idempotency, the `require.main` guard, the `AUTO-GENERATED … DO NOT EDIT BY HAND` HEADER.
**What to change:** query `routing_destinations` (`.select("swarm_type, destination_key").order(...)`), filter `active=true`; emit `DESTINATION_KEYS_BY_SWARM` + `DestinationKey`. **Output path:** match the intent precedent (`web/lib/automations/debtor-email/coordinator/intent.generated.ts`) — RESEARCH proposed `web/lib/swarms/routing-destinations.generated.ts`; either is acceptable but place the codegen output where the coordinator/agent-schema consumer imports it, and ensure the path is consistent in the script's `OUTPUT_PATH`. **Append to `web/package.json` `codegen`** (currently `gen-entity-types && gen-tenant-domains && gen-intent-types`): add `&& tsx scripts/gen-routing-destinations.ts`. CI gate: `npm run codegen && git diff --exit-code`. The agent's `bucket` enum (#4) is built from the same registry read so TS ↔ DB ↔ Orq stay single-source.

---

### 6. `web/lib/swarms/registry.ts` — add `loadRoutingDestinations`

**Analog:** `loadSwarmIntents` in the SAME file (lines 80-100)

**Cached-read pattern to copy** (registry.ts:80-100) — 60s TTL Map + last-known-good on error:
```typescript
const ROUTING_DEST_CACHE = new Map<string, { value: RoutingDestinationRow[]; expires: number }>();
export async function loadRoutingDestinations(
  admin: SupabaseClient, swarmType: string,
): Promise<RoutingDestinationRow[]> {
  const now = Date.now();
  const hit = ROUTING_DEST_CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.value;
  const { data, error } = await admin
    .from("routing_destinations")
    .select("destination_key, brand, target_mailbox, outlook_category, active")
    .eq("swarm_type", swarmType)
    .eq("active", true);
  if (error) { if (hit) return hit.value; return []; }
  const value = (data as RoutingDestinationRow[] | null) ?? [];
  ROUTING_DEST_CACHE.set(swarmType, { value, expires: now + TTL_MS });
  return value;
}
```
**What to copy:** the Map+TTL cache, `.eq("swarm_type", …)`, last-known-good-on-error, `?? []` empty default (so debtor/sales — no rows — get `[]` and the capability block is skipped → byte-neutral). Add `RoutingDestinationRow` to `web/lib/swarms/types.ts` mirroring `SwarmIntentRow`.
**What to change:** table + columns; `.eq("active", true)` filter.

---

### 7. `web/lib/inngest/functions/debtor-email-coordinator.ts` — additive routing capability block

**Analog:** the existing registry-gated routing-gate seam in the SAME file.

**Seam pattern to mirror** — registry load OUTSIDE/INSIDE `step.run`, then a presence-gated additive block (lines 147-156 agent-key lookup; 466-469 gate read):
```typescript
// Existing seam (lines 147-156): per-swarm agent key via registry, no swarm literal.
const stage3AgentKey = await step.run("load-swarm-agent-key", async () => {
  const swarmRow = await loadSwarm(supabase, swarm_type);
  return swarmRow?.stage3_coordinator_agent_key ?? "debtor-intent-agent";
});
// Existing gate (lines 466-469): registry-driven, fail-closed.
const routingGated = await step.run("load-stage3-routing-gate", async () => {
  const swarmRow = await loadSwarm(supabase, swarm_type);
  return isStage3RoutingGated(swarmRow);
});
```
**New additive block (mirror the RESEARCH §Pattern 1 shape):**
```typescript
const routingDestinations = await step.run("load-routing-destinations", async () =>
  loadRoutingDestinations(supabase, swarm_type)); // [] for debtor/sales → block skipped
if (routingDestinations.length > 0) {
  // invoke info-routing-coordinator (invokeOrqAgent via stage3AgentKey) → Zod-validate → bucket+brand;
  // resolve (bucket×brand)→target_mailbox from routingDestinations;
  // dedup layer (a)/(b) (helper #10); unrouted gate (confidence < threshold OR no registry match);
  // build the 6-field verdict (helper #11).
}
```
**Verdict persistence to copy** — reuse the `persist-ranked` dual-write boundary (lines 345-414): `coordinator_runs.update(...)` then `emitPipelineEvent(...)` inside the SAME `step.run` (single replay boundary):
```typescript
await emitPipelineEvent(supabase, {
  swarm_type, stage: 3, email_id,
  decision: verdict.bucket,
  confidence: numericConfidence(verdict.confidence),
  decision_details: { routing: verdict },   // the 6-field verdict under a single `routing` key (composes additively beside `ranked`)
  agent_run_id, automation_run_id: automation_run_id ?? null,
  triggered_by: "pipeline",
});
```
**Replay-safe id (copy, do NOT regenerate):** reuse the existing `resolve-run-id` step (lines 163-168) — `run_id` is already replay-safe; key all verdict writes off it. Do NOT generate any new UUID/`Date.now()` outside `step.run` (Pitfall 4 / CLAUDE.md Inngest).
**No-forward guarantee (copy, no new code):** `stage_3_routing=true` (seeded #2) makes `isStage3RoutingGated` return true → the existing held path (lines 471-496) persists the verdict + `mark-routing-held` + WITHHOLDS `emit-predicted` → dispatcher never fires → no Stage 4. ROUTE-07 needs NO new branch.
**What to copy:** the registry-load-then-presence-gate seam; the `persist-ranked` dual-write inside one `step.run`; the `resolve-run-id` reuse; the existing held-gate path.
**What to change:** add the `routingDestinations.length > 0` block; write `decision_details.routing` (additive key — debtor/sales unaffected). **NEVER** add an `if (swarm_type === 'info-routing')` branch (SWARM-02 / ROUTE-01 grep gate). **NEVER** edit `stage-3-dispatcher.ts` (the hold is achieved by withholding the emit). **NEVER** add a Graph `/sendMail`/`move`/forward call (ROUTE-07 grep gate).

---

### 8 & 9. `web/lib/.../routing/dedup.ts` + `routing/verdict.ts` (pure-fn helpers)

**dedup.ts analog:** RESEARCH §Code Examples (no in-repo analog — net-new, but the shapes are fully specified). **verdict.ts Zod analog:** `web/lib/automations/debtor-email/coordinator/intent-schema-registry.ts` + the debtor agent's categorical-confidence schema.

**`extractRecipientAddresses` (copy from RESEARCH §Code Examples)** — tolerant of all 3 live ingest shapes (`raw_json.toRecipients`/`ccRecipients` Graph; `recipients` `{to,cc}` outlook; `[{email}]` sugarcrm). **Layer (a) MUST read `raw_json.*`** — the flat `recipients` column is NULL for `zapier-info-routing-ingest` rows (Pitfall 2 / Anti-Pattern).
**`normalizeMessageId(s) = s.replace(/^<|>$/g,"").trim().toLowerCase()`** — apply to BOTH sides before layer-(b) matching (source `raw_json.internetMessageId` carries `<…>`; target column carries `<…>` mixed-case) (Pitfall 2).
**Layer (b)** matches the **target mailbox by address** (`order@smeba.nl`-style outlook rows), NOT the raw `mailbox` string (info@ rows' `mailbox` is a sugarcrm display name — Pitfall 3). Non-ingested target → **graceful skip + coverage-gap log**, do not block (D-04).
**verdict.ts** — Zod schema mirroring the debtor categorical-confidence pattern: `z.object({ bucket: z.enum([...DESTINATION_KEYS]), brand: z.enum(["smeba","fire-control","berki"]).nullable(), confidence: z.enum(["low","medium","high"]), reasoning: z.string() })`. **Invalid/empty agent output → `unrouted` verdict, never throw** (ROUTE-03 acceptance). Build the verdict to the RESEARCH §Discretion 2 JSON shape (`bucket`/`brand`/`target_mailbox`/`confidence`/`dedup{status,matched_layer}`/`unrouted`/`routing_version`).
**What to copy:** the 3-shape extractor + id normalizer verbatim from RESEARCH; the Zod-validate-then-fallback-to-`unrouted` discipline from the debtor schema-registry.
**What to change:** these are new modules — co-locate under the routing capability dir and unit-test each layer (ROUTE-05/06 test map).

---

### 10. `web/scripts/eval/info-routing-precision-shadow.ts` (ROUTE-08 shadow harness)

**Analog:** `web/scripts/eval/info-unknown-pool-noise-baseline.ts` (full file)

**Pure-fn + report-mode + direct-invoke-guard pattern to copy** (baseline lines 79-106 pure fn; 128-165 `main()`; 167-179 invoked-directly guard):
```typescript
export function computeMatchRate(rows: { verdict_bucket: string; human_category: string|null; confidence: string }[]):
  { overall_match_pct: number; per_bucket: {bucket:string;n:number;match_pct:number}[]; graded_n: number; ungraded_n: number } { /* IO-free */ }
async function main(): Promise<void> {
  const mode = process.argv[2] ?? "report"; if (mode !== "report") fail(...);
  const { createAdminClient } = await import("@/lib/supabase/admin"); // lazy — arg-validation needs no env
  // join coordinator_runs.decision_details->routing->>'bucket' (high-confidence only) to delta-synced Outlook category
  // mapped through routing_destinations.outlook_category; print JSON.
}
const invokedDirectly = /info-routing-precision-shadow\.ts$/.test(process.argv[1] ?? "");
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
```
**What to copy:** the pure IO-free compute fn (unit-testable without Supabase), the lazy `createAdminClient` import, the `report` mode, the print-JSON-no-writes shape, the `invokedDirectly` regex guard.
**What to change:** join verdict bucket → human Outlook category; **report `graded_n` and REFUSE a pass/fail when `graded_n` is below a minimum** (Pitfall 6 — 0/8000 categories captured today; the delta-sync prerequisite is OUTSIDE 131). Gate: overall ≥0.85 among high-confidence verdicts. **Build + unit-test the harness in 131; gate the LIVE run on the prerequisite landing — do NOT block the router build on it.**

---

### 11. Co-located `__tests__/*.test.ts`

**Migration-parse analog (ROUTE-01 seed/grep):** `web/lib/swarms/__tests__/sales-noise-calibration.test.ts` (lines 17-60) — `readFileSync` the migration, strip `--` comment lines, regex-assert the exact row/disposition set. Mirror for `routing-destinations-seed.test.ts` (assert the frozen bucket set; assert no hardcoded bucket list / no `swarm_type === 'info-routing'` in TS).
**Mocked-supabase analog (ROUTE-04 verdict):** `web/lib/inngest/functions/__tests__/*.test.ts` (the mocked-client coordinator tests) — mirror for `coordinator-routing-verdict.test.ts`.
**Pure-fn analog (ROUTE-05/06/08):** import the pure helper only (dedup, verdict, `computeMatchRate`) and drive it without Supabase — exactly how the baseline eval test imports `computeUnknownShare`.
**What to copy:** the comment-stripping migration parser; the import-pure-fn-only discipline; Vitest `describe/it/expect`; co-located `__tests__/` placement.
**Run commands** (RESEARCH §Validation): per-task `cd web && npx vitest run <path>`; per-wave `cd web && npm test` + `npm run codegen && git diff --exit-code`; phase-gate full suite + `npm run check:supabase`.

---

## Shared Patterns

### Registry-as-source-of-truth (SWARM-02 — applies to #1, #5, #6, #7)
**Source:** `20260521_info_routing_swarm_smeba_minimum_viable.sql` (seed) + `gen-intent-types.ts` (codegen) + `registry.ts` `loadSwarmIntents`.
**Apply to:** all registry tables/loaders/codegen this phase. Zero `if swarm_type === 'info-routing'` branches; a new bucket/mailbox is one INSERT; the bucket enum is codegen'd (TS ↔ DB ↔ Orq single-source); the codegen output is never hand-edited. CI gate: `npm run codegen && git diff --exit-code`.

### RLS-mandatory-in-migration (applies to #1)
**Source:** `supabase/migrations/_template.sql:21-58`.
**Apply to:** the `routing_destinations` CREATE. CREATE → `ENABLE ROW LEVEL SECURITY` → `service_role FOR ALL` policy in ONE migration; add `authenticated FOR SELECT` for Phase 132 UI; NEVER `anon`. `npm run check:supabase` pre-push hook fails on any ERROR-level advisor lint (Pitfall 5).

### Inngest replay-safety (applies to #7)
**Source:** debtor-email-coordinator.ts:158-168 (`resolve-run-id`) + the `persist-ranked` single-step dual-write (345-414).
**Apply to:** the routing capability block. All side effects in `step.run`; reuse the replay-safe `run_id`; never generate a DB-key UUID/`Date.now()` outside `step.run`; never alias `inngest.send` (call inline) — CLAUDE.md Inngest / Phase 65.

### Orq strict-mode conventions (applies to #4, #9)
**Source:** CLAUDE.md Orq.ai block + `client.ts` `invokeOrqAgent` (45s deadline, fence-strip, JSON.parse) + the debtor agent row's schema (but with the **corrected `anyOf` nullable**, not the array-shorthand at `20260429g_…:75`).
**Apply to:** the `info-routing-coordinator` registration + the Zod validator. `anyOf` for every nullable; `list_models` before create/update; `create_agent` bare → PATCH `model.parameters` → `get_agent` verify; Zod-validate output; off-list/invalid → `unrouted` (no crash). Transport reuses `invokeOrqAgent` unchanged.

### Verdict-only / no-forward hold (applies to #2, #7)
**Source:** `dry-run-gate/index.ts:isStage3RoutingGated` (lines 95-99) + the coordinator held path (471-496) + `20260609c_…` seed.
**Apply to:** ROUTE-07. Seed `stage_3_routing=true` → the existing held path persists the verdict and withholds the predicted-emit → no Stage 4, no forward, no Stage-2 invoke (Stage 2 stays null). No new gating code; grep/test gate proves no Graph forward reachable.

---

## No Analog Found

| File | Role | Data Flow | Reason | Mitigation |
|------|------|-----------|--------|------------|
| `routing/dedup.ts` (`extractRecipientAddresses`, `normalizeMessageId`, layer a/b) | pure-fn helper | transform | No existing dedup/recipient-extraction helper in the repo; the 3-shape heterogeneity is a 2026-06-17 live-probe discovery | RESEARCH §Code Examples gives the full implementation to copy verbatim; Pitfalls 2/3 give the normalization + mailbox-address rules. Treat RESEARCH as the analog. |

> Every other file maps to a confirmed in-repo analog. The dedup helper is the only genuinely new logic; its shape is fully specified in RESEARCH (not abstract).

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `web/lib/inngest/functions/` (+ `__tests__/`), `web/lib/pipeline-gating/dry-run-gate/`, `web/lib/automations/orq-agents/`, `web/lib/automations/debtor-email/coordinator/`, `web/lib/swarms/` (+ `__tests__/`), `web/scripts/`, `web/scripts/eval/` (+ `__tests__/`).
**Files scanned:** 12 analog files read in full or targeted ranges (debtor-email-coordinator.ts 561 lines; client.ts 250; dry-run-gate 128; gen-intent-types 156; eval baseline 179; registry.ts 1-120; 5 migrations; 1 test).
**Pattern extraction date:** 2026-06-17

---

## PATTERN MAPPING COMPLETE

**Phase:** 131 - Destination taxonomy + Stage-3 router (info-routing swarm)
**Files classified:** 12
**Analogs found:** 12 / 12 (11 exact/role-match in-repo; 1 research-specified for the net-new dedup helper)

### Coverage
- Files with exact analog: 10
- Files with role-match analog: 1 (verdict.ts → persist-ranked shape + debtor Zod)
- Files with no in-repo analog: 1 (dedup.ts — fully specified in RESEARCH §Code Examples)

### Key Patterns Identified
- **Routing is an additive, registry-gated capability inside the existing generic coordinator** (`debtor-email-coordinator.ts`) — mirror the `loadSwarm`→presence-gate seam; `routingDestinations.length > 0` gates the block; debtor/sales get `[]` → byte-neutral. NO new Inngest function, NO `swarm_type` branch, NO dispatcher edit.
- **No-forward (ROUTE-07) is free** — seed `dry_run_config.stage_3_routing=true`; the existing `isStage3RoutingGated` held path persists the verdict and withholds the predicted-emit. No new gating code.
- **Registry-as-source-of-truth end to end** — `routing_destinations` table (RLS triad from `_template.sql`) → codegen (`gen-intent-types.ts` clone, alphabetical + skip-if-identical) → bucket enum drives BOTH the TS literal-union AND the Orq agent json_schema; `loadRoutingDestinations` clones `loadSwarmIntents` (60s TTL + last-known-good).
- **Verdict reuses the Stage-3 persistence path** — `coordinator_runs.decision_details.routing` (additive key) + `emitPipelineEvent` TELE-01 in the SAME `step.run` (single replay boundary); Bulk Review (132) reads it free. No `routing_verdicts` table.
- **Dedup is the only net-new logic** — read `raw_json.*` (NOT the NULL `recipients` column for info-routing rows), normalize message-ids (strip `<>`, lowercase) on both sides, match target by address not the display-name `mailbox`; graceful skip + coverage-gap log for non-ingested targets. Shape fully given in RESEARCH.

### File Created
`.planning/phases/131-destination-taxonomy-stage-3-router-v9-7-p1/131-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. The planner can reference each analog (file + line range) and the per-file "what to copy / what to change" directly in PLAN.md action sections, following the A→B→C→(D∥E) wave decomposition in RESEARCH §Recommended Wave Decomposition.
