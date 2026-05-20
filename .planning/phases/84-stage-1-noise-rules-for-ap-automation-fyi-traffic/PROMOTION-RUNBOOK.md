# Phase 84 — PROMOTION-RUNBOOK.md

**Audience:** operator running the Phase 84 shadow + promotion window.
**Outcome:** 8 Stage 1 noise rules x 2 swarms (= 16 `classifier_rules` rows)
move from `status='candidate'` to `status='promoted'` per D-05, OR are held /
rolled back per the corpus-evidence and Wilson-CI gates.
**Companion docs:**
- `84-CONTEXT.md` (D-05 gate definition, verification 1-6).
- `CORPUS-SAMPLES.md` (per-category hand-confirmed positives + D-05 disposition rollup).
- `60-08-RUNBOOK.md` (structural precedent for classifier promotion runbooks).
- `docs/agentic-pipeline/stage-1-regex.md` (canonical Stage 1 two-pass design).

This is the copy-paste hand-over. No engineer required except in step 4
(Method A) for the one-tick `CLASSIFIER_CRON_MUTATE=true` flip in Vercel.

---

## Live constants pulled from production code (source-of-truth)

These numbers come from `web/lib/classifier/wilson.ts` (the math the cron
actually runs). **`84-CONTEXT.md` D-05 mentions 0.95; the live code is 0.92.**
The runbook uses the live-code numbers; flag any operator-policy decision to
re-raise the threshold to 0.95 as a follow-up.

| Constant | Value | Source | Meaning |
|----------|-------|--------|---------|
| `PROMOTE_N_MIN` | 30 | `web/lib/classifier/wilson.ts:33` | Minimum N before promotion is even evaluated |
| `PROMOTE_CI_LO_MIN` | 0.92 | `web/lib/classifier/wilson.ts:34` | Wilson 95% lower bound must clear this to promote |
| `DEMOTE_CI_LO_MAX` | 0.88 | `web/lib/classifier/wilson.ts:36` | Wilson lower bound below this triggers demotion (4pp hysteresis) |
| `DEMOTE_N_MIN` | 30 | `web/lib/classifier/wilson.ts:45` | Demotion also requires N>=30 (no demote-on-1) |
| Cron schedule | `TZ=Europe/Amsterdam 0 6 * * 1-5` | `classifier-promotion-cron.ts:180` | Daily 06:00 Amsterdam Mon-Fri |
| Mutate gate | `CLASSIFIER_CRON_MUTATE === "true"` | `classifier-promotion-cron.ts:182` | Default = shadow (writes `classifier_rule_evaluations` only); never flips status |
| Telemetry view | `public.classifier_rule_telemetry` | `supabase/migrations/20260428_classifier_rule_telemetry.sql` | Aggregates `agent_runs.rule_key` + `agent_runs.human_verdict IN ('approved','edited_minor')` |
| Whitelist source | `classifier_rules WHERE status='promoted'` | `web/lib/classifier/cache.ts:37-41` | 60s TTL cache; `promoted` -> immediate auto-action eligibility |
| Status enum | `candidate \| promoted \| demoted \| manual_block` | `supabase/migrations/20260428_classifier_rules.sql:10-12` | No `auto_active` — CONTEXT term is legacy; canonical = `promoted` |

**Critical architecture note on the Wilson-CI cron path for Phase 84 rules:**
the `classifier_rule_telemetry` view filters on `human_verdict IS NOT NULL`.
While a Phase 84 rule sits at `status='candidate'`, the worker's whitelist
gate at `classifier-screen-worker.ts:566-568` will NOT auto-action it —
matched rows fall through to the bulk-review branch (status='predicted')
where the operator hand-verdicts them. Those verdicts ARE what the cron
sees. Path (a) IS reachable for Phase 84, but it requires operator verdicts
on the bulk-review queue during the shadow window. If you let the queue sit,
N stays at 0 and the cron never promotes.

---

## 0. Per-category Day-7 disposition matrix (locked at shadow start)

Pulled from `CORPUS-SAMPLES.md` "Promotion gate (D-05) status" rollup at
2026-05-20. `corpus_status = short` = fewer than 10 hand-confirmed positives
in the 90-day corpus (corpus-evidence path NOT eligible without extending
the corpus window).

| # | category_key | swarm | corpus_status | corpus_positives | recommended Day-7 default | rationale |
|---|--------------|-------|---------------|------------------|---------------------------|-----------|
| 1 | coupa_invoice_paid_notification | debtor-email | short | 3 / 10 | **EXTEND-SHADOW >=14d** (Wilson path only) | <10 corpus + low organic volume; live N may not clear 30 in 7d |
| 2 | coupa_invoice_paid_notification | sales-email | short | 0 | **EXTEND-SHADOW >=14d** (Wilson path only) | Zero sales-email corpus; D-08 cross-swarm default holds, expect low N |
| 3 | coupa_invoice_approved_notification | debtor-email | short | 3 / 10 | **EXTEND-SHADOW >=14d** | Same as #1 |
| 4 | coupa_invoice_approved_notification | sales-email | short | 0 | **EXTEND-SHADOW >=14d** | Same as #2 |
| 5 | iss_ptp_autoreply | debtor-email | short | 3 / 10 | **EXTEND-SHADOW >=14d** OR corpus-extend path | Volume is naturally low; sender + subject highly specific, FP risk negligible |
| 6 | iss_ptp_autoreply | sales-email | short | 0 | **EXTEND-SHADOW >=14d** | Sender pinned, low volume expected |
| 7 | frieslandcampina_portal_reject | debtor-email | short | 3 / 10 | **EXTEND-SHADOW >=14d**; review Christiaan.Knipping FP risk in shadow | Sender-pinned to Robbie.Robot, FP structurally avoided |
| 8 | frieslandcampina_portal_reject | sales-email | short | 0 | **EXTEND-SHADOW >=14d**, FLAG on any FP | R-04 watch-list — drop sales-email row if FP surfaces |
| 9 | m365_quarantine | debtor-email | short | 3 / 10 | **EXTEND-SHADOW >=14d**; boundary-test vs [SPAM] confirmed | System mail; cross-tenant discriminator |
| 10 | m365_quarantine | sales-email | short | 0 | **EXTEND-SHADOW >=14d** | System mail can hit any mailbox |
| 11 | sender_phishing_notice | debtor-email | short | 2 / 10 | **EXTEND-SHADOW >=14d** (R-03 narrow) | Intentionally one-supplier; promote only on full clean shadow |
| 12 | sender_phishing_notice | sales-email | short | 0 | **EXTEND-SHADOW >=14d** | One-supplier narrow; no volume expected on sales |
| 13 | supplier_bank_change_notification | debtor-email | very-short | 1 / 10 | **HOLD-CANDIDATE** (do not promote; revisit in V8.2) | Single positive; weakest evidence; CORPUS-SAMPLES.md recommends keeping shadow-only |
| 14 | supplier_bank_change_notification | sales-email | very-short | 0 | **HOLD-CANDIDATE** | Zero volume; do not promote without live evidence |
| 15 | own_outbound_invoice_loopback | debtor-email | **full** | 21 / 10 | **PROMOTE (corpus path)** if shadow shows 0 operator FPs at Day-7 | Meets D-05 path (b); operator confirms during shadow that intra-company forwards behave as intended |
| 16 | own_outbound_invoice_loopback | sales-email | n/a | 0 | **HOLD-CANDIDATE** (no volume expected — sales-email tenant_domains = `["smeba.nl"]` only) | Self-scoping via tenant_domains; row exists for D-08 parity, will not produce hits on a non-loopback mailbox |

**Read this carefully:** 14 of 16 rows are on the "extend / hold" track. Only
row 15 (`own_outbound_invoice_loopback` for debtor-email) is on a confirmed
corpus-path PROMOTE track at Day 7. The Wave 0 RED/GREEN test work + the
Wave 1 migrations + the Wave 2 matchers are nevertheless valuable now: they
register the rules + start counting telemetry. Phase 84 closure is the
union of these dispositions over real wall-clock observation.

---

## 1. Shadow Window Start (Day 0)

### 1.1 Confirm Wave 2 deploy is live in production

```bash
# Latest Vercel deploy must include commits b6707bf8 + 1fe541b1 (Wave 2 Task 1/2/3).
# Inngest dashboard: Functions -> classifier-screen-worker must be re-registered
# at a build hash newer than the rule-seed migration push timestamp.
```

### 1.2 Confirm the 16 candidate rules + 16 noise categories exist (CONTEXT verification 1)

```sql
-- Expect: 16 rows, all status='candidate', kind = 'regex' (debtor-email) or 'agent_intent' (sales-email).
SELECT swarm_type, rule_key, status, kind, n, agree, ci_lo
FROM public.classifier_rules
WHERE rule_key IN (
  'coupa_invoice_paid_notification','coupa_invoice_approved_notification',
  'iss_ptp_autoreply','frieslandcampina_portal_reject','m365_quarantine',
  'sender_phishing_notice','supplier_bank_change_notification',
  'own_outbound_invoice_loopback'
)
ORDER BY swarm_type, rule_key;
-- Expected: 16 rows. n=0, agree=0, ci_lo=null at shadow start.

-- Expect: 16 rows, all action='categorize_archive', swarm_dispatch=null.
SELECT swarm_type, category_key, action, swarm_dispatch
FROM public.swarm_noise_categories
WHERE category_key IN (
  'coupa_invoice_paid_notification','coupa_invoice_approved_notification',
  'iss_ptp_autoreply','frieslandcampina_portal_reject','m365_quarantine',
  'sender_phishing_notice','supplier_bank_change_notification',
  'own_outbound_invoice_loopback'
)
ORDER BY swarm_type, category_key;
```

If either query returns != 16 rows, STOP — Wave 1 migration push did not
land. Re-check `84-02-SUMMARY.md` Task 4 (operator `supabase db push`
step) and re-run before proceeding.

### 1.3 Confirm `CLASSIFIER_CRON_MUTATE` is NOT `true` in Vercel

Vercel -> agent-workforce -> Settings -> Environment Variables. The variable
should be **unset** or `false`. If you find it set to `true` left over from a
previous Phase 60 promotion window, set it to `false` BEFORE recording
shadow_start — otherwise the next 06:00 Amsterdam cron tick could
prematurely promote any rule that already cleared the gate via stale data.

### 1.4 Confirm matchers fire in shadow mode (telemetry present, no auto-action)

Day 0 spot-check — pick one ingested email that should match a Phase 84 rule
(e.g. a Coupa `Factuur ... door ISS` email arriving today), then:

```sql
-- Expect: rule_key populated; rule appears in agent_runs but the email is in bulk-review (status='predicted'), not auto-actioned.
SELECT ar.id, ar.swarm_type, ar.rule_key, ar.human_verdict, ar.created_at,
       arn.status, arn.topic
FROM public.agent_runs ar
JOIN public.automation_runs arn ON arn.id = ar.automation_run_id
WHERE ar.rule_key IN (
  'coupa_invoice_paid_notification','coupa_invoice_approved_notification',
  'iss_ptp_autoreply','frieslandcampina_portal_reject','m365_quarantine',
  'sender_phishing_notice','supplier_bank_change_notification',
  'own_outbound_invoice_loopback'
)
AND ar.created_at > (CURRENT_DATE)::timestamptz
ORDER BY ar.created_at DESC
LIMIT 50;
-- Expected: status='predicted' (bulk-review) for every row. NOT 'categorize' / 'completed'.
```

If any row has `arn.status` in (`completed`, `categorize`) for a Phase 84
`rule_key` AND `classifier_rules.status` for that row is still `'candidate'`,
STOP — the whitelist gate is bypassed. Open
`web/lib/inngest/functions/classifier-screen-worker.ts` line 550-568 to
inspect the whitelist logic before continuing.

### 1.5 Record shadow_start dates

Open `CORPUS-SAMPLES.md`. In each per-category section add a line:

```
Shadow window started: YYYY-MM-DD
```

Use the same date for all 16 rows (single deploy moment). This is the t=0
reference for Day 7 evaluation.

---

## 2. Daily Shadow Monitoring (Days 1-7)

### 2.1 Daily per-rule telemetry snapshot

Run every morning during the shadow window. Save the output to
`CORPUS-SAMPLES.md` under a new "Day N telemetry" subsection (or a
spreadsheet — the format is up to the operator, but the SQL is fixed).

```sql
-- Telemetry as the cron sees it (joined to current rule status).
SELECT t.swarm_type,
       t.rule_key,
       t.n,
       t.agree,
       t.n - t.agree AS disagree,
       r.status,
       r.ci_lo
FROM public.classifier_rule_telemetry t
JOIN public.classifier_rules r
  ON r.swarm_type = t.swarm_type AND r.rule_key = t.rule_key
WHERE t.rule_key IN (
  'coupa_invoice_paid_notification','coupa_invoice_approved_notification',
  'iss_ptp_autoreply','frieslandcampina_portal_reject','m365_quarantine',
  'sender_phishing_notice','supplier_bank_change_notification',
  'own_outbound_invoice_loopback'
)
ORDER BY t.swarm_type, t.rule_key;
-- Expected during shadow: status='candidate' on every row. n grows as bulk-review verdicts accumulate.
```

The cron also writes `classifier_rule_evaluations` rows daily — inspect them
to see what action the cron *would* have taken in shadow mode:

```sql
SELECT swarm_type, rule_key, n, agree, ci_lo, action, evaluated_at
FROM public.classifier_rule_evaluations
WHERE rule_key IN (
  'coupa_invoice_paid_notification','coupa_invoice_approved_notification',
  'iss_ptp_autoreply','frieslandcampina_portal_reject','m365_quarantine',
  'sender_phishing_notice','supplier_bank_change_notification',
  'own_outbound_invoice_loopback'
)
AND evaluated_at >= (CURRENT_DATE - INTERVAL '7 days')
ORDER BY evaluated_at DESC, swarm_type, rule_key;
-- Look for: action='shadow_would_promote' (= candidate cleared N>=30 and CI-lo>=0.92).
--           action='no_change'             (= candidate but gate not yet tripped).
--           action='shadow_would_demote'   (should not occur for status='candidate' rules; if it does, treat as anomaly).
```

### 2.2 Disagreement triage (any rule with disagree > 0)

```sql
-- Pull the actual emails the operator rejected for a given rule.
SELECT ar.id, ar.swarm_type, ar.rule_key, ar.human_verdict, ar.created_at,
       arn.result->'predicted'->>'rule'   AS predicted_rule,
       arn.result->>'subject'             AS subject,
       arn.result->>'from'                AS from_address,
       arn.result->>'source_mailbox'      AS mailbox
FROM public.agent_runs ar
JOIN public.automation_runs arn ON arn.id = ar.automation_run_id
WHERE ar.rule_key = '<one of the 8 keys>'
  AND ar.human_verdict NOT IN ('approved','edited_minor')
  AND ar.created_at > '<shadow_start>'::timestamptz
ORDER BY ar.created_at DESC;
```

For each disagreement row: open the source email in Outlook (mailbox +
subject + from let you find it), then in `CORPUS-SAMPLES.md` add an entry
under the rule's "False positives reviewed" subsection with:
- `email_id`
- `from_address` + `subject`
- operator_verdict + brief reason (e.g. "Robbie.Robot subject template
  changed to `INITIAL_NOTICE_...` — out of D-01 scope")
- whether the rule's regex should be tightened (Wave 4 follow-up) or the
  email is correctly an FP that disqualifies the rule

**A single confirmed FP on a corpus-path rule (own_outbound_invoice_loopback)
disqualifies the corpus path** per D-05. Switch that rule's recommended Day-7
default in the matrix above to EXTEND-SHADOW until live evidence (Wilson
path) is independently sufficient.

### 2.3 D-03 loopback regression spot-check (Day 1)

R-02 mitigation. Sample 5 inbound positives + 5 outbound negatives from the
last 24h to confirm the direction guard is intact:

```sql
-- 5 inbound positives: must classify as own_outbound_invoice_loopback.
SELECT ar.id, ar.rule_key, arn.result->>'from' AS from_addr,
       arn.result->>'source_mailbox' AS mailbox,
       arn.result->>'subject' AS subj, ar.created_at
FROM public.agent_runs ar
JOIN public.automation_runs arn ON arn.id = ar.automation_run_id
WHERE ar.rule_key = 'own_outbound_invoice_loopback'
  AND ar.created_at > (now() - INTERVAL '24 hours')
ORDER BY ar.created_at DESC
LIMIT 5;
-- Expected: from_addr.domain matches mailbox.domain (= a tenant domain).

-- 5 outbound negatives: same domain on both sides BUT direction='outbound' (must NOT be loopback-tagged).
-- This requires reading email_pipeline.emails directly.
SELECT e.id, e.from_address, e.mailbox, e.direction, e.subject, e.received_at
FROM email_pipeline.emails e
WHERE e.direction = 'outbound'
  AND lower(split_part(e.from_address, '@', 2)) = lower(split_part(e.mailbox, '@', 2))
  AND e.received_at > (now() - INTERVAL '24 hours')
ORDER BY e.received_at DESC
LIMIT 5;
-- For each row: confirm the matching agent_runs row's rule_key is NOT 'own_outbound_invoice_loopback'.
```

If any outbound row carries `rule_key='own_outbound_invoice_loopback'`:
**STOP**. The direction guard has regressed (R-02 spoofing mitigation
broken). Roll back the rule per section 5 and open a defect against
`classifier-screen-worker.ts` loopback branch.

### 2.4 Stage 3 volume-drop spot-check (Day 7)

CONTEXT verification 3-4. Confirm `general_inquiry` / `other` /
`payment_dispute` ranked-top volumes are dropping by the predicted
8-10 emails / 2 weeks (general+other) + 3-6 / 2 weeks (payment_dispute):

```sql
-- 14d-pre baseline (before shadow_start).
SELECT date_trunc('day', created_at) AS day,
       coordinator_topic, count(*)
FROM public.automation_runs
WHERE automation = 'debtor-email-review'
  AND created_at BETWEEN '<shadow_start - 14d>' AND '<shadow_start>'
  AND coordinator_topic IN ('general_inquiry','other','payment_dispute')
GROUP BY 1, 2 ORDER BY 1, 2;

-- 7d-during shadow.
SELECT date_trunc('day', created_at) AS day,
       coordinator_topic, count(*)
FROM public.automation_runs
WHERE automation = 'debtor-email-review'
  AND created_at BETWEEN '<shadow_start>' AND '<shadow_start + 7d>'
  AND coordinator_topic IN ('general_inquiry','other','payment_dispute')
GROUP BY 1, 2 ORDER BY 1, 2;
```

Record observed delta per intent in `CORPUS-SAMPLES.md` "Day 7 volume
delta" section (create it). Note: this is a soft signal — Phase 84 rules
are still in candidate during shadow, so the drop comes from
**bulk-review rerouting** (status='predicted' bypasses Stage 3 ranked-intent
coordinator), not yet from auto-archive.

---

## 3. Day-7 D-05 Gate Evaluation

Per (category, swarm) row, choose ONE gate path:

### Path (a) — Wilson live gate

Eligible when **all of**:
- 7 calendar days have elapsed since shadow_start (D-05 floor, non-negotiable).
- `classifier_rule_telemetry.n >= 30` (= `PROMOTE_N_MIN`).
- `wilsonCiLower(n, agree) >= 0.92` (= `PROMOTE_CI_LO_MIN`).
- No unresolved FP entries in `CORPUS-SAMPLES.md` "False positives reviewed"
  for this rule.

The cron evaluates this automatically. When CLASSIFIER_CRON_MUTATE=false
(default), it writes `action='shadow_would_promote'` on rows that pass.

### Path (b) — Corpus-evidence operator override

Eligible when **all of**:
- 7 calendar days have elapsed since shadow_start (D-05 floor).
- `CORPUS-SAMPLES.md` shows >=10 hand-confirmed positives for this rule.
- `CORPUS-SAMPLES.md` shows 0 hand-confirmed FPs for this rule.
- The 7-day shadow surfaced 0 operator-flagged FPs (= no rows with
  `human_verdict NOT IN ('approved','edited_minor')` AND no entries added to
  the rule's "False positives reviewed" section during shadow).

At 2026-05-20 plan-write time, the only row meeting Path (b) is row 15
(`own_outbound_invoice_loopback / debtor-email`, 21 corpus positives).

### Path neither — HOLD or EXTEND

- **HOLD-CANDIDATE:** rule has fewer than ~5 live observations and corpus
  is weak (rows 13, 14, 16 in the disposition matrix). Leave at
  `status='candidate'` indefinitely; re-evaluate in V8.2.
- **EXTEND-SHADOW >=14d:** rule has some live observations but neither path
  closes. Continue daily monitoring (section 2) until either path triggers.
  Re-run gate evaluation weekly.

### Sales-email per-swarm decision (R-04 mitigation)

For each category, compare the (debtor-email, sales-email) pair:

| debtor-email gate | sales-email gate | action |
|-------------------|------------------|--------|
| Path (a) or (b) passes | Path (a)/(b) passes too | promote both (section 4) |
| Path (a) or (b) passes | sales-email had **any** operator-flagged FP | drop the sales-email row before promoting (section 5 sub-rule), then promote debtor-email |
| Path (a) or (b) passes | sales-email has zero volume (N=0) | promote both; the sales-email rule is dormant but registered for D-08 future onboarding |
| Both held | n/a | hold both |

---

## 4. Promotion Action (Operator)

### Method A — cron-driven (Wilson path)

Use when one or more rules cleared Path (a). Flips `CLASSIFIER_CRON_MUTATE`
to `true` for exactly one cron tick (06:00 Amsterdam, Mon-Fri):

1. **Vercel** -> agent-workforce -> Settings -> Environment Variables
   -> set `CLASSIFIER_CRON_MUTATE=true` -> **Save** -> redeploy current build
   (Vercel applies env var changes via a redeploy).
2. Wait for the next 06:00 Amsterdam cron tick.
3. Inspect `classifier_rule_evaluations` for that day:

   ```sql
   SELECT swarm_type, rule_key, n, agree, ci_lo, action, evaluated_at
   FROM public.classifier_rule_evaluations
   WHERE evaluated_at::date = CURRENT_DATE
     AND rule_key IN (8 D-01 keys)
   ORDER BY swarm_type, rule_key;
   -- Expected: action='promoted' on the rules that cleared the gate.
   --           action='no_change' on the rest (held candidates).
   ```

4. Inspect `classifier_rules` to confirm `status='promoted'` + `promoted_at`
   is set:

   ```sql
   SELECT swarm_type, rule_key, status, promoted_at, n, agree, ci_lo
   FROM public.classifier_rules
   WHERE rule_key IN (8 D-01 keys)
   ORDER BY swarm_type, rule_key;
   ```

5. **Immediately reset `CLASSIFIER_CRON_MUTATE` to `false`** (or unset it)
   and redeploy. Leaving it `true` will mutate other Phase 60-X rules on
   subsequent days.

6. Record `promotion_date` in `CORPUS-SAMPLES.md` per-category "Promotion
   gate (D-05) status" rollup.

### Method B — hand-promotion (corpus path)

Use for rules cleared via Path (b) corpus-evidence override (e.g.
`own_outbound_invoice_loopback / debtor-email` on Day 7+). Service-role
write only (`web/.env.local` `SUPABASE_SERVICE_ROLE_KEY`):

```sql
-- One UPDATE per (swarm_type, rule_key) tuple. The unique constraint
-- (swarm_type, rule_key) guarantees exactly one row touched per call.
UPDATE public.classifier_rules
SET status = 'promoted',
    promoted_at = now(),
    notes = COALESCE(notes || E'\n', '') ||
            'Phase 84 corpus-evidence promotion (D-05 path b) — ' ||
            to_char(now(), 'YYYY-MM-DD'),
    updated_at = now()
WHERE swarm_type = $1
  AND rule_key = $2
  AND status = 'candidate';  -- safety: refuses to demote a 'promoted' or touch a 'manual_block'
```

Example for the only Day-7 corpus-path candidate:

```sql
UPDATE public.classifier_rules
SET status='promoted', promoted_at=now(),
    notes=COALESCE(notes || E'\n','') || 'Phase 84 corpus-path promotion 2026-05-XX',
    updated_at=now()
WHERE swarm_type='debtor-email'
  AND rule_key='own_outbound_invoice_loopback'
  AND status='candidate';
-- Expected: UPDATE 1.
```

Verification immediately after the UPDATE (60s cache TTL — auto-action will
start within one minute):

```sql
SELECT swarm_type, rule_key, status, promoted_at
FROM public.classifier_rules
WHERE swarm_type='debtor-email' AND rule_key='own_outbound_invoice_loopback';
-- Expected: status='promoted', promoted_at recent.
```

### 4.1 Regression-guard query (run before any promotion)

This query MUST return ZERO rows before flipping any candidate:

```sql
-- Any disagreement on a Phase 84 candidate-rule that hasn't been
-- explicitly dispositioned in CORPUS-SAMPLES.md is a promotion blocker.
SELECT t.swarm_type, t.rule_key, t.n, t.agree, (t.n - t.agree) AS disagree, r.status
FROM public.classifier_rule_telemetry t
JOIN public.classifier_rules r
  ON r.swarm_type = t.swarm_type AND r.rule_key = t.rule_key
WHERE t.rule_key IN (8 D-01 keys)
  AND r.status = 'candidate'
  AND (t.n - t.agree) > 0;
-- If non-empty: do NOT promote those rows. Review each disagreement
-- (section 2.2) before continuing.
```

---

## 5. Rollback Procedure

### 5.1 Per-category single-swarm rollback (R-04 mitigation, pre-promotion)

Drop the sales-email row when a sales-email FP surfaces during shadow that
the debtor-email row didn't:

```sql
UPDATE public.swarm_noise_categories
SET enabled = false,
    updated_at = now()
WHERE swarm_type = 'sales-email'
  AND category_key = '<one of the 8 keys>';
-- Expected: UPDATE 1. Preserves the row + audit history; the worker
-- registry-driven dispatch will treat enabled=false as a no-op.
```

If the row needs to be re-enabled later, flip `enabled=true` via the same
UPDATE — no INSERT/DELETE round-trip required.

### 5.2 Full demotion (FPs surface post-promotion)

If an FP shows up after `status='promoted'` flipped to live (= auto-archive
ran on a wrong email):

```sql
-- Demote the rule. classifier-promotion-cron's shouldDemote takes over
-- automatically from this point if telemetry continues to drift below CI-lo 0.88.
UPDATE public.classifier_rules
SET status = 'demoted',
    last_demoted_at = now(),
    notes = COALESCE(notes || E'\n','') ||
            'Phase 84 manual demote — ' || to_char(now(), 'YYYY-MM-DD HH24:MI') ||
            ' (operator FP review)',
    updated_at = now()
WHERE swarm_type = $1
  AND rule_key = $2
  AND status = 'promoted';
-- Expected: UPDATE 1. The whitelist cache picks it up within 60s; auto-action stops.
```

Verification that auto-action has stopped for this rule:

```sql
-- After demote + 90s wait: no NEW automation_runs rows with status='completed'
-- and result->>'action'='categorize' should appear for this rule_key.
SELECT count(*) AS recent_auto_actions
FROM public.automation_runs arn
JOIN public.agent_runs ar ON ar.automation_run_id = arn.id
WHERE ar.rule_key = $1
  AND arn.status = 'completed'
  AND arn.result->>'stage' = 'categorize'
  AND arn.completed_at > (now() - INTERVAL '5 minutes');
-- Expected: 0 after the cache TTL has elapsed.
```

**Outlook label recovery** (if categorize_archive ran on the FP): the
operator must hand-revert the Outlook label on the affected email(s).
There is no automated reversal path. Use the rule_key + a short time-window
on `agent_runs.created_at` to locate the affected `message_id` set:

```sql
SELECT ar.created_at, arn.result->>'source_mailbox' AS mailbox,
       arn.result->>'message_id' AS message_id,
       arn.result->>'subject' AS subject
FROM public.agent_runs ar
JOIN public.automation_runs arn ON arn.id = ar.automation_run_id
WHERE ar.rule_key = $1
  AND arn.result->>'stage' = 'categorize'
  AND ar.created_at > '<promotion_date>'::timestamptz
ORDER BY ar.created_at DESC;
```

### 5.3 Migration / tenant_domains rollback (R-05 mitigation hardening)

**NEVER drop `swarms.tenant_domains` column.** Wave 1's codegen + the worker
loopback branch hard-depend on the field's existence. To disable the
loopback rule for one swarm without a code change or schema change, empty
its tenant_domains list:

```sql
UPDATE public.swarms
SET tenant_domains = '[]'::jsonb,
    updated_at = now()
WHERE swarm_type = $1;
-- Expected: UPDATE 1. The classifier-screen-worker.ts loopback evaluation
-- short-circuits when fromDomain is not in the (empty) list. Codegen will
-- emit an empty array for this swarm on the next `npm run codegen` run;
-- the literal-union becomes 'never' for that swarm, which is type-safe.
```

To re-enable: re-INSERT the domain list back into the jsonb column and run
`npm run codegen && git diff --exit-code` to refresh the generated file.

---

## 6. D-03 loopback regression sample-check (Day-1 follow-up)

R-02 spoofing mitigation surface. This is a one-time Day-1 check that
extends section 2.3 with a deeper sample of 5 inbound positives + 5 outbound
negatives, hand-annotated in `CORPUS-SAMPLES.md` under the
`own_outbound_invoice_loopback` section.

Required evidence rows (10 total):

| # | direction | from_address | mailbox | expected rule_key | annotated by operator |
|---|-----------|--------------|---------|-------------------|----------------------|
| 1 | inbound | `administratie@fire-control.nl` | `administratie@fire-control.nl` | `own_outbound_invoice_loopback` | yes |
| 2 | inbound | `administratie@fire-control.nl` | `administratie@fire-control.nl` | `own_outbound_invoice_loopback` | yes |
| 3 | inbound | `administratie@fire-control.nl` | `administratie@fire-control.nl` | `own_outbound_invoice_loopback` | yes |
| 4 | inbound | `<tenant-domain sender>` | `<own mailbox>` | `own_outbound_invoice_loopback` | yes |
| 5 | inbound | `<tenant-domain sender>` | `<own mailbox>` | `own_outbound_invoice_loopback` | yes |
| 6 | outbound | `administratie@fire-control.nl` | `administratie@fire-control.nl` | NULL or other | yes |
| 7 | outbound | `<tenant-domain sender>` | `<own mailbox>` | NULL or other | yes |
| 8 | outbound | `<tenant-domain sender>` | `<own mailbox>` | NULL or other | yes |
| 9 | outbound | `<tenant-domain sender>` | `<own mailbox>` | NULL or other | yes |
| 10 | outbound | `<tenant-domain sender>` | `<own mailbox>` | NULL or other | yes |

If row 6-10 contains `rule_key='own_outbound_invoice_loopback'`: the
direction guard is broken. Rollback per section 5.1 (set
`swarms.tenant_domains='[]'` for the affected swarm) and open a defect.

---

## 7. Closure Signal

Phase 84 closes when **ALL** of the following hold:

1. For every row in section 0's disposition matrix, the disposition is one
   of: **PROMOTED** (status='promoted'), **DROPPED** (per-swarm enabled=false),
   or **HOLD-CANDIDATE with explicit operator deferral note** in
   CORPUS-SAMPLES.md.
2. `CORPUS-SAMPLES.md` "Promotion gate (D-05) status" rollup table is updated
   with the Day-7 outcome per row (add a "Day 7 decision" column if not
   already present).
3. CONTEXT verifications 1-6 satisfied:
   - V1: 16 rows in `swarm_noise_categories` (any enabled=false from R-04
     rollback are still listed).
   - V2: Fire Control loopback case shows 0 stage=3 rows in the shadow window.
   - V3-V4: Stage 3 `general_inquiry / other / payment_dispute` volumes
     measurably dropped (record observed numbers).
   - V5: Zero operator-flagged FPs at promotion time per category (OR per-swarm
     rollback dispositioned).
   - V6: `swarms.tenant_domains` populated for every existing swarm row;
     codegen output committed (`npm run codegen && git diff --exit-code` clean).
4. Operator opens `/gsd:resume` and signals **"Phase 84 closure complete"**
   with per-category promotion summary. The orchestrator updates STATE.md.

If at Day 7 only row 15 (own_outbound_invoice_loopback / debtor-email)
clears: that is a valid closure outcome. Phase 84 has registered all 8 noise
categories and produced one auto-action-eligible rule. The remaining 15
rows are deferred (HOLD-CANDIDATE) and revisited in V8.2 / Phase 87 once
real-traffic volume accumulates.

---

## Appendix A — Quick reference: terminology drift

| CONTEXT.md term | Live-code canonical | Notes |
|-----------------|---------------------|-------|
| `auto_active` status | `promoted` | Status enum is `candidate / promoted / demoted / manual_block`. There is no `auto_active`. Treat any CONTEXT mention of `auto_active` as a synonym for `promoted`. |
| Wilson lower >= 0.95 | Wilson lower >= 0.92 | Live `PROMOTE_CI_LO_MIN` was lowered from 0.95 to 0.92 in Phase 60-08 (`wilson.ts:34` historical note). Operator may re-raise via constant edit + redeploy if Phase 84 surfaces FPs at 0.92. |
| "promotion to auto_active" | "promotion to promoted" + whitelist refresh (60s cache TTL) | Auto-action eligibility is `classifier_rules.status='promoted'` only. No separate flag. |

## Appendix B — Quick reference: where each artefact lives

| Concept | Table / file | Notes |
|---------|--------------|-------|
| Candidate -> promoted state machine | `public.classifier_rules.status` | UNIQUE (swarm_type, rule_key) |
| Live telemetry | `public.classifier_rule_telemetry` (view) | Reads `agent_runs.rule_key` + `agent_runs.human_verdict` |
| Daily cron decisions log | `public.classifier_rule_evaluations` | Append-only; shadow rows carry `action='shadow_would_*'` |
| Active whitelist (auto-action gate) | `classifier_rules WHERE status='promoted'` via `web/lib/classifier/cache.ts` | 60s TTL cache; mutation reflects within 60s |
| Noise category dispatch | `public.swarm_noise_categories.action` | Phase 84 rows: `categorize_archive` |
| Tenant-domain registry (loopback) | `public.swarms.tenant_domains` (jsonb) | Read at runtime via `loadSwarm`; codegen mirrors to `tenant-domains.generated.ts` for static-typing only |
| Shadow-mode gate env var | `process.env.CLASSIFIER_CRON_MUTATE` | Default = unset / not `"true"` -> shadow; `"true"` -> live mutation |
