# Phase 87: Retro-classification + intent-volume baseline - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning (last phase of v8.1)
**Source:** v8.1 closure verification — produces the dataset V8.2 handler prioritisation reads.
**Milestone:** v8.1 "Validation + Visibility" — observe → understand → THEN automate. Phase 87 is the **closure**: re-run Stage 3 against historical mail with everything from 83+84+85+86 active, produce the baseline, and decide whether v8.1's thesis ("clean input + better prompt + open-set surface → meaningful signal") held up.

**Depends on:** 83, 84, 85, 86 all live in production.

<domain>

## Phase Boundary

**Two deliverables, one phase:**

1. **Retro-classification pass.** Re-run the V3 Stage 3 agent against the last 30-90 days of debtor-email mail (post-Phase-83 ingestion fix → full body) and produce a comparison report: pre-v8.1 intent distribution vs post-v8.1 intent distribution. This is the falsifiable evidence that v8.1 worked.

2. **Intent-volume baseline.** Persist a snapshot of intent counts (closed-list + open-set proposal clusters) per swarm per 30-day window. V8.2 handler prioritisation, V11.0 dashboard, and V9.0 synthesis layer all read this.

**Scope:** read-only re-classification, single comparison report, baseline snapshot tables. **No live pipeline changes.**

</domain>

<decisions>

## Implementation Decisions

### D-01 — Retro-classification source: persisted emails, not live re-fetch

After Phase 83's backfill, `email_pipeline.emails.body_full_text` is populated for the 90-day window. Re-classification reads from Supabase, NOT from Microsoft Graph. Reasons:

- Idempotent, no Graph rate limits.
- Reproducible: future re-runs of Phase 87 (e.g. after prompt v4) read the same input.
- Cheaper.

### D-02 — Re-classification runs as a one-shot Inngest function, not a cron

`debtor-email-stage-3-retro-classify` — manually triggered via `inngest.send` from the dashboard. Inputs: `{ swarm_type, since_date, until_date, sample_limit? }`. Output: rows in a new `stage_3_retro_runs` table with `(run_id, email_id, swarm_type, original_top_intent, new_top_intent, original_confidence, new_confidence, intent_proposal, created_at)`.

Idempotency: `(run_id, email_id)` UNIQUE. Re-runs allowed under new `run_id`.

### D-03 — Cost cap: explicit sample budget

Re-running 5k emails through Sonnet 4.5 at ~2k input tokens each is well within budget, but explicit ceiling needed:

- Default sample: 30 days, all emails that survived Stage 1 (i.e. reached Stage 2/3 originally).
- Hard cap: 5000 emails per run, fail loud above.
- Telemetry: total `agent_runs.token_usage` per `run_id` reported in the closure summary.

### D-04 — Comparison report shape

Single Markdown report `.planning/phases/87-…/87-BASELINE-REPORT.md` containing:

1. **Distribution shift table** — for each closed-list intent: pre-v8.1 count (live distribution from Phase 76+), post-v8.1 count (this re-run), delta, % delta.
2. **Open-set proposal summary** — Phase 86's cluster output as of run date: top-N proposals by count, with cluster centroid + sample count.
3. **Per-email diff sample** — 20 random rows where `original_top_intent ≠ new_top_intent`, with subject + sender + both verdicts + new ranked-top reasoning. Hand-grade each: "correctly reclassified" / "incorrectly reclassified" / "ambiguous." Report precision per direction.
4. **Hypotheses confirmed/refuted** — checklist against the Phase 83 D-07 acceptance threshold (≥ 50% of catch-all rows reclassify away from `general_inquiry`/`other`) and the Phase 84 verification criteria (Coupa PO + auto-replies + own-domain loopback no longer appear in Stage 3 at all).

### D-05 — Baseline snapshot table — `intent_volume_baselines`

New table for V8.2+ consumers:

```sql
CREATE TABLE intent_volume_baselines (
  baseline_id uuid PRIMARY KEY,
  swarm_type text NOT NULL,
  window_start date NOT NULL,
  window_end date NOT NULL,
  intent_key text NOT NULL,        -- closed-list intent OR proposal cluster centroid
  intent_source text NOT NULL,     -- 'closed_list' | 'proposal_cluster'
  count integer NOT NULL,
  share numeric(5,4) NOT NULL,     -- count / total in window
  created_at timestamptz DEFAULT now()
);
```

Phase 87 writes one snapshot. V8.2 / V9.0 / V11.0 read it. Future Phase 87 runs (after prompt v4, after new swarms) append new baselines — never overwrite.

### D-06 — No automated decision-making in Phase 87

Phase 87 produces *the report*. It does NOT auto-promote proposals, auto-create handler phases, or change registry rows. Those are explicit operator actions in V9.0 / V8.2.

### D-07 — Sales-email parity

If V10.0's sales-email Stage 3 is live by the time Phase 87 runs, the same script runs for sales-email and the report has two sections. If not, debtor-email only — sales-email baseline lands in V10.0 closure.

</decisions>

<scope>

## In scope

- `stage_3_retro_runs` table.
- `intent_volume_baselines` table.
- `debtor-email-stage-3-retro-classify` Inngest function.
- Dashboard trigger button (or CLI script for ops if dashboard not ready).
- `87-BASELINE-REPORT.md` written by hand from query outputs.
- 20-row hand-graded diff sample.

## Out of scope

- Automated promotion of proposals.
- V8.2 handler scoping (Phase 87 is the *input* to V8.2; V8.2 picks handlers).
- LLM-based diff analysis — D-04 step 3 is human review.

</scope>

<verification>

## Success criteria

1. **Phase 83 D-07 threshold met:** ≥ 50% of the 42 catch-all rows from 2026-05-05..2026-05-19 reclassify away from `general_inquiry` / `other` when re-run with full thread + V3 prompt. (Carried forward from Phase 83.)
2. **Coupa PO / auto-reply / own-domain-loopback rows are absent from Stage 3 entirely** in the re-run window (because Phase 84's Stage 1 noise rules filtered them out before Stage 3 runs).
3. **Open-set proposal surface is non-empty** — Phase 86 captured ≥ 5 distinct proposal clusters during the live run window, and at least one was hand-validated by the operator as a real candidate intent.
4. **Hand-graded diff sample precision** — of the 20 reclassified rows, ≥ 70% land on "correctly reclassified."
5. **Baseline snapshot is queryable** — V8.2 / V9.0 / V11.0 can `SELECT … FROM intent_volume_baselines` to read top-N uncovered intents by frequency.
6. **`/gsd-audit-milestone v8.1` passes.** All five v8.1 phases (83-87) closed; closure narrative confirms the thesis "observe → understand → THEN automate" played out as designed.

</verification>

<dependencies>

## Depends on

- **Phase 83** — full-body input.
- **Phase 84** — Stage 1 noise rules filtering FYI traffic.
- **Phase 85** — V3 prompt + schema.
- **Phase 86** — proposal capture + cluster surface live for the run window.

## Enables

- **V8.2 — Selective handler automation.** Data-driven handler picking from `intent_volume_baselines`.
- **V9.0 — Learning Inbox.** Synthesis layer reads both `intent_volume_baselines` and `intent_proposals_v1` view.
- **V11.0 — Intent-Prioritised Handlers dashboard.** Reads `intent_volume_baselines` as primary input.

</dependencies>

<risks>

## Risks

- **R-01 — Acceptance threshold not met (Phase 83 D-07).** v8.1's premise is wrong, or Phase 85 prompt v3 is mis-tuned. Mitigation: report it honestly. The phase is *designed* to be falsifiable. If thresholds miss, the phase doesn't close — we iterate on prompt or input layer before V8.2 starts.
- **R-02 — Cost surprise.** 5k × Sonnet 4.5 inference at ~2k input tokens. Mitigation: D-03 hard cap; report token usage explicitly.
- **R-03 — Hand-grading is the bottleneck.** 20 rows is small and tractable; 200 would be too many. Mitigation: D-04 step 3 caps at 20.
- **R-04 — Open-set surface still empty at 7 days post-85 deploy.** Phase 86 risk R-01 reactivates here. Mitigation: extend the live window before running Phase 87 — don't run on insufficient data.

</risks>
