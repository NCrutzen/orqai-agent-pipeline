-- Phase 89 (D-02). Historic backfill: mint synthetic LLM rule_keys on
-- public.agent_runs rows where the LLM 2nd-pass wrote a category_key +
-- confidence but left rule_key NULL (pre-Phase-89 LLM-path inserts at
-- classifier-screen-worker.ts:265-279 omitted the field).
--
-- Idempotent via WHERE rule_key IS NULL — second apply matches 0 rows.
-- Touches rule_key ONLY — operator review columns are untouched, so the
-- review signal stays honest. Historic rows that were never reviewed stay
-- un-reviewed.
--
-- Verification after apply:
--   SELECT rule_key, COUNT(*)
--   FROM public.agent_runs
--   WHERE rule_key LIKE 'llm:%'
--   GROUP BY rule_key
--   ORDER BY 2 DESC;

UPDATE public.agent_runs
SET rule_key = 'llm:' || (tool_outputs->>'stage1_category') || ':' || confidence
WHERE rule_key IS NULL
  AND tool_outputs ? 'stage1_category'
  AND confidence IS NOT NULL;
