---
phase: 89
slug: stage-1-llm-2nd-pass-auto-action-promotion-track
discussed_at: 2026-05-20
milestone: v8.1
---

# Phase 89 — Stage 1 LLM 2nd-pass auto-action promotion track

## Domain

Extend the existing Wilson-CI promotion model (regex `rule_key` → `classifier_rules.status` → `classifier-screen-worker` whitelist gate) to also cover LLM 2nd-pass verdicts. Today every LLM-classified noise email lands in bulk-review because `matchedRule = "no_match"` for the LLM path, so `whitelistSet.has(matchedRule)` is always false. Phase 89 mints synthetic LLM `rule_key`s of the form `llm:{category_key}:{confidence}`, threads them through `agent_runs` and the existing telemetry view, and lets the existing promotion cron promote them once they hit `n≥30 AND ci_lo≥0.92`.

## Canonical refs

- `.planning/ROADMAP.md` (Phase 89 entry, lines 606) — locked acceptance criteria
- `docs/agentic-pipeline/README.md` — 5-stage funnel architecture, Swarm Shapes (Handler / Router / Hybrid)
- `docs/agentic-pipeline/stage-1-regex.md` — two-pass noise filter contract; closed list = noise keys + `unknown`
- `docs/collaboration.md` — workspace-per-phase + registry codegen pattern (Phase 89 touches `classifier_rules` registry)
- `web/lib/inngest/functions/classifier-screen-worker.ts:265-289` — LLM-path `agent_runs` insert (where `rule_key` must be added)
- `web/lib/inngest/functions/classifier-screen-worker.ts:401` — debtor dispatch gate (`stage1_regex_module === DEBTOR_REGEX_MODULE_KEY`) — explicitly NOT refactored in this phase
- `web/lib/inngest/functions/classifier-screen-worker.ts:488-494` — `readWhitelist` + `isWhitelistMatch` gate (no code change needed; gate works as-is once LLM `matchedRule` is set)
- `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts:160-194` — `recordVerdict` writes `rule_key` + `human_verdict` (must accept `llm:*` keys from the review UI payload)
- `supabase/migrations/20260428_classifier_rules.sql` — rule status schema (`candidate|promoted|demoted|manual_block`)
- `supabase/migrations/20260428_classifier_rule_telemetry.sql` — view aggregating `(swarm_type, rule_key, human_verdict)`; **NO schema change required**
- `web/lib/inngest/functions/classifier-promotion-cron.ts` — Wilson-CI evaluator; already registry-driven by `rule_key`, no LLM-specific branch needed
- `web/lib/inngest/functions/classifier-backfill.ts` — precedent for eager seeding (regex rules); mirror its `ON CONFLICT(swarm_type, rule_key)` pattern
- `.planning/debug/stage-2-customer-mapping-stuck.md` — original debug session that surfaced the gap (item C)
- `.continue-here.md` of recent phases — verify-phase83 backfill pattern (1344 priors, idempotent) is the precedent for the historic `rule_key` UPDATE
- Phase 999.8 D-11 — `pipeline_events.decision_details.predictor` already exposes `llm_2nd_pass` vs `regex` (no audit-panel UI work in Phase 89)

## Decisions

### Telemetry source: reuse existing view + `agent_runs.human_verdict`

**Decision:** No schema change to `classifier_rule_telemetry`. The existing view already aggregates `(swarm_type, rule_key, human_verdict in {approved, edited_minor})` over `agent_runs`. Make two writes line up with that contract:

1. **At LLM-verdict time** (`classifier-screen-worker` LLM path, agent_runs insert around line 265): set `rule_key = "llm:" + parsed.category_key + ":" + parsed.confidence`. Today this field is unset on the LLM path.
2. **At Stage-1 review time** (`recordVerdict` action — already writes both `rule_key` and `human_verdict`): the review UI payload must pass the same `llm:*` key for LLM-verdict rows so the operator's approve/reject lands on the same `(swarm_type, rule_key)` aggregate as the prediction.

**Why:** The roadmap's "widen view to `email_feedback.verdict`" wording was misleading — `email_feedback` is the Phase 82.4 prose/correction surface, semantically different from approve/reject. `human_verdict` is the canonical signal the promotion cron already consumes for regex rules. Reusing it gives LLM rules a single, audited promotion pathway with zero new view logic.
**How to apply:** Plan must touch (a) `classifier-screen-worker.ts` agent_runs insert, (b) the Stage-1 review UI payload to ensure LLM rows carry the `llm:*` rule_key into `recordVerdict`, (c) tests covering both paths. Do NOT modify `classifier_rule_telemetry`.

### Shadow-run validation: hybrid backfill (rule_key only, NOT human_verdict)

**Decision:** Ship a one-shot migration that UPDATEs `agent_runs.rule_key` on historic LLM verdicts where the field is currently NULL and `tool_outputs->>'stage1_category'` is non-null:

```sql
UPDATE public.agent_runs
SET rule_key = 'llm:' || (tool_outputs->>'stage1_category') || ':' || confidence
WHERE rule_key IS NULL
  AND tool_outputs ? 'stage1_category'
  AND confidence IS NOT NULL;
```

Do **not** retro-stamp `human_verdict` — leave that field exactly as operators left it. Historic rows that were never reviewed stay un-reviewed.

**Why:** Acceptance criterion (c) requires a 30-day Wilson-CI shadow producing ≥1 promotable rule_key. Without `rule_key` on historic LLM verdicts the shadow has zero data and Phase 89 verification slips by 30+ days. Backfilling `rule_key` only — never `human_verdict` — keeps the human-feedback signal honest: `n` and `agree` in the telemetry view will reflect actual operator reviews, just attributed to the right rule_key.
**How to apply:** Plan owns the migration as its own commit (idempotent; safe to rerun). Mirror the Phase 83 backfill harness pattern. Verification step: a Wilson-CI shadow run against the post-backfill data identifies ≥1 promotable `llm:*:high` rule_key.

### Seed strategy: eager all-combos `(swarm × noise_category × high)`

**Decision:** At deploy, INSERT `candidate` rows into `classifier_rules` for every combination of:
- every active row in `swarms` table,
- every `noise_category` in that swarm's `swarm_noise_categories`,
- `confidence = high` only.

`ON CONFLICT(swarm_type, rule_key) DO NOTHING`. Idempotent.

**Why:** Mirrors the regex seed precedent in `classifier-backfill.ts`. Dashboard `/classifier-rules` shows the full LLM coverage from day 1, including 0-traffic categories — operators can see at a glance which LLM rules are accumulating volume vs which are dormant. Roadmap-locked: low/medium confidence stays in bulk-review by design.
**How to apply:** Plan adds an Inngest function (one-shot or cron-fired-once) that reads `swarms × swarm_noise_categories` and upserts. Idempotent. Generated TS for the `confidence` enum stays in step with `Stage1OutputSchema` — if `Stage1OutputSchema.confidence` changes, this seed re-runs.

### Cross-swarm scope: data cross-swarm, dispatch debtor-only

**Decision:**
- `rule_key = "llm:{cat}:{conf}"` is written on **all** LLM verdicts regardless of swarm.
- `classifier_rules` seed covers **all** active swarms (debtor-email today; sales@, info@, order@ as they land in V10).
- Promotion cron is already swarm-agnostic — no change.
- The auto-action dispatch gate (`swarmRow.stage1_regex_module === DEBTOR_REGEX_MODULE_KEY` in `classifier-screen-worker.ts:401`) **stays debtor-only**. Each future swarm wires its own dispatch handler when it onboards.

**Why:** The roadmap entry's "cross-swarm by default" text mixes two concerns: the promotion *mechanism* (data + classifier_rules + cron) and the dispatch *handler* (the Outlook categorize+archive action). The mechanism is genuinely swarm-agnostic. The handler is not — info@ wants forward/route semantics, sales@ wants label-only, order@ TBD. Refactoring the dispatch gate without knowing those handlers' shapes would be premature and would couple Phase 89 to V10 swarm onboarding timing.

By shipping data cross-swarm, V10 mailboxes inherit LLM telemetry from the day they go live. Each swarm's auto-action wiring is then a one-line registry check against pre-existing promoted rules — no Phase 89 rework needed.

**How to apply:** Plan keeps all code edits inside the LLM-verdict insert path and the seed migration. Do NOT touch the `DEBTOR_REGEX_MODULE_KEY` gate. Acceptance criterion (d) still verifies via `result.stage='categorize+archive'` on debtor-email — that's the debtor handler exercising the promoted LLM rule, which is the right E2E test for this phase.

## Code context (reusable assets)

- **Existing whitelist gate** (`classifier-screen-worker.ts:488-494`) — `readWhitelist(admin, "debtor-email")` returns a Set of `rule_key`s with `status='promoted'`. Once an LLM rule_key gets promoted, `whitelistSet.has("llm:auto_reply:high")` evaluates to true with **no code change** to the gate. This is the central reuse.
- **Existing telemetry view** — same, no change.
- **Existing promotion cron** — already iterates the telemetry view, computes Wilson CI, updates `classifier_rules.status`. No LLM-specific branch needed.
- **Existing demotion gate** — `DEMOTE_N_MIN=30` floor (2026-05-20) applies uniformly to LLM rules. A promoted `llm:auto_reply:high` that later drifts will demote on the same logic. When demoted, the whitelist removes it and incoming LLM verdicts of that category+confidence fall back to bulk-review (current default behavior — no signal needed).
- **Predictor denormalization** — `pipeline_events.decision_details.predictor` already carries `llm_2nd_pass` vs `regex` (Phase 999.8 D-11). The chip strip is already wired; Phase 89 does not extend audit UI.

## Collaboration

Phase 89 touches the `classifier_rules` registry seed and the `agent_runs.rule_key` shape. Per `docs/collaboration.md`:
- Open a workspace via `/gsd-new-workspace 89-...` before starting.
- Registry changes go through a SQL migration + `npm run codegen` if any literal-union types depend on `confidence` or `noise_category` enums.
- CI gate: `npm run codegen && git diff --exit-code` to detect drift.

## Deferred ideas

- **Auto-action dispatch refactor (lift debtor gate to registry-driven action map):** belongs in **Phase 88** (info@smeba.nl info-routing swarm) — that's the first non-debtor swarm forcing the abstraction. Phase 89's data cross-swarm guarantees Phase 88 inherits a populated `classifier_rules` and ready-to-promote LLM telemetry.
- **Widening promotion to `medium` confidence:** explicitly out of scope per roadmap ("gate-narrow first, expand only when the high-confidence track proves out"). Revisit after Phase 89 demonstrates a stable promoted `llm:*:high` rule with healthy `human_verdict` rates over a 60-day window.
- **`email_feedback.verdict` as a secondary telemetry source:** revisit alongside V9.0 Promotion Recommender, which is the canonical home for prose-feedback synthesis.
- **Audit-panel surface for LLM rule_key status** (e.g., chip showing "promoted" vs "candidate"): defer; the existing `/classifier-rules` dashboard already exposes status.

## Acceptance (from ROADMAP.md, unchanged)

(a) `classifier_rules` carries `llm:*:high` rows
(b) Stage 1 worker `matchedRule` for LLM verdicts uses `llm:{cat}:{conf}` format
(c) Wilson-CI shadow-mode run on 30 days of corpus data identifies ≥1 promotable LLM rule_key
(d) Post-promotion, an LLM verdict with category+confidence matching a promoted rule_key produces an auto-archive cleanup row (verified via `automation_runs` for `triggered_by='stage-1-worker', result.stage='categorize+archive'`)
