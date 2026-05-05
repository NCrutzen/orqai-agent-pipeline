---
phase: 70-telemetry-consolidation-pipeline-events
verified: 2026-05-05T10:45:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
---

# Phase 70: Telemetry consolidation (pipeline_events) — Verification Report

**Phase Goal:** Every stage decision flows into a single canonical `pipeline_events` table that becomes the source of truth for Bulk Review and the promotion recommender, while existing tables stay alive as denormalised read-models.

**Verified:** 2026-05-05
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (Success Criterion)                                                                                                          | Status     | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 1   | Every stage decision recorded in `pipeline_events` with `swarm_type`, `stage`, `decision`, `confidence`, `override?`, `eval_type`  | ✓ VERIFIED | All 5 stage emit sites located: Stage 0 (`stage-0-safety-worker.ts:155`), Stage 1 (`ingest/route.ts:304`), Stage 2 (`classifier-label-resolver.ts:203`), Stage 3 (`debtor-email-coordinator.ts:201`), Stage 4 — 3 paths: success (`classifier-invoice-copy-handler.ts:469`), no_invoice_reference (line 257), failRun (line 146). All call `emitPipelineEvent` with required column set. Migration `20260506a_pipeline_events.sql` defines all required columns (`swarm_type text`, `stage smallint`, `decision text`, `confidence numeric(4,3)`, `override jsonb`, `eval_type text`). |
| 2   | Existing tables continue to populate without consumer breakage                                                                     | ✓ VERIFIED | Legacy writes preserved adjacent to each emit: `stage-0-safety-worker.ts:127` (automation_runs), `classifier-label-resolver.ts:154` (email_labels), `debtor-email-coordinator.ts:190` (coordinator_runs UPDATE), `classifier-invoice-copy-handler.ts:238/450` (email_labels). Emits are ADJACENT inside the same `step.run`, not replacing legacy writes. Pure additive dual-write per CONTEXT D-06. |
| 3   | Bulk Review and promotion recommender both read from `pipeline_events` instead of joining 3+ legacy tables                         | ✓ VERIFIED | Bulk Review `loadPageData` reads `pipeline_events` for sub-queries (2) at `page.tsx:214` and (6) at `page.tsx:335`; cost-outlier RPC at sub-query (3) explicitly stays on `automation_runs` per RESEARCH §Pitfall 5 with documented forward-reference comment (page.tsx:229-231). Promotion recommender stub at `docs/agentic-pipeline/promotion-recommender.md` exists, describing canonical `pipeline_events` query contract for Phase 72. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260506a_pipeline_events.sql` | Schema + RLS + Realtime + indexes per D-03/D-04 | ✓ VERIFIED | All required columns present; 3 indexes (email_id, swarm+stage+created, partial-override); RLS enabled with service-role + authenticated-select policies; realtime publication guarded ALTER. Live on DB per phase context (rows=0, rls=true, realtime_wired=1, 4 indexes, 2 policies). |
| `web/lib/pipeline-events/emit.ts` | `emitPipelineEvent` helper (D-07) | ✓ VERIFIED | Throws on Supabase error (no swallowing); typed payload contract enforced. |
| `web/lib/pipeline-events/types.ts` | `Stage` enum + `PipelineEventInput` + `numericConfidence` (D-13, Pitfall 1) | ✓ VERIFIED | Closed Stage enum 0..4; full PipelineEventInput interface with all D-03 columns; `numericConfidence` mapping high=0.9, medium=0.7, low=0.4, none=null. |
| Stage 0 emit site | `stage-0-safety-worker.ts` inside `persist-verdict` step.run | ✓ VERIFIED | Adjacent to `automation_runs.insert` at lines 127-170. |
| Stage 1 emit site | `ingest/route.ts` after `classify()` (single-pass HTTP, no step.run) | ✓ VERIFIED | Plain awaited emit at line 304 with documented carve-out comment for D-09 relaxation. |
| Stage 2 emit site | `classifier-label-resolver.ts` inside `write-email-label` step.run | ✓ VERIFIED | Three-branch decision (resolved/unresolved/resolverError) at lines 183-225. |
| Stage 3 emit site | `debtor-email-coordinator.ts` inside `persist-ranked` step.run | ✓ VERIFIED | Top-1 intent emit adjacent to coordinator_runs UPDATE at lines 188-216. |
| Stage 4 success emit | `classifier-invoice-copy-handler.ts` inside `write-email-label` step.run | ✓ VERIFIED | Lines 447-486, adjacent to email_labels INSERT. |
| Stage 4 no_invoice_reference emit | early-return path | ✓ VERIFIED | Lines 235-266, adjacent to email_labels INSERT inside `write-no-invoice-label` step.run. |
| Stage 4 failRun emit | catch block on unhandled errors | ✓ VERIFIED | Lines 142-154, wrapped in fresh `emit-stage4-failrun` step.run with documented W-70-01 rationale. |
| `docs/agentic-pipeline/promotion-recommender.md` | One-paragraph stub per D-15 | ✓ VERIFIED | Stub describes Phase 72 read-side contract against `pipeline_events`; canonical query shape included. |
| Bulk Review `loadPageData` rewire | `page.tsx` sub-queries (2)+(6) on pipeline_events; (3) stays on automation_runs per Pitfall 5 | ✓ VERIFIED | page.tsx:214 and 335 read pipeline_events; page.tsx:229-233 retains `automation_runs_with_outlier` RPC with forward-reference comment. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| All 5 stage emit sites | `pipeline_events` table | `emitPipelineEvent(admin, payload)` | WIRED | Each site imports the helper and calls it with the required typed payload. Helper INSERTs to `public.pipeline_events`. |
| Bulk Review `loadPageData` | `pipeline_events` | `admin.from("pipeline_events").select(...)` | WIRED | Sub-queries (2) and (6) verified at page.tsx:214/335. |
| Promotion recommender (Phase 72) | `pipeline_events` | Stub doc canonical SQL | DEFERRED to Phase 72 | Per D-15, only stub required in Phase 70. |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| TELE-01 | `pipeline_events` schema + writes from every stage | ✓ SATISFIED | Migration applied; 5 stage emit sites green; REQUIREMENTS.md line 94 ticked + status "complete" line 163. |
| TELE-02 | Existing tables populate without consumer breakage | ✓ SATISFIED | Dual-write additive; legacy table writes unchanged at all sites; REQUIREMENTS.md line 96 ticked + status "complete" line 164. |
| TELE-03 | Bulk Review + recommender consume from `pipeline_events` | ✓ SATISFIED | Bulk Review rewired (2)+(6); Phase 72 stub shipped; REQUIREMENTS.md line 98 ticked + status "complete" line 165. |

### Anti-Patterns Found

None. The Stage 4 failRun emit wrapping in a fresh `step.run` (vs. inline) is documented with W-70-01 rationale (catch boundary outside any existing step) — accepted deviation, not an anti-pattern.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All 7 modified test files pass | `npx vitest run lib/pipeline-events/__tests__/emit.test.ts lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts lib/inngest/functions/__tests__/classifier-label-resolver.test.ts lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts app/api/automations/debtor-email/ingest/__tests__/route.test.ts "app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts"` | 7 files / 45 tests passed in 1.84s | ✓ PASS |

### Human Verification Required

None. All success criteria verifiable programmatically against the codebase + DB state confirmed by phase context (rows=0, rls=true, realtime_wired=1, 4 indexes, 2 policies).

### Gaps Summary

No gaps. Phase 70 delivers exactly the locked CONTEXT decisions (D-01..D-18):
- One canonical `public.pipeline_events` table with the full D-03 column set, D-04 indexes, RLS, Realtime publication.
- Helper module `web/lib/pipeline-events/{emit,types}.ts` with typed payload + `numericConfidence` mapping.
- All 5 canonical Stage emit sites wired (Stage 4 has 3 paths covering success, no_invoice_reference, and unhandled-error failRun).
- Legacy table writes preserved adjacent to every emit — TELE-02 zero-consumer-breakage held.
- Bulk Review `loadPageData` rewired for sub-queries (2) and (6); cost-outlier RPC (3) intentionally stays on `automation_runs` per Pitfall 5 with forward-reference comment.
- Phase 72 promotion recommender stub shipped per D-15.
- REQUIREMENTS.md TELE-01..03 ticked and status table marked complete.
- Full focused vitest run green: 7 files / 45 tests / 1.84s.

---

*Verified: 2026-05-05T10:45:00Z*
*Verifier: Claude (gsd-verifier)*
