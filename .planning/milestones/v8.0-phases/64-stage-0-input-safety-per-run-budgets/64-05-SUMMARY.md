---
phase: 64-stage-0-input-safety-per-run-budgets
plan: 05
subsystem: ui
tags: [bulk-review, safety-review, ui, cost-outlier, budget-breach, v7-tokens, supabase, server-actions, inngest]

# Dependency graph
requires:
  - phase: 64-stage-0-input-safety-per-run-budgets
    provides: Plan 02 stage-0 pure libs (regex-screen, llm-verdict, budget-counter), Plan 03 nxt-zap intent allowlist, Plan 04 stage-0 inngest workers + events (stage-0/email.received, pipeline/budget_breached)
provides:
  - Safety review tab on /automations/[swarm]/review (?tab=safety)
  - Safety review sibling node above the topic tree in queue-tree.tsx
  - SafetyDetailPane (client) with three mutually-exclusive actions: Mark safe & reprocess, Dismiss, Escalate to human review
  - Three server actions wiring those buttons to Supabase + Inngest
  - Cost outlier axis card (AXIS 4) with bootstrap-warming / median-zero / outlier states
  - Budget breach badge for rows where the run halted on the budget ceiling
  - Matched-span highlight (server) for prompt-injection evidence excerpts
  - Supabase view automation_runs_outlier_view (>3x 7-day rolling cost median, 100-sample bootstrap guard)
affects: [phase-65-stage-3, future operator-surface phases, kanban human review lane consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side optimistic remove via pendingRemovalIds + server action call"
    - "Stage 0 override re-emit (Pitfall 5) — operator sets safety_overridden=true, worker short-circuits to classifier"
    - "Kanban escalation reuses automation_runs row pattern from budget-breach-handler (D-11)"
    - "Outlier detection bootstrap guard — show warming-up state until 100 samples are in window (Pitfall 6)"

key-files:
  created:
    - .planning/phases/64-stage-0-input-safety-per-run-budgets/64-05-SUMMARY.md
    - supabase/migrations/20260430f_automation_runs_outlier_view.sql
    - web/app/(dashboard)/automations/[swarm]/review/components/safety-detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/review/components/cost-outlier-axis-card.tsx
    - web/app/(dashboard)/automations/[swarm]/review/components/budget-breach-badge.tsx
    - web/app/(dashboard)/automations/[swarm]/review/components/matched-span-highlight.tsx
    - web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts
  modified:
    - web/app/(dashboard)/automations/[swarm]/review/page.tsx
    - web/app/(dashboard)/automations/[swarm]/review/queue-tree.tsx
    - web/app/(dashboard)/automations/[swarm]/review/row-strip.tsx
    - web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/review/actions.ts

key-decisions:
  - "Reuse existing Kanban human-review lane (D-11) for safety escalations rather than introducing a new surface — operators already work the lane, less context switch"
  - "markSafeAndReprocess re-fetches body via fetchMessageBody so the override classifier event still carries body_text — Stage 0 worker doesn't persist body in result"
  - "Three buttons modeled mutually-exclusive: status='completed' is irreversible per row; subsequent clicks would target a different row"
  - "Outlier bootstrap copy: 'Outlier detection warming up — N/100 samples in window' (per UI-SPEC verbatim)"
  - "Server-side Outlier RPC defined as a Postgres view (not function) so PostgREST surfaces it like a table — cheaper than per-row RPC roundtrips"

patterns-established:
  - "V7-tokens-only constraint enforced; no new shadows, radii, or font families introduced (per ui-brand reference)"
  - "Audit chain: every safety action stamps result.* with action name + reviewer email (mitigates T-64-14 repudiation)"

requirements-completed: [SAFE-02, SAFE-04, BUDG-03]

# Metrics
duration: 60min  # original agent ~45min before stream timeout, +15min orchestrator wrap-up
completed: 2026-04-30
---

# Phase 64 Plan 05: Safety Review tab UI + cost outlier view Summary

**Safety Review surface — dedicated tab on /automations/[swarm]/review with three operator actions (Mark safe & reprocess, Dismiss, Escalate), cost outlier axis card, budget breach badge, matched-span highlights, and a bootstrap-guarded Postgres outlier view**

## Performance

- **Duration:** ~60 min (45 min in original agent run + 15 min orchestrator wrap-up after stream timeout)
- **Started:** 2026-04-30T16:00:00Z
- **Completed:** 2026-04-30T16:50:00Z
- **Tasks:** 4/4
- **Files modified:** 11

## Accomplishments
- Safety review queue node sits above the topic tree, counts pulled from the existing counts RPC (topic='safety_review')
- Three server actions wire the detail-pane buttons to Supabase mutations and Stage-0 re-emits; lane escalation row mirrors the budget-breach-handler shape so both Stage 0 escalations land in the same Kanban lane
- Outlier detection lives in Postgres (`automation_runs_outlier_view`) with a 100-sample bootstrap guard so the UI never shows "outlier" without enough data behind it
- Loader, queue-tree node, three components, and three server actions — all V7-tokens-only, no new shadows/radii/fonts

## Task Commits

1. **Task 1: outlier RPC + 7-day rolling cost median view** - `a2bb541` (feat)
2. **Task 2: loader branch + outlier enrichment for ?tab=safety** - `0e591fa` (feat)
3. **Task 3: four UI components per 64-UI-SPEC** - `3754582` (feat)
4. **Task 4: wire safety-review server actions + queue-tree node** - `7e4f521` (feat)

_Note: Task 4 was finalized inline by the orchestrator after the original executor agent hit a stream idle timeout — see Issues Encountered._

## Files Created/Modified

**Created**
- `supabase/migrations/20260430f_automation_runs_outlier_view.sql` — view with 100-sample bootstrap guard
- `web/app/(dashboard)/automations/[swarm]/review/components/safety-detail-pane.tsx` — client; three sections + three actions; pendingRemovalIds for optimistic remove
- `web/app/(dashboard)/automations/[swarm]/review/components/cost-outlier-axis-card.tsx` — server; AXIS 4 card with three states
- `web/app/(dashboard)/automations/[swarm]/review/components/budget-breach-badge.tsx` — server; pill rendering for budget breach rows
- `web/app/(dashboard)/automations/[swarm]/review/components/matched-span-highlight.tsx` — server; amber-soft fill + wavy underline (WCAG 1.4.1)
- `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` — loader contract test (5 tests, all green)

**Modified**
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` — loader branch for ?tab=safety
- `web/app/(dashboard)/automations/[swarm]/review/queue-tree.tsx` — Safety review sibling node above topic tree
- `web/app/(dashboard)/automations/[swarm]/review/row-strip.tsx` — cost cell + budget-breach badge integration
- `web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx` — variant routing for safety rows
- `web/app/(dashboard)/automations/[swarm]/review/actions.ts` — three new server actions (markSafeAndReprocess, dismissSafetyReview, escalateToKanban)
- `web/package-lock.json` — lockfile sync (no new top-level deps; brings @dnd-kit/utilities/dotenv/tsx in line with already-declared package.json)

## Decisions Made
- **Reuse the Kanban human-review lane for escalations (D-11)** — operators already work the lane, less context switch. Insert a new automation_runs row with `topic='safety_escalation'` and `triggered_by='safety-review-escalation'`, mirroring the budget-breach-handler shape.
- **Re-fetch body in markSafeAndReprocess** — Stage 0 worker doesn't persist `body_text` in the result jsonb, so the override re-emit must call `fetchMessageBody` to forward a complete classifier event payload. Outlook fetch failure surfaces as a clean error rather than silently dropping the body.
- **Server-side outlier as a view, not an RPC function** — PostgREST surfaces views like tables, enabling cheap join-style enrichment from the loader without per-row RPC roundtrips.
- **Bootstrap guard at 100 samples** — Pitfall 6 — show "Outlier detection warming up — N/100 samples in window" until the rolling 7-day window has enough data to make >3x median meaningful.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lockfile sync for already-declared deps**
- **Found during:** Task 4 (server actions implementation)
- **Issue:** `web/package-lock.json` lagged behind `web/package.json` for `@dnd-kit/utilities`, `dotenv`, `tsx` — these were declared in earlier phases but the lockfile hadn't been refreshed. Without the bump, `npm ci` would fail in CI.
- **Fix:** Ran `npm install` (no-op for top-level deps; updates the lockfile only).
- **Files modified:** web/package-lock.json
- **Verification:** `npx tsc --noEmit` clean, vitest 5/5 green.
- **Committed in:** 7e4f521 (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Lockfile hygiene only. No scope creep, no behavior change.

## Issues Encountered

**Stream idle timeout in the executor agent.** The original gsd-executor agent ran ~45 min through tasks 1, 2, 3, and most of task 4 (server-action implementation + queue-tree node) before hitting an API stream idle timeout. The agent had committed tasks 1–3 atomically and left task 4's changes uncommitted in the worktree. The orchestrator (this session) verified the in-progress code with `tsc --noEmit` (zero errors) and the loader test (5/5 passing), then committed task 4 inline as `7e4f521` and authored this SUMMARY.

**Migration push deferred to orchestrator.** Per the original plan note, `supabase db push` rejects the suffix-style filename `20260430f_*.sql` (same blocker pattern as Plan 01 Task 6). The migration FILE is committed; the orchestrator will apply via Supabase MCP after merge.

## User Setup Required

None — the new automation_runs row pattern reuses the existing Kanban surface and Inngest events. The orchestrator will apply the outlier-view migration via Supabase MCP immediately after wave merge.

## Next Phase Readiness

- Stage 0 funnel is now end-to-end: ingest -> stage-0 worker -> classifier (or safety_review) -> operator queue -> override re-emit (short-circuit) or Kanban escalation.
- Outlier detection lives behind a bootstrap guard, so the UI is honest about cold starts.
- Phase 65 (Stage 3 ranked multi-intent coordinator) can rely on the per-run cost surfacing and budget breach lane established here.

---
*Phase: 64-stage-0-input-safety-per-run-budgets*
*Completed: 2026-04-30*
