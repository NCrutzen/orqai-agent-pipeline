# Phase 86 — Operator Runbook

**Purpose.** Drive the 4-week observation window that turns the Phase 86 discovery surface from "shipped" into "validated." Every check below produces a verdict that lands in `86-VERIFICATION-LOG.md`. Phase 87 (V8.1 closure) reads that log; V9.0 (Learning Inbox) builds on top of its conclusions.

**Owner.** Operator running the debtor-email pipeline (default: the engineer on-rotation for v8.1 stabilisation).

**Status today (2026-05-20).** Plans 01–03 are shipped. Phase 85 V3 consumer code merged on `main` at 15:14 UTC; first V3 emit awaits the next inbound debtor email. The day-0 pre-flight (see `86-DAY-0-CHECKPOINT.md`) is the first action — schedule the day-7/14/21/28 calendar reminders the moment the pre-flight passes.

---

## How Phase 86 success is judged

Four success criteria from `86-CONTEXT.md`, each mapped to a check cadence below. **Success #1 is operationally refined per drift #4** — CONTEXT.md stays unchanged, the refinement lives here:

| ID         | From CONTEXT                                                                                     | Refined here?                                                                          | Check cadence                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Success #1 | ≥5 distinct clusters with ≥3 samples each within 7 days                                          | YES — day-7 ≥1 cluster sub-criterion · ≥2 clusters by day-14 · ≥5 clusters by day-21–28 | day-7, day-14, day-21, day-28                                          |
| Success #2 | ≥1 cluster matches a corpus-suspected missing intent (WKA family, PO notifications)              | NO                                                                                     | day-14, day-28                                                         |
| Success #3 | Top-3 clusters: ≥80 % same-intent on 10 random samples each                                      | NO                                                                                     | day-14, day-28 (clusters must have ≥10 members)                        |
| Success #4 | Operator opens the tab ≥2× per week for 4 consecutive weeks                                      | NO                                                                                     | every Friday end-of-day                                                |

The day-7 sub-criterion exists to prove the end-to-end write-through chain (V3 emit → `pipeline_events.decision_details` → `intent_proposals_v1` view → 04:00 cron → `intent_proposal_clusters` snapshot → tab) is alive. The day-21–28 window holds the original ≥5 target — relaxed in time, not in substance.

---

## Storage truth (read this before running any SQL)

Locked at Plan 01:

- **Raw proposals** land in `public.pipeline_events.decision_details` (jsonb). Phase 85's spread-conditional emit at `debtor-email-coordinator.ts:329-332` writes `intent_proposal` and `proposal_reason` here. **NOT** in `coordinator_runs.decision_details`.
- **Read view** = `public.intent_proposals_v1` (regular view, `security_invoker=true`). Source = `pipeline_events` LEFT JOIN `email_pipeline.emails`.
- **Cluster snapshot** = `public.intent_proposal_clusters`. PK column is `id` (uuid). UPSERT key is `(swarm_type, centroid_label, window_end)`. **There is no `cluster_id` column and no `refresh_window_end` column** — early plan drafts referred to them; the live schema uses `id` and `window_end`.
- **Telemetry** = `public.intent_proposal_views` (one row per tab open). Retention = 90 days, enforced by the 04:00 cron's purge step.

The Plan 01 view columns, in projection order, are:

```
pipeline_event_id, email_id, swarm_type, proposal_label, proposal_reason,
intent_version, ranked_top_intent, created_at, subject, sender_email
```

---

## Day 0 — Pre-flight

Walk every step of `86-DAY-0-CHECKPOINT.md` before scheduling any cadence checks. Pre-flight passes when:

1. `/automations/debtor-email/intent-proposals` returns 200.
2. The DiscoveryTabStrip is visible below the StageTabStrip with one "Intent proposals" tab marked active.
3. Empty-state copy is verbatim:
   - Title: *No novel intent proposals yet*
   - Body: *The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic.*
4. One row appears in `intent_proposal_views` per page load.
5. The "Refresh" button disables for ~5 seconds and Inngest dashboard shows an `intent-proposals.refresh` event.
6. Baseline `count(*) FROM intent_proposals_v1` is recorded in the verification log (expected: 0 immediately post-deploy, ≥1 once the first V3 traffic flows).

If any step fails, do NOT start the 7-day clock — escalate per **Failure modes** below.

---

## Day 7 — Sub-criterion for Success #1

Run in the Supabase SQL editor against project `mvqjhlxfvtqqubqgdvhz` (anon role is fine for SELECT — view is `security_invoker`):

```sql
-- 1. Are raw V3 proposals flowing?
SELECT count(*) AS raw_proposals
FROM public.intent_proposals_v1
WHERE created_at > now() - interval '7 days';
-- Expect: >= 3 (RESEARCH §Q4 forecast ~5 proposals/week).

-- 2. Did the 04:00 cron write at least one cluster row in the last 24 h?
SELECT count(*) AS clusters,
       max(refreshed_at) AS last_refresh
FROM public.intent_proposal_clusters
WHERE swarm_type = 'debtor-email'
  AND refreshed_at > now() - interval '24 hours';
-- Expect: clusters >= 1, last_refresh within the last cron tick.

-- 3. UI check: open /automations/debtor-email/intent-proposals.
--    Expect: >= 1 cluster card visible.
```

**Verdict logic.**

- `raw_proposals >= 3` AND `clusters >= 1` AND ≥1 card visible → **PASS day-7 sub-criterion.**
- Otherwise → **FAIL** — run the upstream triage in **Failure modes**.

Log the verdict in `86-VERIFICATION-LOG.md` under "Day 7 check."

> **Calibration tool, not metric.** If natural traffic produced 0 proposals and you need to confirm the write-through chain is alive without waiting another week, you may force a V3 call with `web/scripts/phase85-smoke-v3.ts` (Phase 85 deliverable). The resulting proposal row counts as plumbing evidence only — never include smoke-script proposals in the Success #1 / #2 / #3 totals.

---

## Day 14 — Success #1 primary (refined) + Success #2 first check

### Success #1 — clusters at threshold

```sql
SELECT count(*) AS clusters_of_3_plus
FROM public.intent_proposal_clusters
WHERE swarm_type = 'debtor-email'
  AND member_count >= 3
  AND refreshed_at > now() - interval '24 hours';
-- Expect: >= 2.
```

- `>= 2` → **PASS day-14 primary.** Original ≥5 target moves to day-21–28.
- `== 1` → Note in log: threshold 0.85 may be tight but do NOT lower it yet — minimum 4-week observation per `<deviation_rules>` of 86-04-PLAN.md.
- `== 0` → Re-run the day-7 upstream triage and escalate.

### Success #2 — known-missing intents

Pull the cluster centroids and eyeball-match against the corpus list (WKA family, PO notifications, payment schedule extensions). The corpus reference is `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-CORPUS.md`.

```sql
SELECT centroid_label, member_count, member_labels
FROM public.intent_proposal_clusters
WHERE swarm_type = 'debtor-email'
  AND member_count >= 3
  AND refreshed_at > now() - interval '24 hours'
ORDER BY member_count DESC;
```

- ≥1 centroid matches a corpus-suspected missing intent → **PASS Success #2.**
- Zero matches → soft FAIL — system surprised us; document the actual centroids in the log and continue.

---

## Day 21 — Success #1 original target

```sql
SELECT count(*) AS clusters_of_3_plus
FROM public.intent_proposal_clusters
WHERE swarm_type = 'debtor-email'
  AND member_count >= 3
  AND refreshed_at > now() - interval '24 hours';
-- Expect: >= 5 (CONTEXT Success #1 original target).
```

- `>= 5` → **PASS Success #1** in full. Day-28 confirms stability.
- `3–4` → soft pass — let it cook one more week.
- `< 3` → escalate: clustering threshold may need recalibration. Document in log; do NOT change threshold without 4 weeks of data (per plan deviation_rules).

---

## Day 21–28 — Success #3 (cluster precision spot-check)

The Success #3 measurement requires clusters of size ≥10. If the top-3 clusters by `member_count` are still <10 by day 21, push this check to day 28.

### Step 1 — pick the top 3 clusters

```sql
SELECT id AS cluster_id,
       centroid_label,
       member_count,
       member_labels,
       sample_email_ids,
       window_start,
       window_end,
       refreshed_at
FROM public.intent_proposal_clusters
WHERE swarm_type = 'debtor-email'      -- swap to another swarm if needed
  AND refreshed_at > now() - interval '24 hours'
  AND member_count >= 10
ORDER BY member_count DESC
LIMIT 3;
```

Copy the three `cluster_id` UUIDs out of this result. If fewer than 3 clusters have `member_count >= 10`, lower the threshold to `>= 5` and note in the log that the spot-check ran on smaller clusters (the ≥80 % verdict still applies, just with reduced statistical weight).

### Step 2 — for each cluster_id, pull 10 random samples

Run once per cluster_id by replacing `$CLUSTER_ID`:

```sql
-- Paste the cluster_id UUID from Step 1 in place of $CLUSTER_ID.
WITH cluster_samples AS (
  SELECT unnest(sample_email_ids)::uuid AS pipeline_event_id
  FROM public.intent_proposal_clusters
  WHERE id = '$CLUSTER_ID'
)
SELECT
  pe.id                                       AS pipeline_event_id,
  pe.decision_details ->> 'intent_proposal'   AS proposal_label,
  pe.decision_details ->> 'proposal_reason'   AS proposal_reason,
  pe.decision_details -> 'ranked' -> 0 ->> 'intent' AS ranked_top_intent,
  e.subject                                   AS subject,
  e.sender_email                              AS sender_email,
  left(coalesce(e.body_full_text, e.body_text, ''), 500) AS body_excerpt
FROM cluster_samples cs
JOIN public.pipeline_events pe ON pe.id = cs.pipeline_event_id
LEFT JOIN email_pipeline.emails e ON e.id = pe.email_id
ORDER BY random()
LIMIT 10;
```

> **Schema notes (verified against `supabase/migrations/20260520_phase86_intent_proposal_clusters.sql`):**
> - The snapshot PK is `id`, not `cluster_id`.
> - `sample_email_ids` is `text[]` storing **pipeline_event_id** values as strings — cast to `uuid` before joining `pipeline_events.id`.
> - There is no `refresh_window_end` column; use `refreshed_at`, `window_start`, or `window_end`.

### Step 3 — operator verdict per cluster

For each of the 30 samples (3 clusters × 10 samples), read the `subject` + `body_excerpt` and assign one of:

- **same** — the email's true intent matches the cluster's centroid_label.
- **different** — the email belongs in a different intent bucket.

A cluster **PASSES** Success #3 when ≥8 of its 10 samples are tagged "same."

Log the verdict per cluster in `86-VERIFICATION-LOG.md` under "Day 21–28 spot-check" with the table template provided there.

All 3 clusters PASS → **PASS Success #3.**
Any cluster fails → log the failing centroid and the misgrouped samples; flag as input to V9.0 design (R-01 mitigation: V9.0 may re-cluster semantically).

---

## Day 28 — Success #1 confirmation + Success #2 + Success #3 re-run

Re-run the day-14 and day-21–28 queries one final time. Day 28 confirms that the day-21 verdict is stable, not a one-off cron tick anomaly. Log all three verdicts.

---

## Every Friday end-of-day — Success #4

```sql
SELECT count(*)                              AS opens,
       count(DISTINCT operator_id)            AS operators,
       min(viewed_at)                         AS first_open_this_week,
       max(viewed_at)                         AS last_open_this_week
FROM public.intent_proposal_views
WHERE viewed_at > now() - interval '7 days';
-- Expect: opens >= 2 (Success #4 weekly bar).
```

- `opens >= 2` → log "Week N PASS."
- `opens < 2` → log "Week N FAIL." After **any** FAIL week in the 4-week window, the surface is on probation: 2 consecutive FAIL weeks trigger R-03 mitigation (reopen Phase 86 design — do NOT mark Phase 86 closed and do NOT let V9.0 start building on top).

Four consecutive PASS weeks → **PASS Success #4.**

---

## Failure modes & escalation

### Zero raw proposals after 7 days

Likely upstream — walk these checks in order:

1. **Phase 85 V3 emit fired?**

   ```sql
   SELECT count(*)
   FROM public.pipeline_events
   WHERE stage = 3
     AND decision_details ? 'intent_proposal'
     AND created_at > now() - interval '7 days';
   ```

   `0` here means Phase 85 V3 has not emitted. Check `agent_runs.tool_outputs.intent_first_pass` for the three target mailboxes (administratie@fire-control.nl, debiteuren@smeba-fire.be, verkoop@smeba.nl) and confirm the V3 schema is being returned. Cross-reference `.planning/todos/pending/2026-05-20-phase85-v2-retirement.md` for the V2→V3 retirement window.

2. **04:00 cron actually ran?** Open Inngest dashboard, filter on function id `intent-proposals-refresh`. Expect one successful execution per day post-04:00 Amsterdam. If executions are missing, check Vercel deploy logs for the registration line (`web/app/api/inngest/route.ts:82`).

3. **View filter wrong?** Re-run:

   ```sql
   SELECT count(*) FROM public.intent_proposals_v1;
   ```

   Compare against the raw `pipeline_events` count above. A large gap means the view's WHERE clause is dropping rows it shouldn't — escalate to engineering (Plan 01 owner).

### Many singletons, zero clusters of size ≥3

This is the R-02 risk. **Do not lower the 0.85 Levenshtein threshold yet.** Mitigation per Plan 02:

- Let it cook through day-28.
- If avg cluster size is still <2 at day-28, recommend a threshold recalibration as a Phase 87 closure deliverable. Document the recommended new value with empirical evidence (the actual distribution of similarity scores between distinct proposals) — do not eyeball.

### One huge cluster, no others (R-01)

Aggressive merge. Pull the cluster's `member_labels` array — if it contains semantically distinct labels (e.g. `payment_extension_request` + `payment_schedule_request`), document the false merge in the log and add the centroid pair to the V9.0 semantic-clustering input set. Do NOT raise the threshold — false merges are a feature of the Levenshtein approach that V9.0 is designed to fix.

### Operator opens <2×/week (R-03)

- 1 fail week → log + remind.
- 2 consecutive fail weeks → reopen Phase 86 design. **The discovery loop is broken**; V9.0 cannot ship on top of an unused surface. Escalate to phase-planning.

### Storage bloat (R-04)

The 30-day proposal window × ~5 proposals/week is ~20 jsonb-fragments at ~50 B each = ~1 KB/month inside `pipeline_events.decision_details`. If `pipeline_events` row count grows materially after Phase 85 deploy beyond the established baseline, the V3 schema may be emitting proposals on V2-like rows. Investigate by sampling `decision_details->>'intent_version'`:

```sql
SELECT decision_details->>'intent_version' AS version,
       count(*)
FROM public.pipeline_events
WHERE stage = 3
  AND created_at > now() - interval '7 days'
GROUP BY 1;
```

Expect `2026-05-19.v3` to dominate post-deploy.

---

## Cross-references

- **Phase 85 PROMOTION-RUNBOOK** = `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-AGENT-RITUAL-LOG.md`. Phase 85 promotes **classifier rules**; Phase 86 promotes **intent vocabulary** — but the vocabulary promotion itself is **deferred to V9.0 Learning Inbox**, not this runbook.
- **Phase 87 retro-classification** depends on Phase 86 having ≥5 cluster snapshots captured by its kickoff. The day-21–28 PASS on Success #1 is the gating signal for Phase 87 start.
- **Phase 85 V2 retirement TODO** = `.planning/todos/pending/2026-05-20-phase85-v2-retirement.md`. The 14-day V2 retirement window overlaps Phase 86's day-7 → day-14 check; keep V2 alive until day-14 PASS to keep an audit-comparable fallback.

---

## Hard locks (do NOT relax under field pressure)

- Do NOT lower the 0.85 Levenshtein threshold before 4 weeks of data.
- Do NOT promote any cluster to `swarm_intents` in Phase 86 — V9.0 owns promotion.
- Do NOT edit cluster labels — operator is read-only this milestone.
- Do NOT mark Phase 86 closed if Success #4 (operator opens) fails 2+ weeks in a row. Reopen design first (R-03).
- Do NOT edit `86-CONTEXT.md` Success #1 wording — the drift #4 refinement lives **here** and in the SUMMARY, not in CONTEXT.

---

## When everything passes

Four PASS verdicts logged (Success #1 through #4), 4 consecutive Friday PASS weeks for Success #4 — `86-VERIFICATION-LOG.md` becomes the input for Phase 87 closure (V8.1 milestone retro). Hand the log over; do not synthesise conclusions inside this runbook.
