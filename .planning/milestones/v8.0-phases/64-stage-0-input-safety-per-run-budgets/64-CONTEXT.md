# Phase 64: Stage 0 input safety + per-run budgets — Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement Stage 0 of the agentic-pipeline funnel (RFC: `docs/agentic-pipeline/stage-0-safety.md`):

1. **Prompt-injection screening** of every inbound email *before* any LLM context-window in a downstream stage sees the body (SAFE-01..04).
2. **Per-run budget enforcement** in Inngest with hard token + cost ceilings (BUDG-01).
3. **Intent-scoped tool allowlist** via `zapier_tools.allowed_for_intents` (BUDG-02).
4. **Operator surfaces** for injection-flagged emails (Bulk Review tab) and per-email cost outliers as override axis 4 (SAFE-04, BUDG-03).

Out of scope: changing Stage 1/2/3/4 behavior, Stage 3.5 orchestrator (Phase 65), retiring triage path (Phase 66).
</domain>

<decisions>
## Implementation Decisions

### Stage 0 detection layering

- **D-01:** Stage 0 runs **regex + LLM verdict on every inbound email**, not regex-first / LLM-on-inconclusive. Regex still runs (deterministic, free) but does not gate the LLM call. Rationale: uniform per-email cost signal feeds override axis 4; Haiku cost is small enough (~€0.0003/email) that the cost is acceptable; tunes the regex via real-world signal rather than guessing.
- **D-02:** This decision **contradicts the Phase 63 RFC** (`docs/agentic-pipeline/stage-0-safety.md` currently says "LLM verdict step is conditional: it runs only when the regex pass is inconclusive"). Phase 64 plan MUST include a task to update that RFC paragraph so docs and code do not drift.
- **D-03:** LLM verdict model = `anthropic/claude-haiku-4-5` (primary) with Orq.ai Router fallbacks per `docs/orqai-patterns.md`. JSON via `response_format.json_schema`. NOT Sonnet — overkill for binary classification.
- **D-04:** Seed regex pattern set = **Anthropic published prompt-injection-defenses guidance + a small (~5–10) custom Dutch/English list** specific to debtor-email noise. Examples to include: "negeer eerdere instructies", "ignore the above", common system-prompt-leak attempts. Iterate via the graduated-automation hook (RFC `graduated-automation.md`); thresholds for promotion are Phase 71.

### `zapier_tools.allowed_for_intents` shape

- **D-05:** Add as **array column on the existing `zapier_tools` table**: `ALTER TABLE zapier_tools ADD COLUMN allowed_for_intents text[]`. NOT a junction table. One source of truth, lightest read path, matches the registry pattern already in place.
- **D-06:** **Default-deny semantics**: NULL or empty `allowed_for_intents` ⇒ tool is invokable by NO intent. New tools must explicitly register their intents. This is what makes BUDG-02 success criterion pass ("a copy-document handler attempting to invoke a payment-update tool is rejected").
- **D-07:** Intent identifier = **`swarm_categories.key`**. Reuse the existing registry rather than introduce a parallel `swarm_intents` table. Example values: `'invoice_copy_request'`, `'payment_status_question'`. If we ever need many-to-many between categories and intents, that's a future schema change — not Phase 64.
- **D-08:** Enforcement happens in the in-app NXT/Zap client wrapper (`web/lib/automations/debtor-email/nxt-zap-client.ts` and the parallel pattern for any other `zapier_tools` consumer). Read the tool row, check intent membership, throw a typed `ToolNotAllowedForIntentError` if denied. NOT enforced server-side in Zapier — the registry lives in Supabase.

### Bulk Review surface for `injection_suspected`

- **D-09:** **Dedicated tab/lane** in Bulk Review labeled "Safety review" (or equivalent). Not a filter on the existing draft-review tab. Different mental model, different actions per row.
- **D-10:** Per-flagged-email surfaced fields (all four required):
  1. Regex pattern that matched (if any).
  2. LLM verdict + 1–2 sentence reason returned by the model.
  3. Raw email body with the matched span highlighted in-line.
  4. Per-email token cost (in cents) — also feeds override axis 4 outlier detection.
- **D-11:** Operator actions on a flagged email:
  1. **Mark safe → reprocess through Stage 1**, with a `safety_overridden` audit flag on the row.
  2. **Dismiss / archive** — confirmed injection or junk; no reply, logged.
  3. **Escalate to the existing Human Review lane on the Kanban Board** — reuses the lane that's already there, no new "escalate" concept invented in Phase 64.
- **D-12:** "Reply manually" is **NOT** a Stage 0 action. If the operator wants to draft a reply, they Mark-safe → reprocess (so the pipeline drafts from the cleaned body) or Escalate to Kanban (where manual draft tooling already lives).

### Budget breach → human queue handoff

- **D-13:** Budget breach halt path = **explicit step emits `pipeline.budget_breached` event**. A separate Inngest function consumes the event and creates a Kanban Human Review item. Breach is a first-class signal, NOT a thrown error. **Inngest auto-retry MUST NOT trigger** on budget breach.
- **D-14:** Ceiling shape = **both tokens AND cost**, tracked side-by-side. Breach when EITHER exceeds its ceiling. Tokens catch runaway loops on cheap models; cost catches expensive-model usage. Cost is the operator-visible number (override axis 4 already speaks in cents).
- **D-15:** "Per-run" = **one top-level Inngest function invocation**. Counter resets per invocation. Retries within the same function share the same budget. NOT per-thread, NOT per-email-across-multiple-functions.
- **D-16:** Exact ceiling values (token cap, cost cap in cents) are **deferred to research/planner**. Likely starting points come from looking at actual debtor-email pipeline cost data in `pipeline_events` (or equivalent telemetry) and setting ceilings at ~3× the observed median run cost. Document the chosen numbers + rationale in the plan.

### Cost outlier → override axis 4

- **D-17:** Cost outlier detection = `>3× median per-email cost` per the roadmap success criterion. **Median window** (per-day rolling vs per-week rolling vs absolute) is **deferred to research/planner** — pick what produces a stable but responsive signal given current inbox volume.

### Claude's Discretion

- Exact regex pattern list (D-04 seeds the source; specifics are research/planner output).
- Exact ceiling values for tokens + cost (D-16).
- Median window for axis-4 outlier (D-17).
- Inngest event names and payload shapes for `pipeline.budget_breached` (research/planner picks naming consistent with existing event taxonomy).
- Bulk Review UI implementation details — component reuse vs new components — once existing patterns are scouted.
- Migration ordering between `zapier_tools.allowed_for_intents` column and any backfill of existing tools to their currently-allowed intents.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 63 RFC (locks the canonical shape)
- `docs/agentic-pipeline/README.md` — RFC entry point.
- `docs/agentic-pipeline/stage-0-safety.md` — Stage 0 contract; Phase 64 implements it AND updates the "LLM only on inconclusive" paragraph per D-02.
- `docs/agentic-pipeline/stage-4-handler.md` — handler stage including `zapier_tools.allowed_for_intents` forward-reference.
- `docs/agentic-pipeline/override-model.md` — 4-axis override model, particularly axis 4 (cost outliers) and axis 1 (category overrides) interaction with `safety_overridden` reprocess flow.
- `docs/agentic-pipeline/graduated-automation.md` — promotion-ladder principles for tightening regex over time.
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2→3 context shape; Stage 0 verdicts attach to this context.

### Project requirements
- `.planning/REQUIREMENTS.md` — SAFE-01..04, BUDG-01..03 (the verification truths for this phase).
- `.planning/ROADMAP.md` Phase 64 entry — success criteria.
- `.planning/PROJECT.md` — non-negotiable stack constraints.

### Stack pattern docs (constrain HOW)
- `CLAUDE.md` — top-level project rules (Inngest cron defaults, Orq.ai response_format, deny direct LLM keys, etc.).
- `docs/orqai-patterns.md` — Orq.ai Router usage, json_schema, fallbacks, 45s timeout, XML-tagged prompts. The LLM verdict step MUST follow this.
- `docs/inngest-patterns.md` — step.run boundaries, side-effects only inside step.run, large outputs to Supabase. Budget tracking lives at step boundaries.
- `docs/zapier-patterns.md` — `zapier_tools` registry pattern. New `allowed_for_intents` column extends this.
- `docs/supabase-patterns.md` — service role for automation writes, JSONB double-encoding pitfall.

### Existing code touchpoints
- `web/lib/automations/debtor-email/` — current pipeline implementation (Stage 1+ already shipped).
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — pattern for tool invocation; `allowed_for_intents` enforcement extends this.
- `web/lib/classifier/` — Stage 1 regex classifier; Stage 0 wraps it.
- `supabase/migrations/20260429_zapier_tools_registry.sql` — current `zapier_tools` schema; Phase 64 adds the `allowed_for_intents` column on top.
- `supabase/migrations/20260428_public_agent_runs.sql`, `20260430c_email_labels_feedback_and_invoice_copy.sql` — adjacent telemetry/feedback schema.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — natural place to add the intent-allowlist check before any tool invocation.
- `web/lib/classifier/` (regex classifier for Stage 1) — Stage 0 regex layer can borrow the "regex + audit trail" pattern verified in `feedback_skip_heuristics_for_analysis.md`.
- `zapier_tools` table — adding one column is a small, additive migration, NOT a new table.
- `swarm_categories` registry — already the canonical category vocabulary; extending it as the `intent` source avoids a parallel registry.
- Existing Bulk Review UI — operator surface to extend with the new "Safety review" tab; existing tab/lane pattern already established for draft review.
- Existing Kanban Human Review lane — reused as the escalation target (D-11).
- `pipeline_events` (or current equivalent telemetry table) — source for the cost-outlier median window (D-17).

### Established Patterns
- **Orq.ai Router with json_schema** is mandatory for the LLM verdict (D-03). Prompt-only JSON has documented 15–20% failure rate per `CLAUDE.md`.
- **Inngest step.run for all side effects.** Budget tracking lives at step boundaries; the `pipeline.budget_breached` event is emitted from a step, not from outside one.
- **Zapier tool registry routing** — new tools register a row, no env vars, no per-Zap deploys. `allowed_for_intents` is the same model: data, not code.
- **Default-deny security posture** matches the project's existing test-first / acceptance-credentials defaults — failing closed is the house style.

### Integration Points
- Stage 0 sits *before* the existing classifier-verdict-worker Inngest function. New function: e.g. `stage-0-safety-worker` or fold into the existing entry function.
- `injection_suspected` flagged emails persist on `email_labels` (or equivalent) with a new label/state; they do NOT get a row in any draft-review pipeline tables.
- Budget counter is per-Inngest-invocation state — tracked in a `step.run` accumulator, persisted on breach to a `budget_breaches` row in Supabase for audit.
- `safety_overridden` flag on reprocessed emails feeds back into the override-axes telemetry the RFC describes.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly chose to deviate from the RFC on detection layering (LLM-on-every-email vs LLM-on-inconclusive). This is intentional and the RFC must be updated to match — drift is not acceptable.
- The user explicitly does NOT want a brand-new "escalate" mechanism in Phase 64. Escalation reuses the existing Kanban Human Review lane (D-11). Future phases that touch escalation should respect this baseline.
- Per-email cost in cents is the operator-visible number. The plan should make sure the LLM verdict step's token usage flows into the same cost accumulator that other Stage 1+ LLM calls use.

</specifics>

<deferred>
## Deferred Ideas

- **"Reply manually" as a Stage 0 action** — explicitly out of scope (D-12). Manual-draft tooling already lives in the Kanban Human Review lane; if it's wanted as a one-click action from the Safety Review tab, that's a UX iteration in a later phase, not Phase 64.
- **Many-to-many categories ↔ intents** — D-07 keeps `swarm_categories.key` as the intent identifier. If the project later needs intents that are not 1:1 with categories, that's a separate schema phase.
- **Promotion-ladder thresholds** for tightening the Stage 0 regex over time — explicitly Phase 71 work per RFC `graduated-automation.md`. Phase 64 ships only the static seed list (D-04).
- **Reviewed Todos (not folded):** none — no pending todos cross-referenced this phase.

</deferred>

---

*Phase: 64-stage-0-input-safety-per-run-budgets*
*Context gathered: 2026-04-30*
