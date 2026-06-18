---
phase: 132-forward-side-effect-bulk-review-v9-7-p2
plan: 01
subsystem: api
tags: [outlook, graph, inngest, dry-run-gate, info-routing, forward, tdd]

# Dependency graph
requires:
  - phase: 131-info-routing-stage3-routing
    provides: RoutingVerdict shape (bucket/brand/target_mailbox/dedup/unrouted) + info-routing-coordinator
  - phase: 117-outlook-intent-categories
    provides: AI_CATEGORY_PREFIX + buildIntentCategory/mergeIntentCategory strip-merge mechanics
  - phase: 110-visibility-foundation
    provides: DryRunConfig + per-stage dry-run gate module
provides:
  - "forwardMessage(mailbox,messageId,toMailbox,originalSender,comment?) — 2-call createForward→send Graph helper, never throws, sender-in-comment (no replyTo)"
  - "routing-category.ts — D-05 pinned AI: stamp-back vocabulary (buildRoutingCategory + mergeRoutingCategory strip-merge)"
  - "isForwardBucketReleased + DryRunConfig.stage_4_forward_buckets — per-bucket fail-closed RELEASE gate (inverse polarity)"
  - "Wave-0 RED scaffold for the Plan-02 forward worker (fire/skip/replay contract, no replyTo)"
  - "Live send-scope smoke result: send scope CONFIRMED; replyTo STRIPPED on send for the shared mailbox"
affects: [132-02-forward-worker, 134-v10-ambient-loop, bulk-review-forward-surface]

# Tech tracking
tech-stack:
  added: [tdd-guard-vitest (dev — feeds the tdd-guard hook test-result evidence)]
  patterns:
    - "Graph side-effect helper = 2-call draft flow via graphFetch (single conn-56014785 boundary), never throws"
    - "AI: category stamp-back vocabulary as a pure sibling of intent-category.ts sharing AI_CATEGORY_PREFIX"
    - "Per-bucket graduated-release gate with INVERSE polarity (TRUE=released) vs held-flags (TRUE=held), fail-closed"

key-files:
  created:
    - web/lib/outlook/routing-category.ts
    - web/lib/outlook/__tests__/routing-category.test.ts
    - web/lib/outlook/__tests__/forward-message.test.ts
    - web/lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts
    - web/lib/pipeline-gating/dry-run-gate/__tests__/forward-bucket-release.test.ts
  modified:
    - web/lib/outlook/client.ts
    - web/lib/pipeline-gating/dry-run-gate/index.ts
    - web/vitest.config.ts
    - web/package.json

key-decisions:
  - "D-01 sender-in-comment fallback: forwardMessage is a 2-call flow (NO replyTo PATCH) — Exchange strips replyTo on send for the shared info@ mailbox (2026-06-18 smoke); original sender carried in the forward comment"
  - "stage_4_forward_buckets uses INVERSE polarity (TRUE=released) vs the held-flags; read ONLY via isForwardBucketReleased, fail-closed default held (D-04)"
  - "Wired tdd-guard-vitest reporter into vitest.config (Rule 3): the tdd-guard hook had no test-result feed and was blocking every GREEN-phase edit"

patterns-established:
  - "Graph forward helper: createForward (message.toRecipients + comment only, never message.body) → send, both via graphFetch; non-ok → {success:false}, never throws"
  - "Routing stamp-back vocabulary pinned + tested (V10 ambient-loop contract for Phase 134)"
  - "Per-bucket release gate polarity pinned in JSDoc AND test to defuse the second-mental-model trap"

requirements-completed: [FWD-01, FWD-02, FWD-03, FWD-04, FWD-05, FWD-06, FWD-10]

# Metrics
duration: ~75min (incl. Task-1 live smoke checkpoint, resumed)
completed: 2026-06-18
---

# Phase 132 Plan 01: Forward leaf primitives + send-scope verification Summary

**forwardMessage 2-call Graph helper (sender-in-comment, replyTo stripped), D-05 routing-category stamp-back vocabulary, and the fail-closed per-bucket isForwardBucketReleased gate — the leaf units the Plan-02 forward worker imports, with live send scope confirmed.**

## Performance

- **Duration:** ~75 min (Task 1 ran as a BLOCKING live checkpoint on 2026-06-18, then resumed for Tasks 2–3)
- **Tasks:** 3 (Task 1 checkpoint already resolved before resume; Tasks 2 & 3 executed here)
- **Files modified:** 9 (4 source, 4 new tests, 1 smoke from Task 1)

## Accomplishments

- **Live send-scope confirmed** (Task 1 smoke, 2026-06-18): createForward=201, send=202, forward delivered AS info@ with the attachment carried. The single unproven runtime capability (RESEARCH A1) is now proven — the forward side-effect is viable.
- **replyTo limitation discovered & designed around:** Exchange STRIPS `replyTo` on send for the shared mailbox (verified on both Sent Items and the received copy, via a PATCH and via the createForward `message.replyTo` body). Operator-approved D-01 fallback: convey the original sender in the forward COMMENT.
- **forwardMessage** shipped as a 2-call flow (createForward → send) through `graphFetch`, never throws, 4 unit tests. NO replyTo PATCH (it is a silent no-op).
- **routing-category.ts** (D-05): pinned `AI:` stamp-back vocabulary + strip-merge, 6 unit tests.
- **isForwardBucketReleased** + `stage_4_forward_buckets` field: per-bucket, inverse-polarity, fail-closed release gate, 5 unit tests.
- **Wave-0 RED scaffold** for the Plan-02 worker: a `describe.todo` contract (fire/skip/replay-no-op) with NO replyTo assertions.

## Task Commits

1. **Task 1: live send-scope smoke** — `45cbc576` (feat) — committed pre-resume; checkpoint resolved by operator.
2. **Task 2: forwardMessage + routing-category + Wave-0 scaffold** — `7e8166b3` (feat) — incremental RED→GREEN per behaviour.
3. **Task 3: isForwardBucketReleased + stage_4_forward_buckets** — `74995331` (feat) — incremental RED→GREEN per case.

_Note: TDD discipline enforced by the tdd-guard hook — each function was driven stub→RED→GREEN one assertion at a time._

## Files Created/Modified

- `web/lib/outlook/client.ts` — added `forwardMessage` (2-call draft flow, sender-in-comment, never throws). OUTLOOK_CONNECTION_ID untouched (env-var fix lives on main PR #112).
- `web/lib/outlook/routing-category.ts` — D-05 `buildRoutingCategory` + `mergeRoutingCategory`, re-exports `AI_CATEGORY_PREFIX`.
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — `stage_4_forward_buckets` field + `isForwardBucketReleased` helper.
- `web/lib/outlook/__tests__/forward-message.test.ts` — 4 tests (no replyTo assertions).
- `web/lib/outlook/__tests__/routing-category.test.ts` — 6 tests.
- `web/lib/pipeline-gating/dry-run-gate/__tests__/forward-bucket-release.test.ts` — 5 tests.
- `web/lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts` — Wave-0 RED scaffold (todo).
- `web/vitest.config.ts`, `web/package.json`, `web/package-lock.json` — tdd-guard-vitest reporter (tooling fix).

## Decisions Made

- **D-01 sender-in-comment fallback** (operator-approved): the original 3-call spec (createForward → PATCH replyTo → send) is reduced to 2 calls. The replyTo PATCH is OMITTED because Exchange strips replyTo on send for the shared info@ mailbox. The original sender is carried in the forward comment: `"Doorgestuurd via info-routing — oorspronkelijke afzender: <sender>."`.
- **Inverse-polarity release gate:** `stage_4_forward_buckets` value TRUE = RELEASED (live forward), FALSE/MISSING = HELD. This is the opposite of every other DryRunConfig flag, so the polarity is pinned in both JSDoc and test. Default held (D-04); per-bucket opt-in is the graduated-release mechanism (D-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired the tdd-guard-vitest reporter into the vitest config**
- **Found during:** Task 2 (first forwardMessage implementation edit)
- **Issue:** The repo has the global `tdd-guard` plugin hook enabled, but no `tdd-guard-vitest` reporter was installed or wired into `web/vitest.config.ts`. The hook reads test results from `<repoRoot>/.claude/tdd-guard/data/test.json`, which never existed — so the guard had ZERO test-result evidence and blocked EVERY implementation edit as "no failing test output provided," even immediately after a real failing `npx vitest` run. This made GREEN-phase implementation impossible.
- **Fix:** `npm install -D tdd-guard-vitest@0.2.0` and added `new VitestReporter({ projectRoot: repoRoot })` to `test.reporters` in vitest.config.ts (repoRoot = one level above `web/`, where the guard's data dir lives). After wiring, the reporter writes RED/GREEN state to the repo-root data dir and the guard correctly gated each cycle.
- **Files modified:** web/vitest.config.ts, web/package.json, web/package-lock.json
- **Verification:** `.claude/tdd-guard/data/test.json` now written on each run; guard accepted implementation after a confirmed RED. All 24 tests green.
- **Committed in:** 7e8166b3 (Task 2 commit)

**2. [Spec deviation - D-01, operator-approved] forwardMessage is a 2-call flow, not the original 3-call spec**
- **Found during:** Task 1 (live send-scope smoke, pre-resume)
- **Issue:** The original PLAN spec called for createForward → PATCH replyTo → send so a reply from the department box would address the original sender. The smoke proved Exchange strips replyTo on send for the shared mailbox — the PATCH is a silent no-op.
- **Fix:** Dropped the replyTo PATCH; convey the original sender in the forward comment instead. The plan file `132-01-PLAN.md` was already revised to reflect this before resume; the implementation + tests match the revised spec (no replyTo behaviour asserted anywhere, incl. the Wave-0 scaffold).
- **Files modified:** web/lib/outlook/client.ts (+ tests)
- **Verification:** Live smoke (createForward=201, send=202, delivered as info@ with attachment); replyTo absence verified on both sent + received copies.
- **Committed in:** 7e8166b3 (Task 2 commit); smoke in 45cbc576.

---

**Total deviations:** 2 (1 Rule-3 blocking tooling fix, 1 operator-approved spec deviation surfaced by the BLOCKING checkpoint).
**Impact on plan:** Both necessary. The tooling fix unblocked TDD execution; the 2-call deviation is the locked D-01 design the rest of Phase 132 builds on. No scope creep — the connection literal was NOT touched (per the critical constraint; env-var fix lives on main PR #112).

## Issues Encountered

- The tdd-guard hook initially rejected the full `forwardMessage` implementation 4 times in a row. Root cause was the missing reporter (above), not a TDD-discipline error. Once the reporter was wired and a real RED was recorded, the stub→RED→GREEN cycle proceeded cleanly.
- The `tdd-guard-vitest` `VitestReporter` constructor takes an options object `{ projectRoot }`, not a positional path string — a positional string is silently ignored and the reporter defaults to `web/.claude/...` (wrong dir). Corrected to `{ projectRoot: repoRoot }`.

## Threat Flags

None — no new security surface beyond the threat model. The forward side-effect (outbound, irreversible) is gated fail-closed by `isForwardBucketReleased` (T-132-03 mitigated). The smoke is arg-guarded (T-132-01). No new packages at runtime (the only add is a dev-only test reporter).

## User Setup Required

None — no external service configuration. (The `stage_4_forward_buckets` seed migration + per-bucket go-live flip is Plan 02/03 work.)

## Next Phase Readiness

- **Plan 02 (forward worker)** has all three leaf primitives ready: `forwardMessage`, `mergeRoutingCategory`, `isForwardBucketReleased`, plus the RED `describe.todo` scaffold naming the exact fire/skip/replay-no-op contract to turn green.
- **Send scope confirmed** — no fallback to single-shot `/forward` needed.
- **Pin for Plan 02:** the worker must call `forwardMessage` with `originalSender` = the inbound sender (carried in the comment), assert NO replyTo behaviour, and gate the live forward behind `isForwardBucketReleased(swarm, bucket)`.

## Self-Check: PASSED

- All 6 created/modified files verified present on disk.
- Both task commits (7e8166b3, 74995331) verified in git log.
- Full plan verification: 24 tests green (4 forward-message, 6 routing-category, 14 dry-run-gate); `tsc --noEmit` 0 errors; OUTLOOK_CONNECTION_ID literal untouched in the committed diff.

---
*Phase: 132-forward-side-effect-bulk-review-v9-7-p2*
*Completed: 2026-06-18*
