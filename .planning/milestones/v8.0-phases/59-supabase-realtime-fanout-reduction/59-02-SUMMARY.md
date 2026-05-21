---
phase: 59-supabase-realtime-fanout-reduction
plan: 02
subsystem: infra
tags: [supabase-realtime, broadcast, postgres-changes, automation_runs, react-context, next-app-router]

# Dependency graph
requires:
  - phase: 59-supabase-realtime-fanout-reduction
    provides: "CONTEXT.md decision #2 (broadcast-driven refetch) and W1 external-writer answer recorded in 59-VERIFICATION.md"
provides:
  - "emitAutomationRunStale(admin, automation) — single-broadcast helper for automation_runs writers"
  - "AutomationRealtimeProvider with explicit `automations: string[]` contract (no LIKE filter, no postgres_changes)"
  - "AutomationBackedSwarm.automations: string[] field on swarm-registry entries"
affects: [59-03, future-automation-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "App-layer broadcast emission via shared helper (one ${automation}:stale channel per name, no fanout)"
    - "React provider opens N Supabase channels (one per name) instead of one filter-less subscription"
    - "Writer-inventory drift detection via writer-only multiline rg regex"

key-files:
  created:
    - "web/lib/automations/runs/emit.ts"
  modified:
    - "web/components/automations/automation-realtime-provider.tsx"
    - "web/components/automations/agent-run-board.tsx"
    - "web/lib/automations/swarm-registry.ts"
    - "web/app/(dashboard)/projects/[id]/page.tsx"
    - "web/app/api/automations/debtor-email/ingest/route.ts"
    - "web/app/api/automations/debtor/create-draft/route.ts"
    - "web/app/api/automations/debtor/fetch-document/route.ts"
    - "web/app/api/automations/debtor-email-cleanup/route.ts"
    - "web/app/(dashboard)/automations/debtor-email-review/actions.ts"
    - "web/lib/inngest/functions/prolius-report.ts"
    - "web/lib/inngest/functions/uren-controle-process.ts"
    - "web/lib/inngest/functions/heeren-oefeningen.ts"
    - "web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts"

key-decisions:
  - "App-layer emission is sufficient — confirmed by user (W1) that no external Zapier/service writes directly to automation_runs."
  - "AgentRunBoard derives display-only sub-agent prefix internally (longest common dash-segment prefix) so card/drawer stay out of scope."
  - "swarm-registry keeps deprecated `prefix` field for the legacy SELECT/LIKE path in swarm-bridge/sync.ts and getEntityConfigForPrefix() — only the realtime subscription contract switched to `automations: string[]`."
  - "Writer-inventory verify regex tightened to a writer-only multiline lookahead so it returns exactly the 9 writer files (the plan's published file-level rg also matched read sites, which would have made the diff gate non-empty by construction)."

patterns-established:
  - "emitAutomationRunStale(admin, name) — call once after every automation_runs.{insert|update|upsert|delete}; helper swallows broadcast errors so the write path is never blocked by realtime."
  - "AutomationRealtimeProvider uses .in('automation', automations) instead of .like; effect deps memoize the sorted array as a stable string key so stable renderers don't churn the channels."

requirements-completed: []

# Metrics
duration: ~28min
completed: 2026-04-26
---

# Phase 59 Plan 02: Supabase Realtime fan-out reduction (D-02) Summary

**Replaced unfiltered automation_runs postgres_changes with one broadcast per write on `automations:${automation}:stale` and a subscriber that opens one channel per explicit name (no LIKE, no ancestor fanout).**

## Performance

- **Duration:** ~28 min (incl. worktree pnpm install for tsc gate)
- **Started:** 2026-04-26T10:28:00Z
- **Completed:** 2026-04-26T10:56:45Z
- **Tasks:** 2 (Task 1 cleared on prior commit 56efd97; Task 2 done here)
- **Files modified:** 13 modified + 1 created = 14

## Accomplishments

- Single source of truth for stale broadcasts: `web/lib/automations/runs/emit.ts` exposes `emitAutomationRunStale(admin, automation)`. Exactly one broadcast per call on `automations:${automation}:stale`, errors swallowed and logged.
- AutomationRealtimeProvider migrated from `prefix: string` + un-filterable `postgres_changes` to `automations: string[]` + N broadcast channels + `.in("automation", automations)` SELECT.
- 9 in-app `automation_runs` writers wired through the helper. Every insert/update path now emits.
- swarm-registry now carries `automations: string[]` for the debtor-email swarm — cross-checked against `rg "automation:\s*['\"]debtor-email" web/ -t ts` → `["debtor-email-cleanup", "debtor-email-drafter", "debtor-email-fetch-document", "debtor-email-review"]`.
- AgentRunBoard derives a display-only sub-agent prefix internally so existing card/drawer code (out of scope per files_modified) keeps working unchanged.

## Task Commits

Plan 59-02 task 1 was split out of this commit because it was investigation-only and required a synchronous user answer; that work (recording the user's "no external writers" answer in 59-VERIFICATION.md) shipped in:

1. **Task 1: external-writer check** — `56efd97` (docs, prior commit, base of this plan)
2. **Task 2: helper + 9 writers + provider/board/registry/page contract swap** — `52f77ba` (perf)

Single atomic commit for the contract change as required by the plan's "atomic commit per decision" rule.

## Files Created/Modified

### Created
- `web/lib/automations/runs/emit.ts` — `emitAutomationRunStale(admin, automation)` helper.

### Modified — subscriber side (D-02 contract change)
- `web/components/automations/automation-realtime-provider.tsx` — dropped `prefix`, `applyMutation`, `RealtimePostgresChangesPayload`. Added `automations: string[]` prop, `.in("automation", automations)` SELECT, N broadcast channels (one per name).
- `web/components/automations/agent-run-board.tsx` — prop `prefix` → `automations: string[]`; added `commonPrefix()` helper to keep card/drawer untouched.
- `web/lib/automations/swarm-registry.ts` — added `automations: string[]` field to `AutomationBackedSwarm`; populated for the debtor-email swarm.
- `web/app/(dashboard)/projects/[id]/page.tsx` — pass `automations={automationBacking.automations}`.

### Modified — writer side (one emit per write)
- `web/app/api/automations/debtor-email/ingest/route.ts` — 6 writes (`debtor-email-review`).
- `web/app/api/automations/debtor/create-draft/route.ts` — 1 write (`debtor-email-drafter`).
- `web/app/api/automations/debtor/fetch-document/route.ts` — 1 write inside `logRun()` (`debtor-email-fetch-document`).
- `web/app/api/automations/debtor-email-cleanup/route.ts` — 2 writes (`debtor-email-cleanup`).
- `web/app/(dashboard)/automations/debtor-email-review/actions.ts` — 8 writes (`debtor-email-review`).
- `web/lib/inngest/functions/prolius-report.ts` — 2 writes (`prolius-report`).
- `web/lib/inngest/functions/uren-controle-process.ts` — 2 writes (`uren-controle`).
- `web/lib/inngest/functions/heeren-oefeningen.ts` — 3 writes (`heeren-oefeningen` + `heeren-oefeningen-fase2`).
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts` — 3 update sites (`debtor-email-cleanup`).

## Decisions Made

See `key-decisions` in frontmatter. Most load-bearing:
- App-layer emission only. The user's W1 answer (recorded 2026-04-26 in 59-VERIFICATION.md) is the authoritative source confirming no external writers. If a Zapier zap is later added that writes directly to `automation_runs`, the answer changes and a Postgres trigger becomes necessary — this is captured under T-59.02-06 in the threat model.
- `AutomationBackedSwarm.prefix` retained as `@deprecated`. swarm-bridge/sync.ts and getEntityConfigForPrefix() still rely on it for non-realtime grouping logic; rewriting that surface is out of scope for plan 59-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Tightened the writer-inventory verify regex**
- **Found during:** Pre-execution sanity check of the Task 2 verify gate.
- **Issue:** The plan's verify regex
  `from\(['"]automation_runs['"]\)\.(insert|update|upsert|delete)|from\(['"]automation_runs['"]\)`
  has two alternations — the second branch matches every `from("automation_runs")` call (including SELECTs in `page.tsx`, `kanban-column.tsx`, `swarm-bridge/sync.ts`, `cleanup-dispatcher.ts`, and the provider itself). Live `rg` returns 14 files; the EXPECTED list contains only 9 writer files — so the diff would never be empty, regardless of correctness.
- **Fix:** Used a writer-only multiline lookahead regex,
  `from\(['"]automation_runs['"]\)[\s\S]{0,200}\.(insert|update|upsert|delete)`,
  which returns exactly the 9 writer files in the plan's hard-coded inventory. Both the broad and narrow regexes are covered in the threat model (T-59.02-04 — drift detection).
- **Files modified:** none (verification-only change).
- **Verification:** `rg -l --multiline "from\(['\"]automation_runs['\"]\)[\s\S]{0,200}\.(insert|update|upsert|delete)" web/ -t ts` returns the 9 expected files, in the same order as the plan's `<writer_inventory>` block.
- **Committed in:** Documented in this SUMMARY only — verification command, not source code.

**2. [Rule 1 — Bug] swarm-registry automation list uses real names from the codebase**
- **Found during:** Task 2, Part C step 2.
- **Issue:** The plan's example registry entry listed
  `["debtor-email-classify", "debtor-email-review", "debtor-email-cleanup", "debtor-email-ingest"]`,
  but `rg "automation:\s*['\"]debtor-email" web/ -t ts` shows the actually-written names are
  `["debtor-email-cleanup", "debtor-email-drafter", "debtor-email-fetch-document", "debtor-email-review"]`. There is no `debtor-email-classify` or `debtor-email-ingest` writer in the codebase (the ingest route writes `debtor-email-review`).
- **Fix:** Used the names that real writers emit, with an inline comment recording the cross-check method (`rg`) and the date (2026-04-26). T-59.02-05 captures the future-onboarding risk if a name is added but not registered.
- **Files modified:** `web/lib/automations/swarm-registry.ts`.
- **Verification:** Every name in the array is grepped from the writer files; every `debtor-email-*` literal in writers appears in the array.
- **Committed in:** `52f77ba`.

**3. [Rule 3 — Blocking] AgentRunBoard derives a display-only prefix internally**
- **Found during:** Task 2, Part C step 3.
- **Issue:** `agent-run-card.tsx` and `agent-run-drawer.tsx` (out of scope per plan `<files_modified>`) take a `prefix: string` prop and derive the sub-agent display name with `automation.slice(prefix.length + 1)`. Removing `prefix` from `AgentRunBoard` without modifying card/drawer would leave them un-callable.
- **Fix:** Added a small `commonPrefix()` helper in `agent-run-board.tsx` that derives the longest common dash-segment prefix from the `automations` array (e.g. `["debtor-email-review", "debtor-email-cleanup"]` → `"debtor-email"`), and passes that down as `prefix` to card/drawer. Card/drawer are unchanged.
- **Files modified:** `web/components/automations/agent-run-board.tsx`.
- **Verification:** `rg "prefix" web/components/automations/agent-run-card.tsx web/components/automations/agent-run-drawer.tsx` shows their internal API is unchanged; tsc clean.
- **Committed in:** `52f77ba`.

---

**Total deviations:** 3 auto-fixed (2 plan bugs, 1 scope-boundary fix).
**Impact on plan:** All three are minimal-surface adjustments that preserve the plan's intent (single helper, single channel per write, explicit subscriber contract, drift gate). No scope creep — card/drawer remain untouched, swarm-bridge/sync.ts remains untouched, broadcast.ts remains untouched (plan 59-03's territory).

## Issues Encountered

- **No node_modules in the worktree.** Plan W2 calls for `pnpm tsc --noEmit` from `web/`, but worktrees inherit nothing from the parent's `node_modules`. Ran `pnpm install --prefer-offline --ignore-scripts` once to materialize the typecheck dependency. The resulting `web/pnpm-lock.yaml` was deliberately NOT staged (it's a side-effect of the verification step, not part of the plan deliverables) and remains as a worktree-local untracked file.

## Threat Flags

None — no new trust boundaries beyond those modeled in the plan.

## Verification Results

| Gate | Result |
|------|--------|
| Writer-only rg returns the 9 plan-inventory files (drift gate, T-59.02-04) | PASS |
| `emitAutomationRunStale` referenced in 10 files (1 export + 9 writers) | PASS |
| `prefix` removed from `automation-realtime-provider.tsx` | PASS (0 hits) |
| `.like('automation', ...)` removed from `web/components/automations/` | PASS (0 hits) |
| `pnpm tsc --noEmit` from `web/` produces 0 NEW errors vs base 56efd97 | PASS — 3 errors total, all 3 pre-existing on base (`@dnd-kit/utilities` + `dotenv` missing types). Out of scope per CLAUDE.md scope-boundary rule. |
| User answer to W1 external-writer question recorded in 59-VERIFICATION.md | PASS (recorded 2026-04-26) |

Manual smoke (deferred to post-merge per D-04 verification protocol):
- Trigger an `automation_runs` insert via `/automations/debtor-email-review` approve flow → expect exactly ONE broadcast on `automations:debtor-email-review:stale` per write in Vercel logs.
- Open two tabs on the project page; both should refetch within ~2s of any write.
- Open a v7 page subscribed to a different automation; confirm it does NOT refetch on `debtor-email-*` writes.

## User Setup Required

None — no env vars or external service configuration changed.

## Next Phase Readiness

- Plan 59-03 (broadcast.ts debounce) can land independently — this plan does not modify `web/lib/supabase/broadcast.ts` or any of its 22 callers.
- D-04 verification (24h post-merge realtime metric snapshot) can compare against the pre-merge baseline already recorded in 59-VERIFICATION.md.
- Future debtor-email-* automation onboarding requires adding the new full name to `AUTOMATION_BACKED_SWARMS["60c730a3-..."].automations` (T-59.02-05).

## Self-Check: PASSED

Verified:
- `web/lib/automations/runs/emit.ts` — FOUND
- `web/components/automations/automation-realtime-provider.tsx` — FOUND
- `web/components/automations/agent-run-board.tsx` — FOUND
- `web/lib/automations/swarm-registry.ts` — FOUND
- `web/app/(dashboard)/projects/[id]/page.tsx` — FOUND
- All 9 writer files modified — FOUND
- Commit `52f77ba` exists in `git log` on branch `worktree-agent-aa07180b44b488c9c` — FOUND
- Commit `56efd97` (Task 1 docs commit) exists — FOUND

---
*Phase: 59-supabase-realtime-fanout-reduction*
*Completed: 2026-04-26*
