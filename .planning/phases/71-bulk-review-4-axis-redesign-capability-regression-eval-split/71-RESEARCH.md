# Phase 71: Bulk Review 4-axis redesign + capability/regression eval split — Research

**Researched:** 2026-05-05
**Domain:** Operator-driven pipeline-event override + per-email aggregated read view + 4-axis learning-signal capture
**Confidence:** HIGH (CONTEXT.md is locked; UI-SPEC.md is approved; Phase 70 backbone is in production; all referenced code paths verified at file:line level)

## Summary

Phase 71 lights up the `override` jsonb + `eval_type` columns that Phase 70 pre-provisioned on `public.pipeline_events`. There is **no new schema** other than a single Postgres view (`public.pipeline_events_email_summary`) and **no new write path** other than (a) one Next.js POST route and (b) one Inngest fan-out function (`debtor-email-override-handler`) that emits one `pipeline_events` row per override, then triggers per-axis side effects (Stage 1 reroute via the existing verdict-worker; Stage 2 customer correction with optional Stage 3+4 re-run; Stage 3 handler-event re-dispatch; Stage 4 emit-only).

The Bulk Review UI gets four per-stage widgets, an `eval_type` radio, a recipient chip strip, and a vertical N-stage pipeline detail pane — all per the approved UI-SPEC. Reads come from the new view for the per-row feed and stay on raw `pipeline_events` for the per-email timeline drill-in.

**Primary recommendation:** Build in this order — (1) view migration; (2) `emitOverrideEvent` typing + helper; (3) override Inngest function + POST route; (4) per-axis emit injection in 4 existing Inngest functions; (5) UI widgets and detail pane wiring; (6) full Nyquist axis-coverage tests. Every override emit MUST happen inside `step.run()` for replay safety (Phase 65 lesson).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Override jsonb shape: `{axis, original_decision, original_event_id, operator_id, reason, submitted_at}`. `eval_type` lives in its own column, NOT in the jsonb (faster index, no jsonb path queries on hot path).
- **D-02** One override = one new `pipeline_events` row. Original first-pass row preserved unchanged. Override row carries `override` jsonb + `eval_type` + `triggered_by='operator-override'` + `decision = corrected value`. Replay-fired downstream rows use `triggered_by='operator-override-replay'`.
- **D-03** Closed 4-axis vocabulary: `stage_1_category | stage_2_customer | stage_3_intent | stage_4_handler_output`. TS literal-union enforces compile-time. NO CHECK constraint (matches Phase 70 stance).
- **D-04** Stage 1 override reuses existing `classifier-verdict-worker.ts` — wrap so override row emits FIRST, then existing reroute logic fires.
- **D-05** Stage 2 override updates `coordinator_runs.customer_account_id`; `re_run_downstream` boolean (default `false`). When true: re-emit `debtor-email/coordinator-complete` event so Stage 3+4 re-run.
- **D-06** Stage 3 override picks a handler from `swarm_intents` registry; emit override row, dispatch new `<handler>.requested` Inngest event, original Stage 4 row preserved as audit.
- **D-07** Stage 4 override = `draft_quality` (1-5 smallint) + `reason` text. NO re-run, NO iController draft mutation.
- **D-08** `eval_type` operator-tagged at override time. Default = `regression` (safety bias).
- **D-09** Per-email aggregate is a Postgres VIEW (`public.pipeline_events_email_summary`), NOT a table. Migration `20260507a_pipeline_events_email_summary.sql`. Index `(email_id, stage, created_at DESC)` ships with it.
- **D-10** Bulk Review predicted-row feed reads the view; selected-row detail keeps reading raw `pipeline_events` for the per-stage timeline.
- **D-11** Override path = UI POST → API route → Inngest event → handler. No direct DB writes from the route.
- **D-12** ONE Inngest fan-out function `debtor-email-override-handler` with switch on `data.axis`. Each axis stays inside its own `step.run("axis-{N}-override", ...)`.
- **D-13** `operator_id` captured server-side from `auth.uid()`. NEVER trusted from client payload.
- **D-14** `reason` ≤1000 chars, HTML-escape on render.
- **D-15** Override does NOT auto-modify the iController draft — info banner instructs operator to update draft separately.
- **D-16** UI-SPEC.md owns design contract (already approved 5 PASS / 1 FLAG).
- **D-17** UI lives in `web/app/(dashboard)/automations/[swarm]/review/`.

### Claude's Discretion

- Migration filename detail (e.g. `20260507a_pipeline_events_email_summary.sql` vs other date suffix).
- Override route path: `/api/automations/debtor-email/override` vs `/api/automations/debtor/override` — match neighbour patterns.
- Test fixture co-location (per-axis vs central `override-handler.test.ts`).
- Confirmation modal exact copy (UI-SPEC owns this and has it locked already).

### Deferred Ideas (OUT OF SCOPE)

- `promotion_candidates` table + Learning Inbox UI + auto-promotion → Phase 72.
- Auto-detect capability vs regression via heuristic → Phase 72.
- Sales-email swarm overrides → Phase 73 (will inherit registry-driven UI for free).
- Schema CHECK constraints on `eval_type` / override.axis vocabulary → defer until drift observed.
- Override-of-override / undo → v1 limitation, manual edit via Supabase MCP.
- Bulk override (apply same correction to N rows) → not requested.
- Materialised view → defer until raw view latency exceeds UX budget.
- Mobile/tablet Bulk Review.
- Override-driven model retraining loop.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVW-01 | Stage 1 override re-routes to noise/archive/different category, original verdict preserved | D-04 wrap of `classifier-verdict-worker.ts`; emit override row before existing reroute. Code path verified at `web/lib/inngest/functions/classifier-verdict-worker.ts:26-100` |
| REVW-02 | Stage 2 override corrects `customer_account_id`, optional re-run Stage 3+4 | D-05; coordinator-complete re-emit pattern. Existing `coordinator_runs.customer_account_id` field verified to exist via Phase 70 references |
| REVW-03 | Stage 3 override re-emits to different handler-agent | D-06; dispatch via `swarm_intents` registry (`web/lib/swarms/registry.ts:80-95`, `loadSwarmIntents`) |
| REVW-04 | Stage 4 override records `draft_quality` + `reason` for handler tuning | D-07 emit-only path |
| REVW-05 | Each override tagged `eval_type ∈ {capability, regression}` | D-08; column lit by Phase 71 (`pipeline_events.eval_type` exists per `20260506a_pipeline_events.sql:33`) |
| REVW-06 | One row per email aggregating all 4 stage decisions + cost + tool calls | D-09 view, D-10 read-side rewire |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Override form rendering, dirty-state tracking, keyboard shortcuts | Browser (Client Component) | — | Stateful form interactions, no server round-trip per keystroke |
| Predicted-row feed, detail-pane data load | Frontend Server (RSC) | API Backend | `loadPageData` runs in the React Server Component using service-role admin client (`page.tsx:126`) |
| Override POST validation + Inngest dispatch | API Backend (Next.js route handler) | — | Auth check + service-role write happens server-side only (D-13) |
| Override emit + per-axis side effects | Inngest function | — | Replay-safe step.run discipline; matches every other operator-driven flow |
| `pipeline_events_email_summary` aggregation | Database (Postgres view) | — | Pure SQL aggregation; no app-layer code needed |
| Authoritative event log | Database (Supabase Postgres) | — | Single source of truth (Phase 70 invariant) |

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | (per package.json) | App Router pages + route handlers | Project canon (CLAUDE.md `[VERIFIED: CLAUDE.md]`) |
| `@supabase/supabase-js` | existing | Postgres client (admin + browser) | Stack canon |
| `inngest` | existing | Event-driven durable functions | Stack canon — replay-safe pipeline (CLAUDE.md §Inngest) |
| Radix via shadcn (`Dialog`, `Select`, `RadioGroup`, `Switch`, `Sheet`, `Tooltip`, `Skeleton`, `Tabs`, `Textarea`, `Input`, `Badge`, `Button`, `Card`) | existing in `web/components/ui/` | UI primitives | Already initialised, used everywhere `[VERIFIED: web/components/ui/]` |
| `lucide-react` | existing | Icons | Already in dashboard `[VERIFIED: UI-SPEC.md]` |
| `vitest` | existing | Test runner (per `__tests__/` co-location pattern) | Existing pattern at `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` |

**No new npm dependencies in Phase 71.** All UI primitives ship from existing shadcn registry; all backend dependencies (Supabase, Inngest, pipeline-events helper) exist.

### Supporting (project-internal helpers)

| Helper | Location | Purpose |
|--------|----------|---------|
| `emitPipelineEvent` | `web/lib/pipeline-events/emit.ts:29` | Single canonical event INSERT — Phase 71 calls with override + eval_type populated |
| `PipelineEventInput` type | `web/lib/pipeline-events/types.ts:44` | Compile-time shape; already includes `override?` and `eval_type?` fields |
| `loadSwarmIntents` | `web/lib/swarms/registry.ts:80` | Registry-cached load of `swarm_intents` rows for Stage 3 dropdown |
| `loadSwarmCategories` | `web/lib/swarms/registry.ts` | Registry-cached load for Stage 1 category dropdown |
| `createAdminClient` | `web/lib/supabase/admin.ts` | service_role client (bypasses RLS) for server-side writes |
| `inngest.send` | `web/lib/inngest/client.ts` | Event dispatch — bind correctly to avoid `this` loss (CLAUDE.md Phase 65 lesson) |

## Architecture Patterns

### System Architecture Diagram

```
                                 ┌──────────────────────────────────────────────────────────┐
                                 │                    BULK REVIEW UI                         │
                                 │  /automations/[swarm]/review/page.tsx (RSC)               │
                                 │                                                            │
                                 │  ┌──────────────┐ ┌─────────────────────────────────┐    │
                                 │  │ RecipientChip│ │       PredictedRowList          │    │
                                 │  │    Strip     │ │  (1 row per email; 4 stage cells)│    │
                                 │  └──────────────┘ └─────────────────────────────────┘    │
                                 │  ┌────────────────────────────────────────────────────┐  │
                                 │  │           DetailPane (selected email)              │  │
                                 │  │  ┌─────────────────────────────────────────────┐   │  │
                                 │  │  │  PipelineFlow (N-stage vertical)            │   │  │
                                 │  │  │   S0 ──► S1 ──► S2 ──► S3 ──► S4            │   │  │
                                 │  │  │   ok    dirty   ok     ok     ok            │   │  │
                                 │  │  │           ↓                                  │   │  │
                                 │  │  │       Stage1Widget                           │   │  │
                                 │  │  └─────────────────────────────────────────────┘   │  │
                                 │  │  EvalTypeRadio  [⦿ regression  ○ capability]      │  │
                                 │  │  [Discard] [Submit override (1 stage dirty)]      │  │
                                 │  └────────────────────────────────────────────────────┘  │
                                 └─────────────────────┬────────────────────────────────────┘
                                                       │ (1) READ                  │ (2) WRITE
                                                       ▼                            ▼
                ┌──────────────────────────────────────────────┐    POST /api/automations/debtor-email/override
                │   loadPageData() — RSC server-side           │    {axis, email_id, payload, eval_type, reason}
                │   admin (service-role)                       │                    │
                │   ─ list:   pipeline_events_email_summary VW │                    ▼
                │   ─ detail: pipeline_events (raw timeline)   │    ┌────────────────────────────────────┐
                └──────────────────────────────────────────────┘    │  Route handler                       │
                                       │                             │  - read auth.uid() (D-13)            │
                                       │                             │  - validate payload (zod)            │
                                       │                             │  - inngest.send(                     │
                                       ▼                             │      'debtor-email/override.submitted'│
                ┌──────────────────────────────────────────────┐    │      {axis, email_id, ...,           │
                │  Postgres                                    │    │       operator_id})                  │
                │  ┌──────────────────────────┐                │    └────────────────┬─────────────────────┘
                │  │ pipeline_events (table)  │◄───── INSERT───┼───────────┐         │ inngest event
                │  │  - override jsonb        │                │           │         ▼
                │  │  - eval_type text        │                │     ┌─────┴───────────────────────────────┐
                │  │  - triggered_by          │                │     │ debtor-email-override-handler        │
                │  └──────────────────────────┘                │     │  switch (data.axis)                  │
                │                                              │     │   ┌───────────────────────────────┐  │
                │  ┌──────────────────────────┐                │     │   │ axis-1: emit + reuse         │  │
                │  │ pipeline_events_email_   │ (view)         │     │   │   classifier-verdict-worker  │  │
                │  │ summary                  │                │     │   ├───────────────────────────────┤  │
                │  └──────────────────────────┘                │     │   │ axis-2: emit + update         │  │
                │                                              │     │   │   coordinator_runs;           │  │
                │  ┌──────────────────────────┐                │     │   │   if re_run_downstream:       │  │
                │  │ swarm_intents (registry) │                │     │   │     send 'coordinator-complete'│  │
                │  └──────────────────────────┘                │     │   ├───────────────────────────────┤  │
                │                                              │     │   │ axis-3: emit +                │  │
                │  ┌──────────────────────────┐                │     │   │   send '<handler>.requested'  │  │
                │  │ swarm_categories (reg)   │                │     │   ├───────────────────────────────┤  │
                │  └──────────────────────────┘                │     │   │ axis-4: emit only             │  │
                │                                              │     │   └───────────────────────────────┘  │
                └──────────────────────────────────────────────┘     └──────────────────────────────────────┘
```

### Recommended Project Structure

```
supabase/migrations/
└── 20260507a_pipeline_events_email_summary.sql        # NEW (D-09)

web/
├── app/
│   ├── api/automations/debtor-email/
│   │   └── override/
│   │       └── route.ts                                # NEW (D-11)
│   └── (dashboard)/automations/[swarm]/review/
│       ├── page.tsx                                    # EXTEND — read view (D-10)
│       ├── row-list.tsx                                # EXTEND — recipient col + 4 stage cells
│       ├── detail-pane.tsx                             # EXTEND — N-stage flow
│       ├── recipient-chip-strip.tsx                    # NEW
│       ├── components/
│       │   ├── predicted-row.tsx                       # NEW
│       │   ├── pipeline-flow.tsx                       # NEW
│       │   ├── stage-step.tsx                          # NEW
│       │   ├── stage-1-widget.tsx                      # NEW (category Select)
│       │   ├── stage-2-widget.tsx                      # NEW (customer combobox + re-run Switch)
│       │   ├── stage-3-widget.tsx                      # NEW (handler Select from swarm_intents)
│       │   ├── stage-4-widget.tsx                      # NEW (1-5 scale + textarea)
│       │   ├── eval-type-radio.tsx                     # NEW
│       │   ├── override-confirm-dialog.tsx             # NEW
│       │   └── icontroller-info-banner.tsx             # NEW
│       ├── keyboard-shortcuts.tsx                      # EXTEND — 1/2/3/4/c/g/⌘⏎/Esc
│       └── __tests__/
│           ├── load-page-data.test.ts                  # EXTEND — view rewire test
│           └── override-handler.test.ts                # NEW (axis × {capability, regression})
├── lib/
│   ├── pipeline-events/
│   │   └── types.ts                                    # EXTEND — OverrideAxis literal-union + OverrideJson type
│   ├── inngest/functions/
│   │   ├── debtor-email-override-handler.ts            # NEW (D-12 fan-out)
│   │   ├── classifier-verdict-worker.ts                # EXTEND — Stage 1 emit injection
│   │   ├── classifier-label-resolver.ts                # EXTEND — Stage 2 customer correction handler
│   │   ├── debtor-email-coordinator.ts                 # EXTEND — Stage 3 re-emit
│   │   └── classifier-invoice-copy-handler.ts          # EXTEND — Stage 4 quality-rating hook
│   └── swarms/
│       └── brand-color.ts                              # NEW (recipient dot mapping per UI-SPEC)
```

### Pattern 1: Override emit inside step.run

**What:** Every override emit happens inside an Inngest `step.run("axis-{N}-emit", ...)`. The original first-pass row stays unchanged.

**When to use:** Every override path. Non-negotiable.

**Example:**

```typescript
// web/lib/inngest/functions/debtor-email-override-handler.ts (NEW)
// [CITED: web/lib/pipeline-events/emit.ts:29 — emitPipelineEvent contract]
// [CITED: CLAUDE.md §Inngest — replay-safe step.run discipline]

export const debtorEmailOverrideHandler = inngest.createFunction(
  { id: "debtor-email/override-handler", retries: 0 },
  { event: "debtor-email/override.submitted" },
  async ({ event, step }) => {
    const { axis, email_id, original_event_id, original_decision, decision,
            decision_details, eval_type, reason, operator_id } = event.data;
    const admin = createAdminClient();

    // STEP 1 — emit override row (one row, every axis, same shape)
    await step.run(`axis-${axis}-emit`, async () => {
      await emitPipelineEvent(admin, {
        swarm_type: "debtor-email",
        stage: stageFromAxis(axis),  // 1|2|3|4
        email_id,
        decision,
        confidence: null,
        override: {
          axis,
          original_decision,
          original_event_id,
          operator_id,
          reason: reason ?? null,
          submitted_at: new Date().toISOString(),
        },
        eval_type,                                // 'capability' | 'regression'
        decision_details,
        triggered_by: "operator-override",
      });
    });

    // STEP 2 — per-axis side effects
    switch (axis) {
      case "stage_1_category": {
        await step.run("axis-1-reroute", async () => {
          // reuse existing classifier-verdict-worker side-effect pattern
          // (categorizeEmail / archiveEmail / dispatch swarm_categories.swarm_dispatch)
        });
        break;
      }
      case "stage_2_customer": {
        await step.run("axis-2-update-coordinator", async () => {
          await admin.from("coordinator_runs")
            .update({ customer_account_id: decision_details.customer_account_id })
            .eq("email_id", email_id);
        });
        if (event.data.re_run_downstream === true) {
          // (inngest.send as unknown as SendFn)({...}) — CLAUDE.md Phase 65 this-binding lesson
          await step.run("axis-2-replay-stage-3-4", async () =>
            inngest.send.bind(inngest)({
              name: "debtor-email/coordinator-complete",
              data: { email_id, triggered_by: "operator-override-replay" },
            }));
        }
        break;
      }
      case "stage_3_intent": {
        await step.run("axis-3-dispatch-handler", async () => {
          // look up new handler_event from swarm_intents
          const intent = await loadSwarmIntents(admin, "debtor-email")
            .then(rows => rows.find(r => r.intent_key === decision_details.intent_key));
          if (!intent) throw new Error(`unknown intent ${decision_details.intent_key}`);
          await inngest.send.bind(inngest)({
            name: intent.handler_event,
            data: { email_id, triggered_by: "operator-override-replay" },
          });
        });
        break;
      }
      case "stage_4_handler_output": {
        // emit-only — no side effect (D-07)
        break;
      }
    }
    return { ok: true, axis };
  }
);
```

`[VERIFIED: web/lib/pipeline-events/emit.ts:29-37]` — `emitPipelineEvent` accepts `PipelineEventInput` exactly as shown above.
`[VERIFIED: web/lib/pipeline-events/types.ts:51-52]` — `override?: Record<string, unknown>` and `eval_type?: "capability" | "regression"` are already on the type.

### Pattern 2: Per-email aggregate view (D-09)

**What:** Aggregate `pipeline_events` to one row per `(email_id, swarm_type)` using `DISTINCT ON` per stage to pick the latest decision (override wins because it's the latest event).

**When to use:** Bulk Review predicted-row feed. Detail pane STILL reads raw `pipeline_events` for the per-stage timeline (D-10).

**Example:**

```sql
-- supabase/migrations/20260507a_pipeline_events_email_summary.sql
-- [CITED: 71-CONTEXT.md D-09]

-- Performance index — query reads (email_id, stage, created_at DESC)
CREATE INDEX IF NOT EXISTS pipeline_events_email_stage_created_idx
  ON public.pipeline_events (email_id, stage, created_at DESC);

CREATE OR REPLACE VIEW public.pipeline_events_email_summary AS
WITH per_stage AS (
  SELECT DISTINCT ON (email_id, swarm_type, stage)
    email_id, swarm_type, stage,
    decision, override IS NOT NULL AS overridden, eval_type,
    cost_cents, decision_details, created_at, id AS latest_event_id
  FROM public.pipeline_events
  WHERE email_id IS NOT NULL
  ORDER BY email_id, swarm_type, stage, created_at DESC
)
SELECT
  email_id, swarm_type,
  MAX(decision) FILTER (WHERE stage = 0) AS stage_0_decision,
  MAX(decision) FILTER (WHERE stage = 1) AS stage_1_decision,
  MAX(decision) FILTER (WHERE stage = 2) AS stage_2_decision,
  MAX(decision) FILTER (WHERE stage = 3) AS stage_3_decision,
  MAX(decision) FILTER (WHERE stage = 4) AS stage_4_decision,
  bool_or(overridden) FILTER (WHERE stage = 1) AS stage_1_overridden,
  bool_or(overridden) FILTER (WHERE stage = 2) AS stage_2_overridden,
  bool_or(overridden) FILTER (WHERE stage = 3) AS stage_3_overridden,
  bool_or(overridden) FILTER (WHERE stage = 4) AS stage_4_overridden,
  (SELECT SUM(cost_cents) FROM public.pipeline_events pe
    WHERE pe.email_id = per_stage.email_id) AS total_cost_cents,
  (SELECT COUNT(*) FROM public.pipeline_events pe
    WHERE pe.email_id = per_stage.email_id
      AND pe.stage = 4
      AND pe.decision_details ? 'tool_calls') AS tool_call_count,
  MIN(created_at) AS first_event_at,
  MAX(created_at) AS last_event_at
FROM per_stage
GROUP BY email_id, swarm_type;

GRANT SELECT ON public.pipeline_events_email_summary TO authenticated, service_role;
```

`[VERIFIED: supabase/migrations/20260506a_pipeline_events.sql:23-47]` — `pipeline_events` schema and existing indexes confirm view is feasible without new columns.

> **Assumption A1:** Postgres views in Supabase **inherit RLS from the underlying table** when `security_invoker=true` is set, OR run with the view-creator's privileges otherwise. Phase 70's `pipeline_events` already has `authenticated SELECT` policy, so a plain view works for read access. Recommend explicit `WITH (security_invoker=true)` clause to make the inheritance explicit. `[ASSUMED]`

### Pattern 3: API route → Inngest event (D-11)

**What:** Override route does NOT touch the DB directly. Validates → reads `auth.uid()` → fires Inngest event.

**Example shape** (matches `web/app/api/automations/debtor-email/ingest/route.ts:1-7` pattern):

```typescript
// web/app/api/automations/debtor-email/override/route.ts (NEW)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";  // user-scoped client for auth.uid()
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OverridePayload = z.object({
  axis: z.enum(["stage_1_category", "stage_2_customer", "stage_3_intent", "stage_4_handler_output"]),
  email_id: z.string().uuid(),
  original_event_id: z.string().uuid(),
  original_decision: z.string(),
  decision: z.string(),                            // corrected value
  decision_details: z.record(z.unknown()).optional(),
  eval_type: z.enum(["capability", "regression"]),
  reason: z.string().max(1000).optional(),
  re_run_downstream: z.boolean().optional(),       // axis-2 only
});

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = OverridePayload.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  // D-13: operator_id is server-stamped, never from payload
  await inngest.send.bind(inngest)({
    name: "debtor-email/override.submitted",
    data: { ...parsed.data, operator_id: user.id },
  });
  return NextResponse.json({ ok: true });
}
```

### Anti-Patterns to Avoid

- **Mutating the original `pipeline_events` row.** D-02 forbids it. Audit invariant breaks immediately.
- **Direct DB write from the API route.** D-11 forbids — must go through Inngest event so retries + replay work.
- **Generating UUIDs outside `step.run()`.** Phase 65 lesson (`commit dae6276` / `dd2583a`). On replay the value regenerates → INSERT on key-A then UPDATE on key-B → silent no-op. If any UUID is needed, generate inside `step.run`.
- **Destructuring `inngest.send`.** Loses `this` binding → runtime `TypeError`. Use `inngest.send.bind(inngest)` or call inline. Phase 65 lesson.
- **Hand-rolling the override row INSERT.** Always use `emitPipelineEvent` — single source of insert shape.
- **Storing `eval_type` inside the `override` jsonb.** D-01 forbids — separate column for hot-path index.
- **Reading the per-email aggregate from `automation_runs`.** Phase 70-06 already retired that. Use the view.
- **Trusting `operator_id` from the client payload.** D-13 — always read `auth.uid()` server-side.
- **Auto-modifying the iController draft on Stage 3/4 override.** D-15 — operator-managed surface.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pipeline event insert | A new INSERT helper or raw `.from('pipeline_events').insert()` | `emitPipelineEvent` (`web/lib/pipeline-events/emit.ts:29`) | Single canonical write shape; type-checks `PipelineEventInput` at compile time |
| Form schema validation | Bespoke if/else validation | `zod` (already in repo) | Same pattern as ingest route; aligns with Orq.ai schema discipline (CLAUDE.md) |
| Customer search debounce + dropdown | Custom autocomplete | shadcn `Combobox` pattern (Radix `Command` primitive — already initialised) | Accessibility + keyboard already correct |
| Stage 1 reroute side effects | Reimplement Outlook categorize/archive | Existing `classifier-verdict-worker.ts` switch on `swarm_categories.action` | Wave 0 of Phase 56.7 + 68 already shipped this; Phase 71 is additive (D-04) |
| Customer resolution | New customer-lookup table | Existing `resolve-debtor.ts` patterns + label-resolver pattern (`web/lib/automations/debtor-email/resolve-debtor.ts:46-200`) | Customer search source-of-truth lives in NXT/coordinator_runs already |
| RecipientChipStrip filtering | Client-only filter | URL-param-driven (`?inbox=...`) per UI-SPEC | Survives reload + supports operator deep-links |
| Aggregation table (one row per email) | A `pipeline_events_email` table with dual-write | Postgres VIEW per D-09 | Eliminates dual-write maintenance; view is index-friendly |
| Realtime updates | New websocket layer | Existing Supabase Realtime publication on `pipeline_events` (line 60-73 of `20260506a_pipeline_events.sql`) | Already shipped; new view rows arrive automatically |

**Key insight:** Phase 70 did the heavy lifting. Phase 71 is mostly **wiring** — emit calls in 4 existing places, one new Inngest function, one new POST route, one view migration, and per-UI-SPEC components. ~80% of every backend axis already exists.

## Runtime State Inventory

> Phase 71 is feature-add, not rename/refactor — but Phase 70 telemetry consolidation has runtime state Phase 71 reads from. Inventory below is for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `pipeline_events` already in production with `override` and `eval_type` columns NULL since Phase 70. | None — Phase 71 starts populating these columns going forward. Historical rows stay NULL (correct semantics: never overridden). |
| Live service config | Inngest event names: existing `classifier/verdict.recorded`, `debtor-email/coordinator-complete`, `<handler>.requested`. NEW: `debtor-email/override.submitted`. | New event registers when `debtor-email-override-handler` is exported from `web/lib/inngest/functions/index.ts` (or wherever the registry sits). No external Inngest dashboard config edit needed for app-level functions. |
| OS-registered state | None — pipeline runs entirely on Vercel + Inngest cloud. | None. |
| Secrets/env vars | No new secrets. Reuses `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_*`, Supabase auth session. | None. |
| Build artifacts | No codegen file changes (Phase 69's `entity.generated.ts` is unaffected). UI-SPEC introduces a new helper `web/lib/swarms/brand-color.ts` — plain TS, no codegen. | None. |

**Nothing found in category:** OS-registered state (entirely cloud-hosted), Secrets/env (zero new), Build artifacts (no codegen drift). Verified by inspecting `web/lib/swarms/` directory listing and migration history.

## Common Pitfalls

### Pitfall 1: UI-SPEC table-name discrepancies vs production schema

**What goes wrong:** UI-SPEC § "Per-stage override widgets" cites `public.classifier_categories` (Stage 1 source) and `email_pipeline.customer_index` (Stage 2 source). Codebase grep finds **NO** table named `classifier_categories` and **NO** `customer_index` table.

**Why it happens:** UI-SPEC was synthesised against a logical model; actual production schema names differ.

**Reality check (`[VERIFIED: codebase grep]`):**
- Stage 1 category source = `public.swarm_categories` (NOT `classifier_categories`). Migrations: `supabase/migrations/20260429b_swarm_registry.sql`, `20260430b_swarm_categories_invoice_copy_dispatch.sql`, etc. Loaded via `loadSwarmCategories()` (`web/lib/swarms/registry.ts`).
- Stage 2 customer source = whatever powers `resolve-debtor.ts` — that file SELECTs from `email_labels` (prior linkage) and uses `nxt-zap-client.ts` for live NXT lookups. There is **no** `customer_index` denormalised table; customer search must run against the **same source `resolve-debtor.ts` uses** (likely an NXT-backed view or a search RPC). Plan should explicitly flag a small spike: confirm whether a typeahead-friendly view exists or whether the planner needs to add one.

**How to avoid:** Plan task 1 of Wave 0 should be a 30-min spike: "Confirm Stage 2 customer-search source. If no index/view exists, add one OR fall back to a paginated SELECT on `email_labels` + NXT live-lookup pattern." Stage 1 source is unambiguous: `swarm_categories` via `loadSwarmCategories`.

**Warning signs:** TS compile error on `.from("classifier_categories")`; runtime 404 in customer combobox.

### Pitfall 2: Replay-unsafe id generation in override handler

**What goes wrong:** Generating `submitted_at` or any UUID outside `step.run()` → on replay, override row's `submitted_at` shifts but DB row inserted on first attempt; subsequent replay generates a NEW timestamp and INSERT on a fresh `id`, leading to duplicate-or-mismatched override audit rows.

**Why it happens:** Phase 65 commit `dae6276` documented this exact failure mode for nondeterministic key generation outside step.run.

**How to avoid:** All `Date.now()`, `crypto.randomUUID()`, and any `new Date().toISOString()` MUST be inside the same `step.run("axis-{N}-emit", ...)` that performs the INSERT. The example in Pattern 1 follows this rule.

**Warning signs:** Duplicate override rows for the same `(email_id, axis)` pair after Inngest replay; `submitted_at` values that don't match the `created_at` of the row.

### Pitfall 3: `inngest.send` destructured / `this`-binding loss

**What goes wrong:** `const send = inngest.send` then `send({...})` → runtime `TypeError: Cannot read properties of undefined (reading '_send')`. Phase 65 commit `dae6276` documented and fixed this.

**How to avoid:** Always `inngest.send.bind(inngest)({...})` OR call inline `inngest.send({...})`. Mocked tests don't catch this — only live smoke does.

**Warning signs:** First production POST fails with `_send` error.

### Pitfall 4: View RLS / privilege confusion

**What goes wrong:** Authenticated UI user can't read `pipeline_events_email_summary` because the view runs with creator privileges and `pipeline_events` RLS blocks the call.

**How to avoid:** Add `WITH (security_invoker=true)` to the view OR test explicitly with an `authenticated` JWT before merge. Phase 70 already grants `authenticated SELECT` on `pipeline_events`, so security_invoker mode just works.

**Warning signs:** Bulk Review predicted-row feed returns 0 rows in production while raw `pipeline_events` has thousands.

### Pitfall 5: Stage 1 override race vs. existing verdict-worker

**What goes wrong:** Operator submits Stage 1 override for an email where the original `automation_runs` row is already in `pending` state (re-trigger window, line 61-66 of `classifier-verdict-worker.ts`). Override emits a new pipeline_events row but verdict-worker has already kicked off side-effects.

**How to avoid:** D-04 wraps the existing verdict-worker — emit override row FIRST, then enter the `flip-to-pending` step. That ordering ensures the override is the canonical decision in `pipeline_events` even if the dispatch races. The original Stage 1 row is the audit; the override row is the truth.

**Warning signs:** Two `triggered_by='pipeline'` rows on a single email + a separate `operator-override` row, with stale Outlook label state.

### Pitfall 6: Stage 2 re-run double-counts cost

**What goes wrong:** Operator toggles re_run_downstream=true → coordinator-complete event fires → Stage 3+4 produce a second set of LLM calls. The new pipeline_events rows have non-zero `cost_cents`. Aggregate view's `SUM(cost_cents)` then double-counts vs. the original Stage 3+4 rows that stay in audit.

**How to avoid:** This is **expected behaviour** (audit preserves both first-pass and replay LLM costs; that IS the cost of operator overrides). Document in UI: "Re-running stages costs additional tokens — these accrue to per-email total cost." Already covered in UI-SPEC § confirmation modal copy.

**Warning signs:** Operator confused by "doubled" cost in Bulk Review row.

### Pitfall 7: View latency at scale

**What goes wrong:** With 50k+ emails, the per-stage `DISTINCT ON` plus subqueries for cost and tool-calls run slow (>500ms). UX budget is ~200ms.

**How to avoid:** Phase 71 ships the index `(email_id, stage, created_at DESC)` per D-09. If latency still exceeds budget, deferred path is materialised view (Phase 72+). Plan should include a perf check: `EXPLAIN ANALYZE SELECT * FROM pipeline_events_email_summary WHERE swarm_type='debtor-email' ORDER BY last_event_at DESC LIMIT 100`.

**Warning signs:** Bulk Review TTFB > 1s after view rewire.

## Code Examples

### Per-axis emit hook (Stage 1, injected into existing verdict-worker)

```typescript
// web/lib/inngest/functions/classifier-verdict-worker.ts (EXTEND)
// [CITED: web/lib/inngest/functions/classifier-verdict-worker.ts:26-90 — existing structure]
// D-04: emit override row FIRST, then existing reroute logic.
// Override path is engaged when event.data.triggered_by === 'operator-override'
// (the override-handler dispatches the existing verdict event with this marker).
```

### Override jsonb shape (locked, D-01)

```typescript
// web/lib/pipeline-events/types.ts (EXTEND)
export type OverrideAxis =
  | "stage_1_category"
  | "stage_2_customer"
  | "stage_3_intent"
  | "stage_4_handler_output";

export interface OverrideJson {
  axis: OverrideAxis;
  original_decision: string;
  original_event_id: string;       // uuid
  operator_id: string;              // uuid (auth.uid())
  reason: string | null;            // ≤1000 chars
  submitted_at: string;             // ISO timestamptz
}
```

### Recipient-chip URL-driven filter (UI pattern)

UI-SPEC § "Recipient chip strip behaviour" locks the contract: clicking a chip mutates `?inbox=debiteuren@smeba.nl`. This pattern matches existing `selection-context.tsx` URL-state plumbing in the same directory.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-table writes (`automation_runs`, `email_labels`, `agent_runs`, `coordinator_runs`) read by Bulk Review via brittle multi-table joins | Single canonical `pipeline_events` table, Bulk Review reads either raw events (timeline) or the new aggregate view (list) | Phase 70 (2026-05-05) | Phase 71 plans cleanly off the new backbone — no need to write 4 different override paths. |
| `eval_type` and override info inferred / stored in scattered jsonb fields | Two dedicated columns on `pipeline_events`: `override jsonb`, `eval_type text` | Phase 70 (forward-compat scaffold) | Phase 71 simply populates them. Indexes already in place: `pipeline_events_override_partial_idx` (line 46-47 of `20260506a_pipeline_events.sql`). |
| One row per stage decision in Bulk Review (operator scrolls 4 rows per email) | One row per email aggregating all 4 stages + cost + tool calls | Phase 71 (REVW-06) | Operator's mental model becomes "an email", not "a stage decision". Promotion recommender (Phase 72) consumes the same view. |
| Operator override = approve-or-reject only (Stage 1 fast path) | 4-axis override, each tagged capability/regression | Phase 71 (REVW-01..05) | Distinct learning signals per stage feed Phase 72's promotion engine. |

**Deprecated/outdated:**
- Reading `automation_runs` directly for the predicted-row feed → already removed in Phase 70-06.
- Per-axis bespoke override logic → consolidated into `debtor-email-override-handler` fan-out (D-12).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Postgres view inherits authenticated SELECT via `security_invoker=true`; without that flag the view runs as creator and may bypass or block RLS unexpectedly | Pattern 2 + Pitfall 4 | If wrong, Bulk Review predicted-row feed returns 0 or unfiltered rows. Mitigation: explicit `WITH (security_invoker=true)` in migration AND a test that hits the view as `authenticated`. |
| A2 | UI-SPEC reference `public.classifier_categories` is a UI-SPEC error and the actual source is `public.swarm_categories` (verified in migrations + `loadSwarmCategories`) | Pitfall 1 | Low — codebase grep confirms `swarm_categories` is the registry. UI-SPEC will need a one-line correction during plan-phase. |
| A3 | UI-SPEC reference `email_pipeline.customer_index` does not match a table currently in the codebase; planner must add a customer-search source OR reuse `resolve-debtor.ts` lookup pattern | Pitfall 1 | Medium — if no typeahead-friendly source exists, Wave 0 of plan needs a small spike to confirm the customer-search backing source. |
| A4 | Existing `coordinator_runs` table has a row keyed by `email_id` with mutable `customer_account_id` field that the override handler can UPDATE | Pattern 1 axis-2 path | Low — Phase 65/68 references `coordinator_runs.customer_account_id` extensively; verified in CONTEXT D-05. |
| A5 | The Stage 3 → Stage 4 dispatch event for each handler is `swarm_intents.handler_event` (registry column) and re-dispatching it with the corrected intent is sufficient | Pattern 1 axis-3 path | Low — `loadSwarmIntents` already returns `handler_event` field per `web/lib/swarms/types.ts:71`. |
| A6 | Bulk Review's existing `__tests__/load-page-data.test.ts` vitest setup is the correct test harness for the view rewire (mock admin client + assertion patterns) | Validation Architecture | Low — file exists at `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts`. |

## Open Questions

1. **Which table backs the Stage 2 customer search?**
   - What we know: UI-SPEC names `email_pipeline.customer_index`, but no such table exists in the codebase. `resolve-debtor.ts` does customer resolution against `email_labels` + live NXT via Zapier SDK (`nxt-zap-client.ts`).
   - What's unclear: Whether a denormalised customer-name index exists somewhere in `email_pipeline` schema (the `email_pipeline` schema is mentioned in MEMORY.md but not exposed via the project's PostgREST config per pending-todo `postgrest-exposed-schemas-for-email-insights`).
   - Recommendation: Wave 0 spike (≤30min). If no fast typeahead source: (a) add a thin search RPC over `coordinator_runs DISTINCT customer_account_id, customer_name` (existing data, no migration needed), or (b) accept latency and call live NXT-via-Zapier with a 250ms debounce. Plan should pick one and lock.

2. **Should `auth.uid()` be the supabase auth user OR a project-members-table operator id?**
   - What we know: D-13 says `auth.uid()`. Phase 48 added project_members gating + Azure AD SSO.
   - What's unclear: Whether UI-tooltip operator-display name pulls from `project_members` or directly from `auth.users.email`.
   - Recommendation: Store `auth.users.id` in `override.operator_id` (D-13 verbatim); when rendering "overridden by {operator email} on {date}" tooltip (UI-SPEC § Row interactions), JOIN against `auth.users.email` server-side. No new schema.

3. **Stage 1 override into a category whose `action='swarm_dispatch'` — what swarm_dispatch event fires?**
   - What we know: D-04 reuses verdict-worker's existing dispatch logic (lines 91-160 of `classifier-verdict-worker.ts`).
   - What's unclear: For an override INTO a category like `payment_admittance` (action='categorize_archive'), the existing path archives + categorizes. For an override INTO `unknown` or a swarm-dispatch category, a new Inngest event fires. Is duplicate dispatch (original first-pass already fired one event) acceptable? (Yes — the original event already ran and is audited. Override fires a second event for the new category.)
   - Recommendation: Document this explicitly in plan's REVW-01 task as "Stage 1 override may produce a second swarm-dispatched downstream event; this is intentional audit semantics."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Postgres + service-role key | View migration + override INSERT | ✓ | Production (existing) | — |
| Inngest cloud + signing key | New override handler + event registration | ✓ | Production (existing) | — |
| Vercel Next.js runtime | New POST route | ✓ | Production (existing) | — |
| shadcn primitives in `web/components/ui/` | All NEW UI components | ✓ | Already initialised | — |
| `lucide-react` | Icons | ✓ | Already in use | — |
| `vitest` | Unit/integration tests | ✓ | Existing test harness | — |
| Supabase Auth (server session, `auth.uid()`) | D-13 operator_id stamping | ✓ | Phase 48 SSO live | — |
| Codegen pipeline (`npm run codegen`) | Not needed Phase 71 (no registry-driven enums change) | ✓ | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing, used across `web/**/__tests__/`) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/review` |
| Full suite command | `cd web && npm test` (or `npx vitest run`) |

### Phase Requirements → Test Map

Each REVW requirement is exercised across the **Override Coverage Matrix** = {axis} × {capability, regression} × {happy, edge}.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVW-01 | Stage 1 override emits override row + reroutes to new category (capability tag) | unit | `npx vitest run web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts -t "axis-1.*capability"` | ❌ Wave 0 |
| REVW-01 | Stage 1 override emits override row + reroutes to noise/archive (regression tag) | unit | `npx vitest run web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts -t "axis-1.*regression"` | ❌ Wave 0 |
| REVW-01 | Original Stage 1 `pipeline_events` row preserved (audit) | integration | `npx vitest run web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts -t "axis-1.*audit"` | ❌ Wave 0 |
| REVW-02 | Stage 2 override updates `coordinator_runs.customer_account_id`, no re-run when `re_run_downstream=false` | unit | `npx vitest run -t "axis-2.*no-rerun"` | ❌ Wave 0 |
| REVW-02 | Stage 2 override re-emits coordinator-complete when `re_run_downstream=true` | integration | `npx vitest run -t "axis-2.*rerun"` | ❌ Wave 0 |
| REVW-03 | Stage 3 override dispatches new handler event from `swarm_intents` registry | integration | `npx vitest run -t "axis-3.*dispatch"` | ❌ Wave 0 |
| REVW-03 | Stage 3 override preserves original Stage 4 row as audit | unit | `npx vitest run -t "axis-3.*audit"` | ❌ Wave 0 |
| REVW-04 | Stage 4 override emits draft_quality + reason, NO handler re-run | unit | `npx vitest run -t "axis-4.*emit-only"` | ❌ Wave 0 |
| REVW-04 | Stage 4 override does NOT mutate iController draft | unit | `npx vitest run -t "axis-4.*no-icontroller-mutation"` | ❌ Wave 0 |
| REVW-05 | Default `eval_type=regression` enforced in payload schema | unit (zod) | `npx vitest run web/app/api/automations/debtor-email/override/__tests__/route.test.ts -t "default.*regression"` | ❌ Wave 0 |
| REVW-05 | Capability tag flows from UI → POST → Inngest event → emit row | integration | `npx vitest run -t "eval_type.*capability"` | ❌ Wave 0 |
| REVW-06 | View returns one row per email with all 4 stage decisions | integration (DB) | `npx vitest run web/lib/pipeline-events/__tests__/email-summary.test.ts` | ❌ Wave 0 |
| REVW-06 | View `total_cost_cents` SUMs across all events for the email | integration (DB) | `npx vitest run -t "total_cost_cents.*sum"` | ❌ Wave 0 |
| REVW-06 | `loadPageData` reads from view (not raw events) for predicted-row feed | unit | `npx vitest run web/app/\(dashboard\)/automations/\[swarm\]/review/__tests__/load-page-data.test.ts -t "view"` | ✅ EXTEND |
| D-13 | `operator_id` is server-stamped, ignored from payload | security | `npx vitest run -t "operator_id.*server-stamp"` | ❌ Wave 0 |
| D-14 | `reason` >1000 chars rejected by zod | security | `npx vitest run -t "reason.*max-length"` | ❌ Wave 0 |
| Pitfall 2 | Replay-safety: handler invoked twice produces ≤2 emit rows (idempotency) | integration | `npx vitest run -t "replay.*idempotent"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/review web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts web/lib/pipeline-events`
- **Per wave merge:** `cd web && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`. Manual smoke: file one capability override + one regression override per axis through the live UI on acceptance, verify each row in `pipeline_events` via Supabase MCP.

### Wave 0 Gaps

- [ ] `web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts` — covers REVW-01..05 axis fan-out + replay idempotency. NEW.
- [ ] `web/app/api/automations/debtor-email/override/__tests__/route.test.ts` — covers payload validation, server-side `operator_id` stamping (D-13), max-length reason (D-14). NEW.
- [ ] `web/lib/pipeline-events/__tests__/email-summary.test.ts` — covers view shape, override-wins-latest semantics, cost SUM, tool_call_count rollup. NEW (DB integration).
- [ ] EXTEND `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` — assert predicted-row feed reads `pipeline_events_email_summary` view, not raw events.
- [ ] EXTEND `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` (if exists) — assert override path emits override row BEFORE existing reroute logic. If no test file exists, add one.
- [ ] Shared fixture: `web/lib/pipeline-events/__tests__/fixtures/override-events.ts` — canonical payloads for each axis × {capability, regression}.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth session (existing); `auth.getUser()` in route handler before accepting any override |
| V3 Session Management | yes | Supabase JWT cookies (existing); no new session surface |
| V4 Access Control | yes | RLS on `pipeline_events` (Phase 70: service_role write, authenticated select); view inherits via `security_invoker=true` |
| V5 Input Validation | yes | `zod` schema on POST payload (closed enums for axis + eval_type; max-length on reason) |
| V6 Cryptography | no | No new secrets/crypto; reuses Supabase + Inngest signing |
| V7 Error Handling/Logging | yes | Inngest error logs (failures retry once then surface in queue UI); never log raw email body in error message |
| V14 Configuration | partial | New env-var-free; reuses existing service-role + INNGEST_* keys |

### Known Threat Patterns for Phase 71 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Operator impersonation (client sends fake `operator_id`) | Spoofing | D-13: server-side `auth.uid()` stamping; payload field IGNORED if present |
| XSS via `reason` text rendered in tooltip | Tampering | D-14: HTML-escape on render (React default escapes; do NOT use `dangerouslySetInnerHTML`) |
| Stored PII in `decision_details` jsonb leaks via view to wrong tenant | Information Disclosure | RLS unchanged from Phase 70; view runs `security_invoker=true`; no cross-tenant join introduced |
| Override storm (operator submits N overrides in tight loop) | DoS | Inngest retries=0 + per-event rate limit OR `step.run` boundary keeps DB writes bounded; Bulk Review UI submit-bar disables during in-flight submission |
| Race between UI optimistic update and Inngest replay | Tampering | Override row is append-only audit; UI re-fetches from view post-success; Realtime publication on `pipeline_events` ensures fresh read |
| `re_run_downstream=true` exhausts LLM token budget | DoS / Cost | Confirmation modal + per-run budget cap from Phase 64 BUDG-01 (already in place) — re-run inherits same budget |
| SQL injection via `decision` text on view | Tampering | All writes go through `emitPipelineEvent` parameterised INSERT; the view does no string concat |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/71-bulk-review-4-axis-redesign-capability-regression-eval-split/71-CONTEXT.md` (locked decisions)
- `.planning/phases/71-bulk-review-4-axis-redesign-capability-regression-eval-split/71-UI-SPEC.md` (approved UI contract)
- `supabase/migrations/20260506a_pipeline_events.sql` lines 23-77 (live schema with override + eval_type columns)
- `web/lib/pipeline-events/types.ts` lines 44-59 (PipelineEventInput already has override + eval_type)
- `web/lib/pipeline-events/emit.ts` lines 29-37 (canonical emit helper)
- `web/lib/inngest/functions/classifier-verdict-worker.ts` lines 26-100 (existing Stage 1 path D-04 wraps)
- `web/lib/swarms/registry.ts` lines 78-95 (`loadSwarmIntents` for Stage 3 dropdown)
- `web/lib/swarms/types.ts` lines 66-95 (SwarmIntentRow + SwarmCategoryRow shapes)
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` lines 80-280 (`loadPageData` Phase 70-06 rewire — D-10 swap point)
- `CLAUDE.md` §Inngest (replay-safe step.run discipline + this-binding rule)
- `.planning/REQUIREMENTS.md` lines 63-68 (REVW-01..06)

### Secondary (MEDIUM confidence)

- `docs/agentic-pipeline/README.md` (5-stage architecture canonical doc)
- `docs/debtor-email-pipeline-architecture.md` (debtor-email implementation map)
- `.planning/phases/70-telemetry-consolidation-pipeline-events/70-CONTEXT.md` D-10..D-13 (forward-compat scaffold rationale)
- `web/lib/automations/debtor-email/resolve-debtor.ts` lines 46-200 (customer resolution existing patterns — informs Stage 2 customer-search source question)

### Tertiary (LOW confidence — flagged in Open Questions)

- UI-SPEC reference to `public.classifier_categories` (Open Q1 / Pitfall 1)
- UI-SPEC reference to `email_pipeline.customer_index` (Open Q1 / Pitfall 1)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every library + helper already in repo, verified by grep
- Architecture: HIGH — CONTEXT.md decisions are locked; Phase 70 backbone is in production; UI-SPEC.md is approved
- Pitfalls: HIGH for replay-safety (Phase 65 commits cited verbatim); MEDIUM for view-RLS (assumption A1 needs explicit `security_invoker`); MEDIUM for UI-SPEC table-name discrepancy (resolved by Wave 0 spike)
- Test architecture: HIGH — vitest harness already established at the same directory level

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days; Phase 70 + 71 backbone is stable, no fast-moving external deps)
