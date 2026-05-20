---
slug: injection-suspected-and-s3-drop
status: root_cause_found
trigger: |
  DATA_START
  Two operational anomalies from the Wed 2026-05-13 11:37 UTC health tick that
  the operator wants investigated, scoped together because both are live-data
  questions on the debtor-email pipeline (not code bugs):

  (A) First-ever Stage 0 `injection_suspected` verdict appeared (n=1). Need to
      identify: which mailbox, which email (sender + subject + message_id), what
      content triggered the safety classifier, and whether the verdict is a
      true positive (real prompt-injection attempt in an inbound email) or a
      false positive on benign content. Stage 0 safety classifier output lives
      on the row whose stage_0 verdict = 'injection_suspected'.

  (B) Stage 3 funnel depth dropped 72 → 65 (-7) despite +30 net Stage 1 events
      in the same 21h window. The session manager's note: "rows leaving Stage 3
      (or being reclassified) rather than entering." Need to identify: which
      rows moved out of S3, what their new max-stage is, and whether the
      legacy backfill (the `unknown_legacy` 269-row backfill that also remains
      unexplained) is reclassifying things. The Stage 3 dispatcher itself has
      idempotency guards that look correct in isolation — so the most likely
      explanations are (i) the MAX-stage rollup in the health-tick query
      shifted because some emails got NEW Stage 1 rows after they had Stage 3
      rows (would lower their MAX from 3 → 3, no change — so this is unlikely),
      (ii) Stage 3 rows got deleted/soft-deleted, or (iii) the
      `routed_human_queue` status counter pulled rows that were previously
      counted as S3-depth into a different bucket.

  Also relevant: `routed_human_queue` agent_runs.status frozen at 32 for ~48h
  predates the c4308b0 dedup-bug freeze, so Stage 3 routing has been silent
  for longer than the cleanup-handler freeze. Worth verifying whether the
  Stage 3 dispatcher / coordinator-orchestrator is actually firing.
  DATA_END
created: 2026-05-13T12:15:00Z
updated: 2026-05-13T12:45:00Z
---

# Debug: injection-suspected-and-s3-drop

## Symptoms

- **(A) injection_suspected:** First non-`safe`, non-`unknown_legacy` Stage 0
  verdict ever recorded. n=1. Mailbox, sender, content unknown to operator.
- **(B) S3 depth drop:** debtor-email funnel-depth Stage 3 went 72 → 65 in
  21h despite +30 Stage 1 events. Net S3 inflow should be ≥0; observed -7.
- Stage 3 `routed_human_queue` agent_runs.status frozen at 32 for ~48h
  (predates the cleanup-handler freeze diagnosed in
  `pipeline-side-effects-frozen.md`).
- Expected for (A): identify mailbox/sender/content, classify as TP/FP.
- Expected for (B): identify which rows left S3 and explain why.

## Current Focus

- hypothesis: (A) is a single inbound email — most likely from a marketing
  newsletter or a forwarded auto-reply that contains LLM-instruction-like
  text ("Ignore previous instructions", role tags, system-prompt markers) —
  triggering the Stage 0 prompt-injection classifier on benign content.
  (B) is most likely either Stage 3 row soft-deletion via a cleanup/backfill
  job, OR the health-tick query's MAX-stage rollup interacts with the
  unknown_legacy backfill (rows that had S3 verdicts but got a NEWER backfill
  row at a different stage and the query's MAX shifted). A third possibility:
  the routed_human_queue freeze means Stage 3 verdicts are written but not
  routed, and a separate housekeeping job is purging old un-routed verdicts.
- test:
  (A) Query `email_pipeline.emails` (or wherever stage_0 verdicts land) for
  the single row with stage_0_verdict = 'injection_suspected'. Read the
  email body, sender, subject. Cross-reference the agent_runs.tool_outputs
  for the Stage 0 safety classifier on that message_id for the classifier's
  reasoning.
  (B) Compare two snapshots of the funnel-depth query — yesterday's S3
  set (72 message_ids) vs today's S3 set (65). The diff = ~7 message_ids
  that "left" S3. For each, read their full pipeline-events history
  (stage_0 → stage_1 → stage_2 → stage_3 verdicts in chronological order)
  to see whether they got a new row at a different stage, got soft-deleted,
  or had their Stage 3 row updated.
- expecting: (A) likely benign content + FP classification — useful for tuning
  the Stage 0 safety prompt. (B) most likely either soft-delete by a
  housekeeping job, or the legacy-backfill is writing rows that interact
  with the MAX-stage rollup.
- next_action: identify the Supabase schema for stage_0 verdicts and
  pipeline-events (canonical doc: `docs/debtor-email-pipeline-architecture.md`),
  then run the two queries.

## Evidence

_(populated by investigator)_

## Eliminated

_(populated by investigator)_

## Resolution

_(populated when explained)_
