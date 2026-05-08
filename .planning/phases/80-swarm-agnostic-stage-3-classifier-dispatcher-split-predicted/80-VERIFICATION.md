---
phase: 80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted
verified: 2026-05-08T15:08:00Z
status: human_needed
score: 6/6 must-haves verified (code); 1 operator-action open (must_have #2 backfill execution)
overrides_applied: 0
human_verification:
  - test: "Operator runs `web/scripts/backfill-stuck-classifying-stage3.ts` against acceptance, then production"
    expected: "Per-bucket counts (HAS_KANBAN auto-flipped, NO_KANBAN flagged, MULTI_KANBAN flagged); post-run SQL probe shows 0 stranded `agent_runs.status='classifying'` rows older than 5 minutes (the ~395-of-407 HAS_KANBAN cluster moves to `routed_human_queue`); JSON reports written; per-row JSONL audit log appended"
    why_human: "CLAUDE.md Test-First Pattern + auto-mode Rule 5: production write requires explicit operator confirmation; the script is intentionally gated behind a two-factor (--confirm-prod flag + interactive typed-phrase) prompt. Plan 80-05 Task 2 is a documented checkpoint:human-action and is acknowledged as deferred per the prompt's known_state."
  - test: "Live `*/predicted` event flow on acceptance Inngest dashboard"
    expected: "After sending a fixture `debtor-email/coordinator.requested`: classifier function completes, `debtor-email/predicted` event fires, `stage-3-dispatcher` function picks it up within seconds, agent_runs.status reaches `routed_human_queue` (placeholder intent) or a handler-owned status (registered intent)"
    why_human: "Must_have #3 — verifiable on Inngest dashboard, not in unit tests. Unit tests assert send/subscribe wiring; only the live dashboard confirms the full event chain in production-shaped infra"
  - test: "UI smoke: `predicted` agent_runs rows render in 'progress' lane, attributed to 'Stage 3 Dispatcher'"
    expected: "When a row is briefly at status='predicted' (sub-second under healthy dispatch), it appears in the progress lane with Stage 3 Dispatcher as the agent label; routed_human_queue rows surface in the review lane"
    why_human: "Visual / UX verification of the swarm-bridge sync.ts mapping change; not assertable in unit tests beyond the case-arm presence already verified"
---

# Phase 80: Swarm-agnostic Stage 3 classifier/dispatcher split — Verification Report

**Phase Goal:** Split the monolithic `debtor-email-coordinator` into a thin Stage 3 classifier (flips `agent_runs.status='predicted'` and emits `<swarm>/predicted`) and a swarm-agnostic Stage 3.5 dispatcher (subscribes wildcard `*/predicted`, routes per `swarm_intents.handler_status`). Make `predicted` a first-class observable state. RFC-lock the new state machine. Backfill the 407 stranded pre-Phase-80 `classifying` rows.

**Verified:** 2026-05-08T15:08:00Z
**Status:** human_needed (code complete + tests green; operator action required for production backfill execution)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Classifier no longer dispatches inline; emits `<swarm>/predicted` and flips status to `predicted` | VERIFIED | `web/lib/inngest/functions/debtor-email-coordinator.ts` reduced 427 → 279 LOC; `flip-status-predicted` step.run at line 225 with race-guard `.eq("id",...).eq("status","classifying")`; `emit-predicted` step.run at line 238 sending `${SWARM_TYPE}/predicted`; `grep -c "kanban_reason\|automation_runs.*insert\|dispatch-single-shot"` = 0; 4 classifier tests GREEN |
| 2   | New Stage 3.5 dispatcher subscribes `*/predicted` and routes via `swarm_intents.handler_status` | VERIFIED | `web/lib/inngest/functions/stage-3-dispatcher.ts` (231 lines) exists with `{ event: "*/predicted" }` wildcard at line 51; `loadSwarmIntents` at line 36/93; `dispatch-placeholder` step.run at line 122 (atomic single-step write of Kanban + status flip + completed_at); `dispatch-registered` step.run at line 176 (handler_event emit + completed_at; does NOT flip status — handler-owned per CONTEXT); 5 dispatcher tests GREEN |
| 3   | Dispatcher registered in Inngest serve so live traffic flows through it | VERIFIED | `web/app/api/inngest/route.ts:41` imports `stage3Dispatcher`; line 77 includes it in the `functions` array (commit `49a5541`) |
| 4   | `predicted` is a first-class observable `agent_runs.status` (TS + DB) | VERIFIED | `web/lib/automations/debtor-email/coordinator/types.ts:41` includes `"predicted"` in STATUS const; CONTEXT confirms DB CHECK already accepted it (Resolved After Research #1); `tsc --noEmit` clean project-wide |
| 5   | Hard-separation rule honored: dispatcher reads `swarm_intents` only, never `swarm_noise_categories`; escalation-gate fixed | VERIFIED | `escalation-gate.ts` parameter type swapped to `SwarmIntentRow[]` (commit `8898913`); `grep -c "category_key\|swarm_noise_categories\|SwarmNoiseCategoryRow"` in classifier + dispatcher returns 0 (only doc-comments mention noise table for context); RFC lock at `stage-3-coordinator.md:154` restates the invariant positively for the dispatcher |
| 6   | Cross-swarm dispatcher is swarm-agnostic by construction (zero hardcoded swarm names) | VERIFIED | Dispatcher derives `swarm_type` from `event.data.swarm_type ?? eventName.split("/")[0]`; wildcard subscription means adding sales-email is registry-only; cross-swarm test (`wildcard routes sales-email/predicted via event.name discrimination`) GREEN |
| 7   | Backfill script for 407 stranded rows shipped, idempotent, race-guarded, two-factor production gate | VERIFIED (code) / OPEN (execution) | `web/scripts/backfill-stuck-classifying-stage3.ts` (251 lines); three-bucket exhaustive routing (HAS_KANBAN flip, NO_KANBAN flag, MULTI_KANBAN flag); race guard `.eq("status","classifying")` (3 hits); `--confirm-prod` flag + interactive readline typed-phrase; 6 tests GREEN. **Execution against production deferred to operator** per prompt's known_state |
| 8   | RFC `docs/agentic-pipeline/stage-3-coordinator.md` locked with new state machine, transition table, monitoring, cross-swarm contract | VERIFIED | All 5 required sections present (`## State Machine`, `## Transition Table`, `## Stuck-Status Meaning (Monitoring)`, `## Cross-Swarm Dispatcher Contract`, `stateDiagram-v2` mermaid block); post-backfill steady-state footnote at line 124 names script path + baseline=0; commit `ca14577` |
| 9   | Phase 76 D-09 invariant preserved: `coordinator-orchestrator.ts` defensive seam still works | VERIFIED | `coordinator-orchestrator.ts` is OUT of all Phase 80 plan `key_files.modified`; `grep -c "handler_status.*placeholder" coordinator-orchestrator.ts` = 2 (placeholder branch lines 93–123 untouched) |

**Score:** 9/9 truths verified at code level. Truth #7 has an operator-action component (production backfill execution) that is intentionally deferred per the phase plan (Plan 80-05 Task 2 = `checkpoint:human-action`).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `web/lib/inngest/functions/stage-3-dispatcher.ts` | NEW dispatcher, wildcard `*/predicted` | VERIFIED | 231 lines; all wiring patterns present; tests GREEN |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` | Refactored thin classifier | VERIFIED | 279 LOC (down from 427); inline dispatch removed; predicted flip + emit added |
| `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` | Hard-separation fix to `SwarmIntentRow[]` | VERIFIED | Parameter type swapped; lookup uses `intent_key`; 5 tests GREEN |
| `web/lib/automations/debtor-email/coordinator/types.ts` | STATUS literal-union includes `"predicted"` | VERIFIED | Line 41 |
| `web/app/api/inngest/route.ts` | `stage3Dispatcher` registered | VERIFIED | Lines 41 (import) + 77 (array entry) |
| `web/lib/automations/swarm-bridge/sync.ts` | `predicted` lane mapping for agent_runs | VERIFIED | Two new `case "predicted":` arms at lines 223 (→ progress) + 253 (→ "Stage 3 Dispatcher"); pre-existing line 35 (Bulk Review automation_runs path) unchanged |
| `web/scripts/backfill-stuck-classifying-stage3.ts` | NEW backfill CLI | VERIFIED | 251 lines; all six grep thresholds met; 6 tests GREEN |
| `docs/agentic-pipeline/stage-3-coordinator.md` | RFC lock with new state machine | VERIFIED | All 5 sections + mermaid diagram + post-backfill footnote present |
| `web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` | 5 RED→GREEN tests | VERIFIED | All 5 GREEN |
| `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` | Updated assertions for predicted flip + emit, no inline kanban | VERIFIED | 4 Phase 80 tests GREEN; 13 legacy dispatch-asserting tests skipped per migration |
| `web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` | 6 RED→GREEN tests | VERIFIED | All 6 GREEN |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| classifier (`debtor-email-coordinator.ts`) | dispatcher (`stage-3-dispatcher.ts`) | `${SWARM_TYPE}/predicted` Inngest event | WIRED | Classifier emits via `inngest.send` cast pattern; dispatcher subscribes via `*/predicted` wildcard; integration tested via classifier emit-event assertion + dispatcher wildcard-routes test |
| dispatcher | `swarm_intents` registry | `loadSwarmIntents(admin, swarm_type)` | WIRED | Line 93 of dispatcher; fail-closed if `intentRow` missing |
| dispatcher (placeholder branch) | Kanban `automation_runs` | atomic single `step.run("dispatch-placeholder")` | WIRED | Inserts kanban row + flips agent_runs.status='routed_human_queue' + sets coordinator_runs.completed_at + emitAutomationRunStale, all in one step.run with status precondition for replay safety |
| dispatcher (registered branch) | Stage 4 handler | `inngest.send({ name: intentRow.handler_event, ... })` | WIRED | Line 176 step.run; uses SendFn cast (CLAUDE.md / Phase 65 dae6276 this-binding pattern); idempotency precondition reads `coordinator_runs.completed_at` |
| Inngest serve config | `stage3Dispatcher` | `web/app/api/inngest/route.ts` | WIRED | Live traffic now routes through dispatcher (commit `49a5541`) |
| swarm-bridge UI | `predicted` agent_runs rows | `triageStageFromStatus` + `triageAgentFromStatus` | WIRED | Two new case arms; renders in progress lane attributed to Stage 3 Dispatcher |
| Hard-separation: classifier/dispatcher | `swarm_intents` only (never `swarm_noise_categories`) | `loadSwarmIntents` exclusively | WIRED | Grep confirms no noise-category lookups in classifier or dispatcher; escalation-gate parameter type now `SwarmIntentRow[]` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 80 vitest suite passes | `cd web && npx vitest run lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts scripts/__tests__/backfill-stuck-classifying-stage3.test.ts lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` | 4 files passed; 20 tests passed, 13 skipped (legacy migrated tests) | PASS |
| Dispatcher line count | `wc -l web/lib/inngest/functions/stage-3-dispatcher.ts` | 231 lines (≥120 threshold) | PASS |
| Classifier shrinkage | `wc -l web/lib/inngest/functions/debtor-email-coordinator.ts` | 279 LOC (≤280 threshold) | PASS |
| No inline dispatch in classifier | `grep -c 'kanban_reason\|automation_runs.*insert\|dispatch-single-shot' web/lib/inngest/functions/debtor-email-coordinator.ts` | 0 | PASS |
| Hard-separation in dispatcher | `grep 'swarm_noise_categories\|SwarmNoiseCategoryRow' web/lib/inngest/functions/stage-3-dispatcher.ts` | no matches | PASS |
| Phase 76 D-09 orchestrator invariant | `grep -c 'handler_status.*placeholder' web/lib/inngest/functions/coordinator-orchestrator.ts` | 2 (untouched) | PASS |
| RFC sections present | `grep -nE '## State Machine\|## Transition Table\|## Stuck-Status Meaning\|## Cross-Swarm Dispatcher\|stateDiagram-v2' docs/agentic-pipeline/stage-3-coordinator.md` | 5 matches | PASS |
| Production backfill execution | `npx tsx web/scripts/backfill-stuck-classifying-stage3.ts --apply --confirm-prod` | NOT EXECUTED — operator authorization gate | SKIP (deferred per known_state) |
| Live `*/predicted` event flow on Inngest dashboard | manual deploy + fixture event | NOT VERIFIED — requires acceptance/prod environment access | SKIP (routed to human verification) |

### Anti-Patterns Found

None. Scanned files modified in Phase 80:

- No TODO/FIXME/PLACEHOLDER markers in dispatcher or classifier (commented `Reserved future hook` for Stage 3.5 orchestrator-worker is documented per CONTEXT decision; not an anti-pattern).
- No `return null` / empty handlers in dispatch logic.
- No console.log-only implementations.
- `inngest.send` correctly cast (`(inngest.send as unknown as SendFn)({...})`) — Phase 65 `dae6276` this-binding pattern honored in both classifier and dispatcher.
- Replay-unsafe id generation: `run_id` resolution wrapped in `step.run("resolve-run-id", ...)` per Phase 65 `dd2583a`.

Two pre-existing test failures noted in `deferred-items.md` (`classifier-verdict-worker.test.ts` `admin.schema is not a function` mock gap) — confirmed pre-existing on `main` HEAD via stash baseline check; out of Phase 80 scope per executor SCOPE BOUNDARY rule.

### Deferred Items

The phase intentionally defers two items, both surfaced as known_state in the verifier prompt and properly documented in plan summaries:

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Production execution of `backfill-stuck-classifying-stage3.ts` against acceptance + production | Operator action — Plan 80-05 Task 2 `checkpoint:human-action` | Plan 80-05 SUMMARY explicitly documents the four-step protocol (acceptance dry-run → acceptance apply → production dry-run → production apply) and awaits operator authorization. Script ships fully tested; only invocation is deferred. |
| 2 | Live `*/predicted` event-flow smoke on Inngest dashboard | Operator / smoke test post-deploy | VALIDATION.md "Manual-Only Verifications" table documents this as manual; not a code gap. |
| 3 | `intent=null + multiple Kanban rows` duplicate-write bug (~6 rows) | Future phase | Phase 80 CONTEXT `<deferred>` block; backfill script flags MULTI_KANBAN bucket without flipping. |
| 4 | Stage 4 handler implementations for placeholder intents | Future per-handler phase | Phase 80 CONTEXT `<deferred>` block; all 8 placeholder intents stay human-lane. |
| 5 | Stage 3.5 orchestrator-worker fan-out re-enable | Future phase | Reserved-future hook documented in dispatcher + RFC `## Stage 3.5 Escalation`. |

### Human Verification Required

See frontmatter `human_verification` section. Three items:

1. **Operator runs the backfill script** (acceptance dry-run → acceptance apply → production dry-run → production apply with `--confirm-prod` + typed phrase). Resume signal per Plan 80-05: `backfill complete` (with final SQL count) or `abort backfill` (with reason).
2. **Live `*/predicted` event flow** on acceptance Inngest dashboard.
3. **UI smoke** that `predicted`/`routed_human_queue` agent_runs rows render in the correct lanes with the right agent attribution.

### Gaps Summary

No code-level gaps. All 6 must_haves declared in CONTEXT `<specifics>§Acceptance signals`:

- **#1** "zero rows stuck `classifying` >5 min when traffic flows" — code-side fix shipped (predicted-flip closes the silent-stuck-row bug); steady-state assertion is post-deploy.
- **#2** "zero rows in `classifying` with intent_first_pass + Kanban row" — backfill script ready; awaiting operator execution to clear the legacy 407.
- **#3** "`<swarm>/predicted` event fires per classification" — wired (verified in unit tests); dashboard smoke is manual.
- **#4** "dispatcher handles placeholder + registered" — both paths tested GREEN.
- **#5** "`coordinator-orchestrator` defensive check works" — file untouched; grep confirms.
- **#6** "sales-email Phase 78 can subscribe via the shared dispatcher" — wildcard architecture supports it; cross-swarm test GREEN; sales-email registry seed correctly deferred to Phase 78.

The phase is fully shipped at code level. The remaining work is operator-driven (backfill execution, dashboard smoke, UI smoke) and is properly gated behind a documented two-factor production prompt — this matches CLAUDE.md Test-First Pattern and auto-mode Rule 5.

---

*Verified: 2026-05-08T15:08:00Z*
*Verifier: Claude (gsd-verifier)*
