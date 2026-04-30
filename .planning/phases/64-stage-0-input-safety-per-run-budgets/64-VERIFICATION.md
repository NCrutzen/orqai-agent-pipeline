---
phase: 64-stage-0-input-safety-per-run-budgets
verified: 2026-04-30T17:05:00Z
gap_closure_commit: 117cc10
gap_closure_verified: 2026-04-30T17:10:00Z
status: gaps_closed
score: 7/7 must-haves verified after gap closure
overrides_applied: 0
gap_closure_summary: |
  Both gaps closed in commit 117cc10 by orchestrator inline:
  - SafetyDetailPane mounted in detail-pane.tsx via row.topic === 'safety_review' branch.
  - CostOutlierAxisCard rendered adjacent to SafetyDetailPane when outlier metadata present.
  - BudgetBreachBadge rendered in row-strip.tsx when row.topic === 'budget_breach'.
  - page.tsx loader extended to thread cost_cents/median_cost_cents/sample_count from the
    automation_runs_with_outlier RPC into PredictedRow so the AXIS 4 card has its inputs.
  Verified: tsc clean (after .next stale cache purge); 33/33 phase 64 vitest tests GREEN.
gaps:
  - truth: "Operator sees per-email token cost in Bulk Review; cost outliers (>3x median) appear as their own override axis (BUDG-03)"
    status: failed
    reason: "Server-side machinery is in place (RPC live, loader enriches `is_cost_outlier`, components built) but none of the four new UI components are imported/rendered anywhere. CostOutlierAxisCard, BudgetBreachBadge, MatchedSpanHighlight are orphaned files. row-strip.tsx contains no cost cell or budget-breach badge wiring."
    artifacts:
      - path: "web/app/(dashboard)/automations/[swarm]/review/row-strip.tsx"
        issue: "No import of BudgetBreachBadge; no cost_cents cell rendered. UI-SPEC requires per-row cost cell and badge."
      - path: "web/app/(dashboard)/automations/[swarm]/review/components/cost-outlier-axis-card.tsx"
        issue: "Component exists but no caller anywhere in app/ — orphaned (Level 3 wiring fail)."
      - path: "web/app/(dashboard)/automations/[swarm]/review/components/budget-breach-badge.tsx"
        issue: "Component exists but no caller anywhere in app/ — orphaned."
    missing:
      - "Import BudgetBreachBadge into row-strip.tsx and render when row.topic === 'budget_breach'"
      - "Render cost_cents cell on row-strip for safety rows"
      - "Mount CostOutlierAxisCard in detail-pane (or safety-detail-pane render path) when row.is_cost_outlier"
  - truth: "Operator can audit injection-flagged emails in Bulk Review with regex/LLM verdict surfaced AND can take three actions (SAFE-02, SAFE-04)"
    status: failed
    reason: "SafetyDetailPane component (which contains the three Mark safe / Dismiss / Escalate buttons AND the regex_matched + llm_reason + matched_span panels) is never imported by detail-pane.tsx. detail-pane.tsx has no `tab` / `safety` branching — when ?tab=safety is selected, the existing draft-review pane renders instead. Server actions exist and tests pass, but the UI surface to invoke them is unreachable."
    artifacts:
      - path: "web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx"
        issue: "No import of SafetyDetailPane; no variant routing on params.tab or row.topic === 'safety_review'."
      - path: "web/app/(dashboard)/automations/[swarm]/review/components/safety-detail-pane.tsx"
        issue: "Component substantive (3 buttons, MatchedSpanHighlight wired internally) but never rendered — orphaned at Level 3."
    missing:
      - "In detail-pane.tsx: branch on row.topic === 'safety_review' (or tab === 'safety') and render <SafetyDetailPane row={row} bodyText={...}/> instead of the default draft-review pane"
      - "Wire bodyText source — Stage 0 worker doesn't persist body in result, so detail pane needs either to fetch via Outlook (mirrors markSafeAndReprocess) or to surface body from the originating email row"
deferred:
  - truth: "Stage 0 LLM verdict on every email (SAFE-01, SAFE-03) — production execution"
    addressed_in: "Operator setup (Plan 02 deferred-items.md)"
    evidence: "orq_agents row stage-0-safety-classifier intentionally deferred to operator; will fail-closed until inserted. This is operator config, not a code gap. Code path is fully wired."
human_verification:
  - test: "Click Safety review node in queue tree, observe ?tab=safety URL change, observe topic filter applied"
    expected: "URL updates to ?tab=safety&topic=safety_review; row list filters to topic='safety_review' rows only"
    why_human: "Browser navigation + visual state — not script-checkable"
  - test: "End-to-end Stage 0 smoke: POST a benign body to /api/automations/debtor-email/ingest"
    expected: "stage-0/email.received emitted, stage-0-safety-worker runs, classifier/screen.requested emitted, automation_runs row with verdict='safe' and small cost_cents"
    why_human: "Requires live Inngest dev server + Orq.ai agent provisioning (Plan 02 deferred-items.md)"
  - test: "End-to-end Stage 0 injection smoke: POST 'ignore previous instructions ...' body"
    expected: "Worker writes automation_runs row with topic='safety_review' and verdict='injection_suspected'; classifier/screen.requested NOT emitted"
    why_human: "Same as above — needs live env"
  - test: "Budget breach flow: synthetically push cost_cents above 15 in worker"
    expected: "pipeline/budget_breached event emitted; budget-breach-handler files Kanban row with topic='budget_breach'; source row marked failed; NO Inngest auto-retry observed"
    why_human: "Requires live Inngest dev + monitoring; cannot script-verify retries:0 behavior end-to-end"
  - test: "Operator config: insert orq_agents row for stage-0-safety-classifier"
    expected: "Stage 0 LLM verdict calls succeed in production (currently fail-closed)"
    why_human: "Operator setup task — see web/.planning/phases/64-stage-0-input-safety-per-run-budgets/deferred-items.md"
---

# Phase 64: Stage 0 Input Safety + Per-Run Budgets — Verification Report

**Phase Goal:** Every inbound email passes through prompt-injection screening before any LLM sees it, and every pipeline run is bounded by hard token/cost ceilings with intent-scoped tool allowlists.
**Verified:** 2026-04-30T17:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Emails with prompt-injection patterns are flagged `injection_suspected` and routed to a human-only review lane, never to coordinator/handler | ✓ VERIFIED | `web/lib/inngest/functions/stage-0-safety-worker.ts:124-152` — on `verdict='injection_suspected'`, inserts row with `topic='safety_review'` and `status='predicted'`; only emits `classifier/screen.requested` when `verdict==='safe'` (line 155). Worker registered in `web/app/api/inngest/route.ts:63`. Ingest route dispatches via Stage 0 for LLM-bound path (`web/app/api/automations/debtor-email/ingest/route.ts:554`). |
| 2 | Operator can audit injection-flagged emails in Bulk Review with the trigger pattern (regex hit or LLM verdict) surfaced | ✗ FAILED | Loader filters topic='safety_review' (`page.tsx:118`) and queue node exists (`queue-tree.tsx:394`), but `SafetyDetailPane` (which surfaces `regex_matched` + `llm_reason` + matched span via `MatchedSpanHighlight`) is **never imported** by `detail-pane.tsx`. Component is orphaned at Level 3. |
| 3 | Pipeline run exceeding token or cost ceiling halts deterministically and lands in human queue with breach reason | ✓ VERIFIED | Worker emits `pipeline/budget_breached` event in `step.run("emit-budget-breach")` and returns `{halted:true}` without throwing (`stage-0-safety-worker.ts:106-121`). `budget-breach-handler.ts:40,58` marks source row failed and inserts new row with `topic='budget_breach'`. Both functions registered with `retries:0` (D-13). 7/7 worker tests GREEN. |
| 4 | A copy-document handler attempting to invoke a payment-update tool is rejected by `zapier_tools.allowed_for_intents` allowlist | ✓ VERIFIED | `nxt-zap-client.ts:199-202` enforces default-deny: `NULL` or empty array → throw `ToolNotAllowedForIntentError`. Live Supabase confirms backfill: `nxt.invoice_fetch` allows only `['invoice_copy_request']`; `nxt.contact_lookup`/`identifier_lookup`/`candidate_details` allow `['unknown','invoice_copy_request']`. 5/5 allowlist tests GREEN. |
| 5 | Operator sees per-email token cost in Bulk Review; cost outliers (>3× median) appear as their own override axis | ✗ FAILED | Server side complete: RPC `automation_runs_with_outlier` is live (returns `[]` — bootstrap state, expected) and loader enriches rows with `is_cost_outlier`. UI side broken: `BudgetBreachBadge`, `CostOutlierAxisCard` are orphaned files — no callers in `row-strip.tsx`, `detail-pane.tsx`, or `page.tsx`. |

**Score:** 3/5 ROADMAP success criteria fully verified; 2 fail at UI wiring (Level 3).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SAFE-01 (regex + LLM Stage 0 detects injection) | 64-02, 64-04 | Stage 0 runs on every email | ✓ SATISFIED | `regex-screen.ts` + `llm-verdict.ts` invoked on every event in worker (lines 90-95) |
| SAFE-02 (operator surface for safety review) | 64-05 | Bulk Review safety tab | ⚠️ PARTIAL | Tab + queue node + loader present; detail pane not wired (see gap) |
| SAFE-03 (LLM verdict on every email) | 64-02, 64-04 | D-02 — uniform LLM call | ✓ SATISFIED | `llmInjectionVerdict` called unconditionally in worker (line 94); RFC paragraph rewritten (`docs/agentic-pipeline/stage-0-safety.md`) |
| SAFE-04 (three operator actions) | 64-05 | Mark safe / Dismiss / Escalate | ⚠️ PARTIAL | Server actions exist (`actions.ts:265,340,372`) and pass loader test, but UI buttons (in `safety-detail-pane.tsx`) are unreachable — pane never mounted |
| BUDG-01 (per-run token + cost ceilings halt deterministically) | 64-02, 64-04 | 15¢ / 5000-token ceiling, halt-as-data | ✓ SATISFIED | `budget-counter.ts:check()` strict-greater-than guard; worker emits `pipeline/budget_breached` event without throw; breach handler files Kanban with retries:0 |
| BUDG-02 (intent allowlist default-deny) | 64-03 | `zapier_tools.allowed_for_intents` | ✓ SATISFIED | Migration applied live, 4 tools backfilled, default-deny enforced in `nxt-zap-client.ts`, callers thread `intent` through |
| BUDG-03 (per-email cost in Bulk Review + outlier axis) | 64-05 | Cost cell + axis 4 card | ✗ BLOCKED | RPC + loader enrichment shipped; UI cells/cards never mounted (see gap) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `web/lib/stage-0/regex-screen.ts` | Pure first-line injection screen | ✓ VERIFIED | 23 lines; pure; imported by worker |
| `web/lib/stage-0/regex-patterns.ts` | ≥8 EN+NL patterns | ✓ VERIFIED | 70 lines; 10 patterns per SUMMARY |
| `web/lib/stage-0/budget-counter.ts` | 15¢/5000-token guard | ✓ VERIFIED | 45 lines; both ceilings; strict-> boundary |
| `web/lib/stage-0/llm-verdict.ts` | Orq.ai-backed verdict + Zod parse | ✓ VERIFIED | 86 lines; calls `invokeOrqAgent` registry seam; `safeParse` boundary |
| `web/lib/inngest/functions/stage-0-safety-worker.ts` | Worker w/ regex+LLM+budget+forward | ✓ VERIFIED | 180 lines; 7 step.run calls; retries:0; registered in route.ts |
| `web/lib/inngest/functions/budget-breach-handler.ts` | File Kanban row, mark failed | ✓ VERIFIED | 76 lines; retries:0; `topic='budget_breach'`; registered |
| `web/lib/automations/debtor-email/nxt-zap-client.ts` | Default-deny intent allowlist | ✓ VERIFIED | `ToolNotAllowedForIntentError` exported; 3-arg `callNxtTool(tool, input, intent)`; 4 callsites threaded |
| `supabase/migrations/20260430e_stage_0_safety_and_allowlist.sql` | Add column + backfill | ✓ VERIFIED | Live in production (REST query confirms 4 rows backfilled) |
| `supabase/migrations/20260430f_automation_runs_outlier_view.sql` | RPC w/ bootstrap guard | ✓ VERIFIED | Live (RPC reachable; returns `[]` — empty window, expected bootstrap state) |
| `safety-detail-pane.tsx` | 3 actions + matched-span | ⚠️ ORPHANED | Substantive (334 lines, all 3 buttons + `MatchedSpanHighlight` internally wired) but no caller |
| `cost-outlier-axis-card.tsx` | AXIS 4 card | ⚠️ ORPHANED | Substantive but no caller |
| `budget-breach-badge.tsx` | Badge for budget_breach rows | ⚠️ ORPHANED | Substantive but no caller |
| `matched-span-highlight.tsx` | Highlight matched span | ✓ VERIFIED | Imported by `safety-detail-pane.tsx` (which is itself orphaned) |
| `actions.ts` (server actions) | 3 server actions | ✓ VERIFIED | `markSafeAndReprocess`, `dismissSafetyReview`, `escalateToKanban` exported |
| `queue-tree.tsx` (Safety node) | Sibling node above topic tree | ✓ VERIFIED | Lines 386-405; counts from `topic='safety_review'`; routes to `?tab=safety&topic=safety_review` |
| `page.tsx` (loader branch) | tab=safety filter + outlier enrichment | ✓ VERIFIED | Lines 112-138; topic filter + RPC enrichment |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| ingest route | stage-0/email.received | `inngest.send` | ✓ WIRED | `ingest/route.ts:554` |
| stage-0-safety-worker | regex-screen + llm-verdict + budget-counter | imports | ✓ WIRED | Lines 28-31 |
| stage-0-safety-worker | classifier/screen.requested (safe path) | `inngest.send` in step.run | ✓ WIRED | Lines 156-168 |
| stage-0-safety-worker | pipeline/budget_breached (breach) | `inngest.send` in step.run | ✓ WIRED | Lines 108-118 |
| budget-breach-handler | automation_runs (mark failed + Kanban row) | admin client | ✓ WIRED | Lines 40, 56-66 |
| nxt-zap-client | zapier_tools.allowed_for_intents | service-role select | ✓ WIRED | Line 71 (projection), line 199-202 (enforce) |
| page.tsx loader | automation_runs_with_outlier RPC | `admin.rpc` | ✓ WIRED | Line 128 |
| Safety review node click | ?tab=safety URL | router push | ✓ WIRED | queue-tree.tsx:403 |
| **detail-pane.tsx → SafetyDetailPane** | **safety-detail-pane component** | import + variant route | **✗ NOT_WIRED** | No import; no branch on tab/topic |
| **row-strip.tsx → BudgetBreachBadge** | **badge component** | import + conditional render | **✗ NOT_WIRED** | No import; no cost cell |
| **detail-pane / page → CostOutlierAxisCard** | **axis-4 card** | import + conditional | **✗ NOT_WIRED** | No callers anywhere |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| safety-detail-pane.tsx | `row.result.regex_matched`, `llm_reason`, `matched_span`, `cost_cents` | Worker writes via `automation_runs.result` jsonb (`stage-0-safety-worker.ts:133-145`) | YES (when worker runs) | ✓ FLOWING (but pane never mounted) |
| page.tsx safety branch | `outlierMap` from `automation_runs_with_outlier` RPC | Live RPC; computes 7-day median + outlier flag | YES (returns `[]` until 100-sample bootstrap clears — expected) | ✓ FLOWING |
| stage-0-safety-worker | `event.data.body_text` | Ingest route `fireStage0Event` payload | YES — ingest route fetches Outlook body upstream | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 64 vitest suite | `npx vitest run lib/stage-0 lib/inngest/functions/__tests__/stage-0-* lib/inngest/functions/__tests__/budget-* lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader` | 7 files, 33/33 GREEN | ✓ PASS |
| Live `zapier_tools.allowed_for_intents` backfill | REST: `select tool_id, allowed_for_intents` | 4 tools with correct intents | ✓ PASS |
| Live `automation_runs_with_outlier` RPC | REST POST with `p_swarm_type=debtor-email` | Returns `[]` (no samples — bootstrap) | ✓ PASS (function callable, schema cached) |
| Stage 0 Orq.ai agent provisioned | REST: `orq_agents?agent_key=eq.stage-0-safety-classifier` | `[]` — row missing | ✗ FAIL — operator setup deferred (Plan 02 deferred-items.md) — fail-closed in production until inserted |
| Inngest workers registered | `grep stage0SafetyWorker web/app/api/inngest/route.ts` | 2 hits (import + registration) | ✓ PASS |

### Anti-Patterns Found

None blocking. Worker code uses real `step.run` boundaries, real DB writes, real `inngest.send`. No TODO/FIXME/placeholder text in shipped code paths. Lockfile sync was hygiene only.

### Human Verification Required

See frontmatter `human_verification` block. Five items: queue-tree click navigation, end-to-end Stage 0 smoke (safe + injection), budget breach end-to-end, and the Orq.ai agent operator-setup task.

## Gaps Summary

Phase 64 ships a fully wired backend (Stage 0 worker, budget enforcement, default-deny tool allowlist, two production migrations live, 33/33 unit tests green) but stops short on the operator UI surface. Wave 4 / Plan 05 produced four well-scoped components (`safety-detail-pane`, `cost-outlier-axis-card`, `budget-breach-badge`, `matched-span-highlight`) plus three server actions and a queue-tree node — but did NOT wire the components into the existing `detail-pane.tsx` or `row-strip.tsx`. Plan 05's frontmatter listed both files as `files_modified`, but the inline finalize commit (`7e4f521`) only modified `actions.ts` and `queue-tree.tsx` (per `git show --stat 7e4f521`).

Concrete user-visible impact:

1. Operator clicks Safety review node → URL changes to `?tab=safety` → row list correctly filters to `topic='safety_review'` rows.
2. Operator clicks a row → existing draft-review pane renders (no Mark safe / Dismiss / Escalate buttons; no matched-span highlight; no LLM reason text).
3. Cost cell missing on every row; budget-breach badge never appears; cost outlier axis-4 card never appears.

This is a **single concentrated gap** in the UI wiring layer of Plan 05 Task 4, traceable to the stream-timeout-induced inline finalize. All underlying contracts (events, server actions, RPC, worker behavior, data shape) are correct and tested. Closure is a focused diff: import + render the four components in two files (`detail-pane.tsx` variant routing + `row-strip.tsx` cost cell & badge), and decide where the axis-4 card mounts.

The `orq_agents` row for `stage-0-safety-classifier` is **deferred to operator** per Plan 02's `deferred-items.md` — production Stage 0 LLM calls will fail-closed until inserted. This is acknowledged operator setup, not a phase gap.

---

*Verified: 2026-04-30T17:05:00Z*
*Verifier: Claude (gsd-verifier)*
