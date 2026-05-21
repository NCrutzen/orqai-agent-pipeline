# Phase 86 — Verification Log

**Purpose.** Append-only operator log for the 4-week observation window. Each entry records the SQL output + a PASS/FAIL verdict per success criterion. Phase 87 (V8.1 closure) reads this log; do NOT delete or rewrite entries — append corrections as new dated entries instead.

**Runbook driver.** `86-OPERATOR-RUNBOOK.md` (this log is the artifact the runbook fills in).

**Day 0 baseline.** See `86-DAY-0-CHECKPOINT.md`.

---

## Calendar dates (fill in once day-0 pre-flight passes)

| Check        | Target date  | Owner   |
| ------------ | ------------ | ------- |
| Day 0        | _____        | _____   |
| Day 7        | _____        | _____   |
| Day 14       | _____        | _____   |
| Day 21       | _____        | _____   |
| Day 28       | _____        | _____   |
| Week 1 (Fri) | _____        | _____   |
| Week 2 (Fri) | _____        | _____   |
| Week 3 (Fri) | _____        | _____   |
| Week 4 (Fri) | _____        | _____   |

---

## Day 7 check (Success #1 sub-criterion)

**Date:** _____
**Operator:** _____

| Measurement                                                      | Value | Threshold | Pass? |
| ---------------------------------------------------------------- | ----- | --------- | ----- |
| `count(*)` from `intent_proposals_v1` last 7 days                | _____ | ≥ 3       | _____ |
| `count(*)` from `intent_proposal_clusters` last 24 h (debtor)    | _____ | ≥ 1       | _____ |
| UI: ≥1 cluster card visible on `/automations/debtor-email/intent-proposals` | _____ | yes       | _____ |

**Verdict:** PASS / FAIL

**If FAIL, upstream triage executed?**
- [ ] Phase 85 V3 emit count check
- [ ] Inngest dashboard cron execution check
- [ ] `intent_proposals_v1` raw count vs `pipeline_events` filter

**Notes:**

---

## Day 14 check — Success #1 primary (refined) + Success #2

**Date:** _____
**Operator:** _____

### Success #1 — clusters at threshold

| Measurement                                                  | Value | Threshold | Pass? |
| ------------------------------------------------------------ | ----- | --------- | ----- |
| Clusters with `member_count >= 3` (last 24 h, debtor-email)  | _____ | ≥ 2       | _____ |

**Verdict (Success #1 day-14):** PASS / FAIL

### Success #2 — known-missing intent match

Pasted `centroid_label, member_count, member_labels` query result:

```
(paste rows here)
```

| Centroid (top-N)               | Matches corpus-suspected intent? (WKA, PO notif, payment schedule, …) | Notes |
| ------------------------------ | --------------------------------------------------------------------- | ----- |
| _____                          | _____                                                                 | _____ |

**Verdict (Success #2 day-14):** PASS / FAIL

**Notes:**

---

## Day 21 check — Success #1 original target

**Date:** _____
**Operator:** _____

| Measurement                                                  | Value | Threshold | Pass? |
| ------------------------------------------------------------ | ----- | --------- | ----- |
| Clusters with `member_count >= 3` (last 24 h, debtor-email)  | _____ | ≥ 5       | _____ |

**Verdict:** PASS / SOFT-PASS / FAIL (PASS ≥5 · SOFT-PASS 3–4 · FAIL <3)

**Notes:**

---

## Day 21–28 spot-check — Success #3 (cluster precision)

**Date:** _____
**Operator:** _____

### Top-3 clusters selected

| Rank | cluster_id (UUID) | centroid_label | member_count |
| ---- | ----------------- | -------------- | ------------ |
| 1    | _____             | _____          | _____        |
| 2    | _____             | _____          | _____        |
| 3    | _____             | _____          | _____        |

> If fewer than 3 clusters have `member_count >= 10`, note here that the spot-check was relaxed to `>= 5`: _____

### Cluster 1 spot-check (10 random samples)

| #   | pipeline_event_id | subject (truncated) | proposal_label | verdict (same / different) |
| --- | ----------------- | ------------------- | -------------- | -------------------------- |
| 1   | _____             | _____               | _____          | _____                      |
| 2   | _____             | _____               | _____          | _____                      |
| 3   | _____             | _____               | _____          | _____                      |
| 4   | _____             | _____               | _____          | _____                      |
| 5   | _____             | _____               | _____          | _____                      |
| 6   | _____             | _____               | _____          | _____                      |
| 7   | _____             | _____               | _____          | _____                      |
| 8   | _____             | _____               | _____          | _____                      |
| 9   | _____             | _____               | _____          | _____                      |
| 10  | _____             | _____               | _____          | _____                      |

**Same-intent count for cluster 1:** _____ / 10
**Verdict for cluster 1:** PASS (≥8) / FAIL

### Cluster 2 spot-check (10 random samples)

| #   | pipeline_event_id | subject (truncated) | proposal_label | verdict (same / different) |
| --- | ----------------- | ------------------- | -------------- | -------------------------- |
| 1   | _____             | _____               | _____          | _____                      |
| 2   | _____             | _____               | _____          | _____                      |
| 3   | _____             | _____               | _____          | _____                      |
| 4   | _____             | _____               | _____          | _____                      |
| 5   | _____             | _____               | _____          | _____                      |
| 6   | _____             | _____               | _____          | _____                      |
| 7   | _____             | _____               | _____          | _____                      |
| 8   | _____             | _____               | _____          | _____                      |
| 9   | _____             | _____               | _____          | _____                      |
| 10  | _____             | _____               | _____          | _____                      |

**Same-intent count for cluster 2:** _____ / 10
**Verdict for cluster 2:** PASS (≥8) / FAIL

### Cluster 3 spot-check (10 random samples)

| #   | pipeline_event_id | subject (truncated) | proposal_label | verdict (same / different) |
| --- | ----------------- | ------------------- | -------------- | -------------------------- |
| 1   | _____             | _____               | _____          | _____                      |
| 2   | _____             | _____               | _____          | _____                      |
| 3   | _____             | _____               | _____          | _____                      |
| 4   | _____             | _____               | _____          | _____                      |
| 5   | _____             | _____               | _____          | _____                      |
| 6   | _____             | _____               | _____          | _____                      |
| 7   | _____             | _____               | _____          | _____                      |
| 8   | _____             | _____               | _____          | _____                      |
| 9   | _____             | _____               | _____          | _____                      |
| 10  | _____             | _____               | _____          | _____                      |

**Same-intent count for cluster 3:** _____ / 10
**Verdict for cluster 3:** PASS (≥8) / FAIL

### Aggregate verdict

**Success #3 overall:** PASS (all 3 clusters PASS) / PARTIAL / FAIL

**Misgrouped samples noted for V9.0 R-01 input:**

```
(paste list of cluster_id + pipeline_event_id pairs where verdict = different)
```

---

## Day 28 check — confirmation re-run

**Date:** _____
**Operator:** _____

| Measurement                                                  | Value | Threshold | Pass? |
| ------------------------------------------------------------ | ----- | --------- | ----- |
| Clusters with `member_count >= 3` (last 24 h, debtor-email)  | _____ | ≥ 5       | _____ |
| Success #2 — ≥1 centroid matches corpus-suspected intent     | _____ | yes       | _____ |
| Success #3 — top-3 clusters precision spot-check re-run      | _____ | all PASS  | _____ |

**Verdict (Success #1 confirmed):** PASS / FAIL
**Verdict (Success #2 confirmed):** PASS / FAIL
**Verdict (Success #3 confirmed):** PASS / FAIL

**Notes:**

---

## Weekly check — Success #4 (operator engagement)

### Week 1

**Friday date:** _____
**Operator:** _____

| Measurement                                              | Value | Threshold | Pass? |
| -------------------------------------------------------- | ----- | --------- | ----- |
| `count(*) FROM intent_proposal_views` last 7 days        | _____ | ≥ 2       | _____ |
| `count(DISTINCT operator_id)` last 7 days                | _____ | ≥ 1       | _____ |

**Verdict:** PASS / FAIL

**Notes:**

---

### Week 2

**Friday date:** _____
**Operator:** _____

| Measurement                                              | Value | Threshold | Pass? |
| -------------------------------------------------------- | ----- | --------- | ----- |
| `count(*) FROM intent_proposal_views` last 7 days        | _____ | ≥ 2       | _____ |
| `count(DISTINCT operator_id)` last 7 days                | _____ | ≥ 1       | _____ |

**Verdict:** PASS / FAIL

**Notes:**

---

### Week 3

**Friday date:** _____
**Operator:** _____

| Measurement                                              | Value | Threshold | Pass? |
| -------------------------------------------------------- | ----- | --------- | ----- |
| `count(*) FROM intent_proposal_views` last 7 days        | _____ | ≥ 2       | _____ |
| `count(DISTINCT operator_id)` last 7 days                | _____ | ≥ 1       | _____ |

**Verdict:** PASS / FAIL

**Notes:**

---

### Week 4

**Friday date:** _____
**Operator:** _____

| Measurement                                              | Value | Threshold | Pass? |
| -------------------------------------------------------- | ----- | --------- | ----- |
| `count(*) FROM intent_proposal_views` last 7 days        | _____ | ≥ 2       | _____ |
| `count(DISTINCT operator_id)` last 7 days                | _____ | ≥ 1       | _____ |

**Verdict:** PASS / FAIL

**Notes:**

---

## Aggregate verdict — feed to Phase 87

Once Day 28 + Week 4 entries are filled in:

| Criterion  | Verdict | Evidence summary |
| ---------- | ------- | ---------------- |
| Success #1 | _____   | _____            |
| Success #2 | _____   | _____            |
| Success #3 | _____   | _____            |
| Success #4 | _____   | _____            |

**Phase 86 closure recommendation (Phase 87 input):** SHIP / RE-OPEN / EXTEND-WINDOW

**Recommendation rationale (1–3 sentences):**

_____

---

## Anomaly / incident entries (append-only)

Use this section for anything that breaks the cadence — cron skipped, surprise cluster spike, escalations to engineering. Each entry includes date, operator, observation, action taken.

### YYYY-MM-DD — _____

**Operator:** _____
**Observation:** _____
**Action:** _____
**Outcome:** _____
