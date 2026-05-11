-- Phase 999.8 Plan 04 — Stage 1 LLM classifier prompt re-calibration audit record.
--
-- This migration is an AUDIT TRAIL — the actual prompt change is applied to the
-- live Orq.ai agent (slug 01KQY3ZXEX17RSXFV3CMKRS0T7, workspace cura, path
-- "Debtor Team/stage-1") via the Studio Instructions textarea or update_agent
-- MCP call. The agent's behaviour is canonical; this row exists so git history
-- records what prompt revision shipped with the Phase 999.8 confidence gate.
--
-- Motivating incident: 2026-05-08 — Therese Hendriks email
-- (email_id 09823c92-f6c4-4bce-bb9c-e7935e508e40, mailbox debiteuren@smeba-fire.be)
-- was auto-archived as "Payment Admittance" at medium confidence by the Phase 74
-- agent. With the Plan 03 code gate enforcing "high"-only auto-archive AND this
-- re-calibrated prompt (which encodes the Therese case as `unknown / medium`),
-- the same email now keeps `agent_runs.status='predicted'` and surfaces in the
-- Stage 1 review row list for human verdict.
--
-- See .planning/phases/999.8-…/999.8-04-PLAN.md and 999.8-04-SUMMARY.md for the
-- full proposed prompt text and the 5-input smoke matrix.

UPDATE public.orq_agents
   SET version = '2026-05-11.v2',
       notes  = 'Phase 999.8 re-calibration: added <confidence_calibration> block (asymmetric-cost framing, "WHEN IN DOUBT DOWNGRADE", ~95% certainty threshold for "high") and <calibration_examples> block (5 worked examples including the Therese Hendriks FW: Invoice 17338747 case as unknown/medium). Output enum {low,medium,high} unchanged (D-01 non-goal lock). Pairs with Plan 03 code gate.',
       updated_at = now()
 WHERE agent_key = 'stage-1-category-classifier';
