# Phase 089 Plan 01 — Summary

**Status:** ✅ complete (2026-05-20)  
**Type:** Wave 0 probe (read-only SELECTs against live Supabase)  
**Output:** `089-WAVE0-PROBE.md`

## What changed
- Ran 4 SELECTs via Supabase Management API; captured verbatim outputs.
- Locked DECISION-01 and DECISION-02 for Plans 02 and 05.

## Key finding (changes downstream plans)
**`public.automation_runs.rule_key` column does not exist.** `actions.ts:813`/`:855-858` reference a phantom column → `approvePrediction` is latently broken for every row today (regex + LLM). Phase 89 routes around this: LLM rule_key threading stays on `agent_runs.rule_key` + Plan 05's form-payload path to `recordVerdict`. The `automation_runs` defect is filed as out-of-scope follow-up.

## Decisions locked
- **DECISION-01 (Plan 02):** NO — do NOT extend any `automation_runs.insert` site with `rule_key`. Edit only the two `agent_runs.insert` paths.
- **DECISION-02 (Plan 05):** synthesize `ruleKey = "llm:" + decision_details.llm_category_key + ":" + decision_details.llm_confidence` for rows with `decision_details.predictor === "llm_2nd_pass"`. Skip when `llm_category_key === "unknown"` (matches Plan 03 seed-exclusion).

## Backfill blast radius
- Plan 04 will UPDATE exactly **456 historic LLM rows** in `agent_runs` (currently `rule_key IS NULL` with `tool_outputs ? 'stage1_category'`). Zero pre-existing `llm:*` rule_keys → no merge conflicts.
