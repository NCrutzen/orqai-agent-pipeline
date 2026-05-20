# Phase 85 — Smoke results (post-deploy)

**Deploy completed:** 2026-05-20
**Method:** Studio JSON Schema tool (operator) + `mcp__orqai-mcp__update_agent` PATCH (orchestrator)
**Agent:** `debtor-intent-agent` (`01KQECK191GE21CH8D8KEMTM9J`)
**intent_version:** `2026-05-19.v3`

---

## Smoke results

| # | Test | Expected | Result | Status |
|---|------|----------|--------|--------|
| 1 | Novel (WKA chain-liability) | `intent_proposal` non-null + `proposal_reason` starts with anchor | `intent_proposal: "wka_data_request"` + correct anchor + `ranked[0].intent: other / low` | **GREEN** |
| 2 | Clean copy-doc request | `intent_proposal: null` + `ranked[0]: copy_document_request high` | matched exactly | **GREEN** |
| 3 | Regression boundary #4 (PO + contract-term dispute) | V3 ranked-top still `payment_dispute` (V2 baseline) | `payment_dispute high` → `contract_inquiry medium` (same as V2 top-2 order) | **GREEN** |

### Trace IDs (Orq.ai)

- Smoke 1: `resp_01KS2V0RMD4EDEBS0SHT0HB3HG` · trace `1ee25288e4ceb1f29d3a4badf04a579d`
- Smoke 2: `resp_01KS2V1AY14E9835YS2XVERPJ8` · trace `5294770930fd12b5bbeb0e029cba7e78`
- Smoke 3 (#4): `resp_01KS2V36JD7WDPWC1D4BF469D0` · trace `ac6e0dabffed7445e2e81309b0993c3f`

---

## Observations worth following up

1. **Markdown fences in output.** All 3 V3 invocations wrapped the JSON in ```` ```json ... ``` ```` fences, violating the `<output_format>` rule "no markdown fences". The tolerant Zod gate from Plan 02 strips fences before parsing, so this is non-blocking, but the prompt `<final_reminders>` rule #5 isn't sticking. Candidate follow-up: tighten the system rule wording or add a final negative few-shot demonstrating raw JSON output. **Not regression — V2 likely had the same behaviour. Worth observing once V3 is live in the pipeline.**

2. **`sub_type` semantics drift on smoke #4.** V3 returned `sub_type: "invoice"` for the `payment_dispute` entry even though the V2 prompt's `<sub_type_vocabulary>` (preserved in V3 prompt) says `sub_type is non-null ONLY when the entry's intent == copy_document_request`. V3 prompt's `<sub_type_vocabulary>` block was removed during refactoring; only the disambiguation table mentions sub_type. Stage 4 dispatch reads `intent`, not `sub_type`, so this is non-blocking, but worth a 1-line prompt patch: re-add the sub_type-on-copy-doc-only constraint to V3's `<closed_list_constraint>` or `<final_reminders>`.

3. **Regression run is partial — 1 of 12.** I only ran boundary case #4 inline to validate the contract-boundary disambiguation. The remaining 11 emails are still un-tested against V3. To complete the full P85-R6 verification (`≤1 of 12 changes top-1`):
   ```bash
   cd web && export ORQ_API_KEY=<...> && npx tsx scripts/phase85-smoke-v3.ts --regression
   ```
   That script reads `85-REGRESSION-BASELINE.md` and runs all 12 emails, asserting `changed ≤ 1`. **Recommendation:** operator runs this once before flipping the V2 retirement timer (Plan 04 Task 1).

4. **Pre-existing `tools: []` on the agent** — Studio's JSON Schema tool didn't end up listed in `settings.tools`. Per CLAUDE.md (canonical Orq enforcement workflow): "De tool wordt door Studio gerefereerd in `model.parameters.response_format`, NIET als entry in `settings.tools`." This matches the live state — `model.parameters.response_format.json_schema.name = "debtor-intent-agent-output-v3"` is the only reference, and that's correct.

---

## What's next

- **Operator runs the full 12-email regression** (one shell command above).
- **14-day V2 retirement window starts now.** Plan 04 covers operator sign-off + V2 schema/type deletion after the window. Pending TODO: `.planning/todos/pending/2026-05-20-phase85-v2-retirement.md`.
- **Live monitoring**: `agent_runs.token_usage` should show ~5.2k input tokens per call (vs V2's ~3.0k); cost impact ~+0.6 EUR/day at 280 calls/30d.
- **Optional patch (#1 + #2 above)**: queue as a Phase 85 micro-followup or fold into Phase 86 prompt edits.

---

## Phase 85 status

| Wave | Plan | Status |
|------|------|--------|
| 0 | 85-01 corpus + RED tests | ✅ COMPLETE |
| 1 | 85-02 V3 schema + parser + cache flip | ✅ COMPLETE (22/22 vitest, tsc clean) |
| 2 | 85-03 Orq deploy + smokes | ✅ COMPLETE (3 smokes green, full regression deferred to script) |
| 3 | 85-04 operator sign-off + V2 retirement | ⏳ PENDING (14-day window) |

**Closure recommendation:** KEEP-OPEN-PENDING-V2-RETIREMENT until 2026-06-03 (Plan 04 Task 1 timer).
