---
phase: 111-stage-1-noise-expansion-calibration
plan: 05
subsystem: agentic-pipeline / swarm-registry / schema-push
status: COMPLETE
tags: [STAGE1-01, STAGE1-02, BLOCKING, schema-push, mcp-apply]
requires:
  - 111-02 (calibration-flip migration written)
  - 111-03 (stage_1_retro_runs migration written)
provides:
  - Both Phase 111 migrations applied live to mvqjhlxfvtqqubqgdvhz
  - sales-email Stage 1 noise disposition flipped (3 archive / 2 review) — inert behind 111-01 gate
  - stage_1_retro_runs table live (RLS + service-role policy)
key-files:
  created: []
  modified: []
metrics:
  duration: ~4m (orchestrator-inline)
  tasks_completed: 2 of 2
  completed_date: 2026-06-03
---

# Phase 111 Plan 05: [BLOCKING] Schema Push + Live Verification — Summary

Applied both Phase 111 migrations to the live project via the Supabase MCP `apply_migration` tool (run **inline by the orchestrator**, not a gsd-executor — the executor subagent's toolset excludes the Supabase MCP; same constraint that blocked 110-04 Task 4). The expired `SUPABASE_ACCESS_TOKEN` was NOT used — MCP OAuth (Agent-Workforce org `oavpdqisdpzxqttgdgpt`) only.

## Task 1 — migrations applied (in order)

| # | Migration | apply_migration result |
|---|-----------|------------------------|
| 1 | `20260603_stage_1_retro_runs` (CREATE TABLE + RLS + service-role policy + indexes) | `{"success":true}` |
| 2 | `20260603_sales_noise_calibration_flip` (registry UPDATE, 3 keys) | `{"success":true}` |

## Task 2 — live verification (all green)

| Check | Result |
|-------|--------|
| sales-email `auto_reply` / `ooo_temporary` / `ooo_permanent` | `categorize_archive` ✓ |
| sales-email `payment_admittance` / `unknown` | `manual_review` ✓ (held per D-06) |
| `public.stage_1_retro_runs` RLS enabled | `true` ✓ |
| `stage_1_retro_runs` policies | 1 — `stage_1_retro_runs_service_all:{service_role}` ✓ |
| `stage_1_retro_runs` columns | 14 ✓ |
| `npm run codegen && git diff` | NO drift ✓ (swarm_noise_categories is not codegen'd — Finding 3 confirmed live) |
| `npm run check:supabase` | **0 ERROR** / 6 WARN / 23 INFO ✓ |

## Inertness confirmed (the flip fires no live archive)
The flip to `categorize_archive` is a classification-disposition change only. It fires NO live Outlook archive because Plan 01 gated `classifier-verdict-worker.ts`'s inline `categorizeEmail`/`archiveEmail` behind `isStageBlocked(swarmRow,'stage_1_archive')`, and sales `dry_run_config.stage_1_archive` is blocked (Phase 110-04). The production write (real Outlook-archive side-effect + backfill) is deferred to Phase 112 / CLEANUP-01.

## Threats addressed
- T-111-15 (wrong-project apply): explicit ref `mvqjhlxfvtqqubqgdvhz`, MCP OAuth scoped to Agent-Workforce org.
- T-111-16 (RLS bypass on new table): verified `rowsecurity=true` + service-role policy; advisor 0 ERROR.
- T-111-17 (silent codegen drift): `codegen && git diff` clean.
- T-111-18 (flip fires live archive): inert via Plan 01 gate + blocked dry_run flag.

## Self-Check: PASSED
- Both migrations report `success` against the verified ref.
- Live disposition matches D-06 exactly (3 archive / 2 review).
- Retro table live + RLS-clean.
- Zero codegen drift; RLS advisor green.
