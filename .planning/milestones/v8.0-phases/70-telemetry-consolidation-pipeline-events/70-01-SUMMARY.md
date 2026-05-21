---
phase: 70-telemetry-consolidation-pipeline-events
plan: 01
subsystem: telemetry-tests
tags: [vitest, scaffold, wave-0, nyquist, pipeline_events]
requires: []
provides:
  - "vitest scaffold: web/lib/pipeline-events/__tests__/emit.test.ts (target for Plan 02)"
  - "vitest scaffold: web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts (target for Plan 04)"
affects:
  - "Plan 02 — emit helper: tests already exist; unskip + assert"
  - "Plan 04 — Stage 1 ingest emit: tests already exist; unskip + assert"
tech-stack:
  added: []
  patterns:
    - "it.skip + expect.fail scaffold for failing-red TDD targets"
key-files:
  created:
    - web/lib/pipeline-events/__tests__/emit.test.ts
    - web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts
  modified: []
decisions:
  - "Stage 1 scaffold cites Open Questions Q1 recommendation (one Stage 1 row per email at classify() call site, not per automation_runs.insert branch)"
  - "Stage 1 scaffold cites Pitfall 2 (D-09 step.run rule relaxed for the API route by construction — Vercel never replays a 200/500)"
  - "Helper scaffold cites Pattern 3 helper signature + classifier-invoice-copy-handler.test.ts supabaseInserts mock pattern as the wire-up reference"
metrics:
  duration: 2m
  completed: 2026-05-05
---

# Phase 70 Plan 01: Wave 0 — Test Scaffolds Summary

Created two failing-red vitest scaffolds (helper-level + ingest-route-level) so Plans 02 and 04 land production code against existing test targets, honouring the Nyquist rule.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Scaffold emit.test.ts (helper-level) | 1aacfab | web/lib/pipeline-events/__tests__/emit.test.ts |
| 2 | Scaffold ingest route.test.ts (Stage 1 emit) | 103b0b3 | web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts |

## Verification

- `cd web && npx vitest run lib/pipeline-events/__tests__/emit.test.ts` → 3 skipped, exit 0
- `cd web && npx vitest run "app/api/automations/debtor-email/ingest/__tests__/route.test.ts"` → 3 skipped, exit 0
- `grep -c "it.skip" emit.test.ts` → 4 (≥3 required)
- `grep -c "TODO Plan 02" emit.test.ts` → 3 (≥1 required)
- `grep -c "it.skip" route.test.ts` → 3 (≥3 required)
- `grep -c "TODO Plan 04" route.test.ts` → 3 (≥1 required)
- `grep -c "Open Questions Q1" route.test.ts` → 1 (≥1 required)
- No production code touched (`git diff --stat web/lib web/app/api | grep -v __tests__` empty by construction — only `__tests__` files added).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

Both test files are intentional scaffolds. They are tracked here so downstream work removes the stubs:

- `web/lib/pipeline-events/__tests__/emit.test.ts` — three `it.skip(...)` with `expect.fail("not implemented — Plan 02 wires this up")`. **Resolves in:** Plan 02.
- `web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts` — three `it.skip(...)` with `expect.fail("not implemented — Plan 04 wires this up")`. **Resolves in:** Plan 04.

Phase verification at phase close should assert no `.skip` remains in pipeline-events tests (per threat T-70-W0-01 mitigation).

## Self-Check: PASSED

- FOUND: web/lib/pipeline-events/__tests__/emit.test.ts
- FOUND: web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts
- FOUND commit: 1aacfab
- FOUND commit: 103b0b3
