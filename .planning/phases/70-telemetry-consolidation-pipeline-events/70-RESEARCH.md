# Phase 70: Telemetry consolidation (pipeline_events) — Research

**Researched:** 2026-05-05
**Domain:** Supabase (OLTP table design) · Inngest (replay-safe dual-write) · Next.js API routes · Bulk Review read-side
**Confidence:** HIGH (all findings verified against the live codebase; no external library research required — phase is internal data-layer work on the locked stack)

## Summary

Phase 70 is a small, surgical phase: one new Postgres table, one helper module, ≤7 inline emit points, and one read-side query rewrite. The hard parts are already decided in `70-CONTEXT.md` (D-01 through D-18). Research focused on locating the **exact** emit sites in the codebase and validating the assumption "every emit lives inside an existing `step.run`" — this is **almost** true, but the Stage 1 regex emit lives in a Next.js API route (`web/app/api/automations/debtor-email/ingest/route.ts`) which has no Inngest `step.run` boundary. That's a real divergence from D-09 the planner needs to design around.

Bulk Review's main feed today reads `automation_runs` (cursor-paginated, 100 rows) plus three side-loaders (`coordinator_runs`, `email_labels`, RPC `automation_runs_with_outlier`). It is **not** a 3-way join — Phase 66 already collapsed most of that. TELE-03's "read from `pipeline_events` instead of joining 3+ tables" is a smaller delta than the requirement text implies; the realistic v1 scope is rewiring the `loadPageData` row query in `web/app/(dashboard)/automations/[swarm]/review/page.tsx` and proving the side-loaders still work (or migrating them too, if the planner prefers atomic replacement).

**Primary recommendation:** Ship in this order — (1) migration + helper + types, (2) wire the 4 emit sites that ARE inside `step.run` (Stage 0, Stage 2, Stage 3, Stage 4), (3) wire Stage 1 from inside the Inngest API route as a non-step.run call (it's a single-pass synchronous request handler — replay risk is zero by construction), (4) ship the Bulk Review read-side rewire atomically per D-16. Tests guard the dual-write payload shape and replay idempotency at the Inngest sites.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `pipeline_events` is a regular `public` table — not partitioned, not a foreign data wrapper.
- **D-02:** PK = `id uuid DEFAULT gen_random_uuid()`. Use `crypto.randomUUID()` inside `step.run("emit-pipeline-event", ...)` for Inngest replay determinism.
- **D-03:** Final schema (verbatim from CONTEXT) — `id, created_at, swarm_type, stage smallint, email_id, case_id, decision text, confidence numeric(4,3), override jsonb, eval_type text, decision_details jsonb, cost_cents numeric(10,4), duration_ms int, agent_run_id, automation_run_id, triggered_by text`.
- **D-04:** Initial indexes — `(email_id)`, `(swarm_type, stage, created_at DESC)`, partial `(created_at DESC) WHERE override IS NOT NULL`. No B-tree on `decision`.
- **D-05:** No FK constraints on `email_id`, `agent_run_id`, `automation_run_id`. Soft-refs only.
- **D-06:** Inline dual-write inside the same `step.run()` as the legacy table write.
- **D-07:** Central helper `emitPipelineEvent(admin, payload)` at `web/lib/pipeline-events/emit.ts`.
- **D-08:** Five stage emit sites (Stage 0..4) in the canonical debtor-email flow.
- **D-09:** Every emit MUST live inside an existing `step.run` (no new top-level steps).
- **D-10:** `eval_type` and `override` stay NULL in Phase 70 (forward-compat for Phase 71).
- **D-11:** `override` is `jsonb`; future shape `{ axis, original_decision, operator_id, reason }`.
- **D-12:** `eval_type` is `text` with no CHECK; vocabulary `'capability' | 'regression'` documented in code comments only.
- **D-13:** `stage smallint` 0..4. Code-side `Stage` enum in `web/lib/pipeline-events/types.ts`.
- **D-14:** Bulk Review API rewires its main feed query to `pipeline_events` in the same phase as the dual-write rollout.
- **D-15:** Phase 72 promotion recommender NOT built in Phase 70 — only a one-paragraph stub at `docs/agentic-pipeline/promotion-recommender.md`.
- **D-16:** No backwards-compat shim. Atomic replacement; revert is the rollback plan.
- **D-17:** Apply migration via Supabase MCP, file `supabase/migrations/20260506a_pipeline_events.sql`.
- **D-18:** Migration uses `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`.

### Claude's Discretion

- Wire-up order between the 5 stage emit sites — planner picks easiest-to-verify order.
- Test fixture location — `web/lib/pipeline-events/__tests__/` vs co-located with each handler. Planner picks per existing conventions.
- Whether `cost_cents` is populated in v1 or left NULL until Phase 72 needs it.

### Deferred Ideas (OUT OF SCOPE)

- Partition by month (defer until row-count or latency demands it).
- Materialized views over `pipeline_events`.
- CHECK constraints on `swarm_type`, `stage`, `eval_type` (defer to Phase 71/73).
- CDC stream / logical-replication outbox to a warehouse.
- Backfill of historical `agent_runs` / `email_labels` into `pipeline_events`.
- Drop / replace legacy tables with views.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TELE-01 | Single canonical `pipeline_events` table records every stage decision (`swarm_type`, `stage`, `decision`, `confidence`, `override?`, `eval_type`) | Migration `20260506a_pipeline_events.sql` per D-03; helper at `web/lib/pipeline-events/emit.ts` per D-07; emit calls at the 5 sites enumerated below. |
| TELE-02 | Existing tables (`classifier_rules`, `agent_runs`, `email_labels`, `automation_runs`) preserved as denormalised read-models — no consumer breakage | Dual-write is **additive**: every emit is a new INSERT next to the existing legacy INSERT/UPDATE. No legacy-table code touched on the write side. |
| TELE-03 | Bulk Review + (placeholder) promotion recommender consume from `pipeline_events` instead of fragile multi-table joins | Bulk Review read-side rewire described under "Bulk Review feed query — current shape" below. Phase 72 stub-only per D-15. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema definition for `pipeline_events` | Database (Supabase Postgres) | — | Single canonical source of truth. |
| Replay-safe dual-write | Inngest function (`step.run`) | Database | Atomicity boundary is the existing `step.run`; dual INSERT inside it inherits its replay semantics. |
| Stage 1 dual-write (API route, no Inngest) | Next.js API route | Database | Stage 1 emits live in `web/app/api/automations/debtor-email/ingest/route.ts` — a synchronous request handler. No replay surface, so plain awaited INSERT is sufficient. |
| Helper / typed payload | Application layer (`web/lib/pipeline-events/`) | — | TypeScript codegen-style discipline; co-located with `web/lib/automations/runs/emit.ts`. |
| Bulk Review read query | Next.js server component (`page.tsx::loadPageData`) | Database | Read-side rewire per D-14. |

## Standard Stack

This phase introduces NO new libraries. The stack is locked by `CLAUDE.md`:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` (already in repo) | as-installed | Service-role admin INSERTs | All pipeline writes already go through `createAdminClient()` per CLAUDE.md §Supabase |
| `inngest` (already in repo) | as-installed | Replay boundary for dual-write | `step.run` is the atomic unit per CLAUDE.md §Inngest |
| `vitest` 4.1.0 | 4.1.0 | Test framework (verified `web/package.json` and `web/vitest.config.ts`) | Existing convention across all `web/lib/inngest/functions/__tests__/*` files |

### Supporting
None. Phase is internal — no new dependency.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline dual-write inside `step.run` | Postgres trigger on legacy tables | Rejected by D-06 (opaque, hard to debug across replays). |
| Inline dual-write | CDC / logical replication outbox | Rejected by D-06 (premature complexity). |
| Sync API-route INSERT (Stage 1) | Move Stage 1 logic into a new Inngest function purely so the emit can live in `step.run` | Out of scope — would re-architect the ingest path. The route is single-pass and synchronous; replay risk is zero by construction. |

`[VERIFIED: web/package.json grep — vitest 4.1.0]`
`[VERIFIED: web/vitest.config.ts]`

## Architecture Patterns

### System Architecture Diagram

```
                  Zapier (Outlook ingest)
                          │
                          ▼
        POST /api/automations/debtor-email/ingest    ← Stage 1 emit site (NOT in step.run)
                  │                          │
                  │ regex hit?               │ unknown + LLM-bound?
                  ▼                          ▼
       INSERT automation_runs       INSERT automation_runs (status='pending')
       (status='predicted')                  │
       INSERT pipeline_events                │ inngest.send → stage-0/email.received
       (stage=1, decision=topic)             ▼
                                  ┌──────────────────────────────────┐
                                  │ stage-0/safety-worker            │
                                  │  step.run "persist-verdict"      │ ← Stage 0 emit site
                                  │   • INSERT automation_runs       │
                                  │   • INSERT pipeline_events       │
                                  │     (stage=0, decision=verdict)  │
                                  └─────────────────┬────────────────┘
                                                    │ (if safe)
                                                    ▼ inngest.send → classifier/screen.requested
                                  ┌──────────────────────────────────┐
                                  │ classifier-label-resolver        │
                                  │  step.run "write-email-label"    │ ← Stage 2 emit site
                                  │   • INSERT email_labels          │
                                  │   • INSERT pipeline_events       │
                                  │     (stage=2, decision='resolved'│
                                  │      |'unresolved')              │
                                  └─────────────────┬────────────────┘
                                                    │ inngest.send → debtor-email/coordinator.requested
                                                    ▼
                                  ┌──────────────────────────────────┐
                                  │ debtor-email-coordinator         │
                                  │  step.run "persist-ranked"       │ ← Stage 3 emit site
                                  │   • UPDATE coordinator_runs      │
                                  │   • INSERT pipeline_events       │
                                  │     (stage=3, decision=top_intent)│
                                  └─────────────────┬────────────────┘
                                                    │ inngest.send → swarm_intents.handler_event
                                                    ▼
                                  ┌──────────────────────────────────┐
                                  │ classifier-invoice-copy-handler  │ ← Stage 4 emit site
                                  │  step.run "write-email-label"    │
                                  │   • INSERT email_labels          │
                                  │   • INSERT pipeline_events       │
                                  │     (stage=4, decision='completed│
                                  │      |'failed')                  │
                                  └──────────────────────────────────┘

         ┌──────────────────────────────────────────────────────┐
         │  Read side (TELE-03):                                │
         │   web/app/(dashboard)/automations/[swarm]/review/    │
         │     page.tsx::loadPageData                           │
         │     ─ today: SELECT automation_runs WHERE status     │
         │              ='predicted' + side-loaders             │
         │     ─ Phase 70: SELECT pipeline_events ...           │
         └──────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
web/lib/pipeline-events/
├── emit.ts              # emitPipelineEvent(admin, payload) helper (D-07)
├── types.ts             # Stage enum + PipelineEventInput type (D-13)
└── __tests__/
    └── emit.test.ts     # helper-level test (payload shape, INSERT call)

supabase/migrations/
└── 20260506a_pipeline_events.sql   # D-17 / D-18

docs/agentic-pipeline/
└── promotion-recommender.md         # D-15 stub
```

### Pattern 1: Replay-safe dual-write inside existing `step.run`
**What:** Add a second `INSERT` to the existing `step.run` block that writes the legacy table.
**When to use:** All 4 Inngest emit sites (Stage 0, Stage 2, Stage 3, Stage 4).
**Example:** `[VERIFIED: web/lib/inngest/functions/classifier-label-resolver.ts:149-181]`
```typescript
// BEFORE (Stage 2 — Phase 67)
const labelInsertResult = await step.run("write-email-label", async () => {
  const { data, error } = await admin
    .schema("debtor")
    .from("email_labels")
    .insert({ email_id: emailRow.id, ... })
    .select("id")
    .single();
  if (error) throw new Error(`email_labels insert failed: ${error.message}`);
  return data as { id: string };
});

// AFTER (Phase 70 — D-06)
const labelInsertResult = await step.run("write-email-label", async () => {
  const { data, error } = await admin
    .schema("debtor")
    .from("email_labels")
    .insert({ email_id: emailRow.id, ... })
    .select("id")
    .single();
  if (error) throw new Error(`email_labels insert failed: ${error.message}`);
  await emitPipelineEvent(admin, {
    swarm_type: "debtor-email",
    stage: 2,
    email_id: emailRow.id,
    decision: result.customer_account_id ? "resolved" : "unresolved",
    confidence: numericConfidence(result.confidence), // 'high'/'medium'/'low' → numeric(4,3)
    decision_details: {
      customer_account_id: result.customer_account_id,
      customer_name: result.customer_name,
      method: result.method,
      candidates_considered: result.candidates_considered,
    },
    triggered_by: "pipeline",
  });
  return data as { id: string };
});
```
Both INSERTs share one `step.run` boundary → on Inngest replay, neither is repeated.

### Pattern 2: Stage 1 emit from a Next.js API route (no `step.run`)
**What:** Plain awaited INSERT next to the existing `automation_runs` INSERT in the route handler.
**When to use:** ONLY the Stage 1 site at `web/app/api/automations/debtor-email/ingest/route.ts`.
**Why this is safe despite D-09:** The route is a single-pass HTTP handler — Zapier sends one POST, the route runs once, and Vercel terminates. There is no replay surface, so the "replay-safety" rationale of D-09 doesn't apply. The route already does multiple sequential INSERTs to `automation_runs` (predicted / failed / completed branches at lines 244, 323, 400, 430, 459, 487 — `[VERIFIED: ingest/route.ts grep]`). Adding a sibling INSERT to `pipeline_events` is the same pattern.
**Note for planner:** Recommend adding a comment block at the Stage 1 emit site documenting *why* the rule "every emit lives inside step.run" is relaxed here. Without that comment a future reader might "fix" it by adding redundant idempotency.

### Pattern 3: Helper signature (D-07)
```typescript
// web/lib/pipeline-events/types.ts
export const Stage = {
  Stage0_Safety: 0,
  Stage1_Regex: 1,
  Stage2_Entity: 2,
  Stage3_Coordinator: 3,
  Stage4_Handler: 4,
} as const;
export type StageValue = typeof Stage[keyof typeof Stage];

export interface PipelineEventInput {
  swarm_type: string;          // 'debtor-email' | 'sales-email' | 'cross-cutting'
  stage: StageValue;
  email_id?: string | null;
  case_id?: string | null;     // forward-compat for case-layer
  decision: string;            // canonical stage outcome
  confidence?: number | null;  // [0.000, 1.000]; numeric(4,3)
  override?: Record<string, unknown> | null; // Phase 71 only
  eval_type?: "capability" | "regression" | null; // Phase 71 only
  decision_details?: Record<string, unknown> | null;
  cost_cents?: number | null;
  duration_ms?: number | null;
  agent_run_id?: string | null;
  automation_run_id?: string | null;
  triggered_by?: "pipeline" | "operator-override" | "replay" | "backfill" | null;
}

// web/lib/pipeline-events/emit.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineEventInput } from "./types";

export async function emitPipelineEvent(
  admin: SupabaseClient,
  payload: PipelineEventInput,
): Promise<void> {
  const { error } = await admin.from("pipeline_events").insert(payload);
  if (error) {
    // Throw so the surrounding step.run fails and Inngest replays the whole
    // step (including the legacy-table write). NEVER swallow — the planner's
    // explicit goal is one-row-per-decision; silent loss defeats TELE-01.
    throw new Error(`pipeline_events insert failed: ${error.message}`);
  }
}
```

### Anti-Patterns to Avoid
- **Wrapping the emit in its own `step.run`.** Violates D-09; doubles the Inngest step count; risks orphan rows on retry between the legacy-write step and the emit step. The whole point is one atomic boundary.
- **Try/catch around the emit that swallows errors.** Defeats TELE-01 ("every stage decision recorded"). If `pipeline_events` INSERT fails, fail loud — Inngest will replay the whole `step.run`.
- **Hand-built UUIDs outside `step.run` for any future `pipeline_events.id` we want to expose to other steps.** D-02 already says use `crypto.randomUUID()` inside `step.run`. CLAUDE.md learning `dae6276` / `dd2583a` is the canonical reference.
- **Adding a FK from `pipeline_events.email_id` to `email_pipeline.emails.id`.** D-05 explicitly forbids this; cross-schema FK ties Phase 70 to a future schema-split decision.
- **Touching legacy-table consumer code.** TELE-02 requires zero consumer breakage. The dual-write is purely additive on the write side.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Replay-safe id generation | A custom replay-detection layer | `step.run("...", async () => crypto.randomUUID())` per CLAUDE.md / Phase 65 learning `dae6276` | Inngest's `step.run` is the canonical boundary; reinventing it is exactly the bug Phase 65 fixed. |
| Atomic dual-write across two tables | A pg trigger / a separate `step.run` chained with `step.waitForEvent` | Inline second INSERT inside the existing `step.run` (D-06) | Triggers are opaque under Inngest replay; chained steps multiply replay surface. |
| Type-safe enum for `stage` | Hand-maintained literal-union string in 5 files | Single `Stage` const + `StageValue` type in `web/lib/pipeline-events/types.ts` (D-13) | Mirrors Phase 69 D-03 codegen-style discipline (one source of truth). |
| Postgres UUID generation | App-side UUID + INSERT | `gen_random_uuid()` DEFAULT on the `id` column (D-02) | Already the pattern on `automation_runs`, `agent_runs`, etc. Supabase enables `pgcrypto` by default. |

**Key insight:** This phase has near-zero room for hand-rolling. The patterns are all locked by prior phases (Phase 65 replay-safe ids, Phase 67 RLS, Phase 68 registry codegen, Phase 69 brand codegen). Phase 70 is *applying* discipline, not establishing it.

## Common Pitfalls

### Pitfall 1: `confidence` type mismatch between legacy tables and `pipeline_events`
**What goes wrong:** The planner or implementer maps `'high' | 'medium' | 'low' | 'none'` text confidence (used by `email_labels` and `agent_runs`) directly into `pipeline_events.confidence numeric(4,3)`.
**Why it happens:** The legacy tables use a `text CHECK (...)` constraint for confidence `[VERIFIED: supabase/migrations/20260423_debtor_email_labeling.sql:26 — text not null check (confidence in ('high', 'medium', 'low', 'none'))]` and `[VERIFIED: supabase/migrations/20260428_public_agent_runs.sql:39 — confidence text check (confidence in ('low', 'medium', 'high'))]`, while D-03 specifies `numeric(4,3)`.
**How to avoid:** Add a small mapping helper `numericConfidence(text: 'high'|'medium'|'low'|'none'): number | null` inside `web/lib/pipeline-events/emit.ts` (or `types.ts`). Suggested mapping (planner can refine): `high=0.9, medium=0.7, low=0.4, none=null`. Stage 0 LLM verdict already exposes a numeric `cost_cents` and structured `verdict` — translate to numeric confidence per stage's available data. Stage 1 regex already exposes a numeric `r.confidence` from `web/lib/debtor-email/classify` `[VERIFIED: ingest/route.ts:283]` — pass through directly.
**Warning signs:** TS compile errors at the emit sites; Postgres `numeric` overflow at runtime; bulk-review feed showing NaN.

### Pitfall 2: Stage 1 emit site is in an API route, not in `step.run`
**What goes wrong:** Planner reads D-09 literally and tries to wrap the Stage 1 emit in `step.run` — but the call site is `web/app/api/automations/debtor-email/ingest/route.ts`, which has no Inngest step context. Or: planner moves the Stage 1 INSERT into the `stage-0/safety-worker` and Stage 1 emit becomes inconsistent with where the legacy `automation_runs` write actually happens.
**Why it happens:** The current architecture has Stage 1 (regex classify + automation_runs INSERT) inside the synchronous Vercel request handler — it is not an Inngest function `[VERIFIED: ingest/route.ts:283 classify(); :323 admin.from("automation_runs").insert(...)]`.
**How to avoid:** Co-locate the `pipeline_events` INSERT next to **every** `automation_runs.insert` in the ingest route — there are 6 INSERT sites in this route alone (lines 244, 301, 323, 400, 430, 459, 487 — verifying the Stage 1 *audit trail* is one row per decision means each branch needs its own emit). Treat the route's request handler as the atomic unit — no `step.run` needed because Vercel never replays a 200/500 response.
**Warning signs:** Bulk Review shows N rows in `automation_runs` for a single email but only N-2 rows in `pipeline_events` because the failure branches (categorize-failed, archive-failed) were missed.

### Pitfall 3: `email_id` type mismatch — coordinator_runs uses text, schemas use uuid
**What goes wrong:** D-03 says `email_id uuid NULL`, but `[VERIFIED: supabase/migrations/20260501a_coordinator_runs.sql:11 — email_id text not null]` shows `coordinator_runs.email_id` is `text`. The Stage 3 emit reads from `coordinator_runs.email_id` (or carries it through the event payload) and may pass a non-UUID string to `pipeline_events.email_id`.
**Why it happens:** Different prior phases used different types. `email_pipeline.emails.id` is `uuid` (the canonical surface), but some downstream tables use `text` for compatibility with Outlook IDs that pre-date the `email_pipeline.emails` row.
**How to avoid:** At each emit site, use the canonical `email_pipeline.emails.id` (uuid) — that is what `coordinator-complete.ts` (Stage 2/3) already uses (`emailRow.id` is uuid `[VERIFIED: classifier-invoice-copy-handler.ts:308 — customer_id: emailRow.id]`). Stage 0's `event.data.email_id` is documented as the email_pipeline UUID. If a site only has the Outlook string id, set `email_id: null` and put the string into `decision_details.outlook_message_id`.
**Warning signs:** Postgres `invalid input syntax for type uuid` errors in the Inngest run logs.

### Pitfall 4: `automation_runs` row written *before* the `automation_run_id` is known
**What goes wrong:** The Stage 0 ingest path inserts an `automation_runs` row with `status='pending'` and reads `.select("id")` to get the id, then fires `inngest.send` `[VERIFIED: ingest/route.ts:300-321]`. If the Stage 1 emit happens at the moment of the `automation_runs` INSERT, the just-created row's id is what should land in `pipeline_events.automation_run_id`. Easy to fumble in the `predicted`/`failed`/`completed` branches that don't `.select("id")`.
**How to avoid:** For each branch in the route, decide upfront whether we're capturing the new id (`stage_0_safety_pending` branch already does) or whether the `automation_run_id` for the emit is already known (e.g., the `categorize+archive` audit row at line 459 — that row IS the Stage 1 record, so `automation_run_id` for *its* `pipeline_events` emit is its own newly-generated id; pass through `gen_random_uuid` server-side and use the returning id, OR leave `automation_run_id` NULL and look up by `email_id` later).
**Warning signs:** `pipeline_events.automation_run_id IS NULL` for Stage 1 rows that should have it.

### Pitfall 5: Bulk Review's read query is bigger than "join 3 tables"
**What goes wrong:** Planner assumes TELE-03 is "rewrite one SELECT" — actual `loadPageData` `[VERIFIED: web/app/(dashboard)/automations/[swarm]/review/page.tsx:126-307]` does:
1. RPC `classifier_queue_counts(p_swarm_type)` — counts grouped by topic/entity/mailbox.
2. `automation_runs WHERE status='predicted' AND swarm_type=...` (cursor pagination, 100 rows).
3. (Safety tab) RPC `automation_runs_with_outlier(p_swarm_type)` for cost-outlier flag.
4. `classifier_rules WHERE status='promoted' AND promoted_at >= today-midnight` (race-cohort).
5. `classifier_rules WHERE status='candidate'` (pending-promotions tree badge).
6. `automation_runs WHERE id = ?` (selected-row detail).
7. Side-loader `loadCoordinatorRunsForReview(rowIds)` (debtor-email only).
8. Side-loader `loadTaggingFailuresForReview(pairs)` (debtor-email only).

`pipeline_events` only realistically replaces (2), (3), and (6) — the per-row Stage 1/2/3/4 decision feed. The classifier_rules surface (4, 5) is unrelated promotion-recommender data; the side-loaders (7, 8) are still legacy-table joins.
**Why it happens:** D-14 says "main feed query" — easy to over-promise.
**How to avoid:** Scope TELE-03 explicitly in the plan to (2), (3), (6). Leave 1/4/5/7/8 alone for now. The plan-checker should flag attempts to migrate the side-loaders as scope creep.
**Warning signs:** Plans growing to 6+ tasks for the read side; planner trying to introduce a `pipeline_events`-backed view to replace `coordinator_runs`.

### Pitfall 6: Forgetting RLS / Realtime publication on the new table
**What goes wrong:** Migration creates the table without `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + a service-role policy, so the service-role client gets denied. Or: `supabase_realtime` publication is not added and any future Bulk Review live-update feature silently no-ops.
**Why it happens:** Easy to copy a minimal `CREATE TABLE` and forget the boilerplate.
**How to avoid:** Mirror `[VERIFIED: supabase/migrations/20260501a_coordinator_runs.sql:34-55]` boilerplate — RLS enable + `coordinator_runs_service_all` + `coordinator_runs_auth_select` + `supabase_realtime add table` block. For Phase 70 `auth_select` is optional (no client-side reads planned), but service-role policy is required.
**Warning signs:** `permission denied for table pipeline_events` from the admin client.

## Runtime State Inventory

Phase 70 introduces a new table — it is **not** a rename/refactor/migration phase. No legacy state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `pipeline_events` starts empty (CONTEXT explicit: no backfill in scope). | None. |
| Live service config | None. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None. The new table uses the same `SUPABASE_SERVICE_ROLE_KEY` as every other admin write. | None. |
| Build artifacts | None — no codegen for this phase. The `Stage` enum is a static module, not generated. | None. |

## Code Examples

### Example: Stage 0 emit (inside `stage-0-safety-worker.ts`, `step.run("persist-verdict", ...)`)
`[VERIFIED: web/lib/inngest/functions/stage-0-safety-worker.ts:125-152]`
```typescript
await step.run("persist-verdict", async () => {
  const { error } = await admin.from("automation_runs").insert({
    automation: "debtor-email-review",
    status: isInjection ? "predicted" : "completed",
    swarm_type: "debtor-email",
    topic: isInjection ? "safety_review" : null,
    entity,
    mailbox_id,
    result: { stage: "stage_0_safety", email_id, ..., verdict: llmResult.verdict, ... },
    triggered_by: "stage-0/safety-worker",
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`automation_runs insert failed: ${error.message}`);

  // Phase 70 — TELE-01 dual-write
  await emitPipelineEvent(admin, {
    swarm_type: "debtor-email",
    stage: 0,
    email_id,
    decision: llmResult.verdict, // 'safe' | 'injection_suspected'
    confidence: null, // Stage 0 LLM verdict is categorical, not a numeric score
    decision_details: {
      regex_matched: regexResult.matched,
      llm_reason: llmResult.reason,
      matched_span: llmResult.matched_span,
      safety_overridden: false,
    },
    cost_cents: llmResult.usage.cost_cents,
    duration_ms: null, // not tracked at this site today
    triggered_by: "pipeline",
  });
});
```

### Example: Stage 3 emit (inside `debtor-email-coordinator.ts`, `step.run("persist-ranked", ...)`)
`[VERIFIED: web/lib/inngest/functions/debtor-email-coordinator.ts:186-192]`
```typescript
await step.run("persist-ranked", async () => {
  const { error } = await supabase
    .from("coordinator_runs")
    .update({ ranked_intents: output.ranked })
    .eq("run_id", run_id);
  if (error) throw new Error(`persist-ranked: ${error.message}`);

  // Phase 70 — TELE-01 dual-write
  const top = output.ranked[0];
  await emitPipelineEvent(supabase, {
    swarm_type: SWARM_TYPE,         // 'debtor-email'
    stage: 3,
    email_id,                        // canonical uuid from event payload
    decision: top.intent,            // top-1 intent
    confidence: numericConfidence(top.confidence), // 'high'|'medium'|'low' → number
    decision_details: {
      ranked: output.ranked,
      language: output.language,
      urgency: output.urgency,
    },
    agent_run_id,
    automation_run_id: automation_run_id ?? null,
    triggered_by: "pipeline",
  });
});
```

### Example: Stage 4 emit (inside `classifier-invoice-copy-handler.ts`, `step.run("write-email-label", ...)`)
`[VERIFIED: web/lib/inngest/functions/classifier-invoice-copy-handler.ts:421-438]`
```typescript
await step.run("write-email-label", async () => {
  const { error } = await admin
    .schema("debtor")
    .from("email_labels")
    .insert({ email_id: emailRow.id, ..., status: dryRun ? "dry_run" : "labeled" });
  if (error) throw new Error(`email_labels insert failed: ${error.message}`);

  // Phase 70 — TELE-01 dual-write
  await emitPipelineEvent(admin, {
    swarm_type: swarm_type ?? "debtor-email",
    stage: 4,
    email_id: emailRow.id,
    decision: "completed",
    confidence: 0.9, // 'high' on the labeling-side
    decision_details: {
      handler_key: "debtor-copy-document-body-agent",
      invoice_ref: invoiceRef,
      body_version: body.body_version,
      detected_tone: body.detected_tone,
      draft_url: draft.draftUrl,
      dry_run: dryRun,
    },
    automation_run_id,
    triggered_by: "pipeline",
  });
});
```
The handler also has a "no_invoice_reference" early-return path (line 222) and a `failRun-on-unhandled` block (line 142) that count as additional Stage 4 failure-emit sites — planner should enumerate these in the plan.

### Example: New migration `supabase/migrations/20260506a_pipeline_events.sql`
Modeled after `[VERIFIED: 20260501a_coordinator_runs.sql]`:
```sql
-- Phase 70 — TELE-01..03. Single canonical telemetry table for every
-- stage decision (Stage 0..4) across every swarm. Existing per-table writes
-- (classifier_rules, agent_runs, email_labels, automation_runs) keep
-- happening unchanged — they become denormalised read-models. Bulk Review
-- and the Phase 72 promotion recommender consume from this table.

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  swarm_type         text NOT NULL,
  stage              smallint NOT NULL,
  email_id           uuid NULL,
  case_id            uuid NULL,
  decision           text NOT NULL,
  confidence         numeric(4,3) NULL,
  override           jsonb NULL,
  eval_type          text NULL,
  decision_details   jsonb NULL,
  cost_cents         numeric(10,4) NULL,
  duration_ms        integer NULL,
  agent_run_id       uuid NULL,
  automation_run_id  uuid NULL,
  triggered_by       text NULL
);

CREATE INDEX IF NOT EXISTS pipeline_events_email_id_idx
  ON public.pipeline_events (email_id);
CREATE INDEX IF NOT EXISTS pipeline_events_swarm_stage_created_idx
  ON public.pipeline_events (swarm_type, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_events_override_partial_idx
  ON public.pipeline_events (created_at DESC) WHERE override IS NOT NULL;

ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_events_service_all ON public.pipeline_events;
CREATE POLICY pipeline_events_service_all ON public.pipeline_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pipeline_events_auth_select ON public.pipeline_events;
CREATE POLICY pipeline_events_auth_select ON public.pipeline_events
  FOR SELECT TO authenticated USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'pipeline_events'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_events';
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.pipeline_events TO authenticated;
GRANT ALL    ON public.pipeline_events TO service_role;
```

## State of the Art

Phase 70 is internal — no external "state of the art" applies. The only relevant currency check is on the locked stack:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-table direct queries from Bulk Review (`automation_runs` + `coordinator_runs` + `email_labels` joined client-side) | Read from `pipeline_events` for the main row feed (D-14) | This phase | Replaces 3 fetches with 1 for the predicted-row list. Coordinator/tagging side-loaders unchanged in v1. |
| Telemetry implicitly stored across 4 tables | Single canonical telemetry table; legacy tables become read-models | This phase | TELE-01..03. |

Deprecated/outdated: nothing. All decisions in CONTEXT.md align with current Inngest (`step.run` discipline) and Supabase (`pgcrypto`/`gen_random_uuid()`) patterns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pgcrypto` is enabled by default in this Supabase project (so `gen_random_uuid()` works without explicit `CREATE EXTENSION`). | Migration / D-02 | LOW — no `CREATE EXTENSION pgcrypto` line was found in the migrations folder `[VERIFIED: grep CREATE EXTENSION supabase/migrations/*.sql — only pg_trgm and vector explicitly created]`, yet `coordinator_runs` uses `uuid primary key` and works in production, implying `gen_random_uuid` is available. Supabase enables `pgcrypto` by default in the `extensions` schema. **Recommend** the migration include `CREATE EXTENSION IF NOT EXISTS pgcrypto;` defensively (idempotent; matches D-18). |
| A2 | The mapping `'high'/'medium'/'low'/'none'` → `numeric(4,3)` is `0.9 / 0.7 / 0.4 / null`. | Pitfall 1 | LOW — values are illustrative; planner should confirm with operator or pick conservative defaults. The mapping is internal and reversible. |
| A3 | Stage 1 has 6 emit sites in the ingest route (one per `automation_runs.insert` branch). | Pitfall 2 | MEDIUM — counted via grep, but some branches may share semantic meaning ("predicted-but-skipped" + "auto-action audit" both represent the same Stage-1 decision per email). Planner should review with operator whether *every* `automation_runs.insert` is a Stage-1 decision or whether some are pure operational audit. |
| A4 | The `case_id` column will remain NULL for the entire life of Phase 70 (case-layer is `docs/agentic-pipeline/case-layer.md` and not yet shipped). | Schema D-03 | LOW — confirmed by CONTEXT D-03. |
| A5 | `numericConfidence()` lives in `web/lib/pipeline-events/types.ts` (or a sibling). | Code Examples | LOW — discretionary; planner can place it elsewhere. |

## Open Questions

1. **Should the Stage 1 ingest-route emits be one row per `automation_runs.insert`, or one row per email?**
   - What we know: the route currently has up to 6 INSERT branches per email (pending stage-0, predicted skip-not-whitelisted, predicted skip-disabled, failed-categorize, failed-archive, completed-categorize+archive, pending-icontroller-delete). Some are real "decisions"; some are operational error rows.
   - What's unclear: whether Bulk Review (read side) wants 1 row per email at Stage 1, or 1 row per attempt.
   - Recommendation: emit ONE Stage 1 row per email — at the moment of classification (the `r = classify(...)` line, ~line 283). Failure rows for categorize/archive are operational and belong in `automation_runs` only (Stage 1 decision was already made; the failure is a downstream side-effect of the categorize_archive action).

2. **Where exactly does Stage 2 emit when the resolver fails (`resolverError` branch)?**
   - What we know: `classifier-label-resolver.ts` writes a single `email_labels` row per invocation including the failure case (`status: 'failed'`).
   - What's unclear: whether the failure is an emit site (decision='unresolved' with failure_details) or whether it should be skipped.
   - Recommendation: emit it. The whole point of TELE-01 is "every stage decision" — including the decision "we couldn't resolve, here's why."

3. **Should `automation_run_id` and `agent_run_id` be populated for Stage 0?**
   - What we know: Stage 0 has `automation_run_id` from the ingest route's pre-created row, but no `agent_run_id` (Stage 0 doesn't use an Orq agent — it's regex + a deterministic LLM call via `llmInjectionVerdict`).
   - Recommendation: populate `automation_run_id`, leave `agent_run_id` NULL.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Postgres + service-role key | All emits | ✓ | — | — |
| `pgcrypto` extension (`gen_random_uuid()`) | Migration D-02 | likely ✓ (used implicitly by `coordinator_runs`, `agent_runs`) | — | Add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` defensively |
| `vitest` | Tests | ✓ | 4.1.0 | — |
| `crypto.randomUUID()` (Node 19+) | App-side id generation if needed | ✓ (used elsewhere in codebase) | — | — |
| Supabase MCP | Migration apply (D-17) | ✓ (operator-driven, established Phase 67/68/69 pattern) | — | `supabase db push` |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

`workflow.nyquist_validation` is not explicitly disabled in `.planning/config.json` `[VERIFIED]`, so this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` 4.1.0 (jsdom env) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run <path>` |
| Full suite command | `cd web && npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TELE-01 | `emitPipelineEvent` writes a row with the correct payload shape | unit | `cd web && npx vitest run lib/pipeline-events/__tests__/emit.test.ts` | ❌ Wave 0 |
| TELE-01 | Stage 0 dual-write happens inside one `step.run` (atomicity) | integration (handler-level) | `cd web && npx vitest run lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` (extend) | ✅ extend |
| TELE-01 | Stage 1 emit writes one row per email at `classify()` | integration (route-level) | `cd web && npx vitest run app/api/automations/debtor-email/ingest/__tests__/route.test.ts` | ❌ Wave 0 (no existing route test) |
| TELE-01 | Stage 2 emit on resolved + unresolved | integration | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` (extend) | ✅ extend |
| TELE-01 | Stage 3 emit captures top intent + ranked details | integration | `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` (extend) | ✅ extend |
| TELE-01 | Stage 4 emit on completed + failure branches | integration | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` (extend) | ✅ extend |
| TELE-02 | Legacy table writes still occur (no consumer breakage) | regression | each handler test asserts BOTH inserts present in the supabase mock | ✅ pattern exists `[VERIFIED: classifier-invoice-copy-handler.test.ts:40 supabaseInserts array]` |
| TELE-03 | Bulk Review `loadPageData` reads `pipeline_events` for predicted rows | integration | `cd web && npx vitest run app/(dashboard)/automations/[swarm]/review/__tests__/...` | ✅ extend (loader is testable per `loadPageData` JSDoc) |
| TELE-03 | Bulk Review row enrichment + side-loaders unchanged | regression | as above | ✅ extend |
| Replay-safety | Re-running a handler does not double-insert into `pipeline_events` | unit | mock-step pattern from `classifier-invoice-copy-handler.test.ts` (call `handler` twice with same event) | ✅ extend |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/pipeline-events lib/inngest/functions/__tests__`
- **Per wave merge:** `cd web && npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `web/lib/pipeline-events/emit.ts` + `web/lib/pipeline-events/types.ts` — module does not exist yet.
- [ ] `web/lib/pipeline-events/__tests__/emit.test.ts` — covers helper-level INSERT shape, throw-on-error, optional-field handling.
- [ ] `web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts` — new integration test for Stage 1 emit. The route has **no existing test file** `[VERIFIED: ls /web/app/api/automations/debtor-email/ingest/]`. This is the largest gap.
- [ ] Bulk Review `loadPageData` test — extend `web/app/(dashboard)/automations/[swarm]/review/__tests__/` (existing dir per page.tsx JSDoc reference).
- [ ] No framework-install gap (vitest already in `package.json`).

## Project Constraints (from CLAUDE.md)

The planner MUST honor these directives — they have the same authority as locked CONTEXT decisions:

- **Stack — non-negotiable:** Vercel + Supabase + Inngest. No new infra in this phase.
- **Service-role for automation writes:** `createAdminClient()` per CLAUDE.md §Supabase. RLS service-role policy required on `pipeline_events`.
- **Inngest replay-safety:** every non-deterministic id (UUID, `Date.now()`, random nonce) used as a DB key MUST be generated inside `step.run`. Reference learnings: `dae6276` (this-binding), `dd2583a` (replay-id). For Phase 70, the table's `id` uses `gen_random_uuid()` DEFAULT (server-side, replay-irrelevant) so no app-side UUID needed.
- **Inngest `inngest.send` no-destructure:** not directly applicable to this phase (no new sends), but if any emit needs to fire an event, follow `(inngest.send as unknown as SendFn)({...})` pattern.
- **Supabase JSONB `jsonb` columns:** `decision_details`, `override` are jsonb. CLAUDE.md notes JSONB double-encoding gotcha — read-side rewires must `while (typeof state === 'string') state = JSON.parse(state)` if the column ever round-trips through a stringification step. Direct `.from().insert({decision_details: { ... }})` does NOT double-encode (verified pattern across existing tables).
- **Migration filename:** `YYYYMMDDx_<slug>.sql` — `20260506a_pipeline_events.sql` per D-17.
- **Soft-refs over FKs:** D-05 aligns with this directive. No FK constraints on `email_id`, `agent_run_id`, `automation_run_id`.
- **Build-time codegen for registry-driven literal-union TS types:** Not applicable — Phase 70's `Stage` enum is closed/static, not registry-derived. Document this in code comment so future contributor doesn't try to codegen it.
- **`/orq-agent` skill / Orq.ai:** No new agents in this phase.
- **Cron / Inngest cron:** No new cron functions.

## Sources

### Primary (HIGH confidence — verified in this session against the live codebase)
- `web/lib/inngest/functions/stage-0-safety-worker.ts` (Stage 0 emit site at `step.run("persist-verdict", ...)`, lines 125-152)
- `web/lib/inngest/functions/classifier-verdict-worker.ts` (operator-decision dispatch — NOT a Stage 1 emit site; clarifies CONTEXT D-08 wording)
- `web/lib/inngest/functions/classifier-label-resolver.ts` (Stage 2 emit site at `step.run("write-email-label", ...)`, lines 149-181; coordinator hand-off at lines 223-240)
- `web/lib/inngest/functions/debtor-email-coordinator.ts` (Stage 3 emit candidate inside `step.run("persist-ranked", ...)`, lines 186-192; replay-safe id pattern lines 88-93)
- `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` (Stage 4 emit sites at `step.run("write-email-label", ...)` lines 421-438 + early-return line 222 + `failRun` line 142)
- `web/lib/automations/debtor-email/coordinator/coordinator-complete.ts` (NOT itself an emit site — it's a "synthesis emit happens app-side" comment; coordinator-runs writes happen in `debtor-email-coordinator.ts`)
- `web/app/api/automations/debtor-email/ingest/route.ts` (Stage 1 emit site — 6 `automation_runs.insert` branches at lines 244, 301, 323, 400, 430, 459, 487)
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (Bulk Review feed loader `loadPageData`, lines 126-307)
- `supabase/migrations/20260501a_coordinator_runs.sql` (boilerplate template for RLS + Realtime)
- `supabase/migrations/20260423_debtor_email_labeling.sql` (legacy `confidence text` shape)
- `supabase/migrations/20260428_public_agent_runs.sql` (legacy `confidence text` shape)
- `web/vitest.config.ts` + `web/package.json` (test framework versions)
- `.planning/phases/70-telemetry-consolidation-pipeline-events/70-CONTEXT.md` (locked decisions)
- `.planning/REQUIREMENTS.md` (TELE-01..03 verbatim)
- `.planning/ROADMAP.md` (Phase 70 success criteria + Phase 71/72 dependencies)
- `CLAUDE.md` (Inngest + Supabase pattern directives)

### Secondary
- `.planning/phases/66-pipeline-consolidation-retire-triage-path/66-CONTEXT.md` referenced via CONTEXT canonical_refs (single canonical flow precondition)
- `.planning/phases/68-...` and `.planning/phases/69-...` referenced for `swarm_type` semantics

### Tertiary (LOW confidence)
- None. All claims verified against source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in repo, verified via `package.json`/`vitest.config.ts`.
- Architecture: HIGH — emit sites located by direct code inspection; replay boundary discipline verified against existing `step.run` blocks.
- Pitfalls: HIGH — all six pitfalls grounded in concrete code evidence (line-anchored citations).
- Stage 1 divergence from D-09: HIGH — directly verified that the ingest route is a Next.js `route.ts`, not an Inngest function.
- Bulk Review read-side scope: HIGH — `loadPageData` source read end-to-end.

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days; phase touchpoints are stable Inngest functions hardened in Phases 65/66/67/68/69).
