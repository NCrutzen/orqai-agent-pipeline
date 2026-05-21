# Phase 76: Stage 3 → Kanban human-lane wiring — Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the existing Stage 3 intent coordinator output into a "needs human" Kanban lane so every email leaving Stage 1 either (i) reaches a registered Stage 4 handler and completes, or (ii) lands in the per-swarm Kanban human lane with a clear reason — never silently disappears.

Three Kanban-trigger conditions, single lane per swarm, `result.kanban_reason` field:
1. **`no_handler`** — Stage 3 picked an intent but no Inngest worker is registered for the `swarm_intents.handler_event`.
2. **`low_confidence`** — Stage 3's top-pick confidence is below threshold OR the top-1 / top-2 gap is too tight.
3. **`handler_error`** — A Stage 4 handler ran but threw / hit a deadlock / was rejected by a downstream system.

**Out of scope:** Building any of the 8 missing Stage 4 handlers (address_change, contract_inquiry, copy_document_request, credit_request, general_inquiry, peppol_request, payment_dispute, other). Those ship in their own phases as v8.2 prioritizes them. Phase 76 just ensures none are silent dead-letters in the meantime.

**Cross-swarm reuse target:** Phase 78 (sales-email) must drop into this Kanban surface by registry insert only — no new code paths. Anything Phase 76 builds that needs a `swarm_type === 'X'` literal branch is a cross-swarm architecture bug to fix in 76, not 78.

</domain>

<decisions>
## Implementation Decisions

### Replay action mechanics (Area 1 — discussed)

- **D-01:** Replay action writes an axis-3 override before re-emitting the handler event. When operator clicks "Replay through Stage 4" with a (possibly edited) intent, the runtime writes a `pipeline_events` row at `stage=3` with `triggered_by='operator-override'` and the operator's chosen intent, THEN re-emits the registered `handler_event` for that intent. The override is only written when the chosen intent **differs** from the Stage 3 coordinator's original top pick — same-intent replays just re-fire the event without duplicating the row. Audit trail captures every operator correction; learning-loop (Phase 79) gets clean signal for prompt-tune candidate detection.
- **D-02:** Replay does NOT re-run Stage 3. The coordinator's original ranked output stays as the canonical Stage 3 telemetry; the operator's correction is layered on top as an axis-3 override (matches `docs/agentic-pipeline/override-model.md`).
- **D-03:** Third operator action — **"Reclassify as noise"** — beyond Close and Replay. Drop-down picks one of the 5 active noise keys (`auto_reply`, `ooo_permanent`, `ooo_temporary`, `payment_admittance`, plus an internal `unknown` reset). Writes an axis-1 `pipeline_events` override at `stage=1` with the chosen noise key, fires the existing `categorize_archive` action for that key (Outlook label + archive + queue iController cleanup automation_run), and closes the Kanban row. This action is a Stage 1 LLM precision signal: "the email got through to Kanban but was actually noise — the regex AND the LLM 2nd-pass both missed it." Phase 79's learning loop must surface a count of these per week per noise key as a Stage 1 LLM precision metric.

### UI surface for Kanban rows (Area 2 — discussed; revised after sketch 005)

> **Revision history:** Sketch 005 (2026-05-07) replaced the original "Bulk Review vs Kanban as distinct surfaces" model with a stage-keyed tab shell. The original D-04 / D-05 are preserved below for audit; the **REVISED** versions are authoritative.

- **D-04 (REVISED):** Per-swarm tab shell at `/automations/[swarm]/stage-N` (path-based) or `/automations/[swarm]?stage=N` (query-string — final choice during planning). Tabs are pipeline stages, not feature names. Stage 0 = existing safety-review surface (today's `?tab=safety`). Stage 1 = today's Bulk Review (default tab) with Pending Promotion as a sub-view (today's `?tab=pending`). Stage 2 = customer-mapping queue (empty today; Phase 77 ships content). Stage 3 = Phase 76's intent triage (low_confidence + no_handler). Stage 4 = Phase 76's handler-error queue. Tab badges show per-stage backlog counts. The swarm-ops dashboard at `/swarm/[swarmId]` stays separate via a small "↗ Swarm operations dashboard" link in the tab strip.
  - **D-04 (ORIGINAL, superseded):** "New per-swarm route at `/automations/[swarm]/kanban`. Sibling to the existing `/automations/[swarm]/review` (Bulk Review) page."
- **D-05 (REVISED):** Bulk Review and Kanban are both views of the per-stage operator surface — they're not distinct surfaces. Stage 1 tab carries today's Bulk Review behavior (noise QA + Pending Promotion sub-view). Stage 3 + Stage 4 tabs carry what Phase 76 was originally scoped as "Kanban." "Bulk Review" stops being a UI noun (becomes the operator-action verb on the Stage 1 tab). "Kanban" disappears as a UI label entirely.
  - **D-05 (ORIGINAL, superseded):** "Bulk Review and Kanban remain conceptually distinct surfaces with different operator workflows."
- **D-05.5 (NEW):** The tab list is **registry-driven**, not hardcoded per swarm. Which stages render as tabs comes from the `swarms` registry row (e.g. derived from `stage1_regex_module IS NOT NULL`, `stage2_entity_resolver IS NOT NULL`, etc.). Sales-email (Phase 78) inherits the shell by registry insert — no swarm-specific tab list anywhere in the UI code.
- **D-05.6 (NEW):** Existing `/automations/[swarm]/review`, `?tab=safety`, `?tab=pending` URLs redirect to their stage-keyed equivalents (`/stage-1`, `/stage-0`, `/stage-1?sub=pending` or similar). Old URLs stay alive as backwards-compat aliases for at least one milestone after this ships so existing bookmarks survive the rename.
- **D-06:** Phase 999.2 (unified email inbox, already in backlog) is the migration target when operator persona / mailbox-scoped permissions / review-level gating are locked. Phase 76 builds the per-swarm shape; consolidation is a separate phase later. Don't pre-build Phase 999.2 inside 76.

### `low_confidence` trigger vs existing escalation-gate (Area 3 — discussed)

- **D-07:** Kanban replaces Stage 3.5 fan-out entirely for now. The existing `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` is repurposed: when its conditions trigger (low confidence OR top-1/top-2 gap too tight OR `requires_orchestration` flag set), the gate writes a Kanban row with `result.kanban_reason='low_confidence'` instead of fanning out to multiple Stage 4 handlers. Stage 3.5 orchestrator-worker fan-out is deferred to a future phase if learning-loop data shows the LLM cost of fan-out beats human judgement on enough volume to justify it.
- **D-08:** The threshold itself stays as the gate currently encodes it (escalation-gate.ts already has a confidence test plus a top-N intent-count test). Don't introduce a new threshold parameter in Phase 76 — reuse what's there. Tuning the threshold is a Phase 79 (learning-loop) follow-up once we have data.
- **D-09:** Keep `escalation-gate.ts` as the single decision point in the coordinator code path. No new branch in `debtor-email-coordinator.ts` or `coordinator-orchestrator.ts` — the gate is the choke point, and its body changes from "fire stage-3.5 event" to "insert Kanban automation_runs row + emit broadcast."

### Per-swarm vs cross-swarm Kanban (Area 4 — discussed)

- **D-10 (REVISED, follows D-04):** Per-swarm only. The stage-keyed tab shell lives at `/automations/[swarm]/stage-N` (or `?stage=N`) per swarm. Cross-swarm aggregation is Phase 999.2. `swarm_type` filter applied via the URL `[swarm]` segment against `automation_runs.swarm_type` (column already exists per Phase 75 work).
- **D-11:** Cross-swarm aggregation is Phase 999.2 territory. Phase 76 ships nothing cross-swarm. Operators with multi-mailbox responsibility today open multiple browser tabs; that's acceptable until Phase 999.2 ships.

### Claude's Discretion

The user did NOT discuss these — Claude picks sensible defaults during planning, can revisit if needed:

- **Schema / row shape on `automation_runs`:** Reuse `status='pending'` (existing Kanban backend). Use `topic` column to carry the intent_key (so existing Kanban-by-topic filtering works for free). `result` jsonb carries `kanban_reason`, `intent`, `confidence`, `error_detail`, `email_id`, `automation_run_id` (the original Stage 3 run id, not this Kanban row's id). No new columns on `automation_runs` — it's a generic surface.
- **Where each trigger fires in the code path:**
  - `no_handler`: detected at the `coordinator-orchestrator` (or wherever `swarm_intents.handler_event` is dispatched). After resolving the registry's `handler_event`, check if any Inngest function is registered for that event; if not, write Kanban row instead of `inngest.send`. Implementation note: Inngest's typed `inngest.send` doesn't expose registered-event introspection, so the cleanest approach is a separate `swarm_intent_handlers` registry (or a column on `swarm_intents` like `handler_status ∈ ('registered', 'placeholder')`) that the dispatch checks before firing. Decide between in-flight runtime registry probe or registry column during planning.
  - `low_confidence`: detected at `escalation-gate.ts` (per D-07/D-08).
  - `handler_error`: registered as an Inngest `onFailure` callback per Stage 4 handler. Each handler's failure path writes a Kanban row with the error detail.
- **Reason field UX in Kanban UI:** Pill on each row showing `kanban_reason`, plus a filter chip strip at the top (All / no_handler / low_confidence / handler_error / safety_escalation if applicable later). Counts per filter shown in the chip.
- **Operator notifications when rows land:** None for v1. Pull-only surface. Email/Slack notifications can be a later opt-in.
- **SLA / stuck rows:** None for v1. Rows just sit there. Phase 79 dashboard will surface stuck-row age as a metric; if a class of intent ages out frequently, that's a handler-priority signal.
- **Sub-reasons on Close (false-positive vs handled-out-of-band vs not-actionable):** None for v1 — start with a single Close action. Phase 79 may want to retrofit sub-reasons if the data shows operators systematically closing for one specific reason.
- **Optimistic UI removal pattern:** Mirror the Bulk Review optimistic-removal pattern (`pendingRemovalIds` in `selection-context.tsx`) so action clicks paint instantly without waiting for the server round-trip + broadcast.
- **Realtime invalidation:** Reuse the `emitAutomationRunStale(admin, '${swarm_type}-kanban')` channel pattern (matches the existing Bulk Review channel `${swarm_type}-review`). Add a kanban-specific channel so Bulk Review and Kanban don't cross-invalidate.
- **Empty state:** "No rows in this lane — pipeline is fully automated for the visible window. 🎉" Filter chips still rendered with zero counts.

</decisions>

<specifics>
## Specific Ideas

- **Stage 1 LLM precision signal (D-03 elaboration):** When operators reclassify a Kanban row as noise via the new third action, this is a high-value training signal: the regex Pass 1 didn't match AND the LLM 2nd-pass also failed to bucket it as noise. Phase 79's learning-loop dashboard MUST count these per noise key per week. Threshold target (informal, no SLA): if `auto_reply` reclassifications exceed ~5/week, the Stage 1 LLM 2nd-pass prompt needs a tune. The bonus is that this also catches regex gaps — reclassification volumes by noise key directly suggest which regex rules to extend.
- **Bulk Review vs Kanban mental model lock:** From the operator's perspective the difference is sharp: Bulk Review is *noise QA + Stage 1 promotion* (approve regex/LLM noise matches to feed the Wilson-CI promotion machine + relabel mistakes); Kanban is *real customer work the pipeline couldn't auto-resolve*. They have different cadences, different operator personas potentially, and different success metrics. Don't blur this in the UI even if some components are shared.
- **Replay editor UX:** When operator clicks "Replay through Stage 4" they get an intent dropdown pre-selected to the Stage 3 top pick. Changing the intent and confirming triggers the axis-3 override + replay path (D-01). Same dropdown pattern as Stage 1 widget in Bulk Review (`web/app/(dashboard)/automations/[swarm]/review/components/stage-1-widget.tsx`) — reuse the component shape.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture (locked source of truth)
- `docs/agentic-pipeline/README.md` — 5-stage funnel + tenancy; the canonical entry point.
- `docs/agentic-pipeline/stage-3-coordinator.md` — ranked-intent dispatch via `swarm_intents`, hard separation rule vs `swarm_noise_categories`, Stage 3.5 escalation principle (D-07 repurposes).
- `docs/agentic-pipeline/override-model.md` — 4-axis override taxonomy. Phase 76 axis-3 override (D-01) and axis-1 override (D-03) follow this contract.
- `docs/agentic-pipeline/graduated-automation.md` — promotion-ladder principles; D-03's reclassification signal feeds these hooks at the Stage 1 layer.
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2→3 envelope. Replay path (D-01) does NOT re-run Stage 3, so the contract is consumed once per email lifetime.

### Existing code that Phase 76 extends
- `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` — repurposed in D-07: gate body changes from "fire Stage 3.5 event" to "insert Kanban row + emit broadcast."
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — Stage 3 single-shot dispatch path; site of `no_handler` detection (Claude's Discretion §where each trigger fires).
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — Stage 3 entry point. Reads `swarm_intents` for `handler_event`. Loads `loadHandlerEvent` from registry.
- `web/lib/inngest/functions/debtor-email-override-handler.ts` — existing axis-1/axis-2/axis-3/axis-4 override emit pattern. D-01 and D-03 follow this exact shape.
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — Stage 1 noise terminal action (categorize_archive). D-03's reclassify-as-noise reuses this dispatch.
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` — per-swarm dynamic-segment loader. The new `[swarm]/kanban/page.tsx` mirrors this shape (registry-driven, server-rendered, client-side selection-context for row selection).
- `web/app/(dashboard)/automations/[swarm]/review/selection-context.tsx` — module-level selection cache + history.replaceState pattern. D-04's Kanban page reuses this.
- `web/app/(dashboard)/automations/[swarm]/review/components/stage-1-widget.tsx` — referenced in §Specific Ideas for the Replay editor's intent dropdown pattern.

### Registry tables (Phase 75 + Phase 68 split)
- `public.swarms` — per-swarm scaffolding; `stage3_coordinator_agent_key`, `entity_brand`, `side_effects[]`.
- `public.swarm_intents` — `(swarm_type, intent_key) → handler_event`. Source of truth for Stage 3 dispatch. The `no_handler` check (Claude's Discretion) needs to know which `handler_event`s have a registered Inngest worker — implementation choice between runtime probe and a `handler_status` column gets locked in planning.
- `public.swarm_noise_categories` — Stage 1 noise dispatch (`auto_reply`, `ooo_*`, `payment_admittance`, `unknown`). D-03's reclassify-as-noise dropdown reads this list at runtime.

### Inngest patterns
- `docs/inngest-patterns.md` — durable functions, replay-safe id generation (Phase 65 learning), `inngest.send` binding rule (CLAUDE.md commit dae6276), business-hours cron defaults.

### Bulk Review reference (yesterday's perf work)
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (current state) — viewport-sized PAGE_SIZE pattern, parallel Promise.all for row-keyed loaders, no SSR Graph fallback. Kanban page should follow the same patterns from day 1 — don't repeat yesterday's perf debugging.

### Phase boundaries this phase respects
- Phase 75 noise/intent registry split — DONE (commit 66c0379). Phase 76 builds on this foundation; the Kanban lane only exists because Stage 1 LLM is now constrained to noise.
- Phase 77 (debtor verify, parallel) — depends on Phase 76 to actually SEE Stage 3 output. The 50-email manual grading sample uses the Kanban view as the inspection surface.
- Phase 78 (sales-email, parallel) — Phase 76 must accept registry-only sales-email onboarding. If sales-email needs `swarm_type === 'sales-email'` branches anywhere in the Kanban code, it's a 76 bug.
- Phase 79 (learning loop) — depends on the data Phase 76 emits. D-03 reclassify-as-noise count is one of 79's metrics; `kanban_reason` distribution is another.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`automation_runs` table with `status='pending'`** — existing Kanban backend (Phase 64-05 budget-breach-handler precedent). Phase 76 just inserts more rows of the same shape; no schema migration.
- **`emitAutomationRunStale(admin, channel)`** — Realtime broadcast helper used by Bulk Review (`channel='${swarm_type}-review'`). Reuse with `channel='${swarm_type}-kanban'`.
- **`pendingRemovalIds` in `selection-context.tsx`** — optimistic UI removal. Action clicks (Close, Replay, Reclassify-as-noise) paint instantly.
- **`fetchReviewEmailBody` Server Action** — already lazy-fetches Outlook body on click. Kanban detail-pane reuses it directly.
- **`loadHandlerEvent(swarm_type, intent_key)`** — already used in `debtor-email-coordinator.ts`. The `no_handler` check sits adjacent to this lookup.
- **Phase 65 escalation-gate.ts** — has the conditions (confidence + top-N intent-count) needed to fire `low_confidence`. Don't reinvent.

### Patterns to mirror (not invent)
- **4-axis override emit shape:** `debtor-email-override-handler.ts` already handles `stage_1_category`, `stage_2_customer`, `stage_3_intent`, `stage_4_handler_output`. D-01 (replay with axis-3) and D-03 (reclassify-as-noise = axis-1) plug into this existing handler — don't write a parallel emit path.
- **Registry-driven dispatch:** `swarm_categories.action='swarm_dispatch'` (now `swarm_noise_categories` for noise) + `swarm_intents.handler_event` for intents. Phase 76's `no_handler` detection extends this pattern (knows which `handler_event`s exist).
- **Per-swarm dynamic route shape:** `web/app/(dashboard)/automations/[swarm]/review/` — copy the pattern (`page.tsx` server component, swarm registry lookup, registry-driven UI config, dynamic-segment params).

### Things to NOT touch
- **Bulk Review surface (`[swarm]/review/`)** — no changes. Kanban is a sibling, not a tab.
- **`coordinator-orchestrator.ts` Stage 3.5 fan-out logic** — D-07 says we don't fan out for now, but don't DELETE the orchestrator. Just keep the gate from firing it.
- **`classifier-screen-worker.ts`** — Phase 74 LLM 2nd-pass code is correct as-is. Phase 76 doesn't change Stage 1.

</code_context>

<deferred>
## Deferred Ideas

These came up but explicitly defer to other phases / future work:

- **Operator email/Slack notifications when Kanban rows land** — none for v1; pull-only surface. Revisit if operator pull cadence is too slow.
- **SLA / stuck-row alerting** — none for v1; Phase 79 dashboard surfaces stuck-row age as a metric.
- **Sub-reasons on Close action (false-positive / handled-out-of-band / not-actionable)** — none for v1; retrofit if Phase 79 data shows systematic close patterns.
- **Stage 3.5 orchestrator-worker fan-out for low-confidence cases (RFC-described, never fully shipped)** — deferred indefinitely. Re-introduce if learning-loop data shows fan-out beats human-judgement on enough volume to justify the LLM cost.
- **Cross-swarm Kanban aggregation** — Phase 999.2 territory.
- **Reclassify-as-noise edge case: what if operator picks "unknown"?** — D-03 says the dropdown includes the 4 active noise keys. Including `unknown` would be a "send back through pipeline" action, which is functionally equivalent to "Replay" — keep it OUT of the noise dropdown to avoid two paths to the same result. If pressure emerges, revisit.
- **Auto-promote intent_proposal patterns from Phase 79** — Phase 79's clustering surfaces new intent candidates. Phase 76 doesn't pre-build that promotion path; just emits the data Phase 79 needs.

</deferred>

---

*Phase: 76-stage-3-kanban-human-lane-wiring*
*Context gathered: 2026-05-07 via /gsd-discuss-phase*
