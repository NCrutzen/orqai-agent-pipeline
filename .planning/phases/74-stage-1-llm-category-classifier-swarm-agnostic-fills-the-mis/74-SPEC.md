# Phase 74: Stage 1 LLM Category Classifier (swarm-agnostic) — Specification

**Created:** 2026-05-06
**Ambiguity score:** 0.166 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

When the existing regex Stage 1 returns `category_key='unknown'`, a swarm-agnostic LLM agent re-classifies the message into one of the swarm's enabled `swarm_categories` (or defers back to `unknown`); the verdict flows through `classifier/verdict.recorded` and the existing registry-driven dispatch so that cheap-noise rows skip the entity→coordinator chain and sales-email (which has no regex rules yet) gets day-1 classification on the same agent.

## Background

**What exists today:**
- `stage-0-safety-worker` emits `classifier/screen.requested` on safe verdict (`web/lib/inngest/functions/stage-0-safety-worker.ts:75`).
- **`classifier/screen.requested` has zero consumers.** The event is defined in `web/lib/inngest/events.ts:297`, emitted by Stage 0, and ignored.
- The regex Stage 1 (`web/lib/debtor-email/classify.ts`) is invoked outside this seam — it returns one of `auto_reply | ooo_temporary | ooo_permanent | payment_admittance | unknown`.
- `classifier-verdict-worker` (`web/lib/inngest/functions/classifier-verdict-worker.ts`) consumes `classifier/verdict.recorded` and dispatches via `swarm_categories.action` (registry-driven, swarm-agnostic since Phase 68).
- For `(swarm_type='debtor-email', category_key='unknown')`, `swarm_categories.action='swarm_dispatch'`, `swarm_dispatch='debtor-email/label-resolve.requested'` (`supabase/migrations/20260429h_swarm_categories_unknown_dispatch.sql`). That dispatches the entity-resolver → coordinator → handler chain.
- Phase 70 dual-write: every stage decision is written to canonical `pipeline_events` plus the legacy denormalized read-models (`agent_runs`, `email_labels`, `automation_runs`).
- No Orq agent named `stage-1-category-classifier` exists in `public.orq_agents`.
- Sales-email swarm (Phase 73) has no rows in `swarm_categories`.

**What triggers this work:**
End-of-week rollout target — Friday 2026-05-08: enable two debtor mailboxes (firecontrol@, SMEBA fire@) plus one sales-email inbox. Sales-email has no regex rules and no historical telemetry, so without an LLM Stage 1, every sales-email message would route directly through the expensive entity→coordinator chain. The LLM closes that gap with one swarm-agnostic agent.

## Requirements

1. **Stage-1 LLM agent (Orq.ai)**: A new swarm-agnostic Orq agent classifies a message into a closed `category_key` set sourced from `swarm_categories`.
   - Current: No `stage-1-category-classifier` agent in `public.orq_agents`. No Orq agent today reads `swarm_categories` to scope its output.
   - Target: New agent `stage-1-category-classifier` (Haiku-class primary model — verify in Orq catalog via `list_models` per CLAUDE.md, e.g. `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0`) with strict `response_format=json_schema` (`anyOf` for nullable per CLAUDE.md), declared `swarm_type='cross-cutting'` in `public.orq_agents`. Input includes the message subject + body + the closed category list (label + key) for the swarm at call time. Output: `{ category_key, confidence: "low"|"medium"|"high", reasoning }`.
   - Acceptance: `get_agent` after `update_agent` shows persisted `model.parameters.response_format` with strict json_schema; agent invoked on a known auto-reply test fixture returns `category_key='auto_reply'` with `confidence ∈ {medium, high}`; agent invoked on an ambiguous fixture returns `category_key='unknown'` OR `confidence='low'`.

2. **Classifier-screen-worker (Inngest)**: A new Inngest function consumes `classifier/screen.requested` and emits `classifier/verdict.recorded`.
   - Current: `classifier/screen.requested` has no listener; no path exists from Stage 0 safe-verdict to a recorded verdict.
   - Target: New function `classifier/screen-worker` at `web/lib/inngest/functions/classifier-screen-worker.ts`, `retries: 0`, side effects in `step.run()` (per CLAUDE.md Inngest patterns including replay-safe id generation and non-destructured `inngest.send`). Loads `swarm_categories` for the inbound `swarm_type` (registry-driven; works for any swarm), runs the regex first, on `unknown` invokes the Stage-1 LLM agent, applies the confidence gate (req. 4), then emits `classifier/verdict.recorded` with `predicted_category` set to the final `category_key`.
   - Acceptance: Function registered in the Inngest app; an emitted `classifier/screen.requested` for a known auto-reply fixture results in exactly one `classifier/verdict.recorded` event with `predicted_category='auto_reply'`; the same emission for an ambiguous body results in `predicted_category='unknown'`.

3. **Regex-then-LLM order on `unknown`**: The new worker preserves regex Stage 1 as the cheap first pass; the LLM is invoked *only* when regex returns `unknown`.
   - Current: There is no integrated regex→LLM ordering — the regex is invoked elsewhere; the seam from Stage 0 to verdict is empty.
   - Target: For every `classifier/screen.requested` payload, `classifier-screen-worker` first calls the swarm's regex classifier (debtor-email today; sales-email regex absent → effectively always returns `unknown`); if regex returns a non-`unknown` key the LLM is **not** called; if regex returns `unknown`, the LLM is called.
   - Acceptance: Trace logs / `pipeline_events` show a regex match for a known `payment_admittance` fixture *without* an LLM call; the same input with the regex bypassed (or via sales-email) shows an LLM call.

4. **Confidence-gated deferral**: LLM `confidence='low'` coerces the predicted category to `unknown`; `medium` and `high` are trusted as-is.
   - Current: No confidence gating exists (no LLM exists at this seam).
   - Target: After LLM returns, worker computes `final_category_key = (confidence == 'low') ? 'unknown' : llm.category_key`; that final value is what `classifier/verdict.recorded.predicted_category` carries. The downstream `classifier-verdict-worker` then routes via `swarm_categories.action` exactly as today (so `unknown` falls through to the existing entity→coordinator chain).
   - Acceptance: A test fixture forcing the LLM to return `confidence='low'` produces `predicted_category='unknown'` on the emitted event; a fixture forcing `confidence='medium'` with `category_key='auto_reply'` produces `predicted_category='auto_reply'`.

5. **Phase 70 dual-write**: Every Stage-1 decision is recorded in `pipeline_events` (canonical) and in the existing denormalized read-models per the established Phase 70 contract.
   - Current: `pipeline_events` exists with stage decisions written by Stage 0, the resolver, and the coordinator. Stage 1 has no row written from this seam (because the seam itself is empty).
   - Target: `classifier-screen-worker` writes one `pipeline_events` row per call describing the Stage-1 decision (regex outcome, LLM outcome if invoked, final category, confidence) using the existing `emitPipelineEvent` helper; legacy read-models (`agent_runs` for the LLM call, `automation_runs` status) are written via the same patterns used elsewhere in the funnel.
   - Acceptance: After processing a fixture row, exactly one new `pipeline_events` row exists for that `automation_run_id` at the Stage-1 stage; for the LLM-invoked branch, exactly one new `agent_runs` row exists with `agent_key='stage-1-category-classifier'`.

6. **Cross-swarm reuse via registry**: The same agent + same Inngest worker serve debtor-email and sales-email; per-swarm behavior diverges only via `swarms` + `swarm_categories` rows.
   - Current: `swarm_categories` has 5 rows for debtor-email and zero for sales-email; no agent reads `swarm_categories` at call time to scope its output set.
   - Target: Add `swarms` row for `swarm_type='sales-email'` (or extend the existing one if Phase 73 has already inserted it) and `swarm_categories` rows for sales-email keys: `auto_reply, ooo_temporary, ooo_permanent, payment_admittance, unknown` (same five as debtor-email; payment_admittance is included because payment confirmations also land in the sales mailbox per operator note). For sales-email all four non-`unknown` keys carry `action='categorize_archive'` semantics matching the debtor equivalents; `unknown` for sales-email may carry `action='manual_review'` (no entity/coordinator chain exists for sales-email yet) — final per-row action choice is a discuss-phase decision, *but the row count and key set are locked here*. No source-code branch on `swarm_type` may be added in this phase; all swarm-specific behavior must come from registry rows.
   - Acceptance: `grep -rn "swarm_type === 'sales-email'\|swarm_type === \"sales-email\"" web/lib/inngest/functions/classifier-screen-worker.ts` returns zero matches; `select count(*) from public.swarm_categories where swarm_type='sales-email'` returns 5; the worker successfully processes a `classifier/screen.requested` payload with `swarm_type='sales-email'`.

7. **End-to-end production flow on three mailboxes**: After deploy, the full chain Stage 0 → Stage 1 (regex+LLM) → verdict-worker → registry-driven dispatch is live for two debtor mailboxes and one sales mailbox.
   - Current: Stage 0 → Stage 1 seam empty; sales-email is not ingesting at all.
   - Target: Sales-email ingestion is enabled for one designated inbox (operator chooses which during phase execution); both debtor mailboxes (firecontrol@, SMEBA fire@) route through the new Stage-1 LLM path; pipeline_events shows Stage-1 rows arriving for live traffic.
   - Acceptance: 24 hours after deploy, `select count(*) from pipeline_events where stage='stage-1' and created_at > deploy_ts` is > 0 for each of the three target mailboxes; no `automation_runs.status='failed'` rows for these mailboxes are caused by the new worker (errors caused by upstream/unrelated issues are excluded).

## Boundaries

**In scope:**
- New Orq agent `stage-1-category-classifier` (Haiku-class, strict json_schema, swarm-agnostic).
- New Inngest worker `classifier-screen-worker` (`web/lib/inngest/functions/classifier-screen-worker.ts`).
- Regex-first ordering with LLM fall-through on `unknown` only.
- Low-confidence coercion to `unknown` (no new schema column — gate is hardcoded `low`→`unknown`).
- Phase 70 dual-write of Stage-1 decisions to `pipeline_events` + legacy read-models.
- `swarm_categories` seed rows for `swarm_type='sales-email'` (5 keys, mirroring debtor-email).
- `swarms` row for sales-email (or update if it exists) sufficient to make the registry-driven worker function.
- End-to-end production rollout on firecontrol@, SMEBA fire@, and one sales mailbox.

**Out of scope:**
- **Promotion of common LLM picks → new regex rules** — Phase 72 (promotion-recommender + Learning Inbox) territory.
- **Deriving an initial sales-email regex set from the Supabase corpus** — separate effort; the LLM is precisely what makes regex-less sales-email rollout viable on Friday.
- **New Bulk Review UI columns for LLM-specific data** (per-call cost, reasoning text). Existing Axis-1 (corrected_category) override surface is reused as-is.
- **Labeled eval dataset / offline regression tests for the LLM.** Ship, observe via `pipeline_events`, eval lands later.
- **Cost/latency dashboards specific to the new agent.** Existing `agent_runs` cost telemetry is sufficient for v1.
- **Per-swarm `min_llm_confidence` registry column.** Confidence gate is hardcoded `low`→`unknown` for v1; per-category gating is a future enhancement.
- **Coordinator/handler changes for sales-email.** This phase ships sales-email *classification* only; sales-email Stage 3/4 (entity resolver + coordinator chain) remain Phase 73's domain or future work.
- **Sales-email regex Stage 1 implementation.** Sales-email regex registry stays empty; sales-email always falls to LLM in v1.

## Constraints

- **Model selection:** Primary must be a Haiku-class model verified via `list_models` against the Orq catalog; per CLAUDE.md the only Haiku-direct id today is `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0`. Fallback chain must use catalog-verified ids only (no `mistral-large-latest`, no undated `claude-sonnet-4-5`, no fictitious `anthropic/claude-opus-4-6`).
- **Strict JSON output:** `model.parameters.response_format` = strict `json_schema` with `anyOf` for any nullable field (CLAUDE.md `3970bad9` learning). Create-then-PATCH-then-`get_agent` verify cycle is mandatory (`cba7352b` learning).
- **Inngest replay safety:** All side effects in `step.run()`. Any non-deterministic id (UUID, `Date.now()`) generated inside `step.run()`. `inngest.send` never destructured. `retries: 0`.
- **Registry-driven only:** No `swarm_type === 'sales-email'` (or `'debtor-email'`) literal in the new worker. Behavior diverges via `swarm_categories` rows only.
- **Dual-write contract:** Phase 70 `emitPipelineEvent` helper used for Stage-1 rows; legacy `agent_runs` write follows existing pattern from `classifier-label-resolver`.
- **Performance budget:** No explicit numeric latency/cost target for v1 — observed `agent_runs.cost_usd` and `duration_ms` for the new agent are the baseline.
- **Stage 0 contract preserved:** Stage 0 emits `classifier/screen.requested` unchanged; no edits to `stage-0-safety-worker` in this phase.

## Acceptance Criteria

- [ ] `public.orq_agents` contains a row `agent_key='stage-1-category-classifier'`, `swarm_type='cross-cutting'`; `get_agent` shows persisted strict `response_format` json_schema.
- [ ] `web/lib/inngest/functions/classifier-screen-worker.ts` exists, registered with `event: "classifier/screen.requested"`, `retries: 0`, all side effects in `step.run()`.
- [ ] Worker invokes regex first; LLM agent is invoked **only** when regex returns `unknown` (verifiable by trace log + presence/absence of `agent_runs` row).
- [ ] LLM `confidence='low'` produces `classifier/verdict.recorded.predicted_category='unknown'`; `medium`/`high` pass the LLM's pick through unchanged.
- [ ] Each Stage-1 decision writes exactly one `pipeline_events` row; LLM-invoked branch additionally writes one `agent_runs` row.
- [ ] `select count(*) from public.swarm_categories where swarm_type='sales-email'` returns exactly 5 (`auto_reply, ooo_temporary, ooo_permanent, payment_admittance, unknown`).
- [ ] No string literal `'sales-email'` or `'debtor-email'` appears in branch conditions inside `classifier-screen-worker.ts`.
- [ ] After production deploy, within 24 hours `pipeline_events` shows ≥1 Stage-1 row for each of: firecontrol@ mailbox, SMEBA fire@ mailbox, the designated sales-email mailbox.
- [ ] No `automation_runs.status='failed'` rows for the three target mailboxes whose root cause is the new worker.
- [ ] All Orq model ids referenced (primary + fallbacks) verified present in `list_models` output before `update_agent` is called.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                 |
|--------------------|-------|------|--------|-----------------------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | Topology locked: regex-first, LLM on `unknown`, low-conf → `unknown`. |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Explicit OUT list confirmed by user.                                  |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Haiku-class + strict json_schema + replay-safe Inngest patterns.      |
| Acceptance Criteria| 0.70  | 0.70 | ✓      | 10 pass/fail checks; latency/cost left to v1 baseline observation.    |
| **Ambiguity**      | 0.166 | ≤0.20| ✓      | Gate passed.                                                          |

## Interview Log

| Round | Perspective       | Question summary                                                  | Decision locked                                                                                                  |
|-------|-------------------|-------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| 1     | Researcher        | Topology: where does LLM sit relative to existing regex Stage 1?  | (a) LLM runs only when regex returns `unknown` — second-chance before existing entity→coordinator chain.         |
| 1     | Researcher        | Closed taxonomy — which `category_key`s may LLM emit?             | Deferred — answered in Round 2.                                                                                  |
| 2     | Simplifier        | LLM output set + low-confidence behaviour                         | (c)+(c) — LLM may emit `unknown`; low-confidence coerces to `unknown` so today's `unknown`-dispatch chain runs.  |
| 2     | Simplifier        | Phase scope (debtor-only / both / shadow)                         | Effectively (b) — both swarms wired this phase, but sales-email = registry rows only (no duplicated code).       |
| 3     | Boundary Keeper   | Sales-email starter category set                                  | (a)+payment_admittance — same 5 keys as debtor; operator note: payment confirmations land in sales mailbox too.  |
| 3     | Boundary Keeper   | Confidence threshold mechanism                                    | (b) — `low` → `unknown`, `medium`/`high` trusted. Hardcoded; no new registry column.                             |
| 3     | Boundary Keeper   | Explicit OUT-of-scope list                                        | Confirmed: promotion hook, sales-email regex derivation, Bulk Review UI changes, eval dataset, cost dashboards.  |

---

*Phase: 74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis*
*Spec created: 2026-05-06*
*Next step: /gsd-discuss-phase 74 — implementation decisions (sales-email `unknown` action choice, exact json_schema shape, regex-invocation surface, agent prompt content, etc.)*
