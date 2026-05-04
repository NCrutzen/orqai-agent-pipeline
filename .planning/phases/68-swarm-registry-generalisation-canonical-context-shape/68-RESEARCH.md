# Phase 68: swarm_registry generalisation + canonical context shape — Research

**Researched:** 2026-05-04
**Domain:** Postgres schema + TypeScript registry helpers + Inngest dispatch refactor
**Confidence:** HIGH (all decisions locked in 68-CONTEXT.md; this research enumerates the exact backfill content + swap sites)

## Summary

Phase 68 is a pure refactor: lift four swarm-specific bindings out of code into `public.swarms` registry rows, plus add a `public.swarm_intents` child table that replaces the template-literal intent→handler-event mapping in coordinator-orchestrator. No new Inngest events, no new Orq agents, no new handler logic. The migration carries all backfill content for the existing `debtor-email` swarm; four call sites in `web/lib/inngest/functions/` swap from hardcoded constants to registry lookups; one new helper module (`web/lib/swarms/dynamic.ts`) caches dynamic `import()` calls for Stage 1/2 module paths; one synthetic `sales-email-stub` test proves SWRM-03.

**Primary recommendation:** Backfill the migration with the exact rows in `## Migration Backfill Content` below — every value verified against the live codebase. Plan five waves: (0) migration file + helper skeletons, (1) apply migration, (2) helper modules + unit tests, (3) swap call sites (one commit each), (4) sales-email-stub test, (5) static-audit + doc update.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration shape (SWRM-01, SWRM-02)**
- D-01: Single migration `supabase/migrations/20260504b_swarms_registry_generalisation.sql` adds 4 columns to `public.swarms` (`stage1_regex_module text`, `stage2_entity_resolver text`, `stage3_coordinator_agent_key text`, `canonical_context_shape jsonb`), creates `public.swarm_intents` (composite PK `(swarm_type, intent_key)` + `handler_agent_key text NOT NULL` + `handler_event text NOT NULL` + `requires_orchestration boolean default false` + `created_at timestamptz default now()`, `ON DELETE CASCADE` to swarms), index on `swarm_intents.handler_event`, backfills existing debtor-email row + intent rows. All `IF NOT EXISTS` for idempotency.
- D-02: `stage1_regex_module` = TS module path string. For debtor-email: `"@/lib/debtor-email/classify"`. Loader does `await import(path)`.
- D-03: `stage2_entity_resolver` = TS module path string. For debtor-email: `"@/lib/automations/debtor-email/resolve-debtor"`. Module exports `resolveEntity` (alias of `resolveDebtor`).
- D-04: `stage3_coordinator_agent_key` = `orq_agents.agent_key` reference. For debtor-email: `"debtor-intent-agent"`. Looked up via existing `loadAgentSpec`.
- D-05: `canonical_context_shape` = versioned jsonb document with `version`, `fields` map (customer_account_id, customer_name, language, entity_brand, recent_documents). Stored only in Phase 68; consumed by Phase 69.

**`side_effects[]` shape (SWRM-04)**
- D-06: Array of side-effect descriptors `{event, trigger, gate, phase_origin}`. Trigger enum: `stage1_categorize_archive | stage2_match_live | stage3_handler_complete | stage4_synthesis_complete`.
- D-07: New module `web/lib/swarms/side-effects.ts` exports `evaluateSideEffects(swarm_type, trigger, ctx): SideEffectDispatch[]`.
- D-08: Backfill the two known side-effects (Phase 67 icontroller-tag + Phase 56.7 icontroller-cleanup) in the migration.

**`swarm_intents` content (SWRM-02)**
- D-09: Backfill row per current intent enum value (8 V2 intents); `handler_event = "debtor-email/${intent}.requested"`; `handler_agent_key` real where handler exists, else null; `requires_orchestration = false` for all V1.
- D-10: Coordinator-orchestrator template-literal swaps to registry lookup.

**Code-edit scope (SWRM-03)**
- D-11: Update `classifier-verdict-worker.ts`, `classifier-label-resolver.ts`, `coordinator-orchestrator.ts`, `debtor-email-coordinator.ts`. Add `loadHandlerEvent` / `loadSideEffects` / `loadCanonicalContextShape` to `web/lib/swarms/registry.ts`.
- D-12: No defensive fallback — throw on missing registry row.

**`swarm_type === 'debtor-email'` gate elimination (SWRM-04)**
- D-13: Audit; replace each gate with registry lookup; today only `classifier-verdict-worker.ts:14` (comment) + `:129` (the actual gate) match.

**Cutover sequencing**
- D-14: Single PR, sequential waves 0–5 as enumerated in CONTEXT.md.

**Stage 1 / Stage 2 module loading**
- D-15: `web/lib/swarms/dynamic.ts` wraps `import()` with module-level Map cache. Exports `loadStage1Classifier(swarm_type): Promise<ClassifyFn>` and `loadStage2Resolver(swarm_type): Promise<ResolveEntityFn>` with typed return signatures (cast happens once inside the helper).

### Claude's Discretion

- Alias-export vs rename for `resolveDebtor`: **recommend keep `resolveDebtor`, add `resolveEntity` alias** for code-grep continuity.
- Migration column order in `swarms` ALTER: cosmetic — recommend grouping the 4 new stage-binding columns together.
- Seed `canonical_context_shape` in Phase 68 (not Phase 69): **recommend YES — shape is locked in D-05**.
- Add `swarms.entity_brand jsonb` column in this phase (Phase 69 needs it for CANO-02): **recommend YES** — backfill `["smeba", "smeba-fire", "sicli-noord", "sicli-sud", "berki"]`.

### Deferred Ideas (OUT OF SCOPE)

- Handler-agent canonicalisation (CANO-01..04) — Phase 69.
- `pipeline_events` runtime telemetry — Phase 70 (TELE-*).
- Override learning loop / `promotion_candidates` — Phase 71 (LERN-*).
- Actual sales-email swarm implementation — Phase 73.
- Stage 1 worker for `classifier/screen.requested` — deferred from Phase 66.
- Migration of `swarm_categories` rows into `swarm_intents` — they serve different stages; coexist.
- `findMessageRow` pagination — carry from Phase 67.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SWRM-01 | `public.swarms` extended with `stage1_regex_module`, `stage2_entity_resolver`, `stage3_coordinator_agent_key`, `side_effects[]` jsonb, canonical context-shape contract | `side_effects` already exists (verified — `web/lib/swarms/types.ts:31`); other 4 columns added in single migration; `canonical_context_shape` jsonb spec in D-05; `entity_brand` jsonb added per Discretion |
| SWRM-02 | New `swarm_intents` table replaces hardcoded intent→handler mappings | Source of truth = `INTENT` enum in `web/lib/automations/debtor-email/coordinator/types.ts:17-26` (8 values). Today's mappings live in coordinator-orchestrator.ts:94 (template literal) + swarm_categories `swarm_dispatch` for ranked[0] single-shot |
| SWRM-03 | Adding new swarm = registry INSERTs only; zero code edits | Proven via synthetic `sales-email-stub` row inserted in vitest test calling `loadSwarmRegistry("sales-email-stub")` |
| SWRM-04 | `verdict-worker` `swarm_type === 'debtor-email'` gate replaced by `side_effects[]` lookup | One literal site at `classifier-verdict-worker.ts:129` (verified by grep — `## Existing Code Inventory` below) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| swarm/intent registry rows | Database (Postgres `public.swarms` + `public.swarm_intents`) | — | Mutation-rare, read-heavy registry. Same pattern as existing `swarm_categories` and `zapier_tools`. |
| Registry caching helpers | Backend (`web/lib/swarms/registry.ts`) | — | 60s TTL Map, last-known-good on Supabase error. Existing `loadSwarm` / `loadSwarmCategories` pattern. |
| Side-effect dispatcher | Backend (`web/lib/swarms/side-effects.ts`) | Inngest functions consume | Pure function: `(swarm_type, trigger, ctx) → SideEffectDispatch[]`. Caller emits the events. |
| Stage 1/2 dynamic module loading | Backend (`web/lib/swarms/dynamic.ts`) | Inngest functions consume | `import()` cache keyed by module path string. Resolves at runtime, cached for cold-start lifetime. |
| Side-effect emission | Inngest functions (`classifier-verdict-worker`, `classifier-label-resolver`) | — | The Inngest worker remains responsible for `inngest.send`; only the *list* of dispatches comes from registry. |
| Intent→handler-event lookup | Inngest functions (`coordinator-orchestrator`, `debtor-email-coordinator`) | Backend helpers | Replace template literal with `loadHandlerEvent` call. |

## Existing Code Inventory (4 swap sites)

### Site 1: `web/lib/inngest/functions/classifier-verdict-worker.ts`

**File length:** 215 lines.

**`swarm_type === 'debtor-email'` gates:**
- Line 14: comment only (`// D-12: iController-delete is gated on swarm_type === 'debtor-email'`).
- Line 129: actual gate — `if (swarm_type === "debtor-email") { ... step.run("queue-icontroller-delete", ...) ... }` inside the `case "categorize_archive"` branch.

**The "icontroller cleanup" side-effect today:**
- Lines 129–146: the gate INSERTs an `automation_runs` row with `automation: "debtor-email-cleanup"`, `status: "deferred"`, `result: { stage: "icontroller_delete", ..., icontroller: "pending" }`. **It does NOT emit an Inngest event.** The actual `icontroller/cleanup.shard.requested` event is fanned out by the *separate* cron-driven `cleanupIControllerDispatch` (`debtor-email-icontroller-cleanup-dispatcher.ts:91`), which polls `automation_runs WHERE result->>icontroller='pending'`.

**Implication for D-08 backfill:** the `stage1_categorize_archive` side-effect for debtor-email is NOT an Inngest event emit — it is an `automation_runs.insert` action. The `side_effects[]` descriptor must encode "insert deferred row in automation_runs" not "emit Inngest event". This requires one of:
- **Option A (recommended):** generalise `side_effects[]` descriptor to support `kind: "automation_run_insert" | "inngest_event"`. Backfill row uses `kind: "automation_run_insert"` with `automation: "debtor-email-cleanup"` + `result_template: { stage: "icontroller_delete", icontroller: "pending" }`. Keep the existing dispatcher cron untouched — it still picks up these rows.
- **Option B:** introduce a new Inngest event `debtor-email/cleanup.queued` that the verdict-worker emits and a thin new function inserts the deferred automation_runs row. Adds an event hop — net negative.

**Recommendation:** Option A. CONTEXT D-06 lists `event` in the descriptor schema, but the schema is locked-in-spirit, not locked-in-syntax — flag this for the planner so the descriptor shape supports both kinds.

### Site 2: `web/lib/inngest/functions/classifier-label-resolver.ts`

**File length:** 366 lines.

**Phase 67 icontroller-tag emit:**
- Lines 241–279: gate `if (result.customer_account_id !== null && !dryRun && (settingsRow?.icontroller_company ?? null) !== null && isKnownMailbox(source_mailbox))` then `step.run("emit-icontroller-tag", ...) → inngest.send({ name: "debtor-email/icontroller-tag.requested", data: {...} })`.

**Phase 68 swap shape:**
```typescript
const dispatches = evaluateSideEffects("debtor-email", "stage2_match_live", {
  dry_run: dryRun,
  customer_account_id_present: result.customer_account_id !== null,
  icontroller_company_present: (settingsRow?.icontroller_company ?? null) !== null,
});
for (const dispatch of dispatches) {
  await step.run(`emit-${dispatch.event}`, async () =>
    (inngest.send as unknown as SendFn)({
      name: dispatch.event,
      data: { /* same payload as today */ },
    }),
  );
}
```

**Note:** the `data` payload is rich (10 fields including `mailboxListUrl`, `email_label_id`, etc.) — the side-effect descriptor cannot encode all of it. The caller still owns payload construction; the registry only owns "which events fire under which conditions". Document this in the helper's JSDoc.

**`isKnownMailbox(source_mailbox)` gate:** today this is also part of the if-condition. Two options: add it to the registry `gate` map (`source_mailbox_known: true`) and have `evaluateSideEffects` know how to check it, OR keep it as a guard at the call site. Recommend **call-site guard** — registry gates should be simple key/value matches, not function calls.

### Site 3: `web/lib/inngest/functions/coordinator-orchestrator.ts`

**Lines 90–109:** the fan-out block.

**Today (line 94):**
```typescript
name: `debtor-email/${h.intent}.requested`,
```

**Phase 68 swap:**
```typescript
const handler_event = await loadHandlerEvent(admin, "debtor-email", h.intent);
if (!handler_event) {
  throw new Error(`no handler for intent "${h.intent}" in swarm "debtor-email"`);
}
// ... use handler_event in inngest.send
```

**Note:** the lookup must happen INSIDE `step.run("fan-out", ...)` to be replay-safe. Cache via Map in `dynamic.ts`/`registry.ts` so the second replay doesn't repeat the round-trip.

### Site 4: `web/lib/inngest/functions/debtor-email-coordinator.ts`

**Lines 213–243:** the single-shot dispatch block.

**Today:** uses `swarm_categories.swarm_dispatch` (loaded via `loadSwarmCategories`) for `ranked[0].intent`. Lines 218–220:
```typescript
const categories = await loadSwarmCategories(supabase, SWARM_TYPE);
const category = categories.find((c) => c.category_key === top.intent);
if (!category?.swarm_dispatch) { throw new Error(...) }
```

**Phase 68 conflict resolution (research question 10):**
- `swarm_categories` has 8 rows where `category_key ∈ INTENT_ENUM` AND `action = 'swarm_dispatch'`. Today only `(debtor-email, invoice_copy_request)` has `swarm_dispatch = "debtor-email/invoice-copy.requested"` (per migration `20260430b_swarm_categories_invoice_copy_dispatch.sql:15-19`).
- `swarm_intents.handler_event` for the same intent in Phase 68 will be `"debtor-email/copy_document_request.requested"` (matching the events.ts:412 entry — the canonical Phase 65 fan-out event).
- **Conflict.** `invoice_copy_request` (the swarm_categories row) ≠ `copy_document_request` (the V2 INTENT enum). They are two different category-keys representing two different routes:
  - `invoice_copy_request` is an **operator override** label assigned in classifier-verdict-worker (the operator says "this is an invoice copy request" → fires `debtor-email/invoice-copy.requested` → goes through the simple Phase 56-02 single-handler flow).
  - `copy_document_request` is the **V2 ranked-intent** value emerging from the coordinator's intent agent → fires `debtor-email/copy_document_request.requested` → goes through the Phase 65 fan-out plumbing.

**Recommendation:** swarm_intents covers the Phase 65 fan-out (V2 INTENT enum, 8 rows). swarm_categories stays as-is for the Stage-1-output dispatch (operator-override flow). The two systems do not alias; debtor-email-coordinator's single-shot path swaps to read from `swarm_intents` because it uses V2 INTENT enum values; classifier-verdict-worker stays on `swarm_categories` for its category-key (operator-override) flow. **No row migration needed; both registries coexist as CONTEXT explicitly states.**

**Swap shape (lines 217–227):**
```typescript
const top = output.ranked[0];
const handler_event = await loadHandlerEvent(supabase, SWARM_TYPE, top.intent);
if (!handler_event) {
  throw new Error(
    `no swarm_intents row for (${SWARM_TYPE}, ${top.intent}) — verify Phase 68 migration applied`,
  );
}
await step.run("dispatch-single-shot", async () => {
  await (inngest.send as unknown as DynamicSend)({
    name: handler_event,
    data: { run_id, email_id, automation_run_id, intent: top.intent, ranked: output.ranked, budget_run_id, swarm_type: SWARM_TYPE },
  });
});
```

### Existing helper to extend: `web/lib/swarms/registry.ts`

**Today (69 lines):**
- Module-level Maps: `SWARM_CACHE`, `CATEGORIES_CACHE` (60s TTL).
- Exports: `loadSwarm(admin, swarmType): Promise<SwarmRow | null>`, `loadSwarmCategories(admin, swarmType): Promise<SwarmCategoryRow[]>`, `__resetCacheForTests()`.

**Phase 68 additions:**
- `loadSwarmIntents(admin, swarmType): Promise<SwarmIntentRow[]>` — same pattern, new cache Map.
- `loadHandlerEvent(admin, swarmType, intent_key): Promise<string | null>` — thin wrapper that filters `loadSwarmIntents` by `intent_key`.
- `loadSideEffects(admin, swarmType, trigger): Promise<SideEffectDescriptor[]>` — reads `swarms.side_effects` jsonb (already in `SwarmRow.side_effects`) and filters by `trigger`. (Helper `evaluateSideEffects` lives in `side-effects.ts` and additionally evaluates the `gate` against runtime ctx.)
- `loadCanonicalContextShape(admin, swarmType): Promise<CanonicalContextShape | null>` — reads new `swarms.canonical_context_shape` jsonb column.
- Update `SwarmRow` type in `web/lib/swarms/types.ts` to include the 4 new columns + optional `entity_brand: string[] | null`.

## Migration Backfill Content (full SQL)

**File:** `supabase/migrations/20260504b_swarms_registry_generalisation.sql`

```sql
-- Phase 68. swarm_registry generalisation + canonical context shape.
-- Lifts hardcoded swarm-specific bindings into data: stage1/2 module paths,
-- stage3 coordinator agent_key, side_effects[], canonical context shape, +
-- per-swarm intent→handler mapping. After this migration, onboarding a new
-- swarm = registry INSERTs only; zero code edits in verdict-worker /
-- label-resolver / coordinator-orchestrator.

-- ---- 1. Extend public.swarms -----------------------------------------------

alter table public.swarms
  add column if not exists stage1_regex_module        text,
  add column if not exists stage2_entity_resolver     text,
  add column if not exists stage3_coordinator_agent_key text,
  add column if not exists canonical_context_shape    jsonb,
  add column if not exists entity_brand               jsonb;

-- ---- 2. Create public.swarm_intents ----------------------------------------

create table if not exists public.swarm_intents (
  swarm_type              text        not null references public.swarms(swarm_type) on delete cascade,
  intent_key              text        not null,
  handler_agent_key       text,                                         -- D-09: nullable for intents without a handler yet
  handler_event           text        not null,
  requires_orchestration  boolean     not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (swarm_type, intent_key)
);

create index if not exists swarm_intents_handler_event_idx
  on public.swarm_intents (handler_event);

create or replace function public.swarm_intents_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists swarm_intents_updated_at on public.swarm_intents;
create trigger swarm_intents_updated_at
  before update on public.swarm_intents
  for each row execute function public.swarm_intents_set_updated_at();

-- ---- 3. Backfill debtor-email swarm row ------------------------------------

update public.swarms
   set stage1_regex_module        = '@/lib/debtor-email/classify',
       stage2_entity_resolver     = '@/lib/automations/debtor-email/resolve-debtor',
       stage3_coordinator_agent_key = 'debtor-intent-agent',
       canonical_context_shape    = jsonb_build_object(
         'version', '2026-05-04.v1',
         'fields', jsonb_build_object(
           'customer_account_id', jsonb_build_object('type','string','nullable',true,'description','Stage 2 entity-resolution output'),
           'customer_name',       jsonb_build_object('type','string','nullable',true),
           'language',            jsonb_build_object('type','string','enum', jsonb_build_array('nl','en','de','fr'), 'default','nl'),
           'entity_brand',        jsonb_build_object('type','string','description','Brand suffix used by handler agents (R-04 / Phase 69)'),
           'recent_documents',    jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array())
         )
       ),
       entity_brand = jsonb_build_array('smeba','smeba-fire','sicli-noord','sicli-sud','berki'),
       side_effects = jsonb_build_array(
         jsonb_build_object(
           'event',        'debtor-email/icontroller-tag.requested',
           'kind',         'inngest_event',
           'trigger',      'stage2_match_live',
           'gate',         jsonb_build_object(
             'dry_run',                       false,
             'customer_account_id_present',   true,
             'icontroller_company_present',   true
           ),
           'phase_origin', '67'
         ),
         jsonb_build_object(
           'kind',         'automation_run_insert',
           'automation',   'debtor-email-cleanup',
           'trigger',      'stage1_categorize_archive',
           'gate',         jsonb_build_object(
             'category_action', 'categorize_archive'
           ),
           'result_template', jsonb_build_object(
             'stage',        'icontroller_delete',
             'icontroller',  'pending'
           ),
           'phase_origin', '56.7'
         )
       )
 where swarm_type = 'debtor-email';

-- ---- 4. Backfill swarm_intents for debtor-email V2 INTENT enum -------------
-- Source: web/lib/automations/debtor-email/coordinator/types.ts INTENT (8 values).
-- handler_event = "debtor-email/<intent>.requested" (matches events.ts entries).
-- handler_agent_key = real key when a handler agent exists, null otherwise.
-- requires_orchestration = false for all V1 intents (orchestration gate is
-- evaluated at coordinator runtime, not by the registry).

insert into public.swarm_intents (swarm_type, intent_key, handler_agent_key, handler_event, requires_orchestration) values
  ('debtor-email', 'copy_document_request', 'debtor-copy-document-body-agent', 'debtor-email/copy_document_request.requested', false),
  ('debtor-email', 'payment_dispute',       null,                              'debtor-email/payment_dispute.requested',       false),
  ('debtor-email', 'address_change',        null,                              'debtor-email/address_change.requested',        false),
  ('debtor-email', 'peppol_request',        null,                              'debtor-email/peppol_request.requested',        false),
  ('debtor-email', 'credit_request',        null,                              'debtor-email/credit_request.requested',        false),
  ('debtor-email', 'contract_inquiry',      null,                              'debtor-email/contract_inquiry.requested',      false),
  ('debtor-email', 'general_inquiry',       null,                              'debtor-email/general_inquiry.requested',       false),
  ('debtor-email', 'other',                 null,                              'debtor-email/other.requested',                 false)
on conflict (swarm_type, intent_key) do nothing;
```

**Notes on the backfill:**

- **`handler_agent_key`** for `copy_document_request` = `debtor-copy-document-body-agent` (verified in `classifier-invoice-copy-handler.ts:42` and `output-adapter.ts:76`). Other 7 intents have no handler agent today; the planner can confirm they all route to a generic per-intent Inngest function (each event has a registered handler in `events.ts:412-498`).
- **`canonical_context_shape`** — `entity_brand` is intentionally NOT typed with `enum` here even though `swarms.entity_brand` carries the enumerated list. Phase 69 will read both columns: `canonical_context_shape` describes the *shape*, `entity_brand` carries the *values*. Keeping them separate avoids a schema/values mix.
- **`side_effects[]` `kind` discriminator** — added per the verdict-worker investigation (Site 1). The Phase 67 icontroller-tag is `kind: "inngest_event"`; the Phase 56.7 cleanup is `kind: "automation_run_insert"`. The dispatcher in `side-effects.ts` switches on `kind`.

## Helper Module Shapes

### `web/lib/swarms/registry.ts` (extension)

```typescript
const INTENTS_CACHE = new Map<string, { value: SwarmIntentRow[]; expires: number }>();

export async function loadSwarmIntents(admin: SupabaseClient, swarmType: string): Promise<SwarmIntentRow[]> {
  // Same TTL/last-known-good pattern as loadSwarmCategories.
}

export async function loadHandlerEvent(admin: SupabaseClient, swarmType: string, intentKey: string): Promise<string | null> {
  const intents = await loadSwarmIntents(admin, swarmType);
  return intents.find((i) => i.intent_key === intentKey)?.handler_event ?? null;
}

export async function loadCanonicalContextShape(admin: SupabaseClient, swarmType: string): Promise<CanonicalContextShape | null> {
  const swarm = await loadSwarm(admin, swarmType);
  return (swarm?.canonical_context_shape as CanonicalContextShape | null) ?? null;
}
```

### `web/lib/swarms/side-effects.ts` (new module)

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSwarm } from "./registry";

export type SideEffectKind = "inngest_event" | "automation_run_insert";
export type SideEffectTrigger =
  | "stage1_categorize_archive"
  | "stage2_match_live"
  | "stage3_handler_complete"
  | "stage4_synthesis_complete";

export interface InngestEventDescriptor {
  kind: "inngest_event";
  event: string;
  trigger: SideEffectTrigger;
  gate: Record<string, unknown>;
  phase_origin: string;
}
export interface AutomationRunInsertDescriptor {
  kind: "automation_run_insert";
  automation: string;
  trigger: SideEffectTrigger;
  gate: Record<string, unknown>;
  result_template: Record<string, unknown>;
  phase_origin: string;
}
export type SideEffectDescriptor = InngestEventDescriptor | AutomationRunInsertDescriptor;

export async function evaluateSideEffects(
  admin: SupabaseClient,
  swarmType: string,
  trigger: SideEffectTrigger,
  ctx: Record<string, unknown>,
): Promise<SideEffectDescriptor[]> {
  const swarm = await loadSwarm(admin, swarmType);
  const all = (swarm?.side_effects as SideEffectDescriptor[] | null) ?? [];
  return all
    .filter((d) => d.trigger === trigger)
    .filter((d) => Object.entries(d.gate).every(([k, v]) => ctx[k] === v));
}
```

### `web/lib/swarms/dynamic.ts` (new module)

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSwarm } from "./registry";

const MODULE_CACHE = new Map<string, unknown>();

async function importByPath<T>(path: string): Promise<T> {
  const hit = MODULE_CACHE.get(path);
  if (hit) return hit as T;
  // Path string MUST resolve at runtime — Next.js / Vercel / vitest all
  // handle dynamic import() against `@/...` aliases via tsconfig paths.
  const mod = (await import(/* @vite-ignore */ path)) as T;
  MODULE_CACHE.set(path, mod);
  return mod;
}

// Stage 1 contract: module exports `classify(email): RegexClassifyResult`
export type ClassifyFn = (email: { subject: string; body_text: string; sender_email: string }) => unknown; // typed via stage-1-regex.md contract
export async function loadStage1Classifier(admin: SupabaseClient, swarmType: string): Promise<ClassifyFn> {
  const swarm = await loadSwarm(admin, swarmType);
  const path = swarm?.stage1_regex_module;
  if (!path) throw new Error(`swarm "${swarmType}" missing stage1_regex_module`);
  const mod = await importByPath<{ classify?: ClassifyFn }>(path);
  if (typeof mod.classify !== "function") {
    throw new Error(`module "${path}" does not export classify()`);
  }
  return mod.classify;
}

// Stage 2 contract: module exports `resolveEntity(args): EntityResolveResult`
export type ResolveEntityFn = (...args: unknown[]) => Promise<unknown>;
export async function loadStage2Resolver(admin: SupabaseClient, swarmType: string): Promise<ResolveEntityFn> {
  const swarm = await loadSwarm(admin, swarmType);
  const path = swarm?.stage2_entity_resolver;
  if (!path) throw new Error(`swarm "${swarmType}" missing stage2_entity_resolver`);
  const mod = await importByPath<{ resolveEntity?: ResolveEntityFn }>(path);
  if (typeof mod.resolveEntity !== "function") {
    throw new Error(`module "${path}" does not export resolveEntity()`);
  }
  return mod.resolveEntity;
}
```

**Aliasing note (Discretion):** in `web/lib/automations/debtor-email/resolve-debtor.ts` add one line:
```typescript
export { resolveDebtor as resolveEntity } from "./resolve-debtor";  // Phase 68 alias for Stage-2 contract
```
or a re-export if the file is the entry-point itself. Keep `resolveDebtor` for grep continuity.

## sales-email-stub Test Shape (SWRM-03 proof)

**Location:** `web/lib/swarms/__tests__/registry-stub.test.ts` (new file).

**Structure:**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmIntents,
  loadHandlerEvent,
  loadCanonicalContextShape,
  __resetCacheForTests,
} from "../registry";
import { evaluateSideEffects } from "../side-effects";

const STUB_SWARM = "sales-email-stub";

describe("Phase 68 SWRM-03: zero-code-edit swarm onboarding", () => {
  const admin = createAdminClient();

  beforeAll(async () => {
    // Seed stub swarm + 3 intents.
    await admin.from("swarms").insert({
      swarm_type: STUB_SWARM,
      display_name: "Sales-email stub (Phase 68 test)",
      review_route: "/automations/sales-email/review",
      source_table: "automation_runs",
      enabled: true,
      stage1_regex_module: "@/lib/debtor-email/classify",        // reuses real module so import() succeeds
      stage2_entity_resolver: "@/lib/automations/debtor-email/resolve-debtor",
      stage3_coordinator_agent_key: "debtor-intent-agent",
      canonical_context_shape: { version: "stub.v1", fields: { customer_id: { type: "string" } } },
      entity_brand: ["sugarcrm-test"],
      side_effects: [
        { kind: "inngest_event", event: "sales-email/notify.requested", trigger: "stage2_match_live", gate: { foo: true }, phase_origin: "68-test" },
      ],
    });
    await admin.from("swarm_intents").insert([
      { swarm_type: STUB_SWARM, intent_key: "lead_qualify",  handler_agent_key: null, handler_event: "sales-email/lead_qualify.requested",  requires_orchestration: false },
      { swarm_type: STUB_SWARM, intent_key: "demo_request",  handler_agent_key: null, handler_event: "sales-email/demo_request.requested",  requires_orchestration: false },
      { swarm_type: STUB_SWARM, intent_key: "pricing_query", handler_agent_key: null, handler_event: "sales-email/pricing_query.requested", requires_orchestration: false },
    ]);
    __resetCacheForTests();
  });

  afterAll(async () => {
    // ON DELETE CASCADE cleans swarm_intents.
    await admin.from("swarms").delete().eq("swarm_type", STUB_SWARM);
  });

  it("loadSwarm returns stub row with all 5 new columns populated", async () => {
    const swarm = await loadSwarm(admin, STUB_SWARM);
    expect(swarm?.stage1_regex_module).toBe("@/lib/debtor-email/classify");
    expect(swarm?.stage2_entity_resolver).toBe("@/lib/automations/debtor-email/resolve-debtor");
    expect(swarm?.stage3_coordinator_agent_key).toBe("debtor-intent-agent");
    expect((swarm as any)?.canonical_context_shape?.version).toBe("stub.v1");
    expect((swarm as any)?.entity_brand).toContain("sugarcrm-test");
  });

  it("loadSwarmIntents returns 3 stub intents", async () => {
    const intents = await loadSwarmIntents(admin, STUB_SWARM);
    expect(intents).toHaveLength(3);
    expect(intents.map((i) => i.intent_key).sort()).toEqual(["demo_request", "lead_qualify", "pricing_query"]);
  });

  it("loadHandlerEvent maps intent_key to handler_event", async () => {
    expect(await loadHandlerEvent(admin, STUB_SWARM, "demo_request")).toBe("sales-email/demo_request.requested");
    expect(await loadHandlerEvent(admin, STUB_SWARM, "missing_intent")).toBeNull();
  });

  it("evaluateSideEffects filters by trigger AND gate", async () => {
    const matched = await evaluateSideEffects(admin, STUB_SWARM, "stage2_match_live", { foo: true });
    expect(matched).toHaveLength(1);
    const noMatch = await evaluateSideEffects(admin, STUB_SWARM, "stage2_match_live", { foo: false });
    expect(noMatch).toHaveLength(0);
  });

  it("loadCanonicalContextShape returns the stored shape", async () => {
    const shape = await loadCanonicalContextShape(admin, STUB_SWARM);
    expect((shape as any)?.version).toBe("stub.v1");
  });
});
```

**Why this proves SWRM-03:** the test seeds a brand-new `swarm_type` and exercises every Phase 68 helper without modifying any source file. If any helper hardcodes "debtor-email" the test fails. Cleanup uses CASCADE so it's safe to re-run.

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Migration ALTER TABLE blocks live writes on `swarms` | Very low | Low | Postgres 15 fast-default, `swarms` has 1 row, all new columns nullable. |
| R2 | `swarm_intents` ON DELETE CASCADE causes accidental data loss | Low | Medium | Confirm no app code does soft-delete-then-INSERT on swarms. Today no deletes occur; flag in Wave 5 audit. |
| R3 | Dynamic `import(path)` fails at Vercel build because path is a runtime string | Medium | High | Vite-style `/* @vite-ignore */` comment + tsconfig `paths` resolution. Validate in Wave 2 unit test that imports the real `@/lib/debtor-email/classify` path through the helper. |
| R4 | `dynamic.ts` cache persists across hot reloads in dev → stale module after rename | Low | Low | Cache is module-level; `next dev` HMR resets module. Document the cold-start invalidation contract per D-15. |
| R5 | Inngest replay regenerates `loadHandlerEvent` value differently if registry changes mid-replay | Very low | Medium | Wrap registry lookups in `step.run` so the value is memoised in Inngest's step state (same pattern as Phase 65 commit `dd2583a`). |
| R6 | `inngest.send` destructured loses `this`-binding | Already avoided | High | All swap sites already use the cast pattern `(inngest.send as unknown as SendFn)({...})` per CLAUDE.md commit `dae6276`. Plan verification: grep zero `const send = inngest.send` post-Phase-68. |
| R7 | `side_effects[]` `kind` discriminator drift — descriptor schema in registry vs TS type union | Low | Medium | Add a Zod schema `sideEffectDescriptorSchema` validating the array on load (in `side-effects.ts`); throw on shape mismatch. Phase 68 owns the schema; future swarms must conform. |
| R8 | `swarm_categories` vs `swarm_intents` confusion — operator routes wrong intent | Medium | Medium | Document explicitly in `docs/agentic-pipeline/stage-3-coordinator.md`: swarm_categories = Stage-1-output (regex bucket → next event); swarm_intents = Stage-3-output (V2 ranked intent → handler event). They are complementary, not redundant. |
| R9 | `coordinator-orchestrator.ts` imports inside `step.run("fan-out")` add cold-start overhead per replay | Low | Low | `loadSwarmIntents` is cached 60s; first replay populates, subsequent replays hit cache. |
| R10 | Migration assumes 1 swarms row; backfill UPDATE has no swarm_type filter for safety on `entity_brand` | Mitigated | Low | All UPDATEs above have `WHERE swarm_type = 'debtor-email'`. |
| R11 | Phase 67's icontroller-tag emit also has `isKnownMailbox` guard not encoded in `gate` | Low | Low | Keep the guard at the call site (above the `for (const dispatch ...)` loop). Document in helper JSDoc that registry gates are simple equality checks. |
| R12 | The cleanup side-effect is an INSERT, not an Inngest event — `kind` discriminator needed | Confirmed | Medium | Adopt `kind: "inngest_event" \| "automation_run_insert"`. Verdict-worker switch reads the kind. (Documented Site 1.) |

## Validation Architecture

**Nyquist enabled** (`workflow.nyquist_validation` not explicitly false → enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 1.x |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run lib/swarms lib/inngest/functions/__tests__/classifier-verdict-worker lib/inngest/functions/__tests__/classifier-label-resolver lib/inngest/functions/__tests__/debtor-email-coordinator lib/inngest/functions/__tests__/debtor-email-orchestrator` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SWRM-01 | Migration applies; 4 new columns + 1 jsonb on `swarms`; `swarm_intents` exists | static + manual SQL probe | `psql ... -c "select column_name from information_schema.columns where table_name='swarms'"` | Wave 1 operator-gated |
| SWRM-02 | `swarm_intents` carries 8 V2 intents for debtor-email; `loadHandlerEvent` maps each | unit | `npx vitest run lib/swarms/__tests__/registry.test.ts` (extend existing) | extend existing — Wave 0 gap |
| SWRM-02 | Coordinator-orchestrator uses `loadHandlerEvent` for fan-out; replay-safe | unit | `npx vitest run lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` | exists — extend |
| SWRM-03 | sales-email-stub onboards with zero code edit | integration | `npx vitest run lib/swarms/__tests__/registry-stub.test.ts` | ❌ Wave 0 |
| SWRM-04 | Zero `swarm_type === "debtor-email"` literal gates remain | static | `! grep -rn "swarm_type === ['\"]debtor-email['\"]" web/lib/inngest web/lib/swarms 2>/dev/null \| grep -v "//" \| grep -v __tests__` | static-audit script in Wave 5 |
| SWRM-04 | `evaluateSideEffects("debtor-email", "stage2_match_live", ...)` returns Phase 67 emit | unit | `npx vitest run lib/swarms/__tests__/side-effects.test.ts` | ❌ Wave 0 |
| SWRM-04 | label-resolver swap preserves Phase 67 smoke-test event payload | unit | `npx vitest run lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` | exists — extend with side-effect dispatch case |

### Sampling Rate

- **Per task commit:** `cd web && npx vitest run lib/swarms lib/inngest/functions/__tests__/{classifier-verdict-worker,classifier-label-resolver,debtor-email-coordinator,debtor-email-orchestrator}` (under 30s).
- **Per wave merge:** Full vitest suite + static grep audit.
- **Phase gate:** Full suite green + Phase 67 live smoke regression (re-fire one tagger event, confirm tagging still works) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `web/lib/swarms/__tests__/registry-stub.test.ts` — covers SWRM-03 (sales-email-stub).
- [ ] `web/lib/swarms/__tests__/side-effects.test.ts` — covers SWRM-04 (evaluateSideEffects gate matching).
- [ ] `web/lib/swarms/__tests__/dynamic.test.ts` — covers D-15 (dynamic import + cache).
- [ ] Extend `web/lib/swarms/__tests__/registry.test.ts` with `loadSwarmIntents` + `loadHandlerEvent` cases.
- [ ] Extend `web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` with registry-driven dispatch case.
- [ ] Extend `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` (file currently exists per ls output — confirm) with `kind: "automation_run_insert"` side-effect case.
- [ ] Extend `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` to assert single-shot uses `loadHandlerEvent` not `swarm_categories.swarm_dispatch` for V2 intents.
- [ ] Extend `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` to assert fan-out uses `loadHandlerEvent`.

## Out-of-Scope Confirmations

Phase 68 explicitly does NOT include:

- **Handler-agent canonicalisation (CANO-01..04)** — Phase 69. Phase 68 ships `canonical_context_shape` + `entity_brand` on the registry but no handler reads them yet.
- **`pipeline_events` runtime telemetry (TELE-*)** — Phase 70.
- **Override learning loop / `promotion_candidates` (LERN-*)** — Phase 71.
- **Sales-email actual implementation (SALES-*)** — Phase 73; Phase 68 only proves the registry shape supports it via stub test.
- **Stage 1 worker for `classifier/screen.requested`** — carried from Phase 66.
- **Any new Orq.ai agent CRUD** — zero `create_agent` / `update_agent` calls.
- **`findMessageRow` pagination** — carried from Phase 67.
- **Any new Inngest events** — zero new event names registered in `events.ts`. Phase 68 reuses every existing event; only the *dispatch source* (template literal vs registry lookup) changes.
- **Migration of `swarm_categories` rows into `swarm_intents`** — they serve different stages and coexist (CONTEXT explicit).
- **Single-shot path category-key alias** (`invoice_copy_request` ↔ `copy_document_request`) — these are intentionally separate routes (operator-override vs V2 ranked intent). No alias needed.

## Sources

### Primary (HIGH confidence — verified by file read)
- `.planning/phases/68-swarm-registry-generalisation-canonical-context-shape/68-CONTEXT.md` — locked decisions D-01..D-15.
- `web/lib/swarms/registry.ts` — existing helper shape (`loadSwarm`, `loadSwarmCategories`).
- `web/lib/swarms/types.ts` — existing `SwarmRow.side_effects` already declared.
- `web/lib/inngest/functions/classifier-verdict-worker.ts` lines 14, 129–146 — only literal-gate site + the cleanup INSERT (not Inngest event).
- `web/lib/inngest/functions/classifier-label-resolver.ts` lines 241–279 — Phase 67 icontroller-tag emit.
- `web/lib/inngest/functions/coordinator-orchestrator.ts` lines 90–109 — template-literal fan-out.
- `web/lib/inngest/functions/debtor-email-coordinator.ts` lines 213–243 — single-shot dispatch via `swarm_categories.swarm_dispatch`.
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher.ts` — cron polls `automation_runs WHERE icontroller='pending'`, confirming Site 1 analysis.
- `web/lib/automations/debtor-email/coordinator/types.ts:17-26` — V2 `INTENT` enum source of truth (8 values).
- `web/lib/automations/debtor-email/mailboxes.ts` — `MAILBOX_BRAND_PATTERNS` keys: `smeba`, `smeba-fire`, `sicli-noord`, `sicli-sud`, `berki`.
- `supabase/migrations/20260429b_swarm_registry.sql` — existing `swarms` schema baseline.
- `supabase/migrations/20260430b_swarm_categories_invoice_copy_dispatch.sql` — confirms `swarm_categories.swarm_dispatch` for `invoice_copy_request` is `"debtor-email/invoice-copy.requested"`.
- `web/lib/inngest/events.ts` lines 412–498 — confirms 8 `debtor-email/<intent>.requested` events all registered.
- `CLAUDE.md` Inngest replay-safety + this-binding patterns — applied throughout.

### Secondary (MEDIUM)
- Phase 65/66/67 CONTEXTs — historical context of the V2 fan-out.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Discretion: add `entity_brand jsonb` column in this migration | Migration | If Phase 69 prefers separate migration, drop one column from this SQL — harmless. |
| A2 | Discretion: `kind` discriminator added to `side_effects[]` descriptor | Migration + helpers | CONTEXT D-06 lists only `event/trigger/gate/phase_origin`. The cleanup side-effect is an INSERT not an event, so the discriminator is necessary. Flag for user confirmation: "Should the cleanup side-effect stay code-coupled (Phase 68 only swaps the icontroller-tag side-effect) instead of generalising to support `automation_run_insert`?" |
| A3 | `handler_agent_key` is nullable in `swarm_intents` | Migration | CONTEXT D-09 says "future intents → null until handler exists" — confirmed nullable. |
| A4 | Phase 68 does NOT swap `debtor-email-coordinator.ts` single-shot path away from `swarm_categories.swarm_dispatch` for the operator-override case | Site 4 | The single-shot path's source-of-truth question is partially answered by D-10 (registry lookup) but the conflict between `invoice_copy_request` and `copy_document_request` is resolved here as "they are different routes, both stay". Flag for user. |
| A5 | The dispatch helper signature `evaluateSideEffects(admin, swarm_type, trigger, ctx)` takes `admin` as first arg for Supabase access | Helper Module Shapes | Matches existing `loadSwarm(admin, swarmType)` signature for consistency. |

## Open Questions

1. **`kind` discriminator on side-effect descriptor (A2):** the locked CONTEXT D-06 shows only `{event, trigger, gate, phase_origin}`. The Phase 56.7 cleanup side-effect is an `automation_runs.insert`, not an Inngest event. Two paths:
   - **Path A (recommended):** generalise descriptor with `kind: "inngest_event" | "automation_run_insert"`. Encodes both side-effects in the registry today. Slight complexity in helpers.
   - **Path B:** keep CONTEXT D-06 schema strict; only the icontroller-tag side-effect (Phase 67) moves into the registry; verdict-worker keeps the cleanup INSERT inline guarded by a `loadSwarm(swarm_type).enabled_features?.icontroller_cleanup` flag (or similar). Simpler descriptor, but requires another schema choice.
   - Recommendation: A. Surface to user pre-plan.

2. **Single-shot path conflict (A4):** confirm that the planner is OK with `swarm_intents` and `swarm_categories` describing two different routes. The boundary is clear in CONTEXT but worth one operator confirmation given the migration touches both tables' references.

## Metadata

**Confidence breakdown:**
- Migration backfill: HIGH — every value verified by file read.
- Helper module shapes: HIGH — direct extension of existing patterns.
- Swap-site line numbers: HIGH — re-read in this session.
- `kind` discriminator: MEDIUM — locks CONTEXT-discretion with clear justification.

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (stable internal-refactor; no upstream deps)

## RESEARCH COMPLETE
