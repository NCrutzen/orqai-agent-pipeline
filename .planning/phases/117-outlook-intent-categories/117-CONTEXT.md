# Phase 117: Outlook Intent Categories - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning
**Source:** Operator session 2026-06-15 (sales go-live prioritisation) — decisions locked in conversation; roadmap §Phase 117 success criteria.

<domain>
## Phase Boundary

Close the human-correction loop **where users already work — Outlook** — for any swarm on an Outlook mailbox. After Stage 3 produces a verdict, a **swarm-agnostic worker writes the top-1 intent back onto the source message as a native Outlook category** (`AI:` prefix, e.g. `AI: quote_request`) via Microsoft Graph. Operators correct it in place (change/remove the category); the existing Phase 112.5 delta-sync observes that change and distils it into a labelled correction signal. Generality is the headline: registry-driven, dry-run-gated, second swarm onboards via a registry row with **zero per-swarm code** (SWARM-02 gate).

**This is the sales go-live priority** (operator, 2026-06-15): the intent label + the monitoring of operator answers/changes is the observe-mode loop that go-live is about. Stage 2 customer-resolution is explicitly NOT in scope here (observe-only, separate fast-follow).

**In scope:** the intent→category write path (mapper + worker + Stage 3 trigger + dry-run gate + per-message written-category store for idempotency). **Out of scope:** the 112.5 delta/signal side (separate phase — but this phase's written-category store is the baseline 112.5 needs; see canonical refs).
</domain>

<decisions>
## Implementation Decisions

### D-1 — Category convention (settles roadmap decision 1)
- Write **exactly one** `AI:`-prefixed category = the Stage 3 **top-1 intent key**: `AI: <intent_key>` (e.g. `AI: quote_request`).
- **No confidence suffix in v1** (deferred — keep the string a clean, machine-parseable `AI: <intent_key>` so 112.5 delta-detection diffs cleanly). The `AI:` prefix is the marker that lets 112.5 tell AI-written labels from user-authored Outlook categories.
- The intent→category mapping is **trivial/derived** (`AI: ${intent_key}`), NOT a hand-maintained per-swarm map — intent keys come from `swarm_intents`. Keep the mapper a pure function; do not hardcode a per-swarm category table.

### D-2 — Swarm-agnostic worker (SC-1, SWARM-02)
- One shared Inngest worker, registry-driven. **Zero `if swarm===…` branches.** It loads the swarm row, reads config, and acts uniformly. Onboarding swarm #2 = a registry row only (SC-4 generality proof).
- Triggered after Stage 3 flips the row to `predicted` — emit a swarm-agnostic event (e.g. `pipeline/intent-label.requested`) carrying `{swarm_type, email_id, source_mailbox, intent_key, pipeline_event_id, run_id}`. Reuse the existing Stage-3 → side-effect dispatch pattern; do not add a per-swarm emit.

### D-3 — Gated production write (SC-2; settles roadmap decision 3)
- Reuse the **Phase 112 gated-write infra**: `web/lib/pipeline-gating/dry-run-gate` `isStageBlocked(swarm, stage)` + `categorizeEmail()` (`web/lib/outlook/client.ts`). Same pattern as `stage_1_archive`.
- **New dry-run key:** `dry_run_config.stage_3_intent_label` (distinct from the existing `stage_3_labeling` / `stage_3_routing` keys to avoid regressing debtor's live predicted-emit). Migration adds the key; **seed both debtor-email AND sales-email = `true` (GATED)** — the write is a no-op until an operator green-lights and flips the flag. Convention: `true` = BLOCKED/dry-run, missing = fail-closed.
- **Sales caveat (⚠):** respect the Sugar cut-over / Power Automate sweep dependency before writing to `verkoop@smeba.nl` (the same flow that gated 112.5 activation). The dry-run flag is the control; do not flip sales live until that is clear.

### D-4 — Idempotency + never-clobber (SC-5; settles roadmap decision 4)
- **Persist the last AI category this worker wrote per message** (per `pipeline_event` / source message immutable id) — a small store (new column or table). This serves TWO purposes:
  1. **Idempotency / anti-churn:** only call Graph when the new top-1 intent differs from the last-written `AI:` category for that message. Replay/re-run with the same verdict = no Graph call.
  2. **Never-clobber:** if the 112.5 delta ledger shows the operator already touched the category (a correction signal exists for this message), the worker MUST NOT overwrite it — the operator's edit is the source of truth.
- `categorizeEmail()` already merges into the existing category set (dedup) — but the worker must additionally **strip a stale `AI:` category before writing a new one** so a verdict change replaces rather than accumulates `AI:` labels. Keep non-`AI:` (user) categories intact.

### D-5 — Cross-phase integration with 112.5 (informs SC-3)
- The per-message written-category store (D-4) is the **baseline snapshot 112.5 needs**: 112.5's `category_edited` transition is currently dormant because `prevCategories` aren't persisted. This phase's store closes that gap from the write side — 112.5's delta-sync diffs the live category against this baseline to detect an operator edit. Coordinate the store shape with `web/lib/email-behavior/*` so 112.5 can read it (or emit the baseline 112.5 already expects). Do NOT build the 112.5 signal side here.

### Claude's Discretion
- Exact store shape (column on an existing per-email row vs a dedicated table) — pick the lowest-friction, RLS-correct option that 112.5 can read.
- Event name + payload field names (follow existing pipeline event conventions in `web/lib/inngest/events.ts`).
- Whether the write-on-change check reads the store, the 112.5 ledger, or both.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gated Graph write (reuse target — Phase 112)
- `web/lib/outlook/client.ts` — `categorizeEmail(mailbox, messageId, category)` (Graph PATCH, dedup-merge) + `graphFetch` boundary.
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — `DryRunConfig` interface + `isStageBlocked(swarm, stage)` (add `stage_3_intent_label` key here).
- A Phase 112 gated-write worker as the template (e.g. the classifier verdict worker that gates `stage_1_archive`) — `web/lib/inngest/functions/` (find the verdict/screen worker that calls `categorizeEmail` behind `isStageBlocked`).
- `supabase/migrations/20260603b_swarms_dry_run_config.sql` + `20260609c_phase113_stage3_routing_gate.sql` — dry-run-config seed pattern to copy for the new key.

### Stage 3 verdict (input)
- The per-swarm coordinator output: `coordinator_runs.ranked_intents` (top-1 = `ranked_intents[0].intent`); row flips `agent_runs.status='predicted'`. `swarm_intents` registry = the intent vocabulary.
- `docs/agentic-pipeline/stage-3-coordinator.md` — ranked-intent classifier contract.

### Phase 112.5 (the correction observer — coordinate, do not build)
- `web/lib/email-behavior/transition-extract.ts` (`category_edited` transition, currently dormant) + `signal-derive.ts` + `web/lib/inngest/functions/swarm-behavior-sync.ts`.
- Tables `public.swarm_review_signals`, `public.swarm_email_transitions`, `public.outlook_delta_tokens` (migration `20260604_swarm_behavior_tracking.sql`).
- `.planning/phases/112.5-outlook-behavior-tracking-passive-review-signals/` — its plans + the dormant-category-edit gap.

### Registry + RLS
- `public.swarms` (`dry_run_config`, `behavior_tracking_config`, intent config) — registry-driven enablement.
- CLAUDE.md Supabase section — RLS mandatory on any new table; migration template `supabase/migrations/_template.sql`.
</canonical_refs>

<specifics>
## Specific Ideas

- Requirement IDs (map to the 5 roadmap success criteria):
  - **OUTLOOK-CAT-01** — swarm-agnostic worker writes `AI: <top-1 intent>` to the source message for every onboarded swarm; zero per-swarm branches.
  - **OUTLOOK-CAT-02** — registry-driven + `stage_3_intent_label` dry-run gated per swarm; no-op until opted in + flag flipped.
  - **OUTLOOK-CAT-03** — an operator change/removal of the category is captured by 112.5 and persisted as a labelled correction signal tied to the originating `pipeline_event` (this phase provides the written-category baseline that makes 112.5's edit-detection fire).
  - **OUTLOOK-CAT-04** — cross-swarm generality proof: a second Outlook swarm enabled end-to-end by a registry row only (no code change).
  - **OUTLOOK-CAT-05** — idempotent + never-clobber: write only on verdict change, strip stale `AI:` label, never overwrite an operator-authored correction; replay does not churn.
- Reuse `categorizeEmail` + the dry-run gate verbatim — this phase is ~150-200 LOC + 1 migration + tests; the infra exists.
</specifics>

<deferred>
## Deferred Ideas

- Confidence suffix on the category (`AI: quote_request (low)`) — v2.
- The 112.5 signal-derive classification of removed vs changed-to-AI vs changed-to-non-AI — that lives in Phase 112.5 (this phase only writes + stores the baseline).
- Sales live-flip of `stage_3_intent_label` — operator decision after Sugar cut-over; ships gated.
- V10.0 Promotion Recommender consumption of the correction signals.
</deferred>

---

*Phase: 117-outlook-intent-categories*
*Context gathered: 2026-06-15 via operator session (sales go-live prioritisation)*
