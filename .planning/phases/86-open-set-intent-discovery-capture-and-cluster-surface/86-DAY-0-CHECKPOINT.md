# Phase 86 — Day 0 Pre-flight Checkpoint

**Purpose.** One-shot verification that the Phase 86 surface is alive end-to-end **before** the 4-week observation window starts. Pre-flight passes once every box below is ticked and the verification log's "Day 0" calendar row is filled in.

**Runbook driver.** `86-OPERATOR-RUNBOOK.md` § "Day 0 — Pre-flight."

**Status at scaffold time (2026-05-20 15:46 UTC).** Plans 01–03 shipped (`6adc6051`, `f2fd4f99`, `e5a472a9`, `74e98f16`, `eb95c562`, `90218176`, `c2fecf2d`, `43fa078d`). Phase 85 V3 consumer code merged to `main` 2026-05-20 15:14 UTC via PR #32. **First V3 emit was pending the first inbound debtor email at scaffold time** — meaning `intent_proposals_v1` may return `count = 0` on the very first pre-flight run, and that is the documented post-deploy steady state, not a bug.

---

## Operator info

**Date pre-flight executed:** _____
**Operator:** _____
**Deploy SHA verified live (`main` HEAD at run-time):** _____

---

## 1. Live tables exist + read correctly

Per the orchestrator's deploy-state note (2026-05-20), all three Plan 01 objects are live in Supabase project `mvqjhlxfvtqqubqgdvhz`. Verify:

```sql
-- 1a. View exists and points at pipeline_events (NOT coordinator_runs).
SELECT table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'intent_proposals_v1';
-- Expect: 1 row. view_definition contains "pipeline_events" and "decision_details".

-- 1b. Snapshot table exists with expected columns (no cluster_id / no refresh_window_end).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'intent_proposal_clusters'
ORDER BY ordinal_position;
-- Expect 9 rows: id, swarm_type, centroid_label, member_count, member_labels,
--                sample_email_ids, window_start, window_end, refreshed_at.

-- 1c. Telemetry table exists, empty at pre-flight start.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'intent_proposal_views'
ORDER BY ordinal_position;
-- Expect 6 rows: id, viewed_at, operator_id, swarm_type, cluster_id, user_agent.
```

- [ ] `intent_proposals_v1` view exists and reads `pipeline_events.decision_details`.
- [ ] `intent_proposal_clusters` schema matches above (9 cols, no `cluster_id`, no `refresh_window_end`).
- [ ] `intent_proposal_views` schema matches above (6 cols).

---

## 2. Baseline counts

```sql
-- Raw proposals (likely 0 if V3 has not emitted yet).
SELECT count(*) AS raw_proposals_total,
       count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h
FROM public.intent_proposals_v1;

-- Cluster snapshot (likely 0 — first cron at 04:00 Amsterdam may not have run yet).
SELECT count(*) AS clusters_total,
       max(refreshed_at) AS last_refresh
FROM public.intent_proposal_clusters;

-- Telemetry (likely 0 — populated by your tab-open in §4 below).
SELECT count(*) AS views_total
FROM public.intent_proposal_views;
```

**Record values here:**

| Measure                                      | Value |
| -------------------------------------------- | ----- |
| `raw_proposals_total`                        | _____ |
| `intent_proposals_v1` rows in last 24 h      | _____ |
| `intent_proposal_clusters` row count         | _____ |
| `intent_proposal_clusters.refreshed_at` (max)| _____ |
| `intent_proposal_views` row count            | _____ |

> Zero across the board is acceptable at day-0 and confirms a clean slate. Non-zero raw proposal counts mean a V3 emit already happened in production — log the count as a starting baseline.

---

## 3. UI tab renders

Open `/automations/debtor-email/intent-proposals` in the production dashboard.

- [ ] HTTP 200 (no auth redirect for an authenticated operator).
- [ ] `PageHeader` renders at the top.
- [ ] `StageTabStrip` (Stage 0..4) is visible.
- [ ] `DiscoveryTabStrip` is visible **below** the stage strip with one "Intent proposals" tab marked `aria-current` / highlighted active.
- [ ] Cluster list area renders below the strip.

If the cluster snapshot is empty (the expected day-0 state), the empty-state copy must match D-06 **verbatim**:

> **Title:** `No novel intent proposals yet`
> **Body:** `The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic.`

- [ ] Empty-state title verbatim.
- [ ] Empty-state body verbatim.

---

## 4. Telemetry row writes on tab mount

Immediately after the tab opened in §3:

```sql
SELECT id, viewed_at, operator_id, swarm_type, cluster_id, user_agent
FROM public.intent_proposal_views
WHERE viewed_at > now() - interval '5 minutes'
ORDER BY viewed_at DESC;
```

- [ ] ≥ 1 row returned.
- [ ] `operator_id` is non-null and matches the operator currently logged into the dashboard (server-stamped from `supabase.auth.getUser()`).
- [ ] `swarm_type` is `'debtor-email'` (or `null` when filter is set to "all").
- [ ] `user_agent` is non-null.

Reload the page once and re-run the query — expect one more row per reload.

---

## 5. Refresh button fires the Inngest event

In the UI:

- [ ] Click **Refresh**. Button immediately disables and shows "Refreshing…".
- [ ] Button re-enables after ~5 seconds.
- [ ] A success message appears: *"Refresh queued. New clusters appear after the next cron tick."* (or an error message if Inngest send failed).

In the Inngest dashboard (function id `intent-proposals-refresh`):

- [ ] An event `intent-proposals.refresh` was received within the last minute.
- [ ] The handler executed (or skipped with `{ skipped: "debounced" }` if a previous cron tick / event was <5 minutes ago — still a PASS).

---

## 6. V3 emit smoke confirmation (optional but recommended)

If no inbound debtor email has triggered Phase 85 V3 yet, the chain is unverified end-to-end. Force one V3 call via the calibration helper:

```bash
cd web && npx tsx scripts/phase85-smoke-v3.ts
```

(Runs the smoke script shipped with Phase 85. The resulting row counts as plumbing evidence only — do **not** include the smoke-induced proposal in Success #1 / #2 / #3 totals later.)

Then re-run §2 baseline counts:

- [ ] `intent_proposals_v1` count incremented by ≥ 1.
- [ ] The new row carries `intent_version = '2026-05-19.v3'` (verify via `SELECT decision_details->>'intent_version' FROM pipeline_events WHERE id = '<the new pipeline_event_id>'`).

Skip this step if natural inbound debtor traffic has already produced V3 proposals (i.e. §2 returned `raw_proposals_total >= 1` and the version field already shows `v3`).

---

## 7. Calendar reminders set

- [ ] Day 7 check scheduled (target date: _____)
- [ ] Day 14 check scheduled (target date: _____)
- [ ] Day 21 check scheduled (target date: _____)
- [ ] Day 28 check scheduled (target date: _____)
- [ ] Weekly Friday Success #4 check (every Friday for 4 weeks) scheduled (first Friday: _____)

---

## Pre-flight verdict

- [ ] All steps 1–5 PASS (step 6 optional, step 7 required).
- [ ] Calendar reminders set.

**Verdict:** PASS / FAIL

If **FAIL**, do NOT start the 4-week observation window. Escalate per the runbook's **Failure modes** section, fix the failing step, re-run pre-flight before scheduling Day 7.

**Day 0 baseline copied to `86-VERIFICATION-LOG.md` calendar table:** [ ]

---

## Notes (anomalies, surprises, or context for Phase 87)

_____
