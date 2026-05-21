# Phase 60-08 — Operator Runbook: Corpus Backfill → Spot-Check → Cron Flip

**Audience:** operator running the debtor-email classifier go-live.
**Outcome:** auto-archive coverage expands without two weeks of organic verdicts.
**Companion docs:** `60-08-PLAN.md` (what was built), `60-07-FLIP-CHECKLIST.md` (the cron flip itself).

This is the copy-paste hand-over. No engineer required for steps 2-10 — only step 1 (deploy) and step 8 (env var flip in Vercel) need infra access.

---

## Sequence (do in order)

### 1. Deploy to production

Tasks 1-3 of 60-08 land on `main`; Vercel auto-deploys. Verify the new functions are registered:

- Open Inngest dashboard → Functions
- Confirm `classifier/corpus-backfill` and `classifier/spotcheck.queue` are listed
- If not, check the latest Vercel deploy log for build errors before continuing

### 2. Fire the corpus backfill

Inngest dashboard → Send Event:

- **Event name:** `classifier/corpus-backfill.run`
- **Payload:**
  ```json
  { "triggeredBy": "<your-name>" }
  ```

**Expected return value:**
- `processed` ≈ 6114 (full corpus row count)
- `total_classified` ≈ 6110 (4 rows missing body — dropped silently)
- `skipped_missing_fields` ≈ 4
- `rules_seeded` between 6 and 12 (depending on which rule_keys fired against the corpus)

If `rules_seeded == 0`: classify.ts is matching nothing — investigate before retrying.

### 3. Inspect classifier_rules post-backfill

Run in Supabase Studio SQL editor:

```sql
SELECT rule_key, status, n, agree, ci_lo, notes
FROM classifier_rules
WHERE swarm_type='debtor-email'
ORDER BY n DESC;
```

**What to look for:**
- High-N rules (`subject_autoreply`, `subject_acknowledgement`, `subject_ticket_ref`, `subject_paid_marker`) should have `n` in the hundreds.
- The 6 already-promoted rules from 60-02 keep `status='promoted'` (the upsert overwrites their n/agree but the cron handles status separately).
- New corpus-derived candidates show `status='candidate'` with `notes LIKE 'corpus-backfill%'`.
- Rules with `n < 30` are NOT promotable — flag them but skip in step 4.

### 4. Fire the spot-check sampler

Inngest dashboard → Send Event:

- **Event name:** `classifier/spotcheck.queue`
- **Payload:**
  ```json
  { "max_per_rule": 50, "triggeredBy": "<your-name>" }
  ```

**Expected return:**
- `rules_processed` matches the count of `status='candidate' AND n>=30 AND rule_key != 'no_match'` from step 3.
- `total_inserted` between 200 and 350 (5-7 promotable rules × ~50 per rule, minus duplicates already in queue).
- `per_rule[].hard_cases_inserted` is the disagreement count; `fillers_inserted` is the agreement-fill when hard cases < 50.

Idempotency: re-running this event produces `total_inserted = 0` (all rows already exist under the spot-check intent_version).

### 5. Review the queue at `/automations/debtor-email-review`

The new rows surface with `intent_version = 'corpus-backfill-spotcheck'` and `human_verdict IS NULL`. Approve / reject each per existing review-UI flow.

Total volume: ~250-350 emails. Estimate: ~2 hours at 30 sec/email. Hard cases (rule predicted X, LLM disagreed) are mixed in first per rule.

### 6. Compute the spot-check pass rate per rule

```sql
SELECT rule_key,
       count(*) AS reviewed,
       sum((human_verdict IN ('approved','edited_minor'))::int) AS approved,
       round(100.0 * sum((human_verdict IN ('approved','edited_minor'))::int) / NULLIF(count(*),0), 1) AS pct
FROM agent_runs
WHERE intent_version='corpus-backfill-spotcheck' AND human_verdict IS NOT NULL
GROUP BY rule_key
ORDER BY rule_key;
```

**Pass criterion per rule:** `pct >= 95`. Rules below 95 % stay `candidate` — investigate the regex (read the rejected examples to see what's misclassifying), patch `classify.ts` in a follow-up plan, re-run from step 2.

### 7. Optional — recombine corpus + spot-check counts

Skip this if you trust the daily promotion cron to integrate the verdicts on its own (it picks them up via `classifier_rule_telemetry`). Otherwise, fast-track:

> Note: `wilson_ci_lower` is JS-only. Either skip and let the cron handle CI-lo recalculation, or do the recombine in a Node script. The query below updates n / agree only — `ci_lo` will be stale until the next cron tick.

```sql
UPDATE classifier_rules cr
SET n = cr.n + agg.n,
    agree = cr.agree + agg.agree,
    last_evaluated = now()
FROM (
  SELECT rule_key,
         count(*) AS n,
         sum((human_verdict IN ('approved','edited_minor'))::int) AS agree
  FROM agent_runs
  WHERE intent_version='corpus-backfill-spotcheck' AND human_verdict IS NOT NULL
  GROUP BY rule_key
) agg
WHERE cr.swarm_type='debtor-email' AND cr.rule_key = agg.rule_key;
```

### 8. Flip the cron

Follow `60-07-FLIP-CHECKLIST.md` exactly. Single change:

- Vercel → Project → Settings → Environment Variables
- Set `CLASSIFIER_CRON_MUTATE=true` for production
- Trigger redeploy (or wait for next push to main)

### 9. Wait for the next 06:00 Amsterdam Mon-Fri tick

Verify post-tick:

```sql
-- Promotion audit trail
SELECT rule_key, action, created_at
FROM classifier_rule_evaluations
WHERE swarm_type='debtor-email'
  AND action='promoted'
  AND created_at > now() - interval '1 day'
ORDER BY created_at DESC;

-- Live status
SELECT rule_key, status, n, agree, ci_lo, promoted_at
FROM classifier_rules
WHERE swarm_type='debtor-email'
ORDER BY status, n DESC;
```

Spot-check passers (≥95 %) should now show `status='promoted'`.

### 10. Live

Auto-archive runs with the expanded whitelist on the next debtor-email ingest tick (<60 s — `readWhitelist` cache TTL). No further action.

---

## Rollback procedure

If a freshly-promoted rule misbehaves in production:

1. **Stop further promotions** — Vercel env var: `CLASSIFIER_CRON_MUTATE=false` → redeploy. Next 06:00 tick stops mutating.
2. **Demote the bad rule manually:**
   ```sql
   UPDATE classifier_rules
   SET status='demoted', last_demoted_at=now()
   WHERE swarm_type='debtor-email' AND rule_key='<bad_rule>';
   ```
3. **Wait 60 s** — the ingest route's `readWhitelist` cache (60-second TTL) picks up the demotion. No deploy required.
4. **Investigate & patch** — read the offending email examples in `/automations/debtor-email-review`, patch `classify.ts` regex in a follow-up plan, re-run corpus-backfill + spot-check before re-flipping the cron.

---

## Risks (documented for handover)

- **LLM-judge bias on the 04-14 corpus.** The agreement counts assume the LLM-judge labels in `debtor.email_analysis` are correct. The 50-per-rule spot-check is the safety net — if the LLM was systematically wrong on a category, hand verdicts will catch it before promotion.
- **Stale corpus.** No emails from the last ~2 weeks are in the corpus. Drift is monitored post-launch via the daily cron + ongoing organic verdicts. Re-run corpus-backfill any time the corpus is refreshed.
- **Rule churn.** If `classify.ts` changes between corpus-backfill and go-live, the n/agree counts no longer reflect what's running. Re-run step 2 after every classifier change.
- **Volume of review.** 250-350 emails is the target; if `total_inserted` exceeds 500, raise the bar — investigate why one rule has so many disagreements before reviewing.

---

## Reference

- Plan: `60-08-PLAN.md`
- Cron flip checklist: `60-07-FLIP-CHECKLIST.md`
- Promotion math: `web/lib/classifier/wilson.ts` (PROMOTE_N_MIN=30, PROMOTE_CI_LO_MIN=0.95)
- Backfill code: `web/lib/inngest/functions/classifier-corpus-backfill.ts`
- Sampler code: `web/lib/inngest/functions/classifier-spotcheck-sampler.ts`
- Agreement table: `web/lib/classifier/corpus-mapping.ts`
