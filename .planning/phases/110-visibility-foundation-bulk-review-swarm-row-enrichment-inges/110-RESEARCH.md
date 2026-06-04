# Phase 110: Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify - Research

**Researched:** 2026-06-03
**Domain:** Multi-swarm Bulk Review generalization · registry-driven codegen · cross-swarm Inngest workers · per-stage dry-run governance · pipeline-health telemetry (Next.js 15 RSC + Supabase + Inngest)
**Confidence:** HIGH (codebase verified directly; locked RFCs consulted; no external-package decisions)

## Summary

Phase 110 is almost entirely a **generalization-of-existing-debtor-code** phase, not a greenfield build. Every shared worker the phase touches (`classifier-screen-worker`, `stage-3-dispatcher`) is *already* registry-driven and branch-free; the only debtor-bound seams are (1) the Bulk Review row **hydrator's anchor** on `debtor.email_labels`, (2) the **coordinator's** hardcoded `const SWARM_TYPE = "debtor-email"`, (3) the **codegen scripts'** debtor-only output paths and `SWARM_TYPE ?? "debtor-email"` default, and (4) the **`labeling_settings.dry_run`** boolean as the dry-run governance primitive. All four are mapped precisely below.

The single highest-leverage finding: **info-routing is ALSO 404'd by the exact same anchor bug** [VERIFIED: codebase]. info-routing's `swarms` row uses `source_table='automation_runs'` with no `debtor.email_labels` store, and `review/page.tsx:84-86` hard-404s every swarm `!== 'debtor-email'`. So D-02's "serve debtor + sales + info-routing uniformly" is not aspirational scope-creep — generalizing the anchor fixes a live, already-broken info-routing surface as a side effect. This strengthens the case for an anchor that pivots on `email_pipeline.emails` (the shared corpus all three swarms write) rather than the debtor label store.

The second critical finding: the **dry-run governance footgun is real and confirmed**. `stage-1-icontroller-noise-cleanup.ts:88` opens the iController session with a hardcoded `"production"` and has **no `labeling_settings.dry_run` read at all** [VERIFIED: codebase] — exactly the 867-delete-under-nominal-dry-run behavior the folded todo describes. Meanwhile `dry_run` IS read by `stage-2-customer-resolver.ts`, `stage-2-icontroller-label-applier.ts`, and `classifier-invoice-copy-handler.ts`. Preserving debtor's *effective* behavior (D-11) means the new per-stage model must keep `stage_1_cleanup` effectively-live and `stage_3_labeling`/`stage_4_handler_*` gated-by-the-existing-boolean's-value — a data-migration that re-encodes today's reality, not a behavior change.

**Primary recommendation:** Split into ≥3 plans with hard debtor-regression gates between them: (Plan A) anchor generalization + codegen generalization + sidebar (read-only, no live-path risk); (Plan B) coordinator `SWARM_TYPE`-from-payload refactor (touches live debtor Stage 3 — heaviest gate); (Plan C) per-stage dry-run migration + swarms-row enrichment + pipeline-health per-mailbox + Sugar zero-assertion. Anchor on `email_pipeline.emails.id`, not a new sales label store.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bulk Review row sourcing | API/Backend (RSC server component + hydrator) | Database (`email_pipeline.emails`, `pipeline_events`, `agent_runs`) | Hydration is server-side SSR; the anchor is a DB-keyed selector. Render tree never round-trips to registry. |
| Swarm-row config (full-funnel) | Database (`public.swarms` registry) | Build (codegen emits TS literal-unions) | Registry-as-source-of-truth (Phase 69). Config is data; types are generated. |
| Shared Stage-3 coordinator | API/Backend (Inngest durable function) | Database (`coordinator_runs`, `agent_runs`, `pipeline_events`) | Event-driven; swarm_type belongs in the event payload, not a module const. |
| Multi-swarm codegen | Build (`npm run codegen`) | Database (reads `swarms`/`swarm_intents`/`entity_brand`) | Build-time read of registry → `*.generated.ts`; CI `git diff --exit-code` gate. |
| Per-stage dry-run governance | Database (registry flags) | API/Backend (each worker reads its own flag) | Governance is config (data); enforcement is per-worker at side-effect boundary. |
| Pipeline-health per-mailbox | API/Backend (Inngest cron) | Database (`pipeline_health_snapshots`) | Cron probes `automation_runs`/`email_pipeline.emails`, writes snapshot rows. |
| Sales ingest (Outlook) | API/Backend (`/api/automations/sales-email/ingest`) | Database (`email_pipeline.emails` upsert on `(source, source_id)`) | Already live; phase only *asserts* its shape, doesn't change it. |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Generalize the row hydrator to a swarm-generic anchor instead of creating a sales label store. `review/page.tsx:84-86` hard-404s any swarm `!== 'debtor-email'` because the hydrator anchors on `debtor.email_labels`. Replace the **anchor** with a swarm-generic source. Stage 0–4 *evidence* reads (`public.pipeline_events` + `public.agent_runs`) are already swarm-generic; only the row anchor and codegen imports are debtor-bound.
- **D-02:** The generalized hydrator must serve **debtor + sales + info-routing** uniformly. Don't special-case sales.
- **D-03:** Sidebar nav (`web/components/v7/swarm-sidebar.tsx`, hardcoded `AUTOMATIONS_ITEMS`) must gain a sales-email entry — prefer driving it from the `swarms` registry.
- **D-04:** Populate the full-funnel config now in one migration + atomic `npm run codegen`: `entity_brand=smeba`, `canonical_context_shape`, `stage2_entity_resolver`, `resolution_config`, `stage3_coordinator_agent_key` (forward-references to assets built in 113/114).
- **D-05:** Forward-referenced config held **inert behind an explicit dry-run gate** (D-10/D-11) AND natural inert guards: empty `swarm_intents` → Stage 3 no-ops until 113; no RESL dispatch seam → Stage 2 no-ops until 114; `side_effects='[]'` until 112.
- **D-06:** No hardcoded enums, no hand-edited `*.generated.ts` — migration + codegen committed atomically.
- **D-07:** Refactor `debtor-email-coordinator.ts` to read `swarm_type` from event payload (drop hardcoded `const SWARM_TYPE = "debtor-email"`) so it becomes the shared Stage-3 runner 113's `sales-intent-agent` dispatches through with no further edits.
- **D-08:** Generalize codegen (`gen-entity-types.ts`, `gen-intent-types.ts`) to emit **per-swarm `*.generated.ts`** (sales = empty unions for now); repoint `hydrate.ts` imports off debtor-only paths. `gen-tenant-domains.ts` already emits a per-swarm map — follow that shape.
- **D-09:** HIGHEST-RISK. D-07 and D-08 both touch the live debtor path. Require heavy debtor regression coverage (`out-of-band.test.ts` + classifier-screen-worker grep test stay green; add debtor Stage-3 behavior tests around the coordinator refactor).
- **D-10:** Adopt full per-stage granular dry-run gating now. Replace the narrow `debtor.labeling_settings.dry_run` boolean with per-stage + per-handler registry flags: `stage_1_archive`, `stage_1_cleanup`, `stage_3_labeling`, `stage_4_handler_<name>` map. Stage 0/1-classify/2/3-classify stay always-live read-only.
- **D-11:** Sales defaults to dry-run/blocked for every side-effect stage; debtor's current effective gating preserved **exactly** (no behavior change to debtor's live side-effects — don't silently flip the 867-delete cleanup path).
- **D-12:** Add a per-mailbox dimension to `pipeline_health_snapshots`. Confirm ~33/day for `verkoop@smeba.nl` visible.
- **D-13:** Sugar disposition = zero-assertion. SugarCRM never connected for sales ingest. Assert `source='sugarcrm'` count==0 in `email_pipeline.emails`; flag any non-zero as anomaly. No delete/mark machinery.

### Claude's Discretion
- Exact contents of `canonical_context_shape` for sales (derive from RFC + debtor's shape).
- Where sales `*.generated.ts` files physically live (per-swarm directory layout under `web/lib/automations/`).
- Migration file naming/splitting and the precise registry column shape for per-stage dry-run flags (jsonb map vs discrete columns).

### Deferred Ideas (OUT OF SCOPE)
- Stage 1 noise calibration/flip (Phase 111); Outlook archive side-effect + backfill (112); the actual `sales-intent-agent` + seeded `swarm_intents` (113); the live Stage 2 NXT resolver dispatch seam (114); SugarCRM dead-code removal (115).
- **No auto-acting on sales mail in this phase.**
- Review-pane dry-run **chip** UI (the second half of the folded todo) — folded todo's chip is OUT; only the gating model is adopted.
- Per-mailbox health for *multi-mailbox* swarms (sales is single-mailbox today); D-12 adds the dimension generically only.
- Reviewed-but-not-folded todos: draft idempotency, debtor review provenance/scoping, override-note flow.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVIEW-01 | sales-email Bulk Review works end-to-end like debtor: sidebar entry + stage-keyed shell rendering rows, detail pane, queue tree, per-stage tabs (0/1/2/3), feedback forms | §RQ1 anchor generalization map; the shell + loaders are already registry-generic — only the `email_label_id` anchor and `swarm_type!=='debtor-email'` 404 block it. Also un-404s info-routing. |
| SWARM-01 | enrich `sales-email` swarms row to full-funnel config via migration + atomic codegen | §RQ5 exact column set + null-state + recommended values; §RQ4 codegen generalization |
| SWARM-02 | zero `if swarm==='sales-email'` branches in shared workers; any needed branch is an arch bug fixed here | §RQ3 coordinator is the only remaining hardcoded const; dispatcher/classifier already branch-free. Static grep gate pattern exists. |
| VERIFY-01 | confirm Outlook ingest; ~33/day `verkoop@smeba.nl` visible in pipeline-health; disposition legacy `source='sugarcrm'` rows | §RQ6 per-mailbox dimension; §RQ7 Sugar zero-assertion query + ingest confirm |

## Standard Stack

No new external packages. This phase uses only the in-repo stack (Next.js 15 RSC, `@supabase/supabase-js`, Inngest, `tsx` codegen, Vitest). **No `## Package Legitimacy Audit` section is required — zero external installs.**

| Tool | Where | Purpose |
|------|-------|---------|
| Supabase migrations (`supabase/migrations/`) | `_template.sql` pattern | swarms-row enrichment, per-stage dry-run column, pipeline_health per-mailbox column |
| `npm run codegen` (`tsx scripts/gen-*.ts`) | `web/scripts/` | regenerate per-swarm `*.generated.ts`; CI `git diff --exit-code` gate |
| Vitest | `web/**/__tests__/` | debtor regression guards (`out-of-band.test.ts`, `classifier-screen-worker.test.ts`) + new coordinator Stage-3 tests |
| Inngest durable functions | `web/lib/inngest/functions/` | coordinator refactor, pipeline-health-monitor extension |

**Version verification:** N/A — no package additions. Existing `package.json` `codegen` script verified: `tsx scripts/gen-entity-types.ts && tsx scripts/gen-tenant-domains.ts && tsx scripts/gen-intent-types.ts` [VERIFIED: codebase].

---

## RQ1 — Hydrator Generalization Seam (REVIEW-01)

### The exact anchor problem

The hydrator (`web/lib/bulk-review/hydrate.ts`) takes `HydrateOptions { email_label_id, swarm_type }` and **anchors on `debtor.email_labels.id`** [VERIFIED: codebase, hydrate.ts:135-177]. Step (1) loads the label row; steps (2)/(3) read `pipeline_events` + `agent_runs` keyed on `label.email_id` — **these are already swarm-generic** (public schema, keyed by `email_id`). The anchor is the only debtor-bound data dependency, plus the two codegen imports (§RQ4).

### Every place `email_label_id` / `debtor.email_labels` is read on the review surface path

| File | Line(s) | What it does | Generalization action |
|------|---------|--------------|----------------------|
| `web/app/(dashboard)/automations/[swarm]/review/page.tsx` | 84-86 | `if (swarmType !== "debtor-email") notFound()` | **Remove** the hard 404; gate on registry instead |
| `review/page.tsx` | 100-104 | `loadQueueBucket(admin, swarmType, …)` returns `email_labels.id` list | Replace bucket source with `email_pipeline.emails`-keyed list |
| `review/page.tsx` | 109-116 | `hydrateBulkReviewRow({ email_label_id: id, swarm_type })` | Pass `email_id` anchor instead |
| `web/lib/bulk-review/hydrate.ts` | 56-59 | `HydrateOptions.email_label_id` | Change to `email_id` (or accept both) |
| `hydrate.ts` | 103-176 | `EmailLabelRow` SELECT on `debtor.email_labels` | Make debtor-only OR derive overrides from `agent_runs`/`pipeline_events` |
| `hydrate.ts` | 564-594 | Stage 4 + overrides read `label.draft_quality`, `label.handler_key`, `label.reviewed_by`, `label.corrected_customer_account_id`, `label.feedback_reason` | These are debtor override-capture fields; sales has none yet → null is correct |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/load-bucket-label-ids.ts` | 144, 258-281, 304-316 | `loadQueueBucket`/`loadHistoryBucket` query `debtor.email_labels`; partition via `agent_runs.email_id` | **Heaviest generalization** — see below |
| `_shell/_lib/load-page-data.ts` | 141-145, 200-210 | reads `debtor.labeling_settings` for `dry_run` map (note: comment at 92-94 explicitly says "the /review route 404s for non-debtor swarms, so re-scope once a second swarm ships") | Re-scope per the inline TODO |

### Cleanest swarm-generic anchor: `email_pipeline.emails.id`

**Recommendation [CITED: docs/agentic-pipeline/README.md — "The email already lives in `email_pipeline.emails` (shared corpus)"]:** pivot the anchor on **`email_pipeline.emails.id`** (`email_id`), the shared corpus every swarm writes (`source='outlook'`, `swarm_type` derivable). Rationale:
- `pipeline_events.email_id` and `agent_runs.email_id` already key off it — the existing evidence reads need **zero change**.
- `email_pipeline.emails` has a `mailbox` column and (per sales ingest route) `source` + `source_id` — enough to scope per swarm.
- Sales already writes both `email_pipeline.emails` and `automation_runs (swarm_type='sales-email')` [VERIFIED: ingest/route.ts:167-304].

**The debtor wrinkle:** `debtor.email_labels` is not just an anchor — it carries debtor's **override-capture columns** (`corrected_customer_account_id`, `reviewed_by`, `draft_quality`, `feedback_reason`, `debtor_name`). The generalized hydrator should treat `email_labels` as a **debtor-only enrichment join** layered on top of the generic `email_id` anchor: for `swarm_type='debtor-email'`, additionally load the matching `email_labels` row (joining on `email_id`) to populate Stage 4 + overrides; for sales/info-routing, those slots are null (correct — no override store yet). This preserves debtor behavior byte-for-byte while making the anchor generic.

**The bucket-partition wrinkle (`load-bucket-label-ids.ts`):** Queue/History membership is computed from `agent_runs` (swarm-generic, filters on `swarm_type`) then mapped to `debtor.email_labels.id` for the list. For sales/info-routing there is no `email_labels` table, so the list unit must become **`email_id`** (or `automation_runs.id`). The cleanest move: make the bucket return `email_id`s for non-debtor swarms (the list unit the hydrator now anchors on) and keep `email_labels.id` for debtor *only if* the debtor surface needs per-label granularity (it does — one `email_id` can carry two label rows, per the COUNT UNIT comment at load-bucket-label-ids.ts:26-31). **Plan implication:** the bucket loader needs a swarm-branch on list-unit — but that branch is a *surface-layer* concern, NOT a shared-pipeline-worker branch, so it does **not** violate SWARM-02 (which scopes to `classify`/classifier/coordinator/dispatcher). Document this distinction explicitly for the plan-checker.

### info-routing already-broken finding

info-routing's `swarms` row: `review_route='/automations/info-routing/review'`, `source_table='automation_runs'`, no `email_labels` store [VERIFIED: 20260521_info_routing_swarm_smeba_minimum_viable.sql]. There is **no `app/(dashboard)/automations/info-routing/` directory** — it resolves through the generic `[swarm]` route, which 404s it at `review/page.tsx:84`. So **info-routing's Bulk Review is currently dead**, same root cause. Generalizing the anchor fixes it for free (D-02). [VERIFIED: codebase]

**`source_table` mismatch to flag:** debtor's swarms row says `source_table='automation_runs'` but the surface actually reads `debtor.email_labels`. The `source_table` column is descriptive metadata, not wired to the loader. The generalized anchor (`email_pipeline.emails`) makes `source_table` even less load-bearing — note for the planner that it's safe to ignore but a candidate for a future doc-clarity pass.

---

## RQ2 — Per-Stage Dry-Run Gating Design (D-10/D-11)

### Confirmed current behavior (the footgun is real)

| Stage / side-effect | Worker file | Reads `labeling_settings.dry_run`? | Effective behavior today |
|---------------------|-------------|-----------------------------------|--------------------------|
| Stage 1 iController **cleanup** (the 867 deletes) | `stage-1-icontroller-noise-cleanup.ts:88` | **NO** — hardcoded `openIControllerSession("production", …)` | **Always live, ungated** [VERIFIED] |
| Stage 2 customer resolve | `stage-2-customer-resolver.ts:77-100` | Yes (`dryRun = settingsRow?.dry_run ?? true`) | Gated; `dry_run` → `predicted` (kanban review) |
| Stage 2 iController label apply | `stage-2-icontroller-label-applier.ts` | Yes (`"skipped_dry_run"` path) | Gated |
| Stage 4 invoice-copy handler | `classifier-invoice-copy-handler.ts:247-264` | Yes (`dryRun = settingsRow?.dry_run ?? true`) | Gated |
| Stage 3 intent labeling | via the Stage-2/Stage-4 gates above | (the labeling itself is the resolver+tagger chain) | Gated |

Other `dry_run` references — `labeling-flip-cron.ts`, `promotion-recommender-cron.ts`, `resolve-debtor.ts:128` (`.in("status", ["labeled","dry_run"])`) — read `dry_run` as a **status value** on `email_labels`, not the settings flag; these are read-model consumers, not gates, but must not break when the gate model changes.

`debtor.labeling_settings` schema [VERIFIED: 20260423_debtor_email_labeling.sql]: `source_mailbox text PK`, `dry_run boolean NOT NULL DEFAULT true`, `updated_at`, `updated_by`. Keyed per-mailbox, **no swarm/entity column** (load-page-data.ts:92-94 flags this for re-scope).

### Registry shape recommendation: jsonb `dry_run_config` on `public.swarms`

**Recommendation [ASSUMED — needs confirmation; multiple valid placements]:** Put per-stage flags as a **jsonb `dry_run_config` column on `public.swarms`**, NOT on `debtor.labeling_settings`. Rationale:
- `swarms` is the cross-swarm registry; `labeling_settings` is debtor-schema + per-mailbox. The folded todo's "single `dry_run_gates jsonb` keyed by stage+side-effect" generalizes cleanly onto the swarm row, matching the Phase 69 registry-as-source-of-truth pattern.
- Sales has no `labeling_settings` rows at all — putting the gate there would force a sales label-settings table, contradicting D-01.
- The folded todo explicitly offers this option: *"a single `dry_run_gates jsonb` column … keyed by stage+side-effect or stage+handler-name, so new handlers don't require schema migrations."*

Proposed jsonb shape (per-swarm):
```json
{
  "stage_1_archive":  false,   // Outlook archive side-effect (sales, Phase 112)
  "stage_1_cleanup":  false,   // iController delete (debtor) — false = LIVE
  "stage_3_labeling": false,   // intent labeling
  "stage_4_handlers": { "invoice-copy": false }  // per-handler-class map
}
```

**The D-11 preservation rule — the hard part.** Debtor's effective behavior must not change:
- `stage_1_cleanup` for debtor MUST be **live** (`false`/not-gated) because today it's hardcoded `"production"`. Re-encoding it as a gate that *defaults to live for debtor* preserves the 867-delete reality. **Do NOT flip it to dry-run** — that would silently disable a live production cleanup the operator depends on.
- `stage_3_labeling` / `stage_4_handlers.invoice-copy` for debtor must read **the same effective value the `labeling_settings.dry_run` boolean produces today** (per-mailbox, default true). This is the subtle bit: today's gate is **per-mailbox**, the proposed `swarms.dry_run_config` is **per-swarm**. A per-swarm flag **loses per-mailbox granularity** that debtor currently has (e.g. smeba live, sicli-noord dry-run). **This is a genuine design tension the planner must resolve** — see Open Questions OQ-1.

**Worker changes required (each side-effect worker):** replace `const dryRun = settingsRow?.dry_run ?? true` with a read of the per-stage flag from the swarm registry (loaded via `loadSwarm`), keyed by the worker's stage/handler. The cleanup worker (`stage-1-icontroller-noise-cleanup.ts`) gains a gate it never had — but **defaulted to live for debtor** so behavior is unchanged. Sales defaults every flag to dry-run/true (D-11).

**Stages staying always-live read-only:** Stage 0 safety, Stage 1 classify, Stage 2 resolve-read, Stage 3 classify — no flags (D-10). The kill-switch question (folded-todo open question) is OUT of scope — note for the planner but don't build.

---

## RQ3 — Coordinator Generalization (D-07, SWARM-02)

### Current state

`debtor-email-coordinator.ts` has `const SWARM_TYPE = "debtor-email"` at line 47 and uses it in three places: TENANT_DOMAINS lookup (55), `coordinator_runs.swarm_type` insert (127), `emitPipelineEvent({ swarm_type: SWARM_TYPE })` (291), and the emitted event name `` `${SWARM_TYPE}/predicted` `` (359-362) [VERIFIED: codebase]. The function trigger is `{ event: "debtor-email/coordinator.requested" }` (line 80).

### What must change

| Concern | Current | Change |
|---------|---------|--------|
| `SWARM_TYPE` source | module const | read `event.data.swarm_type` (the payload already carries it everywhere else) |
| Trigger event name | `debtor-email/coordinator.requested` (swarm-specific) | **TENSION** — see below |
| TENANT_DOMAINS | `TENANT_DOMAINS_BY_SWARM["debtor-email"]` | `TENANT_DOMAINS_BY_SWARM[swarm_type]` (the map is already per-swarm) |
| Intent agent invocation | `invokeIntentAgent` (debtor-email-specific module) | read `swarms.stage3_coordinator_agent_key` to pick the agent (forward-ref; sales agent built in 113) |
| Emitted `*/predicted` | `${SWARM_TYPE}/predicted` | `${swarm_type}/predicted` — dispatcher already wildcard-listens `*/predicted` [VERIFIED: stage-3-dispatcher.ts:51] |

### The event-name tension (plan-critical)

The dispatcher (`stage-3-dispatcher.ts`) is **fully generic** — wildcard `*/predicted`, derives `swarm_type` from payload, falls back to event-name prefix [VERIFIED]. So the **emit** side generalizes trivially. The **trigger** side is the friction: the coordinator triggers on `debtor-email/coordinator.requested`. For 113's `sales-intent-agent` to "dispatch through the existing shared dispatcher with no edits" (STAGE3-01), the coordinator must also accept `sales-email/coordinator.requested` (or a wildcard `*/coordinator.requested`).

**Recommendation [ASSUMED — confirm with planner]:** change the coordinator trigger to a **wildcard `*/coordinator.requested`** mirroring the dispatcher's `*/predicted` pattern, deriving `swarm_type` from `event.data.swarm_type` with event-name-prefix fallback. This is the proven pattern (dispatcher does exactly this). **Regression risk:** the debtor producer (`stage-2-customer-resolver` / label-resolver) emits `debtor-email/coordinator.requested`; under a wildcard trigger the same event still matches — no producer change needed, behavior preserved. Verify the wildcard-trigger cast pattern (dispatcher uses `{ event: "*/predicted" } as unknown as {...}` at line 51) transfers.

### Regression risk + existing coverage

- **Live debtor Stage-3 path risk:** HIGH (D-09). The `entity` coercion (lines 89-94) hardcodes the debtor brand union `"smeba"|"berki"|…` — for a generic coordinator this must read from registry or accept `null` (sales has no entity, per ingest route `entity: null`). Don't drop the debtor default `?? "smeba"` without preserving it for debtor.
- **Existing tests:** `web/lib/bulk-review/__tests__/out-of-band.test.ts` (static forbidden-import guard — must stay green) [VERIFIED]; `classifier-screen-worker.test.ts` (the SWARM-02 registry-driven grep guard, includes sales-email + debtor-email swarm fixtures) [VERIFIED]. **Gap:** there is **no dedicated coordinator Stage-3 behavior test** — D-09 mandates adding one around the refactor. Plan must include RED→GREEN coordinator tests asserting debtor produces identical `coordinator_runs` + `pipeline_events` + `*/predicted` emit before and after.

---

## RQ4 — Codegen Generalization (D-08, SWARM-01)

### Current state

| Script | Output path | Swarm selection | Empty-registry handling |
|--------|-------------|-----------------|------------------------|
| `gen-entity-types.ts` | `lib/automations/debtor-email/coordinator/entity.generated.ts` | `process.env.SWARM_TYPE ?? "debtor-email"` (line 74) | `codes.length===0` → `ENTITY_BRANDS = [] as const; type Entity = never` (line 49-51) |
| `gen-intent-types.ts` | `lib/automations/debtor-email/coordinator/intent.generated.ts` | `process.env.SWARM_TYPE ?? "debtor-email"` (line 76) | `keys.length===0` → `SWARM_INTENTS = [] as const; type Intent = never` (line 49-52) |
| `gen-tenant-domains.ts` | same dir, `tenant-domains.generated.ts` | **iterates ALL swarms** (`select … order by swarm_type`), emits `TENANT_DOMAINS_BY_SWARM` map | `rows.length===0` → `{} as const; type TenantDomain = never` |

`gen-tenant-domains.ts` is **the model** (D-08): one query over all swarms → one per-swarm map → one literal-union. [VERIFIED]

### Recommended generalization

**Option A (follow the tenant-domains model — RECOMMENDED [ASSUMED — confirm]):** rewrite `gen-entity-types.ts` and `gen-intent-types.ts` to iterate all swarms and emit **per-swarm maps**:
```ts
export const SWARM_INTENTS_BY_SWARM = {
  "debtor-email": ["address_change", "contract_inquiry", …],
  "info-routing":  [...],
  "sales-email":   [],   // empty until Phase 113
} as const;
export type Intent = (typeof SWARM_INTENTS_BY_SWARM)[keyof typeof SWARM_INTENTS_BY_SWARM][number];
```
This keeps **one** generated file per concern (not per-swarm directories), matches the existing `TENANT_DOMAINS_BY_SWARM` shape exactly, and avoids the `SWARM_TYPE` env-var-per-run hack. **hydrate.ts repoint:** lines 35-38 import `SWARM_INTENTS`/`Intent`/`ENTITY_BRANDS`/`Entity` from the debtor-only paths; repoint to the new map files and key by `opts.swarm_type`. The hydrator's runtime validation (lines 458-471, 363-368) currently does `(SWARM_INTENTS as readonly string[]).includes(intent_key)` — becomes `(SWARM_INTENTS_BY_SWARM[opts.swarm_type] ?? []).includes(...)`.

**Empty-union footgun check [VERIFIED]:** for an empty sales array, `SWARM_INTENTS_BY_SWARM["sales-email"]` is `readonly []`, whose `[number]` is `never`. In the **per-swarm-map** shape this is **safe** — the *union over all swarms* is non-empty (debtor has intents), so `type Intent` is not `never`. The per-swarm runtime lookup `(map[swarm] ?? [])` returns `[]` and `.includes()` is always-false (correct: sales has no intents yet, every Stage-3 value filters out until 113). **The Option-A map shape avoids the `type X = never` footgun that the per-file Option-B would hit** (a standalone sales `intent.generated.ts` with `type Intent = never` would make `as Intent` casts fail to compile). Prefer Option A.

**CI gate (D-06):** `npm run codegen && git diff --exit-code` already the pattern. After enrichment migration adds `entity_brand=['smeba']` to sales, codegen must regenerate and be committed atomically. The `codegen` package.json script chains all three — no change needed if scripts self-iterate swarms (Option A); if kept env-driven (Option B), the script chain would need per-swarm invocations (clunkier — another reason for A).

---

## RQ5 — swarms Row Enrichment (SWARM-01, D-04)

### Current sales-email null-state [VERIFIED: 20260506_phase74_sales_email_seed.sql]

| Column | Current value | Target (Phase 110) |
|--------|---------------|--------------------|
| `swarm_type` | `'sales-email'` | unchanged |
| `display_name` | `'Sales Email'` | unchanged |
| `review_route` | `'/automations/[swarm]/review'` | unchanged |
| `source_table` | `'automation_runs'` | unchanged (descriptive only — see RQ1) |
| `enabled` | `true` | unchanged |
| `ui_config` | populated (tree/columns/drawer) | unchanged |
| `side_effects` | `'[]'::jsonb` | **stays `[]`** until Phase 112 (D-05) |
| `stage1_regex_module` | `null` | stays `null` (LLM-only Stage 1) |
| `stage2_entity_resolver` | `null` | **set** (forward-ref to v8.2 NXT resolver, RESL-03 seam) |
| `stage3_coordinator_agent_key` | `null` | **set** to `'sales-intent-agent'` (forward-ref, built in 113) |
| `canonical_context_shape` | `null` | **set** (derive from debtor's shape — see below) |
| `entity_brand` | `'[]'::jsonb` | **set** to `["smeba"]` (D-04) → triggers codegen regen |
| `tenant_domains` | (Phase 84 column; sales already `["smeba.nl"]` per gen-tenant-domains comment) | confirm/unchanged |
| `resolution_config` | **does not exist as a column** — see below | **new column** (D-04) |

**`resolution_config` is NOT an existing column.** [VERIFIED — not in 20260429b, 20260504b, or phase74 migrations]. D-04 lists it among the values to populate, so Phase 110's migration must **`ALTER TABLE public.swarms ADD COLUMN resolution_config jsonb`** before seeding it. This is the forward-ref config the v8.2 RESL-03 dynamic-dispatch seam reads (Phase 114). Its exact schema is owned by the v8.2 debtor workspace — Phase 110 seeds a **planned-target placeholder** held inert (D-05). **Flag for planner:** coordinate the `resolution_config` shape with the v8.2 RESL-01/02 work or seed a documented placeholder; do not invent a binding schema that 114 then has to migrate away from. [ASSUMED — cross-track dependency]

### `canonical_context_shape` for sales (Claude's discretion → recommendation)

Debtor's shape [VERIFIED: 20260504b:48-57] is the Stage 2→3 `PipelineStageContext` contract: `{version, fields: {customer_account_id, customer_name, language, entity_brand, recent_documents}}`. The RFC [CITED: docs/agentic-pipeline/context-shape-contract.md, `context_version: 1`] defines this as the cross-swarm contract Stage 3 consumes.

**Recommendation [ASSUMED — Claude's discretion, derive in planning]:** sales mirrors debtor's shape with sales-appropriate field nullability. Since sales Stage 2 (NXT resolver reuse, 114) resolves customers the same way, the same field set applies: `customer_account_id` (nullable — customer-less prospects fall through per STAGE2-02), `customer_name` (nullable), `language` (sales corpus is NL/EN), `entity_brand` (`'smeba'`), `recent_documents` (array, default `[]`). Bump `version` to a sales-stamped value (e.g. `'2026-06-03.sales.v1'`). The shape is inert until 114 wires Stage 2.

**RESL seam note (from STATE.md cross-track):** Phase 114 depends on v8.2 RESL-01/02/03; `stage2_entity_resolver` + `resolution_config` are **forward-referenced here, inert until that seam lands** (STATE.md line 156, CONTEXT D-05). Set `stage2_entity_resolver` to the planned resolver identifier the v8.2 RESL-03 dispatch seam will key on — coordinate the exact string with the v8.2 workspace. [ASSUMED — cross-track]

---

## RQ6 — Pipeline-Health Per-Mailbox (VERIFY-01, D-12)

### Current state [VERIFIED]

`pipeline-health-monitor.ts` already probes `["debtor-email", "info-routing", "sales-email"]` (line 25), writes one `pipeline_health_snapshots` row **per swarm** per tick. `pipeline_health_snapshots` schema [VERIFIED: 20260528_pipeline_health_snapshots.sql]: `id, checked_at, swarm_type, mode CHECK('live'|'dry_run'), queue_depth, failures_6h, throughput_6h, heartbeat_age_minutes, status CHECK('ok'|'warning'|'error'), notes, created_at`. RLS: service_role ALL + authenticated SELECT (already correct). All metrics come from `automation_runs` filtered by `swarm_type`.

### Adding the per-mailbox dimension

**Minimal-change recommendation [ASSUMED — confirm column vs grouping]:**
1. **Migration:** `ALTER TABLE public.pipeline_health_snapshots ADD COLUMN source_mailbox text` (nullable — back-compat; existing rows stay null = "swarm aggregate"). Add to the `swarm_mode_idx` or a new `(swarm_type, source_mailbox, checked_at desc)` index. No RLS change (existing policies cover the new column).
2. **Monitor:** inside the per-swarm loop, additionally group throughput/failures by `source_mailbox`. For sales, the mailbox identifier is **`email_pipeline.emails.mailbox = 'verkoop@smeba.nl'`** [VERIFIED: ingest/route.ts:40,170]. But the monitor reads `automation_runs`, which for sales has `mailbox_id: null` (ingest route line 281) and `result.source_mailbox` in the JSONB [VERIFIED]. So per-mailbox grouping for sales must either (a) join `automation_runs → email_pipeline.emails` on email_id to get `.mailbox`, or (b) read `result->>'source_mailbox'` from the `automation_runs.result` JSONB. Option (b) is cheaper (no join) and the data is already there for sales.
3. **Sales is single-mailbox** so the per-mailbox row for sales == the swarm aggregate today; the dimension is forward-looking (D-12 deferred multi-mailbox UX). Confirm ~33/day `verkoop@smeba.nl` is visible by querying the new dimension.

**The mailbox-id wrinkle:** debtor uses `mailbox_id` (int, e.g. 4,5,15,16,171) + `source_mailbox` text; sales uses neither on `automation_runs` (both null) but carries `source_mailbox` in `result` JSONB and `mailbox` on `email_pipeline.emails`. A uniform per-mailbox key is **`source_mailbox` (text address)** — present (or derivable) for both. Recommend keying the new dimension on text `source_mailbox`, not the int `mailbox_id`.

---

## RQ7 — Sugar Zero-Assertion + Ingest Confirm (VERIFY-01, D-13)

### Ingest is Outlook-only [VERIFIED]

`web/app/api/automations/sales-email/ingest/route.ts`: `SALES_SOURCE = "outlook"` (line 41), `SALES_SOURCE_MAILBOX = "verkoop@smeba.nl"` (line 40), upserts `email_pipeline.emails` on `(source, source_id)` (lines 156-162). No SugarCRM code path. The Zapier trigger feeds this route (`triggered_by: "zapier:outlook-ingest"`). **VERIFY-01's "confirm Outlook-based, not residual SugarCRM poll" is satisfied by asserting `source='outlook'` is the only sales source** — a count query, not a code change.

### The zero-assertion query

Per D-13, assert **no `source='sugarcrm'` rows** exist for sales in `email_pipeline.emails`:
```sql
SELECT count(*) FROM email_pipeline.emails WHERE source = 'sugarcrm';
```
**Caveat from REQUIREMENTS.md baseline (line 12):** "SugarCRM source has 2 stragglers since [the 2026-05-06 cutover]." So the **live count may be 2, not 0**. CONTEXT D-13 says assert ==0 and flag non-zero as an anomaly to investigate. Reconcile this: the planner should assert the count is **≤ the known straggler baseline (2)** OR investigate/disposition those 2 specific rows. **Flag:** REQUIREMENTS.md says 2 stragglers exist; CONTEXT D-13 says assert 0. These mildly conflict — the assertion should surface the actual count and the 2 known stragglers are the "anomaly to investigate," not a silent pass. [VERIFIED: REQUIREMENTS.md:12 vs CONTEXT D-13]

### Where the check lives

**Recommendation [ASSUMED — confirm placement]:** a **monitor probe / test assertion**, not a migration assertion (migrations shouldn't fail CI on data state) and not a delete (D-13 forbids disposition machinery). Cheapest durable home: extend the pipeline-health-monitor to emit a `notes` flag when `source='sugarcrm'` count for sales > expected baseline, OR a one-shot Vitest/SQL verification documented in the phase VERIFICATION. Since D-13 is "assert absence, no machinery," a **verification-time SQL check** (run during `/gsd:verify-work`) is the lightest fit; a standing monitor probe is the durable option if the operator wants ongoing detection.

---

## Architecture Patterns

### System data flow (Bulk Review surface, generalized anchor)

```
Zapier (verkoop@smeba.nl) ──POST──> /api/automations/sales-email/ingest
                                          │ upsert email_pipeline.emails (source='outlook')
                                          │ insert automation_runs (swarm_type='sales-email')
                                          └─emit─> stage-0/email.received
                                                       │
   Stage 0→4 workers (registry-driven) ──write──> public.pipeline_events + public.agent_runs
                                                       │  (already swarm-generic)
                                                       ↓
   /automations/[swarm]/review (RSC) ──> loadQueueBucket(swarm) ──> [email_id list]   ← anchor CHANGE
                                          │
                                          └─> hydrateBulkReviewRow({ email_id, swarm_type })
                                                 ├─ pipeline_events (generic)   ✓ no change
                                                 ├─ agent_runs (generic)        ✓ no change
                                                 ├─ [debtor only] email_labels join for overrides
                                                 └─ SWARM_INTENTS_BY_SWARM[swarm] / ENTITY_BRANDS_BY_SWARM[swarm]  ← codegen CHANGE
                                                       ↓
                                          BulkReviewClientShell (registry-generic, no change)
```

### Pattern: surface-layer branch ≠ shared-worker branch (SWARM-02 boundary)

SWARM-02 forbids `if swarm==='sales-email'` in **shared pipeline workers** (`classify`/classifier/coordinator/dispatcher). A swarm-conditional in the **Bulk Review surface loaders** (e.g. bucket list-unit: `email_labels.id` for debtor vs `email_id` for others) is a presentation concern, not a pipeline-worker branch — it does **not** violate SWARM-02. Document this distinction so the plan-checker doesn't false-flag it. [CITED: ROADMAP.md Phase 110 SC-3 scopes the gate to "classify / classifier / coordinator / dispatcher"]

### Anti-patterns to avoid

- **Building a sales label store.** D-01 explicitly rejects this. Anchor on `email_pipeline.emails`, not a new `sales.email_labels`.
- **Per-swarm `*.generated.ts` files with `type X = never`.** Use the per-swarm-MAP shape (Option A) so the union-over-all-swarms is non-empty. (RQ4)
- **Flipping `stage_1_cleanup` to dry-run for debtor.** Preserves nothing — it silently disables a live cleanup. Default it live for debtor (RQ2/D-11).
- **A per-swarm dry-run flag that erases debtor's per-mailbox granularity.** Open question OQ-1.
- **Inventing a binding `resolution_config` schema** the v8.2 track then migrates away from. Seed an inert placeholder coordinated cross-track (RQ5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swarm-generic row evidence | A new per-swarm events table | Existing `public.pipeline_events` + `public.agent_runs` | Already swarm-generic, keyed by `email_id` (hydrate.ts steps 2-3) |
| Literal-union types from registry | Hand-written `type Intent = …` | `npm run codegen` per-swarm maps | Phase 69 pattern; CI `git diff --exit-code` gate (D-06) |
| Cross-swarm Stage-3 dispatch | New dispatcher per swarm | Existing `stage-3-dispatcher.ts` wildcard `*/predicted` | Already generic — derives swarm_type from payload |
| Sales ingest | New Sugar/Outlook adapter | Existing `/api/automations/sales-email/ingest` (Outlook-only) | Already live, 827 emails/30d |
| Tenant-domains codegen shape | New map format | `TENANT_DOMAINS_BY_SWARM` (gen-tenant-domains.ts) | D-08 says follow it |

**Key insight:** Phase 110 is a refactor that *removes* debtor-specific code, not one that adds sales-specific code. Almost everything sales needs already exists generically; the work is un-binding four debtor anchors.

## Common Pitfalls

### Pitfall 1: Per-swarm dry-run flag silently drops debtor's per-mailbox granularity
**What goes wrong:** Debtor's `labeling_settings.dry_run` is **per-mailbox** (smeba can be live while sicli-noord is dry-run). A per-swarm `swarms.dry_run_config` collapses all debtor mailboxes to one setting.
**Why:** the registry is per-swarm; the existing gate is per-mailbox.
**How to avoid:** either keep a per-mailbox override layer (read `labeling_settings.dry_run` first for debtor, fall back to swarm flag) or make `dry_run_config` keyed by `(swarm, mailbox)`. Resolve in discuss/plan — OQ-1.
**Warning sign:** a debtor mailbox that was dry-run starts acting live (or vice-versa) after the migration.

### Pitfall 2: The cleanup worker gains a gate that defaults wrong
**What goes wrong:** Adding `stage_1_cleanup` gate to `stage-1-icontroller-noise-cleanup.ts` and defaulting it to dry-run disables debtor's live 867-delete cleanup.
**How to avoid:** default `stage_1_cleanup=false` (live) for debtor in the seed migration; sales gets `true` (dry-run). The migration **re-encodes today's reality** (D-11).
**Warning sign:** debtor noise stops being cleaned in iController after deploy.

### Pitfall 3: PostgREST silent-drop on large `.in()` anchor lists
**What goes wrong:** the bucket loader chunks decided-or-done `email_id` sets at 50 (load-bucket-label-ids.ts:154) to stay under the ~8KB URL limit. A naive anchor generalization that `.in()`s a large `email_id` list re-introduces the silent-truncation bug.
**How to avoid:** preserve the chunk-at-50 + range-paged-at-1000 patterns when changing the list unit. [VERIFIED: existing code already guards this]

### Pitfall 4: Inngest replay-safety in the coordinator refactor
**What goes wrong:** moving `swarm_type` derivation or run-id generation outside `step.run` makes replays regenerate values and race onto different keys (CLAUDE.md Phase 65 lesson).
**How to avoid:** `swarm_type` from `event.data` is deterministic (safe outside step.run); the existing `resolve-run-id` step.run (line 104) must stay. Never alias `inngest.send` (Phase 65 dae6276).
**Warning sign:** coordinator_runs rows stuck on INSERT defaults while agent_runs has the real data.

### Pitfall 5: Sugar zero-assertion fails on the 2 known stragglers
**What goes wrong:** asserting `count==0` fails because REQUIREMENTS.md confirms 2 sugarcrm stragglers exist.
**How to avoid:** assert against the known baseline (2) and surface the actual count; treat the 2 as the documented "anomaly to investigate," not a hard fail. OQ-3.

## Runtime State Inventory

This is a refactor/migration phase. Explicit inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `debtor.email_labels` (debtor anchor — stays for debtor as override-join); `email_pipeline.emails` (shared corpus, new anchor); `pipeline_events`/`agent_runs` (generic evidence — no migration); 2 known `source='sugarcrm'` rows in `email_pipeline.emails` (REQUIREMENTS.md:12) | Anchor = code change (hydrator) + bucket-loader change; Sugar rows = zero-assertion only (no delete, D-13) |
| Live service config | Zapier "MR \|\| Sales email analyzer" Zap posts to `/api/automations/sales-email/ingest` (Outlook trigger, confirmed not Sugar) — config lives in Zapier UI, NOT git | VERIFY-01: confirm the Zap trigger is Outlook (operator/Zapier-side check) |
| OS-registered state | None — no cron/task renames in this phase | None — verified (phase touches no Inngest cron schedules except pipeline-health column add) |
| Secrets/env vars | `ZAPIER_INGEST_SECRET` (shared with debtor ingest), `SUPABASE_SERVICE_ROLE_KEY`, `PIPELINE_HEALTH_WEBHOOK_URL` — all unchanged, code reads by existing name | None — no secret renames |
| Build artifacts | `*.generated.ts` (entity/intent/tenant-domains) regenerate after the enrichment migration adds `entity_brand=['smeba']` | `npm run codegen` committed atomically with the migration (D-06); CI `git diff --exit-code` |

**Data-migration vs code-edit split (D-10/D-11):** the per-stage dry-run change is **both** — a code-edit (each worker reads the new flag) AND a data-migration (seed `dry_run_config` re-encoding debtor's current effective behavior). Both tasks must appear in the plan.

## Code Examples

### Generalized per-swarm intent map (codegen output — Option A)
```ts
// AUTO-GENERATED by scripts/gen-intent-types.ts — DO NOT EDIT BY HAND.
export const SWARM_INTENTS_BY_SWARM = {
  "debtor-email": ["address_change", "contract_inquiry", "copy_document_request",
    "credit_request", "general_inquiry", "other", "payment_dispute", "peppol_request"],
  "info-routing": [/* … */],
  "sales-email": [],          // empty until Phase 113 — union-over-all-swarms still non-empty
} as const;
export type Intent =
  (typeof SWARM_INTENTS_BY_SWARM)[keyof typeof SWARM_INTENTS_BY_SWARM][number];
```
Source pattern: `web/scripts/gen-tenant-domains.ts` (already emits this exact shape) [VERIFIED]

### Coordinator swarm_type from payload (D-07)
```ts
// BEFORE: const SWARM_TYPE = "debtor-email";
// AFTER (inside the function body, deterministic — safe outside step.run):
const eventName = (event as unknown as { name: string }).name;
const swarm_type = event.data.swarm_type ?? eventName.split("/")[0];
const TENANT_DOMAINS = [...(TENANT_DOMAINS_BY_SWARM[swarm_type] ?? [])];
// emit: name: `${swarm_type}/predicted`  — dispatcher already wildcard-listens
```
Mirrors `stage-3-dispatcher.ts:69-70` [VERIFIED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-swarm review surface 404 for non-debtor | Generic `[swarm]` route + registry gate | Phase 110 | Un-404s sales AND info-routing |
| `debtor.labeling_settings.dry_run` single boolean | Per-stage `swarms.dry_run_config` jsonb | Phase 110 (folds 2026-05-18 todo) | Restores the dry-run safety contract |
| Coordinator hardcoded `SWARM_TYPE` const | swarm_type from event payload | Phase 110 | Shared Stage-3 runner for 113's sales agent |
| Per-file debtor `*.generated.ts` | Per-swarm maps (`*_BY_SWARM`) | Phase 110 | Zero-edit onboarding extends to types |

**Deprecated/outdated:**
- `source_table` column on `swarms` is descriptive metadata, not wired to the loader (debtor reads `email_labels` despite `source_table='automation_runs'`). Candidate for future doc clarity — not load-bearing.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Anchor on `email_pipeline.emails.id` is the cleanest swarm-generic pivot | RQ1 | If a swarm doesn't write `email_pipeline.emails`, the anchor misses it — verified sales+info-routing do; debtor uses email_labels.email_id → emails.id |
| A2 | Per-stage flags belong on `swarms.dry_run_config` jsonb, not `labeling_settings` | RQ2 | Wrong placement forces a sales label-settings table (contradicts D-01) — confirm in discuss |
| A3 | Coordinator trigger → wildcard `*/coordinator.requested` | RQ3 | If producers must change too, scope grows — verified debtor producer event still matches a wildcard |
| A4 | Codegen Option A (per-swarm maps) over Option B (per-swarm files) | RQ4 | Option B hits `type X = never` compile footgun; A avoids it (verified) |
| A5 | `canonical_context_shape` mirrors debtor's field set with sales nullability | RQ5 | Inert until 114; low risk — Claude's discretion |
| A6 | `resolution_config` needs a NEW column + inert placeholder coordinated with v8.2 | RQ5 | Cross-track — if v8.2 already defined the column/shape, reuse it; do NOT invent a conflicting schema |
| A7 | `stage2_entity_resolver` value coordinated with v8.2 RESL-03 seam | RQ5 | Cross-track dependency; placeholder must match what 114 reads |
| A8 | pipeline-health per-mailbox keyed on text `source_mailbox` (not int `mailbox_id`) | RQ6 | sales has null mailbox_id; source_mailbox is the uniform key |
| A9 | Sugar zero-assertion lives in verification SQL / monitor note, not migration/delete | RQ7 | D-13 forbids machinery; lightest durable home |
| A10 | Debtor's per-mailbox dry-run granularity must be preserved across the per-swarm flag migration | RQ2/OQ-1 | If collapsed to per-swarm, a debtor mailbox silently flips live/dry-run |

## Open Questions

1. **OQ-1 — per-mailbox vs per-swarm dry-run granularity.** Debtor's `labeling_settings.dry_run` is per-mailbox; the proposed `swarms.dry_run_config` is per-swarm. Does debtor need per-mailbox granularity preserved (e.g. smeba live, sicli-noord dry-run)?
   - What we know: debtor `labeling_settings` is keyed by `source_mailbox` PK; some mailboxes may differ.
   - What's unclear: whether any debtor mailbox currently differs from the others in `dry_run`.
   - Recommendation: query `SELECT source_mailbox, dry_run FROM debtor.labeling_settings` during discuss/plan. If all uniform → per-swarm flag is safe. If they differ → keep a per-mailbox override layer (read labeling_settings first, fall back to swarm flag).

2. **OQ-2 — `resolution_config` / `stage2_entity_resolver` cross-track shape.** Phase 114 reads these via the v8.2 RESL-03 seam.
   - What we know: forward-referenced, inert until 114 (D-05, STATE.md:156).
   - What's unclear: the exact column schema + string value the v8.2 RESL-03 dispatch keys on.
   - Recommendation: coordinate with the v8.2 debtor workspace; seed a documented inert placeholder; do not invent a binding schema.

3. **OQ-3 — Sugar straggler count (0 vs 2).** CONTEXT D-13 says assert ==0; REQUIREMENTS.md:12 says 2 stragglers exist.
   - Recommendation: assertion surfaces actual count; treat the 2 known rows as the documented anomaly. Confirm the live count with `SELECT count(*) FROM email_pipeline.emails WHERE source='sugarcrm'` at plan time.

4. **OQ-4 — bucket list-unit for non-debtor swarms.** Debtor's bucket returns `email_labels.id` (one email_id can carry 2 label rows); sales/info-routing have no label table.
   - Recommendation: list unit = `email_id` for non-debtor swarms; keep `email_labels.id` for debtor. This surface-layer branch does NOT violate SWARM-02 (RQ1/Pattern).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (service role) | migrations, codegen registry reads | ✓ | live | — |
| `tsx` codegen runner | `npm run codegen` | ✓ | per package.json | — |
| Vitest | regression guards | ✓ | per package.json | — |
| Inngest | coordinator + pipeline-health | ✓ | live | — |
| Microsoft Graph / Zapier (Outlook) | sales ingest (already live) | ✓ (live, 827/30d) | — | — (not changed this phase) |

No missing dependencies — all in-repo. No external installs.

## Validation Architecture

> `.planning/config.json` not separately read here; nyquist_validation treated as enabled (key absent = enabled). Confirm during planning.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `web/vitest.config.*` (existing) |
| Quick run command | `cd web && npm run test -- <file>` |
| Full suite command | `cd web && npm run test` (+ `npm run typecheck`, `npm run lint`, `npm run build`, `npm run codegen && git diff --exit-code`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVIEW-01 | sales review surface renders (no 404); info-routing un-404s | unit (RSC loader) + manual UAT | `npm run test -- review` | ❌ Wave 0 (new test for generic anchor) |
| SWARM-01 | enrichment migration + codegen atomic, no hand-edit | CI gate | `npm run codegen && git diff --exit-code` | ✅ (CI gate exists) |
| SWARM-02 | zero shared-worker swarm branches | static grep guard | `npm run test -- classifier-screen-worker` | ✅ `classifier-screen-worker.test.ts` |
| SWARM-02 | hydrator out-of-band imports clean | static guard | `npm run test -- out-of-band` | ✅ `out-of-band.test.ts` |
| D-07/D-09 | debtor coordinator Stage-3 behavior unchanged | unit | `npm run test -- coordinator` | ❌ Wave 0 (D-09 mandates new test) |
| D-10/D-11 | debtor effective dry-run behavior preserved | unit (per-worker gate read) | `npm run test -- <worker>` | ❌ Wave 0 (new gate tests) |
| VERIFY-01 | Sugar count assertion + per-mailbox throughput | SQL/verification | manual SQL during verify | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- <touched-file>` + `npm run typecheck`
- **Per wave merge:** full `npm run test` + `npm run codegen && git diff --exit-code`
- **Phase gate:** full suite green + debtor regression guards green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — covers D-07/D-09 (Stage-3 behavior parity). **Mandated by D-09.**
- [ ] Review-surface loader test for the generic `email_id` anchor (covers REVIEW-01 for sales + info-routing).
- [ ] Per-stage dry-run gate tests for each touched worker (cleanup, resolver, label-applier, invoice-copy) — assert debtor effective behavior unchanged (D-11).
- [ ] Sugar zero-assertion SQL check (VERIFY-01).
- [ ] Framework install: none — Vitest already present.

## Security Domain

> `security_enforcement` treated as enabled (absent = enabled).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; ingest auth (shared-secret body field) unchanged |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | **RLS mandatory** on the altered `pipeline_health_snapshots` (existing policies cover new column); no `TO anon`/`TO public USING(true)` (CLAUDE.md). New `swarms.dry_run_config`/`resolution_config` columns inherit existing swarms RLS. |
| V5 Input Validation | yes (existing) | Sales ingest already uses zod (`SalesIngestSchema`); no new external input in this phase |
| V6 Cryptography | no | No crypto |

### Known Threat Patterns for {Supabase + Next.js RSC}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| New column on RLS table without policy review | Info disclosure | Existing `pipeline_health_snapshots` policies (service_role ALL + authenticated SELECT) cover added columns; verify no SELECT leak of mailbox PII to unauthorized roles |
| Anon/public write to registry | Tampering | Migration template + CLAUDE.md rule: no `TO anon`/`USING(true)`; swarms registry is service_role-write, authenticated-read |
| Dry-run gate bypass (cleanup live under nominal dry-run) | Elevation/Repudiation | The whole point of D-10 — close the `stage_1_cleanup` gate gap; default debtor live (D-11), sales dry-run |
| SECURITY DEFINER / view without invoker | Elevation | If any new view added, `WITH (security_invoker = true)` (CLAUDE.md); no SECURITY DEFINER on exposed schema |

**Migration discipline (CLAUDE.md):** every new table/column in an exposed schema (`public`) → `ENABLE ROW LEVEL SECURITY` + explicit policy; `npm run check:supabase` pre-push hook fails on ERROR-level advisor lint. Altering existing RLS tables (`swarms`, `pipeline_health_snapshots`) inherits policies — verify advisor stays green.

## Project Constraints (from CLAUDE.md)

- **READ-FIRST RFC:** `docs/agentic-pipeline/README.md`, `stage-1-regex.md`, `stage-3-coordinator.md`, `docs/debtor-email-pipeline-architecture.md` win over code-inferred conclusions. Hard separation: a row is in exactly one of `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3) — the generalized hydrator must keep enforcing this (it does, lines 259-264 + 458-471).
- **Supabase RLS:** every new table/column in an exposed schema → ENABLE RLS + explicit policy; no `TO anon`/`TO public USING(true)`; SECURITY INVOKER views; `SET search_path` on SECURITY DEFINER functions; migration template `supabase/migrations/_template.sql`; pre-push `npm run check:supabase`.
- **Registry-driven codegen (Phase 69):** never hand-edit `*.generated.ts`; migration + `npm run codegen` committed atomically; CI `npm run codegen && git diff --exit-code`.
- **Inngest replay-safety:** non-deterministic ids inside `step.run()`; never alias/destructure `inngest.send` (Phase 65 dae6276).
- **Workspace gate:** phase work runs in `workspace/sales-agent-swarm` (current branch — verified, not `main`). ✓
- **No new extensions in `public`**; no directe LLM API keys.

## Sources

### Primary (HIGH confidence — codebase verified this session)
- `web/lib/bulk-review/hydrate.ts` — anchor on `debtor.email_labels`, generic evidence reads, codegen imports (lines 35-38, 135-177)
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx:84-86` — the `swarm_type!=='debtor-email'` 404
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/load-bucket-label-ids.ts` + `load-page-data.ts` — bucket/dry_run loaders + the inline "re-scope once a second swarm ships" TODO
- `web/lib/inngest/functions/debtor-email-coordinator.ts:47` — `const SWARM_TYPE = "debtor-email"`
- `web/lib/inngest/functions/stage-3-dispatcher.ts:51,69-70` — already generic wildcard `*/predicted`
- `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts:88` — hardcoded `"production"`, no dry_run gate (the footgun)
- `web/lib/inngest/functions/stage-2-customer-resolver.ts`, `stage-2-icontroller-label-applier.ts`, `classifier-invoice-copy-handler.ts` — the `dry_run` gate consumers
- `web/scripts/gen-entity-types.ts`, `gen-intent-types.ts`, `gen-tenant-domains.ts` + `package.json` codegen chain
- `web/lib/inngest/functions/pipeline-health-monitor.ts:25` — already probes 3 swarms
- `web/app/api/automations/sales-email/ingest/route.ts:40-41` — Outlook-only ingest
- Migrations: `20260429b_swarm_registry.sql`, `20260504b_swarms_registry_generalisation.sql`, `20260506_phase74_sales_email_seed.sql`, `20260423_debtor_email_labeling.sql`, `20260528_pipeline_health_snapshots.sql`, `20260521_info_routing_swarm_smeba_minimum_viable.sql`
- `docs/agentic-pipeline/README.md` — 5-stage funnel, Swarm Shapes, shared `email_pipeline.emails` corpus, per-stage nullability

### Secondary (MEDIUM — planning docs)
- `.planning/phases/110-…/110-CONTEXT.md` (locked decisions D-01..D-13)
- `.planning/REQUIREMENTS.md` (REVIEW/SWARM/VERIFY reqs + verified baseline incl. 2 Sugar stragglers)
- `.planning/ROADMAP.md` Phase 110 success criteria + dependency graph
- `.planning/STATE.md` (V9.0 re-sequencing, cross-track RESL seam note)
- `.planning/todos/pending/2026-05-18-granular-dry-run-gating-per-stage-and-handler.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external packages; all in-repo, verified.
- Architecture (anchor/coordinator/codegen seams): HIGH — read every relevant file directly; RFC consulted.
- Pitfalls (dry-run footgun, per-mailbox granularity, empty-union): HIGH — confirmed in code.
- Cross-track items (`resolution_config`, `stage2_entity_resolver` shapes): MEDIUM/ASSUMED — owned by v8.2 workspace; flagged as OQ-2.
- Sugar count (0 vs 2): MEDIUM — CONTEXT/REQUIREMENTS mildly conflict; resolved as OQ-3.

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable in-repo architecture; re-verify if v8.2 RESL seam lands or codegen scripts change before planning)
