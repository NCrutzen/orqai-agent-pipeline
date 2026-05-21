# Phase 71: Bulk Review 4-axis redesign + capability/regression eval split — Context

**Gathered:** 2026-05-05
**Status:** Ready for /gsd-ui-phase (UI hint = yes) → planning
**Mode:** `--auto` (Claude selected recommended option for each gray area; user can revise before plan-phase)

<domain>
## Phase Boundary

Light up the override emit code paths and operator UI so Bulk Review operators can independently override at any of the 4 pipeline stages (regex match, entity resolution, intent coordination, handler output), each producing a distinct learning signal tagged as either `capability` (a new case the model never handled correctly before) or `regression` (a case that used to work but stopped — typically after a model swap). Phase 70 shipped the schema scaffolding (`pipeline_events.override jsonb`, `pipeline_events.eval_type text`, both NULL); Phase 71 fills them with real operator data and exposes the 4 axes in the Bulk Review UI.

In scope (REVW-01..06):

1. **REVW-01 — Stage 1 override:** Operator re-routes wrong-category email to noise / archive / different category. Original Stage 1 verdict preserved as audit (kept as-is in `pipeline_events`); override emits a new `pipeline_events` row with `override` jsonb populated.
2. **REVW-02 — Stage 2 override:** Operator corrects `customer_account_id`. UI offers a toggle "re-run Stage 3+4 with the corrected customer" (default off — re-runs cost LLM tokens).
3. **REVW-03 — Stage 3 override:** Operator picks a different handler-agent from the registry; original Stage 4 output is discarded; new event is dispatched to the chosen handler.
4. **REVW-04 — Stage 4 override:** Operator captures `draft_quality` (1-5 scale) + free-text `reason`. Does NOT re-run the handler — this drives prompt-tuning data for Phase 72.
5. **REVW-05 — eval_type tagging:** Operator tags every override as `capability` or `regression` via a single radio in the UI. Default = `regression` (safety bias — model swaps that break previously-correct decisions are the higher-cost failure mode).
6. **REVW-06 — Per-email aggregated row:** Bulk Review shows ONE row per email aggregating all 4 stage decisions + per-run cost (SUM `cost_cents`) + tool calls (rolled up from `decision_details` jsonb). Implemented as a Postgres view `public.pipeline_events_email_summary` atop `pipeline_events`, NOT a new table. Same view powers operator browsing AND the Phase 72 promotion recommender's input feed.

Out of scope (explicitly deferred):

- **`promotion_candidates` table + Learning Inbox UI + auto-promotion of override patterns into deterministic rules** — Phase 72 (LERN-01..05).
- **Auto-detect of capability vs regression** (heuristic over historical model runs) — Phase 72. Phase 71 is operator-tagged only.
- **Sales-email swarm** (Phase 73). Phase 71 implements debtor-email overrides; sales-email overrides emerge automatically from registry-driven UI when Phase 73 lands.
- **Schema-level hard constraints** on `eval_type` vocabulary or override.axis vocabulary — same YAGNI stance as Phase 69 D-09. Add CHECK constraints in a later phase only if production data shows drift.
- **Override of override** (operator changes their mind after submitting) — single-shot for v1. Document as a known limitation; an operator who needs to revise edits the row directly via Supabase MCP.
- **Bulk override** (apply same override to many rows at once) — out of scope. Bulk Review is per-email.
- **Mobile/tablet layouts** for Bulk Review — desktop-only operator workflow. UI-SPEC may set a min-width if needed.

</domain>

<decisions>
## Implementation Decisions

### Override emit shape (formalising Phase 70 D-11)

- **D-01: `pipeline_events.override` jsonb shape:**
  ```jsonc
  {
    "axis": "stage_1_category" | "stage_2_customer" | "stage_3_intent" | "stage_4_handler_output",
    "original_decision": "<text — verbatim copy of the row being overridden>",
    "original_event_id": "<uuid — the pipeline_events.id of the first-pass row>",
    "operator_id": "<uuid — auth.uid() at override time>",
    "reason": "<text — free-text, optional, max 1000 chars>",
    "submitted_at": "<timestamptz>"
  }
  ```
  `eval_type` lives in its own column (Phase 70 D-12) — NOT inside the override jsonb. Two columns means simpler indexing and no jsonb path queries on the hot read path.

- **D-02: One override = one new `pipeline_events` row.** The original first-pass row is preserved unchanged (audit). The override row carries `override` jsonb populated, `eval_type` set, `triggered_by='operator-override'`, and `decision` = the corrected value. Stage downstream of an override emits its own row with `triggered_by='operator-override-replay'` so the audit trail makes the chain explicit.

- **D-03: 4-axis vocabulary is closed.** `axis ∈ {stage_1_category, stage_2_customer, stage_3_intent, stage_4_handler_output}`. Documented in `web/lib/pipeline-events/types.ts`. No CHECK constraint (matches the broader Phase 70 stance); a TS literal-union enforces at compile time.

### Per-stage override behaviour

- **D-04: Stage 1 override (REVW-01).** Reuses the existing `classifier-verdict-worker.ts` operator path (already handles `approve` + `override_category`); Phase 71 wraps it to:
  1. Emit the override row to `pipeline_events` first.
  2. Then execute the existing reroute logic (write/skip the email_label, dispatch downstream worker if the new category has `action='swarm_dispatch'`).
  Original verdict-worker logic stays — Phase 71 is additive.

- **D-05: Stage 2 override (REVW-02).** Operator submits corrected `customer_account_id` + a `re_run_downstream` boolean toggle (default `false`).
  - Always: emit the override row + update the corresponding `coordinator_runs.customer_account_id`.
  - If `re_run_downstream=true`: re-emit the `debtor-email/coordinator-complete` event so Stage 3+4 re-run with the corrected customer. Old Stage 3+4 rows in `pipeline_events` stay (audit).
  - Why default off: Stage 3+4 cost LLM tokens; the common case is "operator corrected the customer for accounting/audit reasons but the existing draft is still fine".

- **D-06: Stage 3 override (REVW-03).** Operator picks a handler-agent from the registry (`public.swarms.swarm_intents` rows where `swarm_type='debtor-email'`) — UI shows a dropdown. Phase 71:
  1. Emit override row.
  2. Discard the original Stage 4 output (keep it in `pipeline_events` as audit; do NOT delete the iController draft if one was created — operator manages that separately).
  3. Dispatch the appropriate `<handler>.requested` Inngest event for the new handler.

- **D-07: Stage 4 override (REVW-04).** Operator submits `draft_quality` (smallint, 1-5) + `reason` (text, optional). Phase 71:
  1. Emit override row with `decision='draft_quality_rated'`, `decision_details = { draft_quality: 1..5, reason: text }`.
  2. Does NOT re-run the handler. Does NOT modify the iController draft.
  3. Stage 4 prompt-tuning data accrues for Phase 72.

### eval_type tagging (REVW-05)

- **D-08: eval_type is operator-tagged at override time, not auto-detected.** Single radio in the UI: `capability` | `regression`. Default selection = `regression` (safety bias).
  - **Definitions (operator guidance, surfaced in UI tooltip):**
    - `regression`: this case used to work correctly before the most recent model/prompt change.
    - `capability`: this case has never been handled correctly OR is a brand-new pattern.
  - Auto-detect heuristic (compare against historical Stage outputs to classify automatically) is deferred to Phase 72.

### Per-email aggregated view (REVW-06)

- **D-09: One row per email implemented as `public.pipeline_events_email_summary` view, NOT a new table.** Migration `supabase/migrations/20260507a_pipeline_events_email_summary.sql` creates the view. Shape:
  ```sql
  CREATE VIEW public.pipeline_events_email_summary AS
  SELECT
    email_id,
    swarm_type,
    -- per-stage latest decision (with override applied if present)
    (... distinct-on per stage ...) AS stage_0_decision,
    (... ...)                       AS stage_1_decision,
    (... ...)                       AS stage_2_decision,
    (... ...)                       AS stage_3_decision,
    (... ...)                       AS stage_4_decision,
    -- per-stage override flag (true if any pipeline_events row for this stage has override IS NOT NULL)
    (... ...)                       AS stage_1_overridden,
    (... ...)                       AS stage_2_overridden,
    (... ...)                       AS stage_3_overridden,
    (... ...)                       AS stage_4_overridden,
    -- aggregates
    SUM(cost_cents)                 AS total_cost_cents,
    COUNT(*) FILTER (WHERE stage = 4 AND decision_details ? 'tool_calls') AS tool_call_count,
    MIN(created_at)                 AS first_event_at,
    MAX(created_at)                 AS last_event_at
  FROM public.pipeline_events
  GROUP BY email_id, swarm_type;
  ```
  Why view, not table:
  - Authoritative source stays `pipeline_events` (single source of truth, Phase 70 invariant).
  - View is automatically up-to-date — no dual-write maintenance.
  - Bulk Review reads it directly; Phase 72 recommender reads it. Same shape, both consumers.
  - If perf becomes an issue (10k+ emails), Phase 71 ships `CREATE INDEX` on `(email_id, stage, created_at DESC)` — view query is index-friendly. Materialized view is deferred to a later phase.

- **D-10: Bulk Review reads the new view, not raw `pipeline_events`.** Phase 70-06 rewired sub-queries (2)+(6) to read raw `pipeline_events`. Phase 71 swaps that to read `pipeline_events_email_summary` for the predicted-row feed (one row per email, naturally). Selected-row detail keeps reading raw `pipeline_events` (operator wants the per-stage event timeline when drilling in).

### Backend wiring

- **D-11: Override submit happens via Inngest events, not direct DB writes.** Existing pattern (verdict-worker for Stage 1) is the template:
  - UI POSTs to `/api/automations/debtor-email/override` (new route).
  - Route validates payload, calls `inngest.send({ name: 'debtor-email/override.submitted', data: { axis, email_id, ... } })`.
  - New Inngest function `debtor-email-override-handler` consumes the event, emits the override row, and triggers the per-axis behaviour (D-04..D-07).
  - Why event-driven: matches the rest of the pipeline architecture (CLAUDE.md §Inngest); keeps the route fast (<100ms); replay-safe by construction.

- **D-12: One Inngest function per override axis OR one fan-out function — pick the latter.** Single `debtor-email-override-handler` with a switch on `data.axis`. Less code surface, easier to reason about end-to-end. Each axis path stays inside its own `step.run("axis-{N}-override", ...)`.

### Security / threat model touchpoints

- **D-13: `operator_id` is captured server-side from the authenticated session — never trusted from the client payload.** UI POSTs the override fields only; the route extracts `auth.uid()` from the Supabase server session and stamps `override.operator_id`. Prevents impersonation.

- **D-14: `reason` text is sanitised before storage and before render.** Max 1000 chars, escape HTML on render. PII discipline: same posture as Phase 70 — `decision_details` may contain email-derived strings; RLS service-role-write + authenticated-select gates access. No new RLS policies needed.

- **D-15: Override is NOT auto-applied to the iController draft.** When Stage 3 or Stage 4 override fires, the iController draft (if created) is left untouched. Operator manages the draft separately in iController. Surfaces in UI as an info-banner: "Override recorded — please update the draft in iController separately."

### UI (deferred to /gsd-ui-phase)

- **D-16: UI design contract (component shapes, layout, interaction details, empty states, loading skeletons, error feedback) is OUT OF SCOPE for this CONTEXT.md.** Phase 71 has `**UI hint**: yes` in ROADMAP — `/gsd-ui-phase 71` runs next and produces `71-UI-SPEC.md` BEFORE plan-phase. UI-SPEC will lock:
  - 4 per-stage override widgets (Stage 1 = category dropdown; Stage 2 = customer search + re-run toggle; Stage 3 = handler-agent dropdown; Stage 4 = 1-5 quality scale + reason textarea)
  - eval_type radio (capability | regression)
  - Per-email aggregated row layout (4 stage columns, override flags, cost rollup)
  - Confirmation modal before submit (overrides emit Inngest events that re-run downstream stages — not undo-able)

- **D-17: UI lives in `web/app/(dashboard)/automations/[swarm]/review/`.** Same dashboard route as Bulk Review feed. New components co-located. Reuses the existing Card / Dialog / RadioGroup / Select primitives from `web/components/ui/`.

### Claude's Discretion

- Exact migration filename for the view (likely `20260507a_pipeline_events_email_summary.sql`) — planner picks per convention.
- Whether to expose the override route under `/api/automations/debtor-email/override` or `/api/automations/debtor/override` — match existing pattern from neighbour routes.
- Test fixture co-location (per-axis test in handler tests vs new `override-handler.test.ts`) — planner picks.
- Confirmation modal copy + iController-draft-warning copy — UI-SPEC owns this.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline + telemetry foundation (Phase 70 + earlier)
- `.planning/phases/70-telemetry-consolidation-pipeline-events/70-CONTEXT.md` §D-10..D-13 — Phase 70's forward-compat scaffolding for `override` jsonb + `eval_type` + override semantics. Phase 71 lights it up.
- `.planning/phases/70-telemetry-consolidation-pipeline-events/70-VERIFICATION.md` — confirms all 5 emit sites are live and the schema is in production.
- `web/lib/pipeline-events/types.ts` — `PipelineEventInput` + `numericConfidence` helper. Phase 71 extends with the override axis literal-union type.
- `web/lib/pipeline-events/emit.ts` — `emitPipelineEvent` helper used at every override emit site.
- `supabase/migrations/20260506a_pipeline_events.sql` — live schema (table + RLS + Realtime).

### Pipeline architecture
- `docs/agentic-pipeline/README.md` — Stage 0→4 architecture; the 4-axis override model is the canonical operator interaction with this funnel.
- `docs/debtor-email-pipeline-architecture.md` — concrete debtor-email implementation map; Phase 71 modifies Stage 1 (verdict-worker), Stage 2 (label-resolver), Stage 3 (coordinator), Stage 4 (invoice-copy-handler) override paths.
- `docs/agentic-pipeline/promotion-recommender.md` — Phase 72 stub describing how `pipeline_events.override` + `eval_type` feed the promotion recommender. Phase 71 produces the data Phase 72 consumes.

### Existing operator-decision plumbing (Phase 56-02)
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — current Stage 1 approve/reject/override-category path. Phase 71 D-04 extends it.
- `web/lib/automations/debtor-email/coordinator/coordinator-complete.ts` — Stage 3 fan-in synthesis; Phase 71 D-06 dispatches new handler events through here.

### Read-side (Bulk Review)
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` — `loadPageData`. Phase 70-06 rewired to `pipeline_events`; Phase 71 swaps to the new view per D-10.
- `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` — test pattern for Bulk Review query rewires.

### Project-level
- `.planning/REQUIREMENTS.md` §REVW-01..06 — phase requirements verbatim.
- `CLAUDE.md` §Inngest — replay-safety + step.run discipline (D-11, D-12 both depend on this).
- `CLAUDE.md` §Supabase — service-role pattern + view migration via Supabase MCP at operator-gated checkpoint.
- `docs/inngest-patterns.md` — replay-safe id-generatie, this-binding rules. Phase 65 lessons.

### Prior CONTEXT (decisions still in force)
- `.planning/phases/68-swarm-registry-generalisation-canonical-context-shape/68-CONTEXT.md` — `swarms.swarm_intents` registry shape that Stage 3 override consumes (D-06).
- `.planning/phases/69-handler-agent-canonicalisation-cross-swarm-reuse/69-CONTEXT.md` — `swarm_type='cross-cutting'` convention for the body agent that Stage 4 override quality scoring tunes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`emitPipelineEvent`** (Phase 70 helper) — Phase 71 calls it from the override handler with `override` + `eval_type` populated. No new helper needed.
- **`classifier-verdict-worker.ts`** — already has the approve/reject/override-category code path. D-04 wraps it; ~80% of Stage 1 override is already shipped.
- **`/api/automations/debtor-email/ingest/route.ts`** — pattern for new `/override` route (Next.js API handler + service-role admin client + Inngest event send).
- **`web/components/ui/Select`, `Dialog`, `RadioGroup`** — shadcn primitives used elsewhere in the dashboard. UI-SPEC will reuse, not re-design.

### Established Patterns
- Override flow = UI POST → API route → Inngest event → handler function (matches every other operator-driven automation in the project).
- All `pipeline_events` writes use `emitPipelineEvent` (single helper, single shape).
- Service-role admin client server-side; never client-side `from()` calls into pipeline_events.

### Integration Points
- **`web/lib/inngest/functions/classifier-verdict-worker.ts`** — Stage 1 override emit injection (D-04).
- **`web/lib/inngest/functions/classifier-label-resolver.ts`** — Stage 2 customer correction handler (D-05).
- **`web/lib/inngest/functions/debtor-email-coordinator.ts`** — Stage 3 re-emit dispatch (D-06).
- **`web/lib/inngest/functions/classifier-invoice-copy-handler.ts`** — Stage 4 quality-rating hook (D-07; emit-only, no re-run).
- **NEW:** `web/lib/inngest/functions/debtor-email-override-handler.ts` — central fan-out per D-12.
- **NEW:** `web/app/api/automations/debtor-email/override/route.ts` — UI POST endpoint per D-11.
- **NEW:** `supabase/migrations/20260507a_pipeline_events_email_summary.sql` — view per D-09.
- **`web/app/(dashboard)/automations/[swarm]/review/page.tsx`** — read-side rewire to view per D-10.

</code_context>

<specifics>
## Specific Ideas

- The 4-axis taxonomy (`stage_1_category`, `stage_2_customer`, `stage_3_intent`, `stage_4_handler_output`) is canonical — used in code, in DB strings, in the UI tooltip, and in Phase 72's promotion recommender input. Do NOT rename in Phase 71.
- `eval_type` default = `regression` is a deliberate safety bias — operators are more likely to forget to switch it to `capability` than the reverse, and a `regression` mistag is the lower-cost error (Phase 72 will treat regressions as higher-priority promotions).
- The view (D-09) is a strict aggregation — no JOINs to other tables. Adding `customer_name` or `email_subject` to the row requires the consumer to join `email_pipeline.emails` themselves, which `loadPageData` already does for the existing predicted-row feed.

</specifics>

<deferred>
## Deferred Ideas

- **`promotion_candidates` table + Learning Inbox UI** — Phase 72 (LERN-01..05).
- **Auto-detect capability vs regression** — Phase 72 (heuristic over historical model runs).
- **Override of override / undo** — known v1 limitation; manual edit via Supabase MCP.
- **Bulk override** (apply same correction to N rows) — not requested by operator workflow today; revisit if patterns emerge.
- **Materialised view for `pipeline_events_email_summary`** — defer until raw view query latency exceeds Bulk Review's UX budget.
- **CHECK constraints** on `eval_type` and `override.axis` — defer until production data shows drift.
- **Mobile/tablet Bulk Review** — operator workflow is desktop-only.
- **Override-driven retraining loop for the classifier model** — out of scope for v1; Phase 72's promotion recommender writes config/migration changes, NOT model training data.
- **Reviewed Todos (not folded):**
  - `2026-04-22-resolve-postgrest-exposed-schemas-for-email-insights.md` — independent (`email_insights` schema is unrelated).
  - `2026-03-26-zapier-analytics-browser-automation.md` — unrelated.

</deferred>

---

*Phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split*
*Context gathered: 2026-05-05*
