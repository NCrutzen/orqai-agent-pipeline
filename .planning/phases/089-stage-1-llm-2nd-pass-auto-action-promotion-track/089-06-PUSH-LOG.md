# Phase 89 — Plan 06 Push Log

**Status:** ✅ applied  
**Run:** 2026-05-20  
**Mechanism:** Supabase Management API (`POST /v1/projects/mvqjhlxfvtqqubqgdvhz/database/query`)  
**Operator confirmation:** user-selected via AskUserQuestion 2x ("Push via Management API" → "Yes — execute now")  
**Migration file:** `supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql`

> Note on push mechanism: the file lives in `supabase/migrations/` per Plan 04, but the historical Phase 89 ran the SQL directly via the Management API rather than `supabase db push`, because the project's CLI flow couldn't be exercised in this session (no linked CLI). The SQL body executed is byte-for-byte the migration file; `supabase_migrations.schema_migrations` was **not** stamped by this push. Follow-up: have `supabase db push` register the file (it will detect the UPDATE has already taken effect via the `WHERE rule_key IS NULL` idempotency guard and match 0 rows, then stamp the file).

---

## Pre-push state (predicted blast radius)

```sql
SELECT COUNT(*) AS will_update
FROM public.agent_runs
WHERE rule_key IS NULL
  AND tool_outputs ? 'stage1_category'
  AND confidence IS NOT NULL;
-- → 839
```

| swarm_type   | will_update |
|--------------|-------------|
| debtor-email | 456         |
| sales-email  | 383         |
| **total**    | **839**     |

```sql
SELECT COUNT(*) AS already_llm
FROM public.agent_runs
WHERE rule_key LIKE 'llm:%';
-- → 0
```

No pre-existing `llm:*` rule_keys → no merge conflicts, no orphans to reconcile.

(Wave 0 Query C reported 456 for debtor-email; this push log includes sales-email too because the migration deliberately omits a `swarm_type` filter — cross-swarm by design per RESEARCH "Cross-swarm by default; no debtor-specific branches".)

## Push (apply #1)

```sql
UPDATE public.agent_runs
SET rule_key = 'llm:' || (tool_outputs->>'stage1_category') || ':' || confidence
WHERE rule_key IS NULL
  AND tool_outputs ? 'stage1_category'
  AND confidence IS NOT NULL;
```

Response: `[]` (Management API returns the result set; UPDATE with no RETURNING returns empty array — confirms statement executed without error).

## Post-push verification

### Per rule_key

| rule_key                       | n   |
|--------------------------------|-----|
| llm:unknown:high               | 273 |
| llm:unknown:medium             | 246 |
| llm:unknown:low                | 176 |
| llm:auto_reply:high            | 70  |
| llm:payment_admittance:high    | 32  |
| llm:payment_admittance:medium  | 22  |
| llm:ooo_temporary:high         | 12  |
| llm:ooo_temporary:medium       | 6   |
| llm:ooo_permanent:high         | 2   |

**Total:** 839 rows ✅ (matches pre-push prediction).

### Per swarm

| swarm_type   | llm_rows |
|--------------|----------|
| debtor-email | 456      |
| sales-email  | 383      |

### Idempotency check (apply #2, same SQL)

Response: `[]` — second apply matched 0 rows (would have errored or returned a count if any row still satisfied `WHERE rule_key IS NULL ...`).

Total `llm:%` rows after re-apply: **839** (unchanged) ✅.

### Safety check — `human_verdict` is untouched

```sql
SELECT COUNT(*) FILTER (WHERE human_verdict IS NULL)     AS hv_null,
       COUNT(*) FILTER (WHERE human_verdict IS NOT NULL) AS hv_set
FROM public.agent_runs
WHERE rule_key LIKE 'llm:%';
```

| hv_null | hv_set |
|---------|--------|
| 839     | 0      |

All 839 backfilled rows still have `human_verdict IS NULL` — operator review signal stays honest (CONTEXT D-02 safety contract verified). Historic rows that were never reviewed remain un-reviewed.

---

## Plan 07 input — promotable candidates (raw n, before human_verdict join)

`llm:unknown:*` rule_keys (695 rows total) are intentionally NOT seeded by Plan 03 and CANNOT be promoted — they're aggregation-only artefacts. Promotable candidates (require n≥30 + Wilson CI lo ≥0.92 against `human_verdict='approved'`):

| rule_key                       | raw n | promotable on raw count? |
|--------------------------------|-------|--------------------------|
| llm:auto_reply:high            | 70    | yes (n≥30)               |
| llm:payment_admittance:high    | 32    | yes (n≥30)               |
| llm:ooo_temporary:high         | 12    | no (n<30)                |
| llm:ooo_permanent:high         | 2     | no (n<30)                |

**Caveat for Plan 07:** all 839 backfilled rows have `human_verdict IS NULL`. The Wilson-CI shadow harness reads `classifier_rule_telemetry`, which aggregates `agree = COUNT(...) FILTER (human_verdict='approved')`. Backfilled rows therefore contribute n>0 but `agree=0` until operators retro-review through the Stage 1 UI. Plan 07's shadow report must surface this and either (a) document the dependency on future operator reviews or (b) propose a corpus-spot-check pathway.

---

## Acceptance criteria — Plan 06

- [x] Migration `supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` SQL executed against live project `mvqjhlxfvtqqubqgdvhz`.
- [x] Idempotency verified: second apply matched 0 rows.
- [x] Verification SELECT — rule_key LIKE 'llm:%' count = 839 matches `will_backfill_count` pre-push (cross-swarm cumulative: 456 debtor-email + 383 sales-email).
- [x] `human_verdict` distribution on backfilled rows = (839 null, 0 set) — D-02 safety contract intact.

## Followups

1. Run `supabase db push` from a properly-linked CLI to register the migration in `supabase_migrations.schema_migrations` (no row writes, all matched by idempotency guard).
2. Plan 07 shadow-eval will likely surface 0 promotable rule_keys on `agree`-based CI because all backfilled rows are unreviewed. Decide between operator retro-review or alternate validation pathway.
