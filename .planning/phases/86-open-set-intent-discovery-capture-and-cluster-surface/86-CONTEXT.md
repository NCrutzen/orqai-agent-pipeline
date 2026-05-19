# Phase 86: Open-set intent discovery — capture and cluster surface - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Source:** v8.1 reframing 2026-05-19 — pulls Phase 79's "two-tier intent capture" forward as the *dry-run discovery surface*. Lets the agent (not the engineer) propose new intent vocabulary, with the operator deciding what's real.
**Milestone:** v8.1 "Validation + Visibility" — observe → understand → THEN automate. Phase 86 is the **discovery surface**: classifier proposes, operator sees, V9.0 promotes.
**Depends on:** Phase 85 (provides the `intent_proposal` field). Can develop UI in parallel; flip live after 85 deploys.

<domain>

## Phase Boundary

**Core principle (locked, see memory `feedback-intent-vocab-emerges-from-data`):** intent vocabulary emerges from the LLM's proposals + operator promotion, NOT from hand-curation. Phase 86 builds the system that makes this loop possible during the dry-run period.

**What Phase 86 does:**

1. **Captures** `intent_proposal` + `proposal_reason` from every Stage 3 run (Phase 85's V3 schema) and persists per email.
2. **Clusters** proposals by string-similarity into weekly groups with sample-email previews.
3. **Surfaces** clusters in a Bulk Review tab `Intent proposals` showing count, label suggestions, and sample emails per cluster.
4. **Stops short of promotion** — promote-to-`swarm_intents` is V9.0's Learning Inbox responsibility. Phase 86 is read-only on the registry.

**Scope: read + display only.** Nothing in Phase 86 writes to `swarm_intents` or changes Stage 4 dispatch.

</domain>

<decisions>

## Implementation Decisions

### D-01 — Storage: extend `coordinator_runs.ranked_intents` JSONB, no new column

Reasons:
- `coordinator_runs.ranked_intents` is already JSONB and already written per Stage 3 run (Phase 65 schema).
- Adding `intent_proposal` + `proposal_reason` to the same row keeps the Stage 3 audit trail in one place.
- No migration needed beyond schema docs.

**Shape (extending existing JSONB):**

```json
{
  "ranked": [...],
  "language": "...",
  "urgency": "...",
  "intent_version": "2026-05-19.v3",
  "intent_proposal": "wka_data_request" | null,
  "proposal_reason": "Sender requests periodic WKA chain-liability data; ..." | null
}
```

The coordinator orchestrator already writes the full agent output to `ranked_intents` — Phase 86 just **stops dropping** the new fields. Phase 85's backward-compat parser preserves V2 rows.

### D-02 — Read view: `intent_proposals_v1` SQL view

Materialised view over `coordinator_runs WHERE ranked_intents->>'intent_proposal' IS NOT NULL` exposing:

| column | source |
|---|---|
| `email_id` | `agent_runs.email_id` JOIN |
| `swarm_type` | `coordinator_runs.swarm_type` |
| `proposal_label` | `ranked_intents->>'intent_proposal'` |
| `proposal_reason` | `ranked_intents->>'proposal_reason'` |
| `ranked_top_intent` | `ranked_intents->'ranked'->0->>'intent'` |
| `created_at` | `coordinator_runs.created_at` |
| `subject` | `email_pipeline.emails.subject` JOIN |
| `sender_email` | `email_pipeline.emails.sender_email` JOIN |

Refresh nightly via existing cron pattern. Manual refresh button for the dashboard.

### D-03 — Clustering: simple string-similarity, not an LLM call

Phase 86 must work cheaply at corpus scale and be auditable. Algorithm:

1. Normalize each `proposal_label` (lowercase, strip punctuation, snake_case enforce).
2. Pairwise Levenshtein on normalized labels; threshold ≥ 0.85 similarity merges.
3. Cluster centroid = most-frequent label in the cluster.
4. Compute weekly cluster counts.

**Decision: no LLM in the cluster path.** Keeps it deterministic, debuggable, and free. V9.0's synthesis layer (T2) will apply LLM clustering on the *semantic* level later — Phase 86 is the surface, V9.0 is the brain.

Implementation: pure SQL + JS in a server-side route handler. No new dependencies.

### D-04 — UI: new "Intent proposals" tab inside Bulk Review

Mounted as a peer tab to the existing per-stage tabs (Stage 0 / Stage 1 / Stage 2 / Stage 3 / Stage 4). Tab content is a list grouped by cluster, each cluster expandable to show:

- Cluster centroid label (`wka_data_request`) + count this week / last 30d.
- The closed-list intent the agent picked instead (ranked-top) — important context.
- 3-5 sample emails (subject + sender + first 200 chars).
- "Open in full Bulk Review" link per sample.

**Read-only.** No buttons. No "promote." That's V9.0.

### D-05 — Cross-swarm by default

The view JOINs `swarm_type`, so proposals from sales-email (when V10.0 lands) appear in the same surface filtered by swarm. Avoids building a new surface per swarm.

### D-06 — Empty state messaging

Until the live agent generates proposals (first 24-48h post-Phase 85 deploy), the tab shows: *"No novel intent proposals yet. The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic."*

This is a feature, not a bug — operator sees "system is honest about what it knows" rather than fake data.

### D-07 — Telemetry on the surface itself

Track in `pipeline_events` (or a simple `intent_proposal_views` table) when an operator opens the proposals tab. V9.0 needs this signal to know whether the human side of the loop is being used.

</decisions>

<scope>

## In scope

- Schema doc update: `ranked_intents` JSONB shape now includes proposal fields.
- `intent_proposals_v1` SQL view + nightly refresh.
- Bulk Review "Intent proposals" tab — read-only UI with clusters + samples.
- Levenshtein-based clustering (server-side, no LLM).
- Empty-state messaging.
- Light telemetry on tab opens.

## Out of scope

- Promote-to-`swarm_intents` action — **V9.0 Learning Inbox**.
- LLM-based semantic clustering of proposals — V9.0.
- Editing proposal labels — operator can only observe in V8.1.
- Per-cluster status flags (`pending_review`, `dismissed`) — V9.0.
- Sales-email-specific intent agent — V10.0.

</scope>

<verification>

## Success criteria

1. **Within 7 days of Phase 85 going live**, the proposals tab shows ≥ 5 distinct clusters with ≥ 3 samples each. (If fewer, Phase 85 calibration is off — investigate, don't ship 86 closed.)
2. **At least one cluster** in the first 7 days matches a "missing intent" we already suspect from corpus analysis (e.g. WKA data requests, PO notifications). Not a hard gate — the system can surprise us — but a calibration sanity check.
3. **Clustering precision spot-check:** for the 3 largest clusters, ≥ 80% of labels grouped are genuinely the same intent (operator verdict on 10 random samples per cluster).
4. **Operator opens the tab ≥ 2× per week** for 4 consecutive weeks. If not, the surface isn't useful and Phase 86 design needs rework before V9.0 builds on top.

</verification>

<dependencies>

## Depends on

- **Phase 83** — landed input.
- **Phase 85** — provides the proposal field.

## Enables

- **V9.0 Learning Inbox** — Phase 86 captures, V9.0 synthesizes + promotes.
- **V11.0 Intent-Prioritised Handlers** — once V9.0 promotes a proposal to `swarm_intents`, V11.0's dashboard counts it; V8.2 picks it up as handler candidate.

</dependencies>

<risks>

## Risks

- **R-01 — Clustering too aggressive merges distinct intents.** E.g. `wka_request` and `wka_data_request` merge into one cluster, but `payment_extension_request` and `payment_schedule_request` are genuinely different and shouldn't. Mitigation: D-03 threshold 0.85 leaves room; D-04 shows samples per cluster so operator catches false merges. V9.0 layer can re-cluster semantically.
- **R-02 — Clustering too loose, every proposal its own cluster.** Mitigation: report cluster count + average cluster size weekly; if avg size < 2 after 4 weeks, threshold needs lowering.
- **R-03 — Operator never looks at the tab.** Mitigation: V8.1 closure (Phase 87) reports proposals-tab usage as a milestone metric. If it's near-zero, the discovery loop is broken — reopen 86 before V9.0.
- **R-04 — Storage bloat from agent over-proposing.** Mitigation: D-01 stores proposals in existing `ranked_intents` JSONB — no new row per email, ~50 bytes per non-null proposal.

</risks>
