# Promotion Recommender (Phase 72 placeholder)

> **Status:** STUB — design memo only. Implementation lands in Phase 72.
> **Audience:** Phase 72 implementer; Phase 70/71 reviewers checking the read-side contract.
> **Supersedes:** nothing yet — this is a forward reference from Phase 70's `pipeline_events` deliverable.

## Purpose

The promotion recommender is an **Inngest cron** that scans `public.pipeline_events` to surface graduated-automation candidates: recurring LLM-handled patterns that should be promoted down to deterministic regex rules, sender mappings, or prompt-tunes. It is the closing loop of the v8.0 funnel — every Stage 3/4 LLM call that the recommender can later replace with a Stage 1 regex hit is one less per-email cost and one more deterministic decision. Phase 70 ships the read-side contract (the `pipeline_events` table) so the recommender has a single source of truth to query; Phase 72 ships the cron, the candidate table, and the operator-facing Learning Inbox UI. This stub fixes the contract Phase 72 is allowed to assume — it is not implementation guidance, only a forward-reference.

The recommender addresses REQUIREMENTS LERN-01..05 (promotion candidates table, non-blocking cron, Learning Inbox UI, operator-approval flow, rollback traceability).

## Input Contract (read from Phase 70)

The recommender reads from `public.pipeline_events` only — never from the legacy denormalised tables (`agent_runs`, `email_labels`, `automation_runs`, `classifier_rules`). Canonical query shape:

```sql
SELECT
  swarm_type,
  stage,
  decision,
  confidence,
  decision_details,
  override,
  eval_type,
  cost_cents,
  email_id,
  agent_run_id,
  created_at
FROM public.pipeline_events
WHERE swarm_type = $1
  AND stage = $2
  AND created_at >= now() - interval '30 days'
ORDER BY created_at DESC;
```

Override-driven candidate detection (Phase 71 light up `override` and `eval_type`) hits the partial index `pipeline_events_override_partial_idx` (Phase 70 D-04):

```sql
SELECT * FROM public.pipeline_events
WHERE override IS NOT NULL
  AND created_at >= now() - interval '30 days';
```

The recommender MUST treat `pipeline_events` as append-only — never UPDATE / DELETE rows. All recommender state lives in its own output table (below).

Columns the recommender consumes per stage:
- **Stage 1 promotion** (LLM-handled → regex): aggregate `decision` + `decision_details` from Stage 3/4 events, group by sender / subject pattern, propose a regex rule that would have caught ≥N events with consistent downstream outcome.
- **Stage 2 promotion** (entity miss → sender mapping): aggregate `override` rows where `axis = 'stage_2_customer'` and group by sender domain.
- **Stage 3/4 prompt-tune**: aggregate `override` rows where `axis ∈ ('stage_3_intent', 'stage_4_handler_output')` and surface the highest-volume miss patterns for prompt revision.

## Output Contract (forward-ref Phase 72)

Phase 72 ships `public.promotion_candidates` (table not yet created). Expected shape:

```sql
CREATE TABLE public.promotion_candidates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  kind                text NOT NULL,             -- 'regex_rule' | 'sender_mapping' | 'prompt_tune'
  swarm_type          text NOT NULL,
  stage               smallint NOT NULL,
  expected_volume     integer NOT NULL,          -- # events / 30d that this candidate would have caught
  expected_savings    numeric(10,4) NULL,        -- estimated cost_cents saved / 30d
  evidence_event_ids  uuid[] NOT NULL,           -- soft-ref into pipeline_events.id
  proposed_change     jsonb NOT NULL,            -- kind-specific payload (regex pattern, sender→customer mapping, prompt diff)
  status              text NOT NULL DEFAULT 'open', -- 'open' | 'approved' | 'rejected' | 'rolled_back'
  approved_by         uuid NULL,
  approved_at         timestamptz NULL
);
```

The cron runs on an Inngest schedule (e.g. nightly, business-hours-only per `CLAUDE.md` §Inngest cron defaults), reads from `pipeline_events`, INSERTs new rows into `promotion_candidates`, and surfaces them in the Learning Inbox UI.

## Non-Goals for v1 (Phase 72)

- **Never blocks the synchronous pipeline** (LERN-02). The recommender is strictly out-of-band; Stage 0..4 emit-sites do not wait on it, do not query it, and do not depend on its state.
- **Never auto-applies a candidate without operator approval** (LERN-04). Each candidate stays `status='open'` until an operator reviews it; only on approval does Phase 72 generate a migration / config change with full audit trail.
- **No backfill of pre-Phase-70 history.** `pipeline_events` starts empty when Phase 70 ships; the recommender's first useful run is ~30 days after Phase 70 production rollout.
- **No cross-swarm correlation in v1.** Each `swarm_type` is recommended independently; cross-swarm candidate detection is deferred.

## Cross-References

See `docs/agentic-pipeline/README.md` for the funnel architecture this recommender observes. See `.planning/phases/70-telemetry-consolidation-pipeline-events/70-CONTEXT.md` D-15 for the Phase 70 commitment that produced this stub. See REQUIREMENTS.md §LERN-01..05 for the Phase 72 acceptance criteria.

---

*Phase 70 only ships the read-side contract. Phase 72 owns the cron + UI + approval flow.*
