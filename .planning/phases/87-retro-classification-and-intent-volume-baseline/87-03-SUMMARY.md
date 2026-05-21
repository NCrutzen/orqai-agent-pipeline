---
phase: 87-retro-classification-and-intent-volume-baseline
plan: 03
subsystem: api
tags: [phase-87, invoke-intent, orq, telemetry, non-breaking]

requires:
  - phase: 85-stage-3-prompt-v3-intent-definitions-and-open-set-schema
    provides: InvokeIntentResult V2|V3 discriminated union + Zod gates
provides:
  - InvokeIntentResult.usage?: InvokeIntentUsage — Orq /responses usage block surfaced as optional field
affects: [phase-87-plan-04]

tech-stack:
  added: []
  patterns:
    - "Additive optional return-shape extension — backwards-compatible token-telemetry surface"

key-files:
  modified:
    - web/lib/automations/debtor-email/coordinator/invoke-intent.ts
  created:
    - web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-usage.test.ts

key-decisions:
  - "Forward usage from the existing inline fetch — did NOT refactor to invokeOrqAgentWithUsage helper (preserves plan intent: 'Touch NOTHING else')"
  - "usage is undefined (not zeroed) when Orq omits the block — semantically distinct from 'zero tokens'"
  - "InvokeIntentUsage uses snake_case field names matching the Orq /responses payload verbatim (not converted to camelCase)"

patterns-established:
  - "Additive return-shape extension protocol: extend exported type with optional field, parse defensively from response JSON, return undefined on absence"

requirements-completed: [REQ-87-06]

duration: 6min
completed: 2026-05-21
---

# Phase 87 Plan 03: invokeIntentAgent usage extension

**`InvokeIntentResult.usage?` now surfaces Orq's `/responses` token telemetry. Zero callers broken (`tsc --noEmit` clean).**

## Performance

- **Duration:** ~6 min (RED test → GREEN impl → non-regression sweep + tsc)
- **Tasks:** 1 of 1
- **Files modified:** 2 (1 source + 1 new spec)

## Accomplishments
- Extended `InvokeIntentResult` with optional `usage: InvokeIntentUsage` field
- Added `InvokeIntentUsage` type export with snake_case input/output/total_tokens
- Parsed `usage` defensively from Orq `/responses` JSON; returns `undefined` when absent
- 3-case RED→GREEN spec (`invoke-intent-usage.test.ts`) covering happy path, missing-usage edge, and non-regression of existing `{ output, raw }` shape

## Task Commits

1. **Task 1 RED:** `7d2ac704` (test) — failing usage spec
2. **Task 1 GREEN:** `3b206227` (feat) — additive return-shape extension

## Verification
- ✓ `lib/automations/debtor-email/coordinator/__tests__/invoke-intent-usage.test.ts` — 3/3 green
- ✓ `lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts` — 4/4 green (non-regression)
- ✓ `lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v3.test.ts` — 3/3 green (non-regression)
- ✓ `cd web && npx tsc --noEmit` exits 0 (no caller broke)

## Carry-forward to Plan 04
Plan 04's per-email step uses:
```typescript
const { output, usage } = await invokeIntentAgent(input);
const tokens = usage?.total_tokens ?? 0;
// persist tokens into stage_3_retro_runs.token_usage_total, accumulate in run total
```
