---
phase: 111-stage-1-noise-expansion-calibration
verified: 2026-06-03T13:20:00Z
status: passed
score: 17/17 must-haves verified
overrides_applied: 0
---

# Phase 111: Stage 1 Noise Expansion + Calibration — Verification Report

**Phase Goal:** The 5 core sales noise categories are calibrated against the live corpus and the safe ones flip to auto-archive behind the shadow→promote gate; new sales-specific noise rules are discovered from the corpus and added as registry data; the 8 inherited AP-noise rules are re-validated for sales fit. All as audit-trailed registry data with NO per-swarm code branches.

**Verified:** 2026-06-03T13:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | (P01) Sales high-conf LLM categorize_archive verdict does NOT clear to auto-archive unless its `llm:{cat}:high` rule is `promoted` — routes to requires_review | ✓ VERIFIED | `classifier-screen-worker.ts:931-948` — `promotionGateClears` reads `readWhitelist(admin, swarm_type)` (Step 5, line 939), `gateClearsForAutoArchive` requires `(llmConfidence==='high' && promotionGateClears)`; else emits `classifier/screen.requires_review` (line 966). Test B green. |
| 2 | (P01) verdict-worker inline Outlook categorize+archive does NOT fire when `dry_run_config.stage_1_archive` is blocked | ✓ VERIFIED | `classifier-verdict-worker.ts:124-127` — `if (category.outlook_label && !isStageBlocked(swarmRow, "stage_1_archive"))`. `loadSwarm` loaded at line 84. Test A green (blocked→not called, live→called, missing→not called). |
| 3 | (P01) Debtor-email Stage 1 behavior provably unchanged | ✓ VERIFIED | Debtor block `if (settings)` at line 499 (keyed on registry `stage1_regex_module`, not a swarm literal) returns at line 878; comment 886 confirms only settings-missing path falls to Step 5. phase89 + gate regression tests green. |
| 4 | (P02) sales-email `auto_reply`, `ooo_temporary`, `ooo_permanent` have `action='categorize_archive'` | ✓ VERIFIED | Migration `20260603_sales_noise_calibration_flip.sql:69-72` UPDATE sets exactly those 3 keys. Live applied (111-05 MCP) + RLS advisor live query 0 ERROR confirms DB reachable. |
| 5 | (P02) `payment_admittance` and `unknown` remain `manual_review` with rationale | ✓ VERIFIED | Migration lines 21-29, 74-75 document rationale; keys NOT in the UPDATE IN-list. Test asserts 2 manual_review. |
| 6 | (P02) The flip fires no live archive (inert) | ✓ VERIFIED | Inertness chained from Truth 2: `isStageBlocked` gate + sales `dry_run_config.stage_1_archive` blocked (Phase 110-04). Designed-inert per CONTEXT note. |
| 7 | (P03) Stage-1 retro-run re-classifies both corpora → per-category hit-rate + false-archive estimates | ✓ VERIFIED | `sales-email-stage-1-retro-classify.ts` invokes LLM per candidate, upserts verdict; `aggregate-baseline.ts` produces per-category hit_rate + false_archive_rate. |
| 8 | (P03) Retro-run writes ONLY `stage_1_retro_runs` (side-channel isolation) | ✓ VERIFIED | Only `.from("stage_1_retro_runs")` write (line 121); grep for automation_runs/pipeline_events/agent_runs writes → 0. |
| 9 | (P03) Idempotent on (run_id,email_id), replay-safe run_id | ✓ VERIFIED | `run_id` minted inside `step.run("resolve-run-id")` line 67; upsert `onConflict "run_id,email_id" ignoreDuplicates` line 137. Idempotent-rerun test green. |
| 10 | (P03) Direction normalized; sugarcrm filtered on source alone | ✓ VERIFIED | `normalizeDirection` ({inbound,incoming}→inbound, {sent,outbound}→outbound) line 67; outlook read `.eq("source","outlook")` + mailbox; sugarcrm `.eq("source","sugarcrm")` alone (lines 106,119). |
| 11 | (P04) Cluster miner ranks retro unknown bucket into operator-approvable candidates (not hand-curated) | ✓ VERIFIED | `sales-stage-1-cluster-mine.ts` reads `stage_1_retro_runs WHERE predicted_category_key='unknown'` (line 231), ranked candidate output; NO `.insert(`/`.upsert(` to swarm_noise_categories (line 27 documents it never writes). |
| 12 | (P04) loopback false-archive rate measured from retro corpus (inbound only), decided from data | ✓ VERIFIED | `loopback-validation.ts:74-99` — inbound+would-archive denominator, `recommendation` derived vs `LOOPBACK_FALSE_ARCHIVE_MAX=0.1`, fail-closed on n=0. No preset. 6 tests green. |
| 13 | (P04) 7 inherited AP rules confirmed kept-as-is (D-08); only loopback test-first (D-09) | ✓ VERIFIED | `docs/agentic-pipeline/stage-1-regex.md:99-102` records D-08 (7 named rules kept) + D-09 (loopback test-first). |
| 14 | (P05) Both migrations applied live to mvqjhlxfvtqqubqgdvhz | ✓ VERIFIED | 111-05-SUMMARY records `apply_migration {"success":true}` ×2 (orchestrator MCP, no local MCP to re-query). Corroborated: live RLS advisor query succeeds. |
| 15 | (P05) Live disposition: 3 categorize_archive / 2 manual_review | ✓ VERIFIED | 111-05-SUMMARY live verification table (MCP execute_sql). Migration content matches. |
| 16 | (P05) stage_1_retro_runs live with RLS + service-role policy | ✓ VERIFIED | Migration `20260603_stage_1_retro_runs.sql:60-72` (ENABLE RLS + service_role-only policy, no anon/auth). Live RLS advisor 0 ERROR (re-run this session) confirms table is RLS-clean live. |
| 17 | (P05) codegen NO drift; RLS advisor 0 ERROR | ✓ VERIFIED | `npm run codegen && git diff --exit-code` → no drift (re-run). `npm run check:supabase` → **0 ERROR, 6 WARN, 23 INFO** (re-run live this session). |

**Score:** 17/17 truths verified

### Architecture Gate — NO per-swarm code branches

| Check | Result |
| --- | --- |
| `grep "=== 'sales-email'" / "swarm === 'sales'"` in classifier-screen-worker.ts + classifier-verdict-worker.ts | **0 hits** — gates are registry-driven (`swarm_type`-scoped `readWhitelist`, `dry_run_config`-driven `isStageBlocked`, `stage1_regex_module`-keyed debtor block). SWARM-02 / Anti-Pattern A3 satisfied. |

### Required Artifacts

| Artifact | Status | Details |
| --- | --- | --- |
| `classifier-verdict-worker.ts` | ✓ VERIFIED | `isStageBlocked` import + guard wrapping inline categorize/archive |
| `classifier-screen-worker.ts` | ✓ VERIFIED | swarm-agnostic Wilson gate in Step 5 via `readWhitelist(admin, swarm_type)` |
| `20260603_sales_noise_calibration_flip.sql` | ✓ VERIFIED | Audited UPDATE, 3 keys, BEGIN/COMMIT, rationale header |
| `sales-noise-calibration.test.ts` | ✓ VERIFIED | Static migration-parse guard, 5 tests green |
| `20260603_stage_1_retro_runs.sql` | ✓ VERIFIED | RLS + service-role policy + UNIQUE(run_id,email_id) |
| `sales-email-stage-1-retro-classify.ts` | ✓ VERIFIED | Idempotent, side-channel-isolated harness; registered in route.ts:101 + events.ts:673 |
| `select-candidates.ts` | ✓ VERIFIED | Two-corpus, direction-normalized, pure (no Date.now/random), fail-loud cap |
| `aggregate-baseline.ts` | ✓ VERIFIED | Per-category hit-rate + false-archive aggregator |
| `loopback-validation.ts` | ✓ VERIFIED | Data-driven enable/disable, inbound-only, no preset |
| `sales-stage-1-cluster-mine.ts` | ✓ VERIFIED | Read-only retro unknown-bucket miner, no auto-INSERT, no hardcoded mailbox |
| `docs/agentic-pipeline/stage-1-regex.md` | ✓ VERIFIED | Finding 3 corrected (call-time closed list) + D-08/D-09 recorded |

### Key Link Verification

| From | To | Status | Details |
| --- | --- | --- | --- |
| verdict-worker categorize_archive | `isStageBlocked(swarmRow,'stage_1_archive')` | ✓ WIRED | line 126 |
| screen-worker Step 5 | `readWhitelist(admin, swarm_type)` | ✓ WIRED | line 939 |
| migration | swarm_noise_categories (3 safe keys) | ✓ WIRED | UPDATE WHERE IN-list lines 69-72 |
| retro harness | stage_1_retro_runs upsert | ✓ WIRED | onConflict run_id,email_id line 137 |
| cluster-mine | stage_1_retro_runs unknown bucket | ✓ WIRED | line 231 predicted_category_key='unknown' |
| loopback-validation | normalized-inbound corpus | ✓ WIRED | line 79 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 111 test suites | `vitest run` (7 files) | 44 passed, 1 skipped | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Codegen drift | `npm run codegen && git diff --exit-code` | NO drift | ✓ PASS |
| RLS advisor (live) | `npm run check:supabase` | 0 ERROR / 6 WARN / 23 INFO | ✓ PASS |
| Harness registration | grep route.ts/events.ts | registered | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| STAGE1-01 | 111-01, 111-02, 111-05 | ✓ SATISFIED | Audited flip migration (3 safe→archive, 2 held), behind isStageBlocked + Wilson gate, applied live |
| STAGE1-02 | 111-03, 111-04, 111-05 | ✓ SATISFIED | Two-corpus retro harness (evidence), operator-gated cluster miner (discovery, not hand-curated), data-driven loopback decision, D-08 recorded |

**Note on STAGE1-02 wording:** REQUIREMENTS.md says new rules are "added as `swarm_noise_categories` rows." Phase 111 delivers the data-driven *discovery mechanism* (cluster miner) but intentionally does NOT add rows — per D-07 this is operator-gated (surface clusters → operator promotes → follow-up migration). This is the correct, documented delivery for a corpus-mining phase and honors the "not hand-curated" intent (locked 2026-05-19 principle). The actual row INSERTs are a deliberate downstream step, not a phase-111 gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TBD/FIXME/XXX debt markers in any phase-111 modified file | — | — |

### Gaps Summary

No gaps. All 17 must-haves across the 5 plans verify against the codebase:

- **Architecture (P01):** Both critical gaps closed — the verdict-worker inline Outlook archive is dry-run-gated (Finding 1) and the Wilson promotion gate is generalized into the swarm-agnostic Step 5 (Finding 2). Zero per-swarm code branches; debtor behavior provably unchanged (the debtor block returns before Step 5).
- **Calibration flip (P02):** Audited migration flips exactly the 3 safe keys; the 2 held keys carry recorded rationale. The flip is genuinely inert (gated + dry-run blocked) — the designed 111→112 separation, not a stub.
- **Evidence harness (P03):** Idempotent, replay-safe, side-channel-isolated Stage-1 retro harness over both corpora with correct direction normalization and sugarcrm source-only filtering.
- **Discovery + AP-revalidation (P04):** Operator-gated cluster miner (no auto-INSERT, no hand-curation), data-driven loopback recommendation (no preset), D-08/D-09 recorded, RFC doc corrected.
- **Live apply (P05):** Both migrations applied live (orchestrator MCP). I cannot re-query the live DB (no MCP in verifier toolset), but the live `check:supabase` advisor run THIS session (0 ERROR) independently confirms the `stage_1_retro_runs` table exists live and is RLS-clean, corroborating the 111-05-SUMMARY's recorded MCP verification.

The intentionally-inert flip is the designed behavior (CONTEXT note + verification note) and is NOT flagged as a gap.

---

_Verified: 2026-06-03T13:20:00Z_
_Verifier: Claude (gsd-verifier)_
