# Phase 89 — Wave 0 Probe

**Run:** 2026-05-20  
**Probe operator:** /gsd-execute-phase (Wave 0 / Plan 01)  
**Target:** live Supabase project `mvqjhlxfvtqqubqgdvhz` via Management API (read-only SELECTs only)

Resolves RESEARCH §Open Questions 1 + 4 and Pitfall 1. Locks DECISION-01 and DECISION-02 for downstream Plans 02 and 05.

---

## Critical schema finding (resolves Pitfall 1)

`information_schema.columns` reports **NO** `rule_key` column on `public.automation_runs` (any schema). Verified twice:

```
SELECT table_schema, column_name FROM information_schema.columns
WHERE column_name='rule_key' AND table_name='automation_runs';
→ []
```

`public.automation_runs` columns (ordinal): id, automation, status, result, error_message, triggered_by, created_at, completed_at, swarm_type, topic, entity, mailbox_id.

Consequence: `actions.ts:813` `.select("id, swarm_type, entity, rule_key, result, email_id")` and the subsequent `!run.rule_key` guard at `actions.ts:855-858` reference a column that does not exist. `approvePrediction` is **latently broken for every row today** (regex + LLM alike), not just LLM rows. **This is out of scope for Phase 89** — file as a separate defect. Phase 89's LLM-rule-key threading routes around it via the Stage 1 page.tsx form payload → `recordVerdict` (which has its own Zod-validated `rule_key: z.string().min(1)` at `actions.ts:48`), not via `approvePrediction`.

---

## Query A — automation_runs predicted rows: rule_key state (top 20)

Original `automation_runs.rule_key` column query errored:
```
ERROR: 42703: column "rule_key" does not exist
```
Adapted to inspect `result->>'rule_key'` jsonb path instead:

```sql
SELECT id, result->>'rule_key' AS rule_key_in_result, triggered_by,
       result->'predicted'->>'rule' AS predicted_rule, created_at
FROM public.automation_runs
WHERE automation = 'debtor-email-review'
  AND status = 'predicted'
  AND swarm_type = 'debtor-email'
ORDER BY created_at DESC
LIMIT 20;
```

All 20 rows: `rule_key_in_result = null`. Mix of `triggered_by`: `stage-1-worker` (some with `predicted_rule = payment_subject | blocked_submission_rejected | no_match`) and `stage-0/safety-worker` (predicted_rule null). Sample:

| id | rule_key_in_result | triggered_by | predicted_rule | created_at |
|---|---|---|---|---|
| 3976fbe3-c8e1-46fc-a0ff-3ae81c9b2864 | null | stage-1-worker | payment_subject | 2026-05-19 15:10:17 |
| f62842ed-57b7-40e9-a93d-b182ef1426b0 | null | stage-0/safety-worker | null | 2026-05-19 14:52:24 |
| b5f4ed4e-dafb-4c7e-869a-db8c2992990e | null | stage-1-worker | payment_subject | 2026-05-19 14:17:32 |
| 278594a7-d1db-400c-ad40-a00f483db7ea | null | stage-1-worker | blocked_submission_rejected | 2026-05-19 13:59:46 |
| 069eb813-af7d-4f73-b140-a2e250452e4d | null | stage-1-worker | blocked_submission_rejected | 2026-05-19 13:59:44 |
| f8d4d508-c9a0-4857-bda4-665ec523f780 | null | stage-1-worker | no_match | 2026-05-19 12:31:39 |
| b17159ae-1172-47f0-bdb4-5690709bc04c | null | stage-1-worker | no_match | 2026-05-19 12:03:39 |

(Full 20 rows captured in run log; pattern is uniform — every recent row has `result->>'rule_key' = null` and the `automation_runs.rule_key` column itself does not exist.)

## Query B — predicted automation_runs: rule_key null vs non-null

```sql
SELECT
  COUNT(*) FILTER (WHERE (result->>'rule_key') IS NULL)     AS null_count,
  COUNT(*) FILTER (WHERE (result->>'rule_key') IS NOT NULL) AS non_null_count,
  COUNT(*) AS total
FROM public.automation_runs
WHERE automation = 'debtor-email-review'
  AND status = 'predicted'
  AND swarm_type = 'debtor-email';
```

| null_count | non_null_count | total |
|---|---|---|
| 536 | 0 | 536 |

Today, **0 of 536** predicted bulk-review rows carry rule_key either as a column or anywhere in `result` jsonb.

## Query C — agent_runs LLM rows missing rule_key (backfill blast radius)

```sql
SELECT
  COUNT(*) FILTER (WHERE rule_key IS NULL)                                       AS null_count,
  COUNT(*) FILTER (WHERE rule_key LIKE 'llm:%')                                  AS already_llm_count,
  COUNT(*) FILTER (WHERE rule_key IS NULL AND tool_outputs ? 'stage1_category'
                        AND confidence IS NOT NULL)                              AS will_backfill_count,
  COUNT(*)                                                                       AS total
FROM public.agent_runs
WHERE swarm_type = 'debtor-email'
  AND tool_outputs ? 'stage1_category';
```

| null_count | already_llm_count | will_backfill_count | total |
|---|---|---|---|
| 456 | 0 | 456 | 456 |

**Plan 04 backfill will touch exactly 456 historic LLM rows.** All currently `rule_key IS NULL`. No pre-existing `llm:*` rule_keys to reconcile.

## Query D — pipeline_events.decision_details shape for LLM rows

```sql
SELECT email_id, decision_details
FROM public.pipeline_events
WHERE stage = 1
  AND swarm_type = 'debtor-email'
  AND decision_details->>'predictor' = 'llm_2nd_pass'
ORDER BY created_at DESC
LIMIT 5;
```

All 5 rows have the same flat shape:

```jsonc
{
  "regex": { "invoked": true, "category": "unknown", "matchedRule": "no_match" | "blocked_submission_rejected" },
  "entity": "smeba-fire" | "berki" | "fire-control",
  "predictor": "llm_2nd_pass",
  "llm_invoked": true,
  "llm_error": null,
  "llm_reasoning": "<free text>",
  "llm_confidence": "high" | "medium",          // ← exact field name
  "llm_category_key": "auto_reply" | "unknown",  // ← exact field name
  "final_category_key": "auto_reply" | "unknown"
}
```

Fields needed for Plan 05 synthesis are flat on `decision_details`: **`llm_category_key`** and **`llm_confidence`**.

Note: of the 5 most-recent LLM rows, 3 have `llm_category_key="auto_reply"` with `llm_confidence="high"` (canonical promotable candidates), 1 has `unknown:high`, 1 has `unknown:medium`. Per CONTEXT D-03 + RESEARCH Anti-Pattern, Plan 03 seed MUST exclude `category_key='unknown'`.

---

## DECISION-01 — Plan 02 worker `automation_runs.insert` rule_key extension

**Decision: NO — Plan 02 will NOT extend `automation_runs.insert` sites with `rule_key`.**

Reason: the `rule_key` column does not exist on `public.automation_runs`. Adding writes for a non-existent column would crash the worker. Three viable follow-ups exist (NOT in scope for Phase 89):

1. **Defer:** keep LLM rule_key threading exclusively on `agent_runs.rule_key` (Plan 02 Edit Sites 1 & 2) + the form-payload path in Plan 05. Phase 89 acceptance is satisfied via `classifier_rule_telemetry` which aggregates over `agent_runs.rule_key`, not `automation_runs.rule_key`.
2. **Add a column** (`ALTER TABLE public.automation_runs ADD COLUMN rule_key text`) in a future phase, then extend the 5 worker insert sites. Pairs with the latent `approvePrediction` defect fix.
3. **Stash in `result` jsonb** (`result.rule_key = effectiveMatchedRule`) — cheaper than (2) but only useful once `approvePrediction` is rewritten to read it.

**Locked guidance for Plan 02:** edit only `agent_runs.insert` sites (Edit Sites 1 & 2 in RESEARCH). Do NOT touch any `automation_runs.insert` site. Add a clear inline comment + capture this finding in the plan summary so the latent bug is documented but not silently re-introduced.

**Locked guidance for Plan 05:** because `automation_runs.rule_key` does not exist and `result->>'rule_key'` is also null on 100% of rows (Query B), the page.tsx row-loader MUST synthesize `ruleKey` exclusively from `pipeline_events.decision_details` (per DECISION-02). The form payload passes `rule_key` directly to `recordVerdict` (Zod-validated, `actions.ts:48`). Do NOT rely on `approvePrediction` for the LLM rule_key path.

## DECISION-02 — Plan 05 row-loader rule_key synthesis fields

**Decision:** For rows where `decision_details->>'predictor' = 'llm_2nd_pass'`, synthesize:

```ts
ruleKey = `llm:${d.llm_category_key}:${d.llm_confidence}`;
```

Exact JSON paths (verified verbatim across 5/5 sampled rows in Query D):

- **category_key:** `decision_details.llm_category_key` (flat, snake_case, top-level on decision_details)
- **confidence:**   `decision_details.llm_confidence`  (flat, snake_case, top-level on decision_details)

Both are strings. Confidence values seen: `"high"`, `"medium"`. Category values seen: `"auto_reply"`, `"unknown"`.

**Guard:** skip synthesis if either field is null/empty, OR if `llm_category_key === "unknown"` (per Plan 03 seed-exclusion logic — never auto-archive on `unknown:*`). When skipped, fall through to existing regex-path `rule_key` so regex rows continue to thread their existing key.

---

## Out-of-scope findings filed for follow-up

1. **`automation_runs.rule_key` column missing** — `actions.ts:813` selects a nonexistent column; `approvePrediction` cannot succeed for any row today. File as separate defect after Phase 89.
2. **`result->>'rule_key'` null on 100% of predicted rows (536/536)** — even if approvePrediction were rewritten to read from jsonb, no row carries it. Requires a worker write-side fix coupled with a backfill.
3. **0 historic `llm:*` rule_keys exist on agent_runs** (Query C `already_llm_count=0`) — Plan 04 backfill is the sole source. No conflicts with pre-existing data.
