---
phase: 76-stage-3-kanban-human-lane-wiring
plan: 08
subsystem: ui
tags: [next.js, middleware, redirect, registry-driven-routing, phase-76, debtor-email]

requires:
  - phase: 76-stage-3-kanban-human-lane-wiring
    provides: "Plans 01–07 ship the Stage 3/4 Kanban UI + pipeline triggers + Server Actions; this plan closes the URL-rename loop and runs end-to-end verification."

provides:
  - "Backwards-compat HTTP 308 redirect from /automations/[swarm]/review (and ?tab=safety / ?tab=pending) to stage-keyed equivalents (D-05.6)."
  - "Stage 1 route wrapper at /automations/[swarm]/stage-1 that re-exports the existing review/page.tsx (minimum-churn path)."
  - "Stage 0 placeholder route at /automations/[swarm]/stage-0 so the registry-driven stage tab strip's stage-0 link resolves."
  - "Pure helper resolveReviewRedirect, exported and unit-tested (8 cases incl. open-redirect threat T-76-08-01)."
  - "76-VALIDATION.md populated with non-destructive verification results + a written-out plan for the live-DB verification pass."

affects:
  - 76-VALIDATION (live-DB verification pending user approval)
  - 77 (Stage 2/3 end-to-end verification)
  - 78 (sales-email onboarding — registry-only)

tech-stack:
  added: []
  patterns:
    - "Middleware redirect helper as pure function, exported for vitest unit testing (avoids Edge-runtime test complexity)."
    - "Re-export pattern for route aliasing under Next.js App Router: `export { default, dynamic } from \"../review/page\"`."

key-files:
  created:
    - "web/__tests__/middleware-review-redirect.test.ts"
    - "web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx"
  modified:
    - "web/middleware.ts"
    - ".planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md"
    - ".planning/phases/76-stage-3-kanban-human-lane-wiring/deferred-items.md"

key-decisions:
  - "Picked re-export over wrapper for /stage-1 (plan option A, minimum churn) — review/page.tsx already renders its own page chrome and a wrapper would duplicate it."
  - "Stage 0 placeholder does NOT link back to /review?tab=safety because the new middleware would 308-redirect that URL onto /stage-0, creating an infinite loop. Stage 0 surface is deferred per CONTEXT.md D-04 REVISED."
  - "Middleware redirect runs BEFORE the Supabase session check — redirects are public-cacheable and have no auth dependency; auth gating re-runs on the redirected target."
  - "Task 3 live-DB verification PAUSED pending user confirmation per orchestrator pre-instruction (Auto Mode rule 5 — live-DB writes need explicit approval)."

patterns-established:
  - "Pattern: pure-helper extraction for middleware logic — `resolveReviewRedirect(pathname, searchParams)` is exported from middleware.ts and tested directly."
  - "Pattern: re-export for stage-keyed URL aliasing without surface duplication."

requirements-completed: []

duration: ~30min
completed: 2026-05-07
---

# Phase 76 Plan 08: Redirects + end-to-end verification Summary

**Backwards-compat 308 redirect from `/review` → `/stage-N` URLs (D-05.6) plus Stage 0/Stage 1 route wrappers; live-DB end-to-end verification paused pending user approval.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-07T13:25:50Z
- **Completed:** 2026-05-07T13:55Z (Tasks 1+2; Task 3 paused)
- **Tasks:** 2/3 executed; Task 3 paused as instructed
- **Files created/modified:** 5 (1 modified, 4 created)

## Accomplishments

- Middleware backwards-compat redirect for legacy `/automations/[swarm]/review` URLs (308 Permanent Redirect; preserves method).
- Closed-enum `tab` handling: `?tab=safety` → `/stage-0`, `?tab=pending` → `/stage-1?sub=pending`, default → `/stage-1`. Open-redirect threat T-76-08-01 mitigated.
- Stage 1 route wrapper via re-export (minimum churn) — internal links from the Plan 06 stage tab strip resolve via `t.slug='stage-1'`.
- Stage 0 placeholder route with `loadSwarm` spoofing gate (T-76-08-03), shell chrome (PageHeader + StageTabStrip) and a copy block stating the surface is deferred.
- 8 vitest cases on `resolveReviewRedirect` (all green); type-check (`tsc --noEmit`) clean.
- 76-VALIDATION.md populated with sections A–F including a written-out live-DB verification plan for Task 3.

## Task Commits

1. **Task 1: Backwards-compat middleware (D-05.6)** — `afaab2e` (feat) — TDD: test (in same commit) + impl. 8 unit tests added.
2. **Task 2: Stage 0 + Stage 1 route wrappers** — `8cbdc3f` (feat).
3. **Task 3: End-to-end verification + 76-VALIDATION.md** — **STILL DEFERRED** after a Round-2 resume attempt (2026-05-07 with `phase-76-verified` user approval). Resume-executor could not reach the live DB: Supabase MCP tools are not bound to the subagent's tool list, `psql` is absent from `$PATH`, no `web/.env.local` exists in this worktree, and the repo isn't linked to a Vercel project. Per orchestrator `<auth>` instruction, the executor stopped without guessing credentials and instead pre-staged the three synthetic Strategy-A INSERTs (with deterministic `result.test_marker` tags), the loader-shape verification SELECTs, and the cleanup DELETE — all appended to 76-VALIDATION.md so a follow-up agent with MCP binding can execute the live-DB pass in one minute.

Out-of-band:
- `bf6e256` (chore) — log pre-existing safety-review-loader vitest failures to `deferred-items.md`.

## Files Created/Modified

- `web/middleware.ts` — added `resolveReviewRedirect` pure helper + redirect short-circuit at the top of the proxy handler, before the Supabase session check.
- `web/__tests__/middleware-review-redirect.test.ts` — new — 8 vitest cases covering all four redirect cases + passthrough + open-redirect threat.
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` — new — re-exports `default` and `dynamic` from `../review/page`.
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` — new — wrapper with `loadSwarm` gate, PageHeader, StageTabStrip currentStage=0, deferred-surface copy.
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md` — appended `## Phase 76 Validation Results — Plan 76-08 (executor pass)` section A–F.
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/deferred-items.md` — logged 22 pre-existing vitest failures in `safety-review-loader.test.ts`.

## Decisions Made

- **Re-export vs wrapper for /stage-1:** Picked re-export per plan option A. Lower churn; review/page.tsx already renders its own page chrome and wrapping would duplicate it. The `<h1>{swarm.display_name} — Bulk Review</h1>` heading reads cleanly as the Stage 1 surface.
- **Stage 0 link target:** Originally drafted with a `Link` to `/review?tab=safety`, then removed — the new middleware 308-redirects that URL onto /stage-0, creating an infinite redirect loop. Replaced with a static copy block.
- **Redirect ordering in middleware:** Placed BEFORE the Supabase `getUser()` call. Redirects have no auth dependency and the redirected target re-enters middleware on the next request, where it is gated normally.
- **Pure-helper extraction:** Pulled `resolveReviewRedirect` out of the middleware default export so vitest can test it directly without instantiating the Next.js Edge runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stage 0 link would have caused an infinite redirect loop**
- **Found during:** Task 2 (drafting Stage 0 placeholder)
- **Issue:** Initial Stage 0 wrapper linked back to `/automations/<swarm>/review?tab=safety` as "Open existing Safety Review queue". With the Task 1 middleware live, that URL 308s onto `/stage-0` — clicking the link would loop the operator infinitely.
- **Fix:** Removed the link; replaced with a static copy block stating the dedicated Stage 0 surface is deferred to a follow-up phase (consistent with CONTEXT.md D-04 REVISED).
- **Files modified:** `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx`
- **Verification:** Visual review of file; link tag removed; no remaining `Link` import.
- **Committed in:** `8cbdc3f` (Task 2 commit; the bug only existed during draft and was fixed before commit).

---

**Total deviations:** 1 auto-fixed (Rule 1 bug, caught pre-commit).
**Impact on plan:** No scope creep. Plan executed essentially as written.

## Issues Encountered

- **22 pre-existing vitest failures** in `app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` (`TypeError: admin.schema is not a function`). Root cause: mocked admin client fixture predates the Phase 71-08 `email_pipeline` schema accessor. Out of scope for Plan 76-08 (file untouched by this plan; failure pattern unrelated). Logged to `deferred-items.md` and committed (`bf6e256`).
- **Live-DB verification paused.** Per orchestrator instruction + Auto Mode rule 5, Task 3 (sections C/D of 76-VALIDATION.md) was not executed. The work plan, including the three trigger fixtures, target tables, and cleanup approach, is documented in 76-VALIDATION.md so the human-verify pass can proceed once approved.

## Live-DB Verification Plan (Task 3 — awaiting user approval)

When the user authorizes, the verifier should:

1. **Insert one synthetic email** into `email_pipeline.emails` with `source_id` set to a fresh test message id, `swarm_type='debtor-email'`, isolated test mailbox, subject prefixed `[PHASE-76 TEST]`. Repeat for each of the three triggers (`no_handler`, `low_confidence`, `handler_error`).
2. **For `handler_error`:** temporarily mis-set `OUTLOOK_API_BASE` (or equivalent) so the invoice-copy handler raises; restore env var immediately after capture.
3. **Observe** Stage 3 / Stage 4 Kanban surfaces refresh via Realtime within ~2s; capture commit shas and screenshots.
4. **Run operator actions** (Close, Replay same-intent, Replay edited-intent, Reclassify-as-noise) on the resulting Kanban rows; observe `pipeline_events` writes per Plan 05.
5. **Cleanup:** `DELETE` the inserted `email_pipeline.emails` rows + their `automation_runs` + `pipeline_events` rows by message id. Do NOT delete production data.

Resume signal: `phase-76-verified`.

## User Setup Required

None — no external service configuration required for Tasks 1+2.

For Task 3 the user must (a) confirm authorization to write synthetic rows to the production Supabase project and (b) be prepared to revert any temporary env-var change made for the `handler_error` trigger.

## Next Phase Readiness

- Phase 76 code is feature-complete pending live-DB verification.
- Operator bookmarks for `/review`, `?tab=safety`, `?tab=pending` keep working via 308 redirects.
- Phase 78 (sales-email onboarding) prerequisite — registry-only insert path — unaffected by this plan; cross-swarm sanity grep deferred to live verification pass.

## Self-Check: PASSED

- ✅ `web/middleware.ts` — modified (commit `afaab2e`)
- ✅ `web/__tests__/middleware-review-redirect.test.ts` — created (commit `afaab2e`)
- ✅ `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` — created (commit `8cbdc3f`)
- ✅ `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` — created (commit `8cbdc3f`)
- ✅ `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md` — modified (this commit)
- ✅ Commits `afaab2e`, `8cbdc3f`, `bf6e256` present in `git log --oneline`

---
*Phase: 76-stage-3-kanban-human-lane-wiring*
*Completed: 2026-05-07 (Tasks 1+2 only; Task 3 paused pending user approval)*
