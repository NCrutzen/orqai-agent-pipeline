# Phase 76: Stage 3 → Kanban human-lane wiring — Research

**Researched:** 2026-05-07
**Domain:** Pipeline runtime (Stage 3 dispatch + Stage 4 failure capture) + per-swarm Kanban UI
**Confidence:** HIGH (all critical questions answered against in-tree code; no ambiguity)

## Summary

Phase 76 wires three triggers (`no_handler`, `low_confidence`, `handler_error`) into a per-swarm Kanban lane (`automation_runs.status='pending'`) with three operator actions (Close, Replay, Reclassify-as-noise). The locked design contract (CONTEXT.md) is consistent with the canonical RFC docs (`docs/agentic-pipeline/README.md`, `stage-3-coordinator.md`, `override-model.md`) — Kanban is a side-surface, NOT a new pipeline stage. The hard separation rule (a row exists in exactly one of `swarm_noise_categories` or `swarm_intents`) is preserved: D-03's "reclassify-as-noise" picks from `swarm_noise_categories` only.

**Critical question resolved:** the `no_handler` mechanism is a **registry column on `swarm_intents`** (`handler_status enum('registered','placeholder')`), NOT runtime Inngest introspection. The Inngest SDK does not expose `inngest`-client-level introspection of registered functions (`this.fns` lives privately inside `InngestCommHandler` and is only assembled inside `serve()`); attempting to introspect would either reach across the serve boundary or hardcode a list — both worse than a registry column that follows Phase 68's "registry-driven, mutation-rare" pattern.

**Primary recommendation:** Add `handler_status` to `swarm_intents` (default `'registered'` for the 1 currently-shipping handler `invoice_copy_request`, `'placeholder'` for the 8 missing ones). Both Stage 3 dispatch sites (`debtor-email-coordinator.ts:255` single-shot + `coordinator-orchestrator.ts:107` fan-out) check it before `inngest.send`. `low_confidence` rewires inside `escalation-gate.ts` body. `handler_error` is captured via Inngest's per-function `onFailure` callback (already used in 6 existing functions — pattern proven).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `no_handler` detection | API / Backend (Inngest worker — `coordinator-orchestrator.ts`, `debtor-email-coordinator.ts`) | Database (`swarm_intents.handler_status`) | Stage 3 dispatch is server-side; the choke point is the `loadHandlerEvent` call site |
| `low_confidence` detection | API / Backend (`escalation-gate.ts` body change) | Database (`automation_runs` insert) | Pure-function decision today — repurposed body now writes Kanban row instead of fanning out |
| `handler_error` capture | API / Backend (Inngest `onFailure` per Stage 4 handler) | Database (`automation_runs` insert) | Inngest's per-function lifecycle hook is the canonical failure path |
| Kanban list view | Frontend Server (Next.js RSC `[swarm]/kanban/page.tsx`) | API / Backend (Supabase service-role read) | Mirrors the existing `[swarm]/review/page.tsx` shape verbatim |
| Optimistic row removal | Browser / Client (`selection-context.tsx` analog) | Frontend Server | Module-level cache + `history.replaceState` — already proven for Bulk Review |
| Realtime invalidation | Browser / Client (Supabase Realtime subscription) | API / Backend (`emitAutomationRunStale`) | One channel per `automations:${name}:stale` — exact pattern from `emit.ts` |
| Operator actions (Close / Replay / Reclassify-as-noise) | API / Backend (Server Actions or API routes) | API / Backend (`debtor-email-override-handler` for axis-1/3) | Reuses existing axis-1/axis-3 emit shape — no new override handler needed |

## Standard Stack

### Core (already in repo, no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | `^3.x` (SDK in `web/node_modules/inngest/`) | Stage 3 dispatch + onFailure | Already standard; CLAUDE.md non-negotiable |
| `@supabase/supabase-js` | `^2.x` | `automation_runs` writes + Realtime broadcast | Service-role admin client pattern is canonical |
| Next.js 15 App Router | dynamic segment `[swarm]` | Per-swarm route shape | Mirrors `/automations/[swarm]/review/page.tsx` |

### Verification
- `inngest` SDK function-introspection: VERIFIED ABSENT. The `inngest` package's public surface (`web/node_modules/inngest/index.d.ts`) exports `InngestFunction`, `isInngestFunction`, `Inngest`, `serve` but provides NO method on the `Inngest` client to enumerate registered functions. The function map (`this.fns`) is built only inside `InngestCommHandler` constructor (`InngestCommHandler.js:191`) when `serve({ functions: [...] })` runs. There is no `inngest.getFunctions()` or equivalent.
- `onFailure` callback: VERIFIED PRESENT and idiomatic. 6 existing functions use it: `pipeline.ts:70`, `briefing-refresh.ts:29`, `prolius-report.ts:18`, `heeren-oefeningen.ts:31`, `uren-controle-process.ts:22`, `orqai-trace-sync.ts:73`. Signature: `onFailure: async ({ error, event, step }) => { … }`.

## Architecture Patterns

### System Architecture Diagram

```
                     Stage 3 entry (debtor-email-coordinator.ts)
                                       │
                                       ↓
                   classify-intent (Orq.ai) → ranked list
                                       │
                                       ↓
                   evaluateEscalationGate(output, categories)
                                       │
                       ┌───────────────┼───────────────────────┐
                       │               │                       │
              kind:single_shot     kind:orchestrator     (gate body now also writes
                       │           reason: low_confidence       Kanban row when
                       │            / high_intent_count /        kind:orchestrator)
                       │            requires_orchestration_flag
                       ↓                                        ↓
            loadHandlerEvent(swarm_intents)              automation_runs INSERT
                       │                                  status='pending'
                       ↓                                  topic=<intent_key>
       ┌───── handler_status === 'registered' ?           result.kanban_reason='low_confidence'
       │                                                        │
       NO (placeholder)                                          ↓
       │                                              emitAutomationRunStale('${swarm_type}-kanban')
       ↓                                                        │
 automation_runs INSERT                                          │
 status='pending'                                                │
 result.kanban_reason='no_handler'                               │
       │                                                        │
       ↓                                                        ↓
  emitAutomationRunStale('${swarm_type}-kanban')          [/automations/[swarm]/kanban]
                                                                ▲
                                                                │
                       YES (registered)                         │
                                  │                             │
                                  ↓                             │
                         inngest.send(handler_event)            │
                                  │                             │
                                  ↓                             │
                       Stage 4 handler runs                     │
                                  │                             │
                       ┌──────────┴──────────┐                  │
                       success            throw                 │
                                            │                   │
                                            ↓                   │
                                    onFailure callback ─────────┘
                                    (writes Kanban row,
                                     result.kanban_reason='handler_error',
                                     result.error_detail=<error.message>)
```

Operator actions on a Kanban row:

```
[Close]            → automation_runs.status='completed' + emit broadcast
[Replay]           → if intent unchanged: re-fire handler_event
                     if intent changed:    inngest.send('debtor-email/override.submitted',
                                            { axis: 'stage_3_intent', decision: <new_intent>, … })
                                            → debtor-email-override-handler.ts:184 emits axis-3
                                              pipeline_events row + dispatches new handler_event
[Reclassify-as-noise] → inngest.send('debtor-email/override.submitted',
                          { axis: 'stage_1_category', decision: <noise_key>, … })
                          → debtor-email-override-handler.ts:103 emits axis-1
                            pipeline_events row + dispatches classifier/verdict.recorded
                          + Kanban row marked completed
```

### Recommended Project Structure
```
web/
├── app/(dashboard)/automations/[swarm]/
│   ├── review/                       # EXISTING — do not touch
│   └── kanban/                       # NEW (mirrors review/ shape)
│       ├── page.tsx                  # RSC, swarm registry lookup, AutomationRealtimeProvider
│       ├── selection-context.tsx     # client; pendingRemovalIds + history.replaceState
│       ├── row-list.tsx              # client; reads useSelection
│       ├── detail-pane.tsx           # client; per-row reason + operator actions
│       ├── filter-chips.tsx          # client; All / no_handler / low_confidence / handler_error
│       ├── actions/
│       │   ├── close.ts              # 'use server'; UPDATE automation_runs status='completed'
│       │   ├── replay.ts             # 'use server'; axis-3 override OR direct re-fire
│       │   └── reclassify-noise.ts   # 'use server'; axis-1 override
│       └── _lib/
│           └── kanban-loader.ts      # SELECT automation_runs WHERE swarm_type=$1 AND status='pending' AND result->>'kanban_reason' IS NOT NULL
├── lib/
│   ├── inngest/functions/
│   │   ├── debtor-email-coordinator.ts        # MODIFY :245-268 (no_handler check before send)
│   │   ├── coordinator-orchestrator.ts        # MODIFY :94-123 (no_handler check inside fan-out loop)
│   │   ├── classifier-invoice-copy-handler.ts # MODIFY :47 (add onFailure → kanban row)
│   │   └── (8 future Stage-4 handlers)        # NEW handlers in their own phases all add onFailure
│   ├── automations/debtor-email/coordinator/
│   │   └── escalation-gate.ts                 # MODIFY: body changes from "decide kind" to ALSO carry the kanban-write
│   └── swarms/
│       ├── registry.ts                        # MODIFY: SwarmIntentRow gains handler_status; loadHandlerEvent returns null when placeholder
│       └── types.ts                           # MODIFY: add handler_status field
└── supabase/migrations/
    └── 2026MMDD_swarm_intents_handler_status.sql  # NEW: ALTER TABLE swarm_intents ADD COLUMN handler_status
```

### Pattern 1: `handler_status` column on `swarm_intents` (the no_handler decision)

**What:** Add `handler_status text NOT NULL DEFAULT 'registered' CHECK (handler_status IN ('registered','placeholder'))` to `public.swarm_intents`.

**Migration shape (planner extends with exact values):**
```sql
-- Phase 76: handler-registration source-of-truth on swarm_intents.
ALTER TABLE public.swarm_intents
  ADD COLUMN handler_status text NOT NULL DEFAULT 'registered'
  CHECK (handler_status IN ('registered','placeholder'));

-- Set placeholder for the 8 intents whose Stage 4 handler does not exist yet.
-- (Source: docs/agentic-pipeline/stage-3-coordinator.md §Registry Tables — only
--  `invoice_copy_request` ships today; the other 8 are TBD per CONTEXT.md.)
UPDATE public.swarm_intents
   SET handler_status = 'placeholder'
 WHERE swarm_type = 'debtor-email'
   AND intent_key IN (
     'address_change', 'contract_inquiry', 'copy_document_request',
     'credit_request', 'general_inquiry', 'peppol_request',
     'payment_dispute', 'other'
   );
```

**Why this and NOT runtime introspection:**
1. The Inngest SDK exports no client-level introspection — verified against `web/node_modules/inngest/index.d.ts` and `InngestCommHandler.js:191`. Building one would either (a) thread the `serve()` `functions[]` list back to the dispatch site (cross-cutting; defeats the route-handler boundary) or (b) hardcode a Set of registered events in shared module (the very registry-vs-code drift the column avoids).
2. Phase 68's "registry as source of truth" principle (codified in `swarm_intents`/`swarm_noise_categories` and CLAUDE.md's "Build-time codegen for registry-driven literal-union TS types" entry) already extends to `handler_status`. The CI gate `npm run codegen && git diff --exit-code` can be extended in Phase 78 (the codegen wave) to verify that every `handler_status='registered'` row's `handler_event` is reachable from a `createFunction` `event` literal in the codebase, closing the drift loop without runtime introspection.
3. Onboarding cost is one-line per shipped handler: when a Stage 4 handler ships, its plan also flips `handler_status` from `'placeholder'` to `'registered'` for that intent_key — same migration motion as adding any registry row.

### Pattern 2: `onFailure` for `handler_error` capture

**What:** Add `onFailure` to every Stage 4 handler `inngest.createFunction` config. For Phase 76 only `classifier-invoice-copy-handler.ts` exists — the other 8 will add it as they ship.

**Verified shape (from `pipeline.ts:70` and `briefing-refresh.ts:29`):**
```typescript
// inside inngest.createFunction({...}) config object
onFailure: async ({ error, event, step }) => {
  const admin = createAdminClient();
  await step.run("kanban-handler-error", async () => {
    // event.data.event holds the original handler trigger payload
    const orig = (event.data as { event: { data: Record<string, unknown> } }).event.data;
    await admin.from("automation_runs").insert({
      automation: `${orig.swarm_type}-kanban`,
      swarm_type: orig.swarm_type as string,
      status: "pending",
      topic: orig.intent as string,           // intent_key carried as topic
      entity: (orig.entity as string) ?? null,
      result: {
        kanban_reason: "handler_error",
        intent: orig.intent,
        email_id: orig.email_id,
        automation_run_id: orig.automation_run_id, // original Stage 3 run
        error_detail: error.message,
      },
      triggered_by: "stage-4-onFailure",
    });
    await emitAutomationRunStale(admin, `${orig.swarm_type}-kanban`);
  });
},
```

**Why retries: 0 stays:** All Stage 4 handlers in this codebase use `retries: 0` (see `classifier-verdict-worker.ts:27`, `coordinator-orchestrator.ts:32`, `debtor-email-coordinator.ts:54`). The convention is "auto-retry compounds Orq.ai cost; Bulk Review/Kanban retry is the recovery path." `onFailure` fires after retries are exhausted — with `retries: 0`, it fires after the first failure. This matches the design intent: one Kanban row per failed run.

### Pattern 3: `escalation-gate.ts` body repurpose (D-07)

**Current shape (verified — `escalation-gate.ts:24-52`):** PURE function. `evaluateEscalationGate(output, categories): EscalationDecision`. Returns `{kind:'single_shot'}` OR `{kind:'orchestrator', reason:'low_confidence'|'high_intent_count'|'requires_orchestration_flag'}`.

**Threshold details (D-08 — verified in code, not docs):**
- `low_confidence` fires when `output.ranked[0].confidence === 'low'` (string literal — `confidence` is an enum {`high`,`medium`,`low`}, NOT a numeric score). NOT a number — there is no float threshold today.
- `high_intent_count` fires when `output.ranked.length >= 3`.
- `requires_orchestration_flag` fires when ANY `ranked[i].intent` matches a `swarm_noise_categories` row with `requires_orchestration === true`. **NOTE — RFC consistency check:** the canonical RFC says this flag is per-intent on `swarm_intents`, but the current code reads it from `swarm_noise_categories`. This appears to be a pre-Phase-75 leftover (categories table had intents in it; Phase 75 split them). The planner should flag this for confirmation; for Phase 76 the flag's source is not load-bearing because all three escalation conditions go to the same Kanban lane regardless.

**Repurpose strategy (D-09 — single decision point):** Keep the pure function shape. The CALLER (`debtor-email-coordinator.ts:222`) currently dispatches based on `decision.kind`. The change is in the caller's `if (decision.kind === 'orchestrator')` branch (line 293-312): instead of `inngest.send('debtor-email/orchestrator.requested')`, it inserts a Kanban row + emits broadcast. The orchestrator function (`coordinator-orchestrator.ts`) stays in the codebase per "Things to NOT touch" (D-07) but loses its trigger.

### Pattern 4: Override-handler emit shape (axis-1 + axis-3 for D-01 + D-03)

**Verified — `debtor-email-override-handler.ts:38-215` already handles all four axes.** Phase 76 plugs into the existing `debtor-email/override.submitted` event — no new handler.

**axis-3 (D-01 Replay with edited intent):**
```typescript
await inngest.send({
  name: "debtor-email/override.submitted",
  data: {
    axis: "stage_3_intent",
    email_id: <email_id>,
    original_event_id: <Stage 3 pipeline_events.id>,
    original_decision: <coordinator's top intent>,
    decision: <operator's chosen intent>,
    decision_details: { intent_key: <operator's chosen intent> },
    eval_type: "capability",     // or "regression" — see decision_details usage
    reason: <optional operator note>,
    operator_id: <user.id>,
  },
});
```
Handler at line 184-202 looks up the new intent's handler_event from `swarm_intents` and dispatches.

**Same-intent replay (D-01):** "The override is only written when the chosen intent **differs** from the Stage 3 coordinator's original top pick — same-intent replays just re-fire the event without duplicating the row." The Server Action checks `chosenIntent === originalIntent` and either (a) calls `inngest.send(<handler_event>, …)` directly bypassing the override handler, OR (b) emits the override event regardless and lets the override handler dedupe. Recommendation: **(a) — bypass for same-intent**. The override handler unconditionally writes a `pipeline_events` row, which would pollute axis-3 telemetry with non-corrections.

**axis-1 (D-03 Reclassify-as-noise):**
```typescript
await inngest.send({
  name: "debtor-email/override.submitted",
  data: {
    axis: "stage_1_category",
    email_id: <email_id>,
    original_event_id: <Stage 1 pipeline_events.id>,    // see Risk R-3
    original_decision: <Stage 1's emitted category, may be 'unknown'>,
    decision: <chosen noise_key>,                       // 'auto_reply' | 'ooo_*' | 'payment_admittance'
    eval_type: "regression",                            // these are misses, not new capabilities
    operator_id: <user.id>,
  },
});
```
Handler at line 103-160 dispatches `classifier/verdict.recorded` with `override_category=<noise_key>`. The verdict-worker (line 71-178) loads the matching `swarm_noise_categories` row and runs `categorize_archive` (Outlook label + archive + queue iController cleanup automation_run via `evaluateSideEffects`). This is exactly the D-03 contract.

**`unknown` exclusion (deferred-ideas):** D-03 dropdown shows 4 noise keys (`auto_reply`, `ooo_permanent`, `ooo_temporary`, `payment_admittance`). `unknown` is filtered out at the UI layer — the registry has 5 rows but the dropdown shows 4.

### Pattern 5: Per-swarm dynamic route (mirrors `[swarm]/review/page.tsx`)

**Verified shape (review/page.tsx:1-100):**
- `export const dynamic = "force-dynamic"`
- Reads `params.swarm` → `loadSwarm(admin, params.swarm)` → `notFound()` if null
- Loads `swarm_intents`, `swarm_noise_categories` for filter chips + dropdowns
- Wraps children in `<AutomationRealtimeProvider automations={[<channels>]}>` and `<SelectionProvider>`
- 3-column grid layout `[clamp(220px,18vw,280px) minmax(380px,460px) 1fr]`

**Server-component data loaders work for D-03 dropdown:** `loadSwarmNoiseCategories(admin, swarmType)` is async with no `'use client'` boundary issues — it's already called from `review/page.tsx` server-side. The Kanban page can pass the noise category list as a server-rendered prop into the client `<DetailPane>` for the Reclassify dropdown. Confirmed.

### Pattern 6: Realtime channel naming + multi-channel subscription

**Verified (`automation-realtime-provider.tsx:35-90`):** the provider takes `automations: string[]` and opens ONE Supabase channel per name. So a single page can subscribe to multiple channels by passing `automations={['debtor-email-kanban', 'debtor-email-review']}` if needed. For Phase 76, the Kanban page subscribes only to `'${swarm_type}-kanban'`.

**Channel name convention (`emit.ts:22`):** `automations:${automation}:stale`. The `automation` argument here is the FULL automation name. Bulk Review uses `'${swarm_type}-review'`; Kanban uses `'${swarm_type}-kanban'`. The two surfaces remain separate channels; no cross-invalidation. Verified.

**Kanban writes `automation_runs.automation` value:** must equal `'${swarm_type}-kanban'` so the Realtime SELECT (`.in("automation", automations)` in provider line 67) filters correctly. The CONTEXT.md "Schema / row shape on automation_runs" says "Reuse status='pending'" — but does NOT pin the `automation` column. Recommendation: **set `automation = '${swarm_type}-kanban'`** so both the channel-broadcast filter and the realtime-fetch filter agree. Bulk Review's predicted rows use `automation='${swarm_type}-review'` (verified in migration `20260428_automation_runs_typed_columns.sql:42`), so this is the established naming pattern.

### Pattern 7: Optimistic UI removal

**Verified shape (`selection-context.tsx:30-115`):** `pendingRemovalIds: ReadonlySet<string>` + `markPendingRemoval(id)`. Cleanup effect drops ids the server has removed (compares to `rowIds` prop). History sync via `window.history.replaceState`.

**For Kanban:** create a NEW `selection-context.tsx` under `[swarm]/kanban/` (do NOT share with Bulk Review — different row sets, different navigation behavior). The pattern is verbatim-copyable; the `rowIds` prop comes from the Kanban loader instead of the review loader.

### Anti-Patterns to Avoid

- **Hardcoded `swarm_type === 'debtor-email'` branches in Kanban code.** CONTEXT.md flags this explicitly: "If sales-email needs `swarm_type === 'sales-email'` branches anywhere in the Kanban code, it's a 76 bug." All swarm-specific values come from registry tables.
- **Runtime Inngest function-list introspection.** Verified absent in SDK; would force private-API access.
- **Skipping `step.run` around `automation_runs` inserts inside `onFailure`.** CLAUDE.md replay-id rule applies: any non-deterministic value (UUID, `Date.now()`) used as a DB key MUST be inside `step.run`. Even though `onFailure` is itself a step-aware context, the body still needs `step.run` wrappers for replay safety.
- **Destructuring `inngest.send`.** CLAUDE.md commit `dae6276` learning. Always inline-call: `(inngest.send as unknown as SendFn)({…})` or `inngest.send.bind(inngest)`.
- **Generating UUIDs outside `step.run` for the Kanban row.** If the planner inserts an explicit `id` (not relying on the DB default), it must be inside `step.run`. Default-UUID-from-DB sidesteps this entirely — recommended.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tracking which Inngest events have a registered handler | A static map in shared module | `swarm_intents.handler_status` column | Registry is the source of truth (Phase 68 principle); CI gate detects drift |
| Per-axis override emit + side-effects | A new Kanban-specific override handler | Existing `debtor-email-override-handler.ts` (axis-1, axis-3 paths verified) | Each new handler is another drift point; reuse keeps the override taxonomy single-source |
| Stage 4 failure capture | try/catch wrappers in each handler body | Inngest's per-function `onFailure` callback | Inngest already differentiates retried/exhausted failures; manual try/catch loses that distinction |
| Realtime broadcast plumbing | A new Realtime channel pattern | `emitAutomationRunStale(admin, '${swarm_type}-kanban')` | Identical pattern to Bulk Review; one helper covers both |
| Optimistic-removal state | New context shape | Verbatim copy of `pendingRemovalIds` from `selection-context.tsx` | Pattern proven for Bulk Review; behaviour spec is identical |
| Reclassify-as-noise dispatch | Direct call to Outlook + iController APIs | `classifier/verdict.recorded` event with `override_category` | Reuses `evaluateSideEffects` registry-driven dispatch; Outlook label + archive + iController cleanup all happen automatically |
| `swarm_type === '…'` switch in Kanban UI | Hardcoded brand/swarm logic | Registry rows: `swarms.review_route` (already exists), `swarm_intents`, `swarm_noise_categories` | Sales-email (Phase 78) drops in by registry insert; per CONTEXT.md cross-swarm test |

**Key insight:** Every operator action in Phase 76 has a pre-existing dispatch path. Phase 76 is wiring + UI, not new pipeline logic. The single new "behaviour" is the `no_handler` decision — and even that is a registry-column read, not a new mechanism.

## Runtime State Inventory

> Phase 76 is feature-add, not rename/refactor. State inventory is minimal but documented for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 76 only INSERTS new `automation_runs` rows. No back-fill needed for existing rows. | None |
| Live service config | None — no n8n / Datadog / external service touches `automation_runs.kanban_reason`. | None |
| OS-registered state | None — no new cron, no scheduled task. | None |
| Secrets / env vars | None — uses existing service-role key. | None |
| Build artifacts | One — if Phase 78 codegen extension lands in this phase: regenerate `*.generated.ts` (`web/lib/swarms/intents.generated.ts`) after `swarm_intents.handler_status` migration so the new column is reflected in the typed loader. Phase 76 plan should defer codegen extension to Phase 78 unless explicitly added. | Confirm with planner: extend codegen in 76 or defer to 78? |

## Common Pitfalls

### Pitfall 1: `escalation-gate.ts` is a pure function — re-purposing means the CALLER changes
**What goes wrong:** Researcher reads D-07 ("the gate is the choke point, and its body changes") and modifies `evaluateEscalationGate` to insert a Kanban row directly.
**Why it happens:** D-07 phrasing is shorthand. The gate is pure (no DB, no I/O). The actual side-effect site is the caller — `debtor-email-coordinator.ts:293-312` (the `if (decision.kind === 'orchestrator')` branch).
**How to avoid:** Keep `evaluateEscalationGate` pure. Move the kanban-write into the caller's orchestrator branch. The escalation-gate.test.ts (which tests pure decisions) stays green.
**Warning signs:** Test failures in `escalation-gate.test.ts` after edit; `createAdminClient()` import added to `escalation-gate.ts`.

### Pitfall 2: Kanban rows clogging the realtime fetch with `.in("automation", […])`
**What goes wrong:** `automation-realtime-provider.tsx:67` SELECTs all rows where `automation IN (passedNames)` ordered by `created_at DESC LIMIT 200`. If a swarm accumulates >200 Kanban rows, the oldest ones disappear from the live view (refetched only on stale broadcast).
**Why it happens:** Kanban is intentionally pull-only with no SLA; rows can accumulate indefinitely.
**How to avoid:** Either (a) bump `initialLimit` for the Kanban page to 500/1000, or (b) add server-side pagination in the loader (not in the Realtime provider). Recommendation: (a) for v1; pagination is Phase 79 territory if accumulation becomes a problem.
**Warning signs:** Operator reports "rows missing" after a Friday's worth of accumulation.

### Pitfall 3: `original_event_id` for axis-1 reclassify when Stage 1 had no override-able event
**What goes wrong:** D-03 says reclassify-as-noise writes an axis-1 override. But `debtor-email-override-handler.ts:88` calls `emitPipelineEvent` with the override referencing `original_event_id`. For an email that reached Stage 3 (and thus Kanban), Stage 1 must have classified it as `unknown` and forwarded — meaning there IS a Stage 1 `pipeline_events` row to reference. But if the Stage 1 LLM 2nd-pass didn't write a row (older row predates Phase 70), there's no `original_event_id` to point at.
**Why it happens:** Phase 70 telemetry is recent; rows from before Phase 70 may lack a Stage 1 `pipeline_events` entry.
**How to avoid:** Loader query for Kanban rows joins on `pipeline_events` to surface the Stage 1 event_id. If absent, the Reclassify-as-noise action either (a) emits with `original_event_id=null` if the schema allows, or (b) creates a synthetic Stage 1 emit first. Planner should verify against `pipeline-events/types.ts` schema. **For Phase 76: assume Phase 70 is fully landed** (per phase ordering 70 < 75 < 76); only emails that came through after Phase 70 will reach Stage 3 / Kanban anyway.
**Warning signs:** `OverrideJson` schema validation failure when `original_event_id` is null.

### Pitfall 4: Same-intent Replay double-writing axis-3 telemetry
**What goes wrong:** Operator opens a `low_confidence` Kanban row (top intent: `payment_dispute`), reviews, agrees with the top pick, hits Replay. If the action unconditionally emits `debtor-email/override.submitted`, the override handler writes a `pipeline_events` row at stage=3 with `decision_details.original=='payment_dispute'` and `decision=='payment_dispute'` — a non-correction polluting axis-3 metrics.
**Why it happens:** It's tempting to use one code path for both edited and unedited Replay.
**How to avoid:** Server Action branches: `if (chosenIntent === originalTopIntent) → inngest.send(handler_event, …)` directly; `else → inngest.send(override.submitted, axis: 'stage_3_intent', …)`.
**Warning signs:** axis-3 `eval_type='capability'` rows where `decision === original_decision` show up in pipeline_events.

### Pitfall 5: `automation_runs.automation` value drives BOTH the realtime channel AND the loader filter
**What goes wrong:** Mismatch between (a) the channel name in `emitAutomationRunStale(admin, X)` and (b) the `automation` value in the row INSERT and (c) the `automations` array passed to `<AutomationRealtimeProvider>`. If any two disagree, the UI doesn't update.
**Why it happens:** Three separate code paths writing the same string.
**How to avoid:** Define `const KANBAN_AUTOMATION = '${swarm_type}-kanban'` once per page in a server-side const, pass it to all three sites.
**Warning signs:** Operator sees stale data; manual page refresh shows the row.

### Pitfall 6: `coordinator-orchestrator.ts` fan-out loop — partial dispatch on missing handler
**What goes wrong:** Phase 65 orchestrator fan-out (currently shipping but unreached after D-07) iterates over plan.handlers and dispatches each. If we DON'T retire the orchestrator entirely (D-07 keeps it in the codebase), and one of the fanned-out handlers has `handler_status='placeholder'`, the loop currently THROWS (line 100). Pre-Phase-76 behaviour: the whole orchestrator run fails. Post-Phase-76: should partial-success — registered handlers fan out, placeholder handlers each write a Kanban row.
**Why it happens:** Even though D-07 stops Stage 3.5 from firing, the file stays in the codebase per "Things to NOT touch."
**How to avoid:** Apply the same `handler_status` check inside `coordinator-orchestrator.ts:94-123` loop. Replace the `throw` at line 100 with an `automation_runs` Kanban INSERT for that intent, continue loop.
**Warning signs:** Future re-enablement of Stage 3.5 fails with "no handler for intent X" instead of degrading gracefully.

## Code Examples

### Example 1: `no_handler` check at single-shot dispatch site
```typescript
// web/lib/inngest/functions/debtor-email-coordinator.ts (modified around line 245-268)
// Source: existing dispatch site + new handler_status check.

if (decision.kind === "single_shot") {
  const top = output.ranked[0];
  const intent = await step.run("resolve-intent-row", async () => {
    const intents = await loadSwarmIntents(supabase, SWARM_TYPE);
    return intents.find((i) => i.intent_key === top.intent) ?? null;
  });
  if (!intent) {
    throw new Error(`no swarm_intents row for (${SWARM_TYPE}, ${top.intent})`);
  }

  if (intent.handler_status === "placeholder") {
    // no_handler trigger — write Kanban row instead of dispatching.
    await step.run("kanban-no-handler", async () => {
      const { error } = await supabase.from("automation_runs").insert({
        automation: `${SWARM_TYPE}-kanban`,
        swarm_type: SWARM_TYPE,
        status: "pending",
        topic: top.intent,
        entity,
        result: {
          kanban_reason: "no_handler",
          intent: top.intent,
          confidence: top.confidence,
          email_id,
          automation_run_id: automation_run_id ?? null,
          coordinator_run_id: run_id,
        },
        triggered_by: "stage-3-no-handler",
      });
      if (error) throw new Error(`kanban-no-handler insert: ${error.message}`);
      await emitAutomationRunStale(supabase, `${SWARM_TYPE}-kanban`);
    });
    // close out coordinator_runs cleanly so it doesn't dangle.
    await step.run("mark-coordinator-deferred", async () => {
      await supabase.from("coordinator_runs")
        .update({ completed_at: new Date().toISOString(), completed_handlers: 0 })
        .eq("run_id", run_id);
    });
    return { run_id, email_id, decision: "kanban_no_handler" as const };
  }

  // existing registered-handler dispatch path (unchanged from line 255-268)
  const handler_event = intent.handler_event;
  await step.run("dispatch-single-shot", async () => { /* … */ });
}
```

### Example 2: `low_confidence` Kanban write inside `escalation-gate.ts` caller
```typescript
// web/lib/inngest/functions/debtor-email-coordinator.ts (modified around line 293-312)
// Replaces the orchestrator dispatch with a Kanban write.

if (decision.kind === "orchestrator") {
  await step.run("kanban-low-confidence", async () => {
    const { error } = await supabase.from("automation_runs").insert({
      automation: `${SWARM_TYPE}-kanban`,
      swarm_type: SWARM_TYPE,
      status: "pending",
      topic: output.ranked[0].intent, // best-guess intent
      entity,
      result: {
        kanban_reason: "low_confidence",
        gate_reason: decision.reason, // 'low_confidence' | 'high_intent_count' | 'requires_orchestration_flag'
        ranked: output.ranked,
        email_id,
        automation_run_id: automation_run_id ?? null,
        coordinator_run_id: run_id,
      },
      triggered_by: "stage-3-low-confidence",
    });
    if (error) throw new Error(`kanban-low-confidence insert: ${error.message}`);
    await emitAutomationRunStale(supabase, `${SWARM_TYPE}-kanban`);
  });
  await step.run("mark-coordinator-deferred", async () => { /* same as no_handler */ });
  return { run_id, email_id, decision: "kanban_low_confidence" as const };
}
```

### Example 3: Stage 4 `onFailure` for `handler_error`
```typescript
// web/lib/inngest/functions/classifier-invoice-copy-handler.ts (config object at line 47-49)
// New onFailure callback added; everything else unchanged.

export const classifierInvoiceCopyHandler = inngest.createFunction(
  {
    id: "classifier/invoice-copy-handler",
    retries: 0,
    onFailure: async ({ error, event, step }) => {
      const admin = createAdminClient();
      // event.data.event is the original trigger event when retries are exhausted
      // (Inngest convention — see web/lib/inngest/functions/pipeline.ts:70).
      const orig = (event.data as unknown as { event: { data: Record<string, unknown> } }).event.data;
      await step.run("kanban-handler-error", async () => {
        const swarmType = (orig.swarm_type as string) ?? "debtor-email";
        await admin.from("automation_runs").insert({
          automation: `${swarmType}-kanban`,
          swarm_type: swarmType,
          status: "pending",
          topic: (orig.intent as string) ?? "invoice_copy_request",
          result: {
            kanban_reason: "handler_error",
            intent: orig.intent ?? "invoice_copy_request",
            email_id: orig.email_id,
            automation_run_id: orig.automation_run_id,
            error_detail: error.message,
            error_name: error.name,
          },
          triggered_by: "stage-4-onFailure",
        });
        await emitAutomationRunStale(admin, `${swarmType}-kanban`);
      });
    },
  },
  { event: "debtor-email/invoice-copy.requested" },
  async ({ event, step }) => { /* existing body unchanged */ },
);
```

### Example 4: Replay action (Server Action shape — Same-intent vs Edited-intent branch)
```typescript
// web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts
"use server";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadHandlerEvent } from "@/lib/swarms/registry";

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export async function replayKanbanRow(args: {
  kanbanRowId: string;
  emailId: string;
  originalIntent: string;
  chosenIntent: string;
  swarmType: string;
  operatorId: string;
  originalEventId: string; // pipeline_events.id of the Stage 3 emit
}) {
  const admin = createAdminClient();
  if (args.chosenIntent === args.originalIntent) {
    // Same-intent: bypass override handler, fire handler_event directly.
    const handlerEvent = await loadHandlerEvent(admin, args.swarmType, args.chosenIntent);
    if (!handlerEvent) throw new Error(`no handler_event for ${args.chosenIntent}`);
    await (inngest.send as unknown as SendFn)({
      name: handlerEvent,
      data: { email_id: args.emailId, triggered_by: "operator-replay-same-intent" },
    });
  } else {
    // Edited-intent: emit axis-3 override; handler resolves and dispatches.
    await (inngest.send as unknown as SendFn)({
      name: "debtor-email/override.submitted",
      data: {
        axis: "stage_3_intent",
        email_id: args.emailId,
        original_event_id: args.originalEventId,
        original_decision: args.originalIntent,
        decision: args.chosenIntent,
        decision_details: { intent_key: args.chosenIntent },
        eval_type: "capability",
        operator_id: args.operatorId,
      },
    });
  }
  // Close the Kanban row.
  await admin.from("automation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", args.kanbanRowId);
  await admin.channel(`automations:${args.swarmType}-kanban:stale`)
    .send({ type: "broadcast", event: "stale", payload: { at: new Date().toISOString() } });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stage 3.5 fan-out for low-confidence cases | Kanban human lane (D-07) | Phase 76 | LLM cost down; orchestrator file stays in codebase but unreached |
| Hardcoded handler-event-name map | `swarm_intents.handler_event` registry | Phase 68 | Adding intent = registry insert |
| Hardcoded handler-existence assumption (any registered intent has a worker) | `swarm_intents.handler_status` enum | Phase 76 | Onboarding cost: one column flip per shipped handler |
| try/catch in handler body for failure | Inngest per-function `onFailure` callback | (already standard in 6 funcs) | Auto-fires after retries exhausted |
| Bulk Review = the only operator surface for predicted rows | Bulk Review (Stage 1 noise QA) + Kanban (Stage 3+ unhandled) | Phase 76 | Cadence + persona separation |

**Deprecated/outdated:**
- The phrase "fire stage-3.5 event" in pre-Phase-76 docs and code comments — Phase 76 makes this code-reachable but never code-fired. Re-enablement requires a future phase + data justification.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 8 placeholder intents per CONTEXT.md (`address_change`, `contract_inquiry`, `copy_document_request`, `credit_request`, `general_inquiry`, `peppol_request`, `payment_dispute`, `other`) are EXACTLY the set with no Stage 4 handler today; only `invoice_copy_request` ships. [CITED: stage-3-coordinator.md lists 9 intents; verified `classifier-invoice-copy-handler.ts` is the only file matching `*-handler.ts` in the Stage 4 set] | Pattern 1 migration | If wrong, the migration sets `handler_status='placeholder'` for an intent that DOES have a handler → first email of that intent lands in Kanban instead of being processed. Detection: smoke test — pick a known-good intent post-migration, verify it dispatches not Kanbans. |
| A2 | `requires_orchestration` flag still reads from `swarm_noise_categories` (per `escalation-gate.ts:42`), but the RFC implies it should be on `swarm_intents`. | Pattern 3 threshold details | If the planner moves the column source mid-phase, escalation-gate behaviour changes. Detection: run existing `escalation-gate.test.ts` after any move. |
| A3 | Phase 70 (`pipeline_events` table) is fully landed by Phase 76. | Pitfall 3 | If wrong, axis-1 reclassify-as-noise overrides cannot reference an `original_event_id` for older emails. |
| A4 | `automation_runs.topic` has no CHECK constraint preventing arbitrary intent_key values. | "Schema / row shape on automation_runs" | [VERIFIED: `20260326_automation_runs.sql:5-6` and `20260428_automation_runs_typed_columns.sql:10` declare `topic text` with no CHECK or FK]. No risk. |
| A5 | Operators today only need a per-swarm Kanban view; no cross-swarm requirement. | D-10/D-11 | LOCKED in CONTEXT.md; cross-swarm is Phase 999.2. No risk for Phase 76. |
| A6 | Re-enabling the orchestrator (currently shipping) is NOT part of Phase 76. The file stays untouched per "Things to NOT touch" except for the `handler_status` check inside its fan-out loop (Pitfall 6). | Pattern 1 + Pitfall 6 | If the planner interprets "Things to NOT touch" strictly, the orchestrator stays without the check, leaving a latent throw if Stage 3.5 is ever re-enabled. Recommendation: APPLY the check (1-line change) as defensive coding. |

## Open Questions

1. **Codegen extension scope (A1's onboarding lifecycle).**
   - What we know: Phase 78 ships codegen for `swarm_intents.intent_key` literal-union. Adding `handler_status` is a new column on the same table; codegen could emit a "registered intents" subset type alongside the full intent enum.
   - What's unclear: should Phase 76's plan extend codegen now, or wait for Phase 78?
   - Recommendation: defer. Phase 76 plan only adds the column; Phase 78 absorbs codegen extension. Reduces Phase 76 scope and avoids two phases editing `web/scripts/gen-intent-types.ts`.

2. **Kanban row schema: is `automation_run_id` (the original Stage 3 run) on `result` enough, or do we need a FK column?**
   - What we know: CONTEXT.md "Schema / row shape" says "No new columns on automation_runs — it's a generic surface." `result.automation_run_id` is jsonb, so no FK enforcement.
   - What's unclear: future cross-row queries (e.g. "which Kanban rows came from which Stage 3 runs?") may want a real FK for join performance.
   - Recommendation: stick with jsonb for v1; revisit if Phase 79 dashboard needs the join.

3. **Kanban filter chip counts — server-rendered or client-aggregated?**
   - What we know: filter chips show counts per `kanban_reason`. The Bulk Review surface server-renders QueueTree counts via a separate SELECT.
   - What's unclear: whether to follow that pattern or aggregate client-side from the already-fetched `automation_runs` rows.
   - Recommendation: client-side aggregation. Realtime provider already fetches all rows for the swarm; counting them client-side is `O(rows)` and avoids a second SELECT round-trip.

## Environment Availability

Phase 76 is purely code + one column-add migration. No new external tools.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase service-role | All `automation_runs` writes | ✓ | — | — |
| Inngest cloud | Stage 3 dispatch + onFailure | ✓ (production already running) | — | — |
| Vercel deployment | Per-swarm route | ✓ (`agent-workforce` project) | — | — |

**Missing dependencies with no fallback:** None.

## Validation Architecture

> Phase 76 is pipeline-runtime + UI. Both need verification. Eight-dimensional strategy below applies the Nyquist convention from `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.x (verified in `web/vitest.config.ts`; existing `__tests__/*.test.ts` follow this) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run lib/inngest/functions/__tests__/<file>.test.ts` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements → Test Map

| Trigger / Action | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| `no_handler` | Stage 3 detects placeholder intent → Kanban INSERT, no `inngest.send` | unit | `npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "no_handler"` | ❌ Wave 0 (extend existing test file) |
| `low_confidence` | Gate `kind:'orchestrator'` → Kanban INSERT (NOT orchestrator dispatch) | unit | `npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "low_confidence"` | ❌ Wave 0 |
| `handler_error` | Stage 4 throws → onFailure writes Kanban row | unit | `npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts -t "onFailure"` | ❌ Wave 0 (test exists; add suite) |
| `escalation-gate` purity | Gate stays pure; behaviour unchanged | unit | `npx vitest run lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` | ✅ exists |
| `loadHandlerEvent` returns null when placeholder | Registry loader respects `handler_status` | unit | `npx vitest run lib/swarms/__tests__/registry.test.ts -t "handler_status"` | ❌ Wave 0 |
| Replay action — same-intent | Server Action bypasses override handler | unit | `npx vitest run app/\\(dashboard\\)/automations/\\[swarm\\]/kanban/actions/__tests__/replay.test.ts -t "same intent"` | ❌ Wave 0 |
| Replay action — edited-intent | Server Action emits axis-3 override | unit | same file `-t "edited intent"` | ❌ Wave 0 |
| Reclassify-as-noise | Server Action emits axis-1 override | unit | `…/__tests__/reclassify-noise.test.ts` | ❌ Wave 0 |
| Close action | Server Action UPDATES status + emits broadcast | unit | `…/__tests__/close.test.ts` | ❌ Wave 0 |
| Realtime channel naming | Kanban broadcasts to `${swarm_type}-kanban`, not `-review` | unit | `…/kanban/__tests__/page.test.tsx` (smoke) OR manual smoke | ⚠ likely manual smoke |
| Per-swarm route loads | RSC loads swarm registry; 404 on unknown swarm | smoke | manual: visit `/automations/debtor-email/kanban` then `/automations/foo/kanban` | manual |
| Optimistic removal | Action click hides row before server roundtrip | smoke | manual click-test | manual |

### Sampling Rate
- **Per task commit:** the unit test file(s) for that task (e.g., adding the `no_handler` check → run `debtor-email-coordinator.test.ts`).
- **Per wave merge:** `cd web && npx vitest run` (full suite green).
- **Phase gate:** Full Vitest suite + manual smoke through all three triggers (place an email known to be `low_confidence`; fail a handler manually via override-handler; insert a placeholder intent and verify Kanban row appears).

### Wave 0 Gaps
- [ ] Extend `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — add `no_handler` and `low_confidence`-now-Kanban suites.
- [ ] Extend `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` — add `onFailure` suite (Inngest test mock signature: `createFunction(cfg, trigger, handler)` — `cfg.onFailure` accessible from the captured config object).
- [ ] Extend `web/lib/swarms/__tests__/registry.test.ts` (or create) — add `handler_status` row-shape coverage; verify `loadSwarmIntents` includes the new column.
- [ ] Create `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/{close,replay,reclassify-noise}.test.ts` — Server Action unit tests with mocked `inngest.send` and Supabase admin client.
- [ ] Create `web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts` — verify SELECT shape + filter logic.
- [ ] Migration: add `supabase/migrations/2026MMDD_swarm_intents_handler_status.sql`.

### Eight-Dimensional Validation per Trigger / Action

**Convention:** S = purposeful Sample, I = Invariants, B = Behavior, BD = Boundaries, IX = Interactions, O = Observability, F = Failure modes, R = Regression.

#### Trigger: `no_handler`
- **S:** One email each for: (a) intent with `handler_status='registered'` (must dispatch, NOT Kanban); (b) intent with `handler_status='placeholder'` (must Kanban, NOT dispatch); (c) intent missing from `swarm_intents` entirely (must throw — pre-existing behaviour).
- **I:** Exactly one of {`inngest.send(handler_event)`, `automation_runs INSERT`} fires per Stage 3 single-shot dispatch. Never both, never neither.
- **B:** `result.kanban_reason='no_handler'`; `topic=<intent_key>`; `swarm_type` matches; `automation='${swarm_type}-kanban'`.
- **BD:** Empty `swarm_intents` table → throw. `handler_status` value not in enum → migration CHECK rejects it. Intent with `handler_status='registered'` but `handler_event` empty string → throw (pre-existing path).
- **IX:** Realtime broadcast fires on `automations:${swarm_type}-kanban:stale`. `coordinator_runs` row marked `completed_at` (no dangling row).
- **O:** A new `pipeline_events` row stamped `stage=3` (existing emit at line 200) PLUS the Kanban row are both queryable. Operator can join to find why a Stage 3 ranked-list led to Kanban.
- **F:** DB INSERT fails → caller's `try/catch` (line 320-340) marks `automation_runs` parent failed. Realtime broadcast fails → logged warning, not thrown (per `emit.ts:30`).
- **R:** Existing `single-shot dispatches via swarm_intents` test (line 395 in `debtor-email-coordinator.test.ts`) stays green; new `no_handler` cases added.

#### Trigger: `low_confidence`
- **S:** Three emails covering each escalation reason: `low_confidence` (`ranked[0].confidence==='low'`), `high_intent_count` (`ranked.length>=3`), `requires_orchestration_flag` (any ranked intent with the flag).
- **I:** Gate decision `kind:'orchestrator'` → Kanban write, NEVER `inngest.send('debtor-email/orchestrator.requested')`. Gate decision `kind:'single_shot'` → no Kanban write.
- **B:** `result.kanban_reason='low_confidence'`; `result.gate_reason` carries the original gate reason (`low_confidence`/`high_intent_count`/`requires_orchestration_flag`).
- **BD:** `ranked.length === 2` with `confidence==='medium'` and no flag → `single_shot` (no Kanban). `ranked.length === 3` with all `'high'` confidence → still Kanban (count test fires).
- **IX:** Same coordinator_runs / pipeline_events writes as no_handler; Realtime broadcast.
- **O:** `coordinator_runs.escalation_reason` (already persisted at line 230) carries the gate reason; cross-references the Kanban row's `result.gate_reason`.
- **F:** Same as no_handler.
- **R:** `escalation-gate.test.ts` stays green (gate unchanged); coordinator-test gains "kind:'orchestrator' → Kanban not orchestrator-event" assertion.

#### Trigger: `handler_error`
- **S:** Mocked Stage 4 handler that throws (`classifier-invoice-copy-handler.ts` test mocks the body). Run with `retries: 0`.
- **I:** `onFailure` fires exactly once per failed run. Kanban INSERT is idempotent on Inngest replay (the row's PK is DB-default UUID; replay generates a new row, so each replay would create a duplicate — verify Inngest does NOT replay onFailure on success).
- **B:** `result.kanban_reason='handler_error'`; `error_detail=error.message`; `intent`, `email_id`, `automation_run_id` all populated from `event.data.event.data`.
- **BD:** `error.message` empty / undefined → store empty string, don't throw. `event.data.event.data.swarm_type` undefined → fallback to `'debtor-email'` literal IS acceptable here because onFailure has narrower payload knowledge than other call sites; alternatively reject the row to surface the bug.
- **IX:** Original `automation_runs` row of the failed handler is independently marked `failed`; the Kanban row is a SEPARATE row referencing the failed one's id.
- **O:** Operator can navigate from Kanban row → original `automation_runs.id` via `result.automation_run_id`.
- **F:** Inngest's onFailure itself throws → Inngest logs but no further action (retries: 0). Kanban write fails → operator never sees the failure (no automatic recovery). Mitigation: monitor `automation_runs WHERE status='failed' AND created_at > now()-1h` and cross-reference to confirm a Kanban row exists per failed run.
- **R:** Existing handler tests stay green; new test uses Inngest test harness's `cfg.onFailure` capture (pattern: `createFunction: vi.fn((cfg, trigger, handler) => ({ cfg, trigger, handler }))`).

#### Action: Close
- **S:** Click on Kanban row of each `kanban_reason`.
- **I:** Optimistic removal (pendingRemovalIds add) → server UPDATE `status='completed'` → realtime stale → server-fetched rows lack the row → pendingRemovalIds drops the id (verified pattern at `selection-context.tsx:71-85`).
- **B:** `automation_runs.status='completed'`, `completed_at` set, no other column changes.
- **BD:** Click-twice → second UPDATE no-ops (status already completed). Network failure → optimistic-removal rollback (the row stays in `rowIds`, pendingRemovalIds keeps it filtered until the server-fetched rows confirm — but if the UPDATE never happened, the row stays and gets re-shown on next fetch).
- **IX:** Realtime broadcast on the Kanban channel.
- **O:** A `pipeline_events` row at this point would be useful for "operator closed without action" telemetry (Phase 79). For Phase 76 v1, no pipeline_events emit on Close.
- **F:** Server Action throws → caller surfaces error to UI; pendingRemovalIds NOT updated.
- **R:** No regression scope — net-new code path.

#### Action: Replay (same-intent vs edited-intent)
- **S:** Same-intent: pick a `low_confidence` row, accept top intent. Edited-intent: pick a row, change intent in dropdown, confirm.
- **I:** Same-intent → exactly one `inngest.send(handler_event, …)` call, NO `pipeline_events` axis-3 row, NO `override.submitted` event. Edited-intent → exactly one `inngest.send('debtor-email/override.submitted', …)`, override handler then writes pipeline_events + dispatches.
- **B:** Both branches close the Kanban row (`status='completed'`).
- **BD:** Edited-intent where new intent has `handler_status='placeholder'` → override handler at line 191 throws "unknown intent_key" — but the intent EXISTS, just isn't registered. Action: extend override handler to check `handler_status` → if placeholder, write Kanban row referencing the operator's correction (effectively, operator-corrected `no_handler`). Out of scope for Phase 76 v1; v1 throws and the old Kanban row reopens. Document.
- **IX:** Verdict-worker chain (axis-1) and override handler chain (axis-3) both already tested — Phase 76 only adds caller tests.
- **O:** Edited-intent emits axis-3 `pipeline_events` row → Phase 79 prompt-tune trigger consumes.
- **F:** `inngest.send` fails → Server Action throws → UI surfaces; row stays open.
- **R:** Override-handler tests stay green.

#### Action: Reclassify-as-noise
- **S:** Kanban row with each `kanban_reason`; pick each of the 4 dropdown noise keys.
- **I:** Exactly one `inngest.send('debtor-email/override.submitted', { axis: 'stage_1_category', … })`. No direct Outlook call. Kanban row closed.
- **B:** Override handler dispatches `classifier/verdict.recorded` → verdict-worker categorizes + archives the email + queues iController cleanup automation_run (per Phase 68 SWRM-04 side-effects pipeline). Same as if Bulk Review had reclassified.
- **BD:** Operator picks `payment_admittance` for an email that's NOT Dutch → still works (label-resolver doesn't language-gate). Original Stage 1 emit-row is `unknown` (else email wouldn't reach Stage 3) → axis-1 override's `original_decision='unknown'`.
- **IX:** All Phase 1 side effects fire (Outlook label, Outlook archive, iController cleanup queue) — this is exactly the "regress as noise" path.
- **O:** Phase 79 surfaces these as Stage 1 LLM precision misses (CONTEXT.md D-03 elaboration).
- **F:** Verdict-worker fails (e.g., Outlook API down) → automation_run for the verdict is marked `failed`, Kanban row stays closed (the override emit succeeded; downstream side-effect failed). Operator sees the original email surface back as a `failed` automation_run, NOT a Kanban row. Acceptable for v1 — flagged as known gap.
- **R:** verdict-worker tests + override-handler tests stay green.

## Implementation Seams

Exact file:line locations where Phase 76 plugs in. **No proposed code changes here** — only seams.

| Seam | File | Line(s) | Phase 76 plug type |
|------|------|---------|--------------------|
| Single-shot dispatch — `no_handler` check | `web/lib/inngest/functions/debtor-email-coordinator.ts` | 245-268 | Insert `handler_status` check between `loadHandlerEvent` resolve and `inngest.send` |
| Orchestrator branch — `low_confidence` Kanban write | `web/lib/inngest/functions/debtor-email-coordinator.ts` | 293-312 | Replace `inngest.send('debtor-email/orchestrator.requested')` body with Kanban INSERT |
| Orchestrator fan-out — `no_handler` per-intent (defensive) | `web/lib/inngest/functions/coordinator-orchestrator.ts` | 94-123 | Add `handler_status` check inside the for-of loop; replace throw at 100 with Kanban INSERT + `continue` |
| Stage 4 onFailure | `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` | 47 (config object) | Add `onFailure` callback alongside `id` and `retries` |
| Registry loader — `handler_status` field | `web/lib/swarms/registry.ts` | 80-100 (`loadSwarmIntents`) | No code change; `select("*")` already pulls new column |
| Registry types | `web/lib/swarms/types.ts` | 67-75 (`SwarmIntentRow`) | Add `handler_status: 'registered' \| 'placeholder'` field |
| Migration | `supabase/migrations/` | NEW file | `ALTER TABLE swarm_intents ADD COLUMN handler_status …` + UPDATE for placeholders |
| Per-swarm route | `web/app/(dashboard)/automations/[swarm]/kanban/page.tsx` | NEW file | Mirror `[swarm]/review/page.tsx:1-100` shape |
| Realtime provider mount | (same file) | within JSX | `<AutomationRealtimeProvider automations={['${swarm_type}-kanban']}>` |
| Selection context | `web/app/(dashboard)/automations/[swarm]/kanban/selection-context.tsx` | NEW file | Verbatim copy of `[swarm]/review/selection-context.tsx` |
| Server Actions | `web/app/(dashboard)/automations/[swarm]/kanban/actions/{close,replay,reclassify-noise}.ts` | NEW files | Each one inserts `inngest.send` of the appropriate event + UPDATEs the Kanban row |
| Realtime broadcast helper | `web/lib/automations/runs/emit.ts` | (existing) | No change — `emitAutomationRunStale(admin, '${swarm_type}-kanban')` works as-is |
| Override handler axis-1 | `web/lib/inngest/functions/debtor-email-override-handler.ts` | 103-160 | No change — already routes to verdict-worker correctly |
| Override handler axis-3 | `web/lib/inngest/functions/debtor-email-override-handler.ts` | 184-202 | No change — dispatches looked-up handler_event |

## Risks / Unknowns

1. **R-1 (LOW):** `automation_runs.automation` value naming convention. If Bulk Review's `automation='${swarm_type}-review'` is wrong, the Kanban naming convention is wrong too. Verified at migration `20260428_automation_runs_typed_columns.sql:42`. No risk.

2. **R-2 (LOW):** Inngest `onFailure` signature drift. The version in `package.json` may have a different signature than what `pipeline.ts:70` uses. Verified shape in 6 files; consistent. The `event.data.event.data` re-nesting (Inngest wraps the original event payload under `event.data.event`) is the documented Inngest convention.

3. **R-3 (MEDIUM):** Reclassify-as-noise depends on the original Stage 1 emit-row existing in `pipeline_events`. If Phase 70 telemetry was not yet emitting at the time the email entered the pipeline, the `original_event_id` is unavailable. **Mitigation:** Kanban loader joins to `pipeline_events` and surfaces the `event_id` to the action; if null, the action either (a) fails-loud "no Stage 1 event to override" or (b) emits the override with `original_event_id=null` if schema allows. Planner must verify.

4. **R-4 (MEDIUM):** Edited-intent Replay where the new intent has `handler_status='placeholder'`. The override handler at line 184-202 looks up the handler_event from `swarm_intents` and dispatches blindly — it does NOT check `handler_status`. So an operator correcting `payment_dispute → credit_request` would dispatch `credit_request`'s handler_event, which has no listener. Inngest will accept the send but no worker runs. **Mitigation:** Phase 76 plan extends `debtor-email-override-handler.ts:184-202` to check `handler_status` and emit a Kanban row instead of dispatching when placeholder. This is a 1-block addition.

5. **R-5 (LOW):** Stage 3.5 orchestrator file (`coordinator-orchestrator.ts`) becomes dead code per D-07. CONTEXT.md says "don't DELETE the orchestrator." Future re-enablement would need the same `handler_status` check (Pitfall 6); recommend applying the check in 76 even though the file is unreached.

6. **R-6 (LOW):** Cross-swarm test (sales-email Phase 78). CONTEXT.md says any `swarm_type === 'X'` literal in Kanban code is a 76 bug. Validation: grep `web/app/(dashboard)/automations/[swarm]/kanban/**` for the strings `debtor-email`, `sales-email`. Should match zero. Same grep on `web/lib/inngest/functions/` for the new code paths — should ONLY match `SWARM_TYPE` constants and the existing pre-Phase-76 literals (none added by 76).

7. **R-7 (LOW):** Realtime row-count cap (Pitfall 2). 200-row default may cap older rows; planner picks 500 or 1000.

## Sources

### Primary (HIGH confidence)
- `docs/agentic-pipeline/README.md` — 5-stage funnel + tenancy
- `docs/agentic-pipeline/stage-3-coordinator.md` — `swarm_intents` shape, hard separation rule, registry-driven principle
- `docs/agentic-pipeline/override-model.md` — 4-axis override taxonomy, axis-1 / axis-3 contracts
- `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` — pure function shape + threshold details (lines 24-52)
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — single-shot dispatch site (lines 237-291), orchestrator dispatch site (293-312)
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — fan-out loop (94-123)
- `web/lib/inngest/functions/debtor-email-override-handler.ts` — axis-1 (103-160), axis-3 (184-202) emit shapes
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — verdict-worker (registry-driven dispatch + side-effects loop)
- `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` — Stage 4 handler shape (line 47)
- `web/lib/inngest/functions/pipeline.ts:70` — verified `onFailure` callback signature
- `web/lib/swarms/registry.ts` — `loadSwarmIntents`, `loadHandlerEvent`, cache pattern
- `web/lib/swarms/types.ts:66-75` — `SwarmIntentRow` shape
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` — per-swarm route pattern (1-100)
- `web/app/(dashboard)/automations/[swarm]/review/selection-context.tsx` — optimistic removal pattern (full file, 1-123)
- `web/lib/automations/runs/emit.ts` — `emitAutomationRunStale` channel naming
- `web/components/automations/automation-realtime-provider.tsx` — multi-channel subscription
- `supabase/migrations/20260326_automation_runs.sql` — base schema (no CHECK on topic)
- `supabase/migrations/20260428_automation_runs_typed_columns.sql` — `swarm_type`, `topic`, `entity` columns + `automation_runs_swarm_status_created_idx`
- `web/node_modules/inngest/index.d.ts` — verified Inngest SDK exports do NOT include client-level function-list introspection
- `web/node_modules/inngest/components/InngestCommHandler.js:191` — verified `this.fns` map is private to the serve-handler

### Secondary (MEDIUM confidence)
- CLAUDE.md — Inngest patterns (replay-id rule, `inngest.send` binding rule, registry-driven principle, "Build-time codegen for registry-driven literal-union TS types")

### Tertiary (LOW confidence)
- None — every claim verified against in-tree files.

## Metadata

**Confidence breakdown:**
- `no_handler` mechanism (registry column vs introspection): HIGH — verified Inngest SDK has no client-level introspection
- `low_confidence` repurpose (escalation-gate stays pure, caller changes): HIGH — verified by reading the gate (pure function) and the caller (sole site of `inngest.send` for orchestrator)
- `handler_error` capture via `onFailure`: HIGH — 6 existing functions, signature consistent
- Override-handler axis-1/axis-3 reuse: HIGH — code-verified at the exact line ranges cited
- Per-swarm route pattern: HIGH — Bulk Review pattern is established and proven
- Realtime channel separation: HIGH — `emitAutomationRunStale(admin, name)` argument is the channel discriminator
- Reclassify-as-noise dispatch chain: HIGH — verified end-to-end (override-handler → classifier/verdict.recorded → verdict-worker → categorize_archive → side-effects)
- Edge case R-4 (edited-intent replay to placeholder intent): MEDIUM — needs explicit handling in plan

**Research date:** 2026-05-07
**Valid until:** 30 days (stable architecture; only Phase 78 codegen could shift the column-modeling for `handler_status`, and that's deferred per Open Question 1)

## RESEARCH COMPLETE
