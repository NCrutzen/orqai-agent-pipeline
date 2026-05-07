## Pre-existing test failures (out of scope for 999.4-04)

Surfaced 2026-05-07 during plan 999.4-04 full vitest run. NONE are caused by sweeper changes:

- tests/queue/rule-filter.test.tsx — D-15 JSONB filter regression
- tests/labeling/classifier-invoice-copy-handler.test.ts (6 tests)
- tests/labeling/orq-agents-client.test.ts (3 tests)
- lib/pipeline/__tests__/stages.test.ts (4 tests) — PIPELINE_STAGES expects 7 stages
- lib/v7/graph/__tests__/layout.test.ts — computeLayout single-agent
- app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts (3 tests) — Phase 71-03 D-10 view drift
- app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts (4 tests) — admin.schema mock missing for email_pipeline cross-schema query

Total: 22 failed, 632 passed, 16 skipped, 95 todo.
