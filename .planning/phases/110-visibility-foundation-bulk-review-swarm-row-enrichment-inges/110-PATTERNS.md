# Phase 110: Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 11 (1 new migration-cluster, ~10 modified)
**Analogs found:** 11 / 11

> This phase is a **refactor that removes debtor-specific code**, not a greenfield build. Every analog below already exists in-repo; the work is un-binding four debtor anchors and re-encoding one boolean as a per-stage gate. No new external packages.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/scripts/gen-entity-types.ts` (modify) | codegen/build | transform | `web/scripts/gen-tenant-domains.ts` | exact (sibling script, target shape) |
| `web/scripts/gen-intent-types.ts` (modify) | codegen/build | transform | `web/scripts/gen-tenant-domains.ts` | exact |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` (modify) | service (Inngest fn) | event-driven | `web/lib/inngest/functions/stage-3-dispatcher.ts` | exact (same wildcard/payload-derive pattern) |
| `web/lib/bulk-review/hydrate.ts` (modify) | service (RSC hydrator) | request-response (read) | self (anchor section) + `gen-tenant-domains` map import | role-match |
| `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (modify) | route (RSC) | request-response | self (loadSwarm gate, lines 64-69 already generic) | exact |
| `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts` (modify) | service (Inngest fn) | file-I/O (browser side-effect) | `web/lib/inngest/functions/stage-2-customer-resolver.ts` (dry_run gate) | role-match (gains a gate it lacks) |
| swarms-row enrichment migration (new) | migration | batch/DDL | `20260506_phase74_sales_email_seed.sql` + `20260504b_swarms_registry_generalisation.sql` | exact |
| per-stage dry-run column migration (new) | migration | batch/DDL | `20260504b` (ALTER swarms ADD jsonb) + `_template.sql` RLS rules | role-match |
| `web/lib/inngest/functions/pipeline-health-monitor.ts` (modify) | service (Inngest cron) | batch/event-driven | self (per-swarm loop, lines 85-207) | exact |
| pipeline_health_snapshots per-mailbox migration (new) | migration | DDL (ALTER) | `20260528_pipeline_health_snapshots.sql` | exact |
| `web/components/v7/swarm-sidebar.tsx` (modify) | component | request-response | self (`AUTOMATIONS_ITEMS`, lines 64-69) | exact |

---

## Pattern Assignments

### `web/scripts/gen-entity-types.ts` + `gen-intent-types.ts` (codegen, transform)

**Analog:** `web/scripts/gen-tenant-domains.ts` — the ONLY one of the three that already iterates ALL swarms and emits a per-swarm map. D-08 says "follow that shape."

**Current debtor-bound shape to REPLACE** (`gen-intent-types.ts:30-38`, `gen-entity-types.ts:30-36`): output path is hardcoded to `lib/automations/debtor-email/coordinator/{intent,entity}.generated.ts` and the query is `process.env.SWARM_TYPE ?? "debtor-email"` (`gen-intent-types.ts:76`, `gen-entity-types.ts:74`). This single-swarm env-var hack is what gets dropped.

**Target pattern to mirror — iterate all swarms, emit `*_BY_SWARM` map** (`gen-tenant-domains.ts:59-87`, 103-106):
```typescript
const { data, error } = await admin
  .from("swarms")
  .select("swarm_type, tenant_domains")   // → select swarm_type + the relevant column
  .order("swarm_type");                    // stable diff: ORDER BY swarm_type
// ...
function renderBody(rows: SwarmTenantRow[]): string {
  if (rows.length === 0) {
    return `export const TENANT_DOMAINS_BY_SWARM = {} as const;\n\n` +
           `export type TenantDomain = never;\n`;
  }
  const sortedRows = [...rows].sort((a, b) => a.swarm_type.localeCompare(b.swarm_type));
  const entries = sortedRows.map((r) => {
    const domains = [...(r.tenant_domains ?? [])].map((d) => d.toLowerCase()).sort();
    return `  ${JSON.stringify(r.swarm_type)}: [${domains.map((d) => `"${d}"`).join(", ")}],`;
  }).join("\n");
  return `export const TENANT_DOMAINS_BY_SWARM = {\n${entries}\n} as const;\n\n` +
         `export type TenantDomain =\n  (typeof TENANT_DOMAINS_BY_SWARM)[keyof typeof TENANT_DOMAINS_BY_SWARM][number];\n`;
}
```
For intent: `SWARM_INTENTS_BY_SWARM`, source `swarm_intents.intent_key` grouped by `swarm_type` (drop the per-call `.eq("swarm_type", swarmType)` from `gen-intent-types.ts:81-84`; the existing code's NOTE confirms `swarm_intents` has no `enabled` column — keep that filter dropped). For entity: `ENTITY_BRANDS_BY_SWARM`, source `swarms.entity_brand`.

**Empty-union footgun (RQ4):** the per-swarm-MAP shape is safe even with `"sales-email": []` because the union over ALL swarms is non-empty (debtor has intents/brands). Do NOT generate per-swarm standalone files with `type Intent = never` (Option B) — those break `as Intent` casts at compile time. Use the map (Option A).

**Idempotency (mandatory, `gen-tenant-domains.ts:123-132`):** read existing file, skip write if identical, print "already up-to-date". Preserves clean `git diff --exit-code`.

**CI gate (D-06):** `package.json` `codegen` script chains all three scripts. After the enrichment migration sets `entity_brand=['smeba']` for sales, codegen regenerates and is committed atomically. CI: `npm run codegen && git diff --exit-code`.

---

### `web/lib/inngest/functions/debtor-email-coordinator.ts` (service, event-driven) — HIGHEST RISK (D-09)

**Analog:** `web/lib/inngest/functions/stage-3-dispatcher.ts` — already fully generic, the proven model.

**Current debtor-bound code to REPLACE** (`debtor-email-coordinator.ts:47`, 55, 80, 89-94, 127):
```typescript
const SWARM_TYPE = "debtor-email";                                    // line 47
const TENANT_DOMAINS: string[] = [...TENANT_DOMAINS_BY_SWARM[SWARM_TYPE]]; // line 55
// trigger:
{ event: "debtor-email/coordinator.requested" },                       // line 80
// entity coercion hardcodes the debtor brand union:
const entity = (email.entity ?? "smeba") as "smeba"|"berki"|"sicli-noord"|"sicli-sud"|"smeba-fire"; // 89-94
// insert uses the const:
swarm_type: SWARM_TYPE,                                                 // line 127
```

**Target pattern to mirror** (`stage-3-dispatcher.ts:51`, 67-70):
```typescript
// Wildcard trigger — fan-in from every swarm.
{ event: "*/coordinator.requested" } as unknown as {
  event: keyof import("@/lib/inngest/events").Events;
},
// inside handler — derive swarm_type from payload, event-name-prefix fallback:
const eventName = (event as unknown as { name: string }).name;
const swarm_type = event.data.swarm_type ?? eventName.split("/")[0];
const TENANT_DOMAINS: string[] = [...(TENANT_DOMAINS_BY_SWARM[swarm_type] ?? [])];
// emit: name: `${swarm_type}/predicted` — dispatcher already wildcard-listens `*/predicted`
```

**Preservation rules (D-09 / Pitfall 4):**
- `swarm_type` from `event.data` is **deterministic** → safe to derive outside `step.run`. The existing `resolve-run-id` step.run (lines 104-109) MUST stay inside step.run (replay-safety, CLAUDE.md Phase 65).
- Keep the debtor `entity` default `?? "smeba"` but make the union read from registry or accept `null` (sales ingest writes `entity: null`). Don't drop the debtor default.
- Never alias `inngest.send` — coordinator already uses the `DynamicSend`/cast-through-unknown pattern (lines 62-68); keep it.
- The debtor producer still emits `debtor-email/coordinator.requested`; under the wildcard trigger that same event still matches — **no producer change needed**.

**Mandated new test (D-09, Wave 0):** `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — RED→GREEN asserting debtor produces identical `coordinator_runs` + `pipeline_events` + `*/predicted` emit before/after. Existing guards `web/lib/bulk-review/__tests__/out-of-band.test.ts` and `classifier-screen-worker.test.ts` must stay green.

---

### `web/lib/bulk-review/hydrate.ts` + `review/page.tsx` (hydrator + RSC route, request-response)

**Analog:** the hydrator's OWN evidence reads are already swarm-generic; only the anchor + codegen imports are debtor-bound.

**Current anchor to GENERALIZE** (`hydrate.ts:56-59`, 147-154):
```typescript
export interface HydrateOptions { email_label_id: string; swarm_type: string; }
// (1) anchor on debtor.email_labels:
const labelRes = await admin.schema("debtor").from("email_labels")
  .select("id, email_id, corrected_customer_account_id, reviewed_by, ...")
  .eq("id", opts.email_label_id)
  .maybeSingle();
```
**Generalization (D-01, RQ1):** anchor on `email_pipeline.emails.id` (`email_id`). Steps (2)/(3) — `pipeline_events` + `agent_runs` keyed on `email_id` — need ZERO change (already public/generic). Treat `debtor.email_labels` as a **debtor-only enrichment join** layered on the generic anchor: for `swarm_type==='debtor-email'` additionally load the `email_labels` row (join on `email_id`) for Stage-4 + override slots (`hydrate.ts:103-131`, ~564-594); for sales/info-routing those slots are null (correct — no override store yet). This preserves debtor byte-for-byte.

**Codegen import repoint** (`hydrate.ts:35-38`): currently imports `SWARM_INTENTS`/`Intent`/`ENTITY_BRANDS`/`Entity` from debtor-only `.generated.ts`. Repoint to the new `*_BY_SWARM` map files; the runtime validation (`(SWARM_INTENTS as readonly string[]).includes(...)`) becomes `(SWARM_INTENTS_BY_SWARM[opts.swarm_type] ?? []).includes(...)`.

**`review/page.tsx` — REMOVE the hard 404** (lines 84-86):
```typescript
if (swarmType !== "debtor-email") { notFound(); }   // DELETE — un-404s sales AND info-routing
```
The registry gate above it (`loadSwarm` → `if (!swarm || !swarm.enabled) notFound()`, lines 66-69) is the correct generic gate; keep it. Pass `email_id` anchor into `hydrateBulkReviewRow` (lines 109-116).

**Bucket list-unit branch (RQ1 / OQ-4):** `_shell/_lib/load-bucket-label-ids.ts` returns `email_labels.id` for debtor; for non-debtor swarms the list unit must become `email_id`. **This surface-layer branch does NOT violate SWARM-02** (which scopes to classify/classifier/coordinator/dispatcher). Document this for the plan-checker. Preserve the chunk-at-50 / range-paged-at-1000 guards (Pitfall 3 — silent PostgREST `.in()` truncation).

**Out-of-band guard:** `hydrate.ts` MUST NOT import `@/lib/inngest/*` — enforced by `out-of-band.test.ts`. The repoint stays clear of inngest.

---

### `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts` + dry-run gate consumers (service, file-I/O)

**Analog (the gate to add):** `web/lib/inngest/functions/stage-2-customer-resolver.ts:74-100` — the canonical `dry_run` read.

**The footgun to fix** (`stage-1-icontroller-noise-cleanup.ts:88`): opens `openIControllerSession("production", workerIndex)` with **no dry_run read at all** — the 867-delete-under-nominal-dry-run path (D-10).

**Existing gate pattern to mirror** (`stage-2-customer-resolver.ts:74-82`, 100):
```typescript
step.run("load-settings", async () => {
  const { data } = await admin.schema("debtor").from("labeling_settings")
    .select("dry_run, nxt_database, brand_id, entity, icontroller_company")
    .eq("source_mailbox", source_mailbox)
    .maybeSingle();
  return data;
}),
// ...
const dryRun = settingsRow?.dry_run ?? true;   // default-true = safe
```

**Generalization (D-10/D-11):** replace `settingsRow?.dry_run ?? true` per-worker reads with a per-stage flag read from the swarm registry (loaded via `loadSwarm`), keyed by the worker's stage/handler:
```typescript
// proposed jsonb on public.swarms (RQ2 recommendation A2):
//   dry_run_config = { stage_1_archive, stage_1_cleanup, stage_3_labeling, stage_4_handlers: {<name>: bool} }
const cfg = swarm.dry_run_config ?? {};
const cleanupBlocked = cfg.stage_1_cleanup ?? true;   // sales default true (blocked)
```
**D-11 preservation — critical:** debtor `stage_1_cleanup` MUST default to **`false` (LIVE)** in the seed migration (re-encodes today's hardcoded-`production` reality — DO NOT flip to dry-run, Pitfall 2). Sales gets `true` (blocked) for every side-effect stage. `stage_3_labeling`/`stage_4_handlers.invoice-copy` for debtor must reproduce the **same effective value `labeling_settings.dry_run` produces today** — note the per-mailbox-vs-per-swarm granularity tension (OQ-1: query `SELECT source_mailbox, dry_run FROM debtor.labeling_settings` at plan time; if mailboxes differ, keep a per-mailbox override layer reading `labeling_settings` first, falling back to the swarm flag).

**Other consumers to update consistently:** `stage-2-icontroller-label-applier.ts` (`"skipped_dry_run"` path), `classifier-invoice-copy-handler.ts:247-264`. Each needs a RED→GREEN gate test asserting debtor effective behavior unchanged (Wave 0). NOTE: `labeling-flip-cron.ts`, `promotion-recommender-cron.ts`, `resolve-debtor.ts:128` read `dry_run` as a STATUS VALUE on `email_labels`, not the settings flag — do NOT touch these.

---

### swarms-row enrichment migration (new, migration/batch)

**Analog:** `20260506_phase74_sales_email_seed.sql` (the current sales null-state) + `20260504b_swarms_registry_generalisation.sql:42-58` (debtor's full-funnel `UPDATE` — the exact shape to mirror for sales).

**Target pattern to mirror** (`20260504b:44-58`):
```sql
update public.swarms
   set stage2_entity_resolver     = '<planned resolver id — coordinate v8.2 RESL-03, OQ-2>',
       stage3_coordinator_agent_key = 'sales-intent-agent',   -- forward-ref, built in 113
       canonical_context_shape    = jsonb_build_object(
         'version', '2026-06-03.sales.v1',
         'fields', jsonb_build_object(
           'customer_account_id', jsonb_build_object('type','string','nullable',true),
           'customer_name',       jsonb_build_object('type','string','nullable',true),
           'language',            jsonb_build_object('type','string','enum', jsonb_build_array('nl','en'), 'default','nl'),
           'entity_brand',        jsonb_build_object('type','string','description','smeba'),
           'recent_documents',    jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array())
         )
       ),
       entity_brand = jsonb_build_array('smeba'),   -- D-04 → triggers codegen regen
       updated_at = now()
 where swarm_type = 'sales-email';
```
Keep `side_effects = '[]'` (D-05, until 112), `stage1_regex_module = null` (LLM-only Stage 1). `resolution_config` is **NOT an existing column** — `ALTER TABLE public.swarms ADD COLUMN IF NOT EXISTS resolution_config jsonb` first, then seed an **inert documented placeholder** (do NOT invent a binding schema the v8.2 RESL-03 track migrates away from — OQ-2/A6). Inert guards: empty `swarm_intents` → Stage 3 no-ops until 113; no RESL dispatch → Stage 2 no-ops until 114.

**RLS note:** `swarms` is an existing RLS table — adding a column inherits its policies. No new policy needed. Verify `npm run check:supabase` stays green.

---

### per-stage dry-run column migration (new, migration/DDL)

**Analog:** the `ALTER TABLE public.swarms ADD COLUMN ... jsonb` idiom (registry-as-source-of-truth) + `_template.sql` RLS discipline.

**Pattern:** `ALTER TABLE public.swarms ADD COLUMN IF NOT EXISTS dry_run_config jsonb NOT NULL DEFAULT '{}'::jsonb;` then per-swarm `UPDATE` seeding the re-encoded reality (debtor `stage_1_cleanup=false`/live; sales all `true`/blocked — see D-11 rules above). Existing swarms RLS covers the column. No SECURITY DEFINER, no anon policy (CLAUDE.md). jsonb-map shape recommended over discrete columns so new handlers need no schema migration (folded-todo guidance, A2).

---

### `web/lib/inngest/functions/pipeline-health-monitor.ts` + per-mailbox migration (service/cron + DDL)

**Analog:** the monitor's OWN per-swarm loop (`pipeline-health-monitor.ts:85-207`) — extend it; and `20260528_pipeline_health_snapshots.sql` for the column add.

**Migration pattern** (mirror `20260528...sql:7-44`, ALTER form):
```sql
ALTER TABLE public.pipeline_health_snapshots
  ADD COLUMN IF NOT EXISTS source_mailbox text;   -- nullable = back-compat; null = swarm aggregate
CREATE INDEX IF NOT EXISTS pipeline_health_snapshots_mailbox_idx
  ON public.pipeline_health_snapshots (swarm_type, source_mailbox, checked_at DESC);
```
Existing RLS (service_role ALL + authenticated SELECT, lines 23-37) covers the new column — no policy change.

**Monitor change** (inside the `for (const swarm of SWARMS)` loop, lines 85-207): additionally group throughput/failures by `source_mailbox`. For sales, the uniform key is text `source_mailbox` (NOT int `mailbox_id` — sales `automation_runs.mailbox_id` is null). Cheapest source: read `result->>'source_mailbox'` from `automation_runs.result` JSONB (A8) — already present for sales (`verkoop@smeba.nl`). Sales is single-mailbox so the per-mailbox row == swarm aggregate today; the dimension is forward-looking. Confirm ~33/day visible.

**Sugar zero-assertion (VERIFY-01, D-13):** NOT machinery — a verification-time SQL check (`SELECT count(*) FROM email_pipeline.emails WHERE source = 'sugarcrm'`). Assert against the known baseline (REQUIREMENTS.md:12 says 2 stragglers exist; surface actual count, treat 2 as the documented anomaly — OQ-3). No delete, no migration assertion.

---

### `web/components/v7/swarm-sidebar.tsx` (component) — D-03

**Analog:** the existing `AUTOMATIONS_ITEMS` literal (lines 64-69).

**Current pattern** (line 65 = the debtor entry to mirror):
```typescript
{ title: "Debtor Review", href: "/automations/debtor-email/review", icon: Mail,
  match: (p: string) => p.startsWith("/automations/debtor-email/review") || ... },
```
**D-03 preference:** add a sales-email entry, but **prefer driving the list from the `swarms` registry** rather than appending another static literal. Minimal-change fallback (if registry-drive is deferred): append `{ title: "Sales Review", href: "/automations/sales-email/review", icon: Mail, match: p => p.startsWith("/automations/sales-email/review") }`. Note: this is a `"use client"` component — registry data must arrive via props from a server component (`swarms` is already passed in via `SwarmSidebarProps`).

---

## Shared Patterns

### Registry-driven codegen (Phase 69 / D-06)
**Source:** `web/scripts/gen-tenant-domains.ts` (the per-swarm-map model)
**Apply to:** both `gen-entity-types.ts` + `gen-intent-types.ts`
- Iterate ALL swarms, emit `*_BY_SWARM` map + union-over-all-swarms literal type.
- Alphabetical sort (stable diff), idempotent skip-if-identical, `npm run codegen && git diff --exit-code` CI gate.
- NEVER hand-edit `*.generated.ts`; migration + codegen committed atomically.

### Inngest replay-safety + wildcard trigger
**Source:** `stage-3-dispatcher.ts:39-70`
**Apply to:** `debtor-email-coordinator.ts`
- Wildcard `*/<verb>.requested` trigger via `as unknown as {...}` cast; derive `swarm_type` from `event.data` with event-name-prefix fallback.
- Non-deterministic ids inside `step.run()` (`resolve-run-id` stays). Never alias `inngest.send` — call via cast-through-unknown each time.

### Supabase migration / RLS discipline (CLAUDE.md + `_template.sql`)
**Source:** `supabase/migrations/_template.sql`, `20260528_pipeline_health_snapshots.sql`
**Apply to:** all 3 new migrations
- New TABLE in exposed schema → `ENABLE ROW LEVEL SECURITY` + service_role ALL policy (+ authenticated SELECT if UI reads). New COLUMN on existing RLS table inherits policies — no new policy, but verify advisor green.
- NEVER `TO anon`/`TO public USING(true)`. No SECURITY DEFINER on exposed-schema views. Pre-push `npm run check:supabase` must pass.

### Per-mailbox health key
**Source:** `automation_runs.result->>'source_mailbox'` (sales) / `pipeline-health-monitor.ts` loop
**Apply to:** pipeline-health per-mailbox dimension — uniform text `source_mailbox` key, not int `mailbox_id`.

---

## No Analog Found

None — every surface has a strong in-repo analog. The only NEW assets are:
- `debtor-email-coordinator.test.ts` (new test, but modeled on existing Vitest patterns + the dispatcher's behavior contract).
- `resolution_config` column (new column, but the ALTER-swarms-ADD-jsonb idiom is established; its *contents* are a cross-track placeholder coordinated with v8.2 RESL-03 — OQ-2).

---

## Metadata

**Analog search scope:** `web/scripts/`, `web/lib/inngest/functions/`, `web/lib/bulk-review/`, `web/app/(dashboard)/automations/[swarm]/`, `web/components/v7/`, `supabase/migrations/`
**Files scanned:** ~14 (read directly this session)
**Pattern extraction date:** 2026-06-03
