# Phase 85 V2 Retirement (deferred from Phase 85 Plan 04 Task 3)

**Fire date:** 2026-06-03
**Decision basis:** Phase 85 Plan 04 Task 3 — option-a (14 days) chosen by operator 2026-06-01. See `85-OPERATOR-SIGNOFF.md`.
**Deploy date:** 2026-05-20.
**Rollback safety:** V2 is a one-token revert (cache-key flip in `debtor-email-coordinator.ts` + Orq agent PATCH back to V2 prompt). Until this TODO fires, retain that escape hatch.

## Scope
- Delete `INTENT_VERSION_V2`, `intentAgentOutputSchemaV2`, `IntentAgentOutputV2` from `web/lib/automations/debtor-email/coordinator/types.ts`.
- Replace `intentAgentOutputSchemaAny` (discriminated union) with a direct alias to `intentAgentOutputSchemaV3`.
- Simplify `invoke-intent.ts` discriminator back to a single `safeParse(intentAgentOutputSchemaV3)` (currently sniffs `intent_version` at lines 215–219). Also fix the stale comment at `invoke-intent.ts:67` ("Production triage path consumes only IntentAgentOutputV2") — production parses V3.
- Delete `web/lib/automations/debtor-email/coordinator/__tests__/types-v2.test.ts` and `__tests__/invoke-intent-v2.test.ts`.
- `grep` for any lingering `INTENT_VERSION_V2` or `IntentAgentOutputV2` references and clean up.

## Pre-fire checks
- `agent_runs` counts of `intent_version='2026-05-01.v2'` are zero for the past 14 days.
- No open production-incident referencing intent_version mismatch.
- Orq `get_agent debtor-intent-agent` still emits `intent_version: 2026-05-19.v3` (no rollback in effect).

## Out of scope for this TODO
- Phase 86 proposal-capture surface (separate phase).
- V9.0 Learning Inbox promotion (separate phase).
- Prompt-caching enablement (separate, non-urgent — RESEARCH §4; only matters if Stage 3 volume 10×'s).
