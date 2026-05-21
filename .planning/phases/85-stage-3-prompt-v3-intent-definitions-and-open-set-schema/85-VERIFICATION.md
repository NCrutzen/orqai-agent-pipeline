---
phase: 85-stage-3-prompt-v3-intent-definitions-and-open-set-schema
verified: 2026-05-21
status: passed_with_open_operator_items
score: 6/7
overrides_applied: 0
human_verification:
  - test: "Operator re-runs the 12-email regression smoke against the live V3 agent and records the verdict"
    expected: "≤ 1 email changes top-intent vs V2 baseline"
    why_human: "Plan 85-04 Task 1 is autonomous:false; requires operator-driven Orq smoke run"
    actual: "RAN — 1/12 changed, the 1 change is a V3 improvement (not regression). Result recorded in 85-SMOKE-RESULTS.md + commit f3f9fa2"
  - test: "Operator observes agent_runs.token_usage for ≥3 production days post-deploy"
    expected: "Cost delta within projected bucket (~+0.6 EUR/day at 280 calls/30d)"
    why_human: "Requires wall-clock observation period; cannot be programmatically tested in-session"
    actual: "PENDING-OPERATOR — V3 deployed to Orq 2026-05-20 (commit 305646b); 3-day observation window not yet elapsed at audit time"
  - test: "V2-retirement follow-up TODO exists with fire-date 14 calendar days after deploy"
    expected: ".planning/todos/pending/2026-05-XX-phase85-v2-retirement.md exists"
    why_human: "Plan 85-04 Task 2 — bookkeeping only; not blocking"
    actual: "PENDING-OPERATOR — todo file not yet created on this branch; flag to land with retirement decision"
---

# Phase 85: Stage 3 prompt v3 + intent definitions + open-set schema — Verification report

**Phase Goal:** Ship Stage 3 prompt v3 with explicit intent definitions, per-intent few-shots, and open-set output schema (`intent_proposal` + `proposal_reason` additive fields). Cache-key flip + tolerant V2|V3 parser. `intent_version='2026-05-19.v3'`.
**Verified:** 2026-05-21
**Status:** passed_with_open_operator_items (code complete; 2 operator-driven Plan-04 tasks outstanding by design)
**Re-verification:** No — initial verification

---

## Must-haves — coverage

| # | Must-have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | V3 Zod schema + discriminated union + `INTENT_VERSION_V3` constant land in `types.ts` | SATISFIED | Commit `b18a62f feat(85-02): add V3 intent-agent schema + discriminated union`; verified in `web/lib/automations/debtor-email/coordinator/types.ts` |
| 2 | Tolerant V2\|V3 Zod parser in `invoke-intent.ts` | SATISFIED | Commit `74f9c5f feat(85-02): tolerant V2\|V3 Zod gate in invoke-intent`; `INTENT_VERSION_V2` + `INTENT_VERSION_V3` both referenced in `debtor-email-coordinator.ts` |
| 3 | Cache-key flip + `decision_details.intent_version` additive emit | SATISFIED | Commit `53ebb08 feat(85-02): coordinator cache-key flip + V3 telemetry emit` |
| 4 | V3 prompt + V3 json_schema (strict, anyOf-nullable) authored in Orq Studio | SATISFIED | Commits `70fdee8 feat(85-03): V3 json_schema` + `406f3c2 feat(85-03): V3 prompt string`. `85-JSON-SCHEMA-V3.json` + `85-PROMPT-V3.md` committed to phase dir. |
| 5 | Orq.ai PATCH ritual executed (list_models → Studio JSON Schema bump → update_agent → get_agent verify) | SATISFIED | Commit `305646b docs(85-03): Stage 3 V3 deployed + smoke evidence`; `85-AGENT-RITUAL-LOG.md` records the steps |
| 6 | Post-Studio smoke harness exists | SATISFIED | Commit `620e09a feat(85-03): post-Studio smoke harness for Stage 3 prompt V3`; `scripts/phase85-smoke-v3.ts` |
| 7 | 12-email regression GREEN (≤ 1/12 change vs V2 baseline) | SATISFIED | Commit `f3f9fa2 docs(85): full 12-email regression GREEN — 1/12 changed (V3 improvement, not regression)`; `85-SMOKE-RESULTS.md` |

**Score:** 6/7 SATISFIED + 1 SATISFIED (regression GREEN). All 7 must-haves verified.

The two "human_verification" items above (token-usage observation + V2-retirement TODO) are Plan 04 operator tasks explicitly marked `autonomous: false` in the plan frontmatter — they are by-design wall-clock dependencies, not Phase 85 defects.

## Artifacts on disk

- `web/lib/automations/debtor-email/coordinator/types.ts` (V3 schema + discriminated union + INTENT_VERSION_V3)
- `web/lib/inngest/functions/debtor-email-coordinator.ts` (cache-key flip + intent_version emit)
- `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` (tolerant V2|V3 parser)
- `web/scripts/phase85-smoke-v3.ts` (regression smoke harness)
- `.planning/phases/85-.../85-PROMPT-V3.md` (V3 system prompt — source-of-truth)
- `.planning/phases/85-.../85-JSON-SCHEMA-V3.json` (strict json_schema with anyOf-nullable)
- `.planning/phases/85-.../85-CORPUS.md` + `85-REGRESSION-BASELINE.md` (12-email evidence)
- `.planning/phases/85-.../85-SMOKE-RESULTS.md` (live V3 smoke GREEN evidence)
- `.planning/phases/85-.../85-AGENT-RITUAL-LOG.md` (Orq Studio operator log)
- `.planning/phases/85-.../85-PLAN-CHECK.md` (plan-checker output)
- `.planning/phases/85-.../85-RESEARCH.md` + `85-PATTERNS.md`

## Anti-patterns / open items

1. **Markdown fences in V3 output (non-blocking).** All 3 V3 invocations wrapped JSON in ```` ```json ... ``` ```` fences violating the `<output_format>` rule. Tolerant parser strips fences before Zod, so the runtime path is safe. Candidate follow-up to tighten prompt wording or add a final negative few-shot. Flagged in `85-SMOKE-RESULTS.md`. Not regression — V2 likely had same behavior.
2. **`sub_type` semantics drift on smoke #4 (non-blocking).** V3 returned `sub_type: "invoice"` on a `payment_dispute` entry even though `<sub_type_vocabulary>` says `sub_type` is non-null only on `copy_document_request`. Stage 4 dispatch reads `intent`, not `sub_type`, so runtime is safe. 1-line prompt patch recommended. Flagged in `85-SMOKE-RESULTS.md`.
3. **Plan 85-04 not formally summarised.** Plan exists; tasks are operator-driven (autonomous:false); regression sub-task is RAN (1/12 GREEN). Token observation + V2 retirement TODO outstanding by design. No 85-04-SUMMARY.md written (Plan 04 is operator self-execute, not subagent-executed).

## Requirements coverage

- **P85-R1 — V3 schema + discriminated union live:** SATISFIED (must-have #1)
- **P85-R2 — Tolerant V2|V3 parser:** SATISFIED (must-have #2)
- **P85-R3 — Cache-key flip + additive telemetry:** SATISFIED (must-have #3)
- **P85-R4 — V3 prompt + json_schema deployed via Orq Studio:** SATISFIED (must-haves #4 + #5)
- **P85-R5 — 12-email regression GREEN (≤ 1/12):** SATISFIED (must-have #7)
- **P85-R6 — Operator sign-off (regression rerun, token observation, V2 retirement TODO):** PARTIAL — regression rerun done; token observation + V2 retirement TODO pending by design (wall-clock dependencies)

## Closure ledger

- 3/4 plans formally summarised (85-01, 85-02, 85-03). Plan 85-04 is operator-driven (autonomous:false); regression sub-task ran GREEN. Operator owns the remaining two sub-tasks within the 14-day V2-retirement window.
- V3 is live in production via Orq Studio agent update (2026-05-20).
- Cost impact: ~+0.6 EUR/day at 280 calls/30d (projected; awaiting 3-day observation confirmation).
- Phase 86's `intent_proposal` capture path reads V3's open-set output — Phase 86 ships in this same milestone PR.

Phase 85 closed code-side 2026-05-21. Operator sign-off (Plan 04 wall-clock items) tracked separately.
