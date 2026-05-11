---
phase: 81
plan: 01
subsystem: debtor-email-ui
tags: [refactor, route-rename, stage-1, bulk-review]
requires:
  - "Phase 76 Plan 08 stage-keyed shell scaffold (re-export shim being removed here)"
  - "Phase 76 Plan 08 middleware /review → /stage-1 308 redirect (left untouched)"
provides:
  - "Single source of truth for the Stage 1 page at app/(dashboard)/automations/[swarm]/stage-1/page.tsx"
  - "Clean directory shape for Plans 02-04 to mutate without path-fix noise"
affects:
  - "Every test file under web/tests/queue/ that imported the old review/ alias"
  - "Self-aliased imports inside the moved __tests__ tree"
tech-stack:
  added: []
  patterns:
    - "git mv (not delete+add) so blame history follows the file through the rename"
    - "Mechanical refactor with hard-locked scope: zero behavior change, zero logic edits, only path move + import rewrite"
key-files:
  created: []
  modified:
    - "web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx (replaced 22-line re-export shim with the inlined 845-line page body)"
    - "web/tests/queue/detail-pane.test.tsx"
    - "web/tests/queue/race-cohort.test.tsx"
    - "web/tests/queue/keyboard-shortcuts.test.tsx"
    - "web/tests/queue/actions.test.ts"
    - "web/tests/queue/fetch-review-email-body.test.ts"
    - "web/tests/queue/rule-filter.test.tsx (NOT in plan inventory — Rule 3 inclusion)"
    - "web/tests/queue/page.test.tsx (NOT in plan inventory — Rule 3 inclusion)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts (self-alias rewrite)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/safety-review-loader.test.ts (self-alias rewrite)"
  renamed:
    - "web/app/(dashboard)/automations/[swarm]/review/* → web/app/(dashboard)/automations/[swarm]/stage-1/* (28 files via git mv)"
decisions:
  - "D-01 honored: review/ directory deleted, stage-1/ now holds the full tree"
  - "D-03 honored: middleware /review → /stage-1 308 redirect NOT touched; 11/11 redirect tests still pass"
  - "D-04 honored: re-export shim replaced with inlined page body — no backwards-compat shim left behind"
  - "D-19 honored: ${swarmType}-review realtime channel name preserved verbatim in the moved page.tsx"
  - "Scope boundary respected: QueueTree, the h1 \"Bulk Review\" string, the 3-col grid, and ?tab=pending branching all left exactly as-is for Plans 02/04 to own"
metrics:
  duration: "~5m"
  completed: 2026-05-11
---

# Phase 81 Plan 01: Move review/ into stage-1/ and inline the page Summary

One-line: Atomic rename of `web/app/(dashboard)/automations/[swarm]/review/` → `stage-1/` via `git mv`, inlined the 22-line re-export shim with the full 845-line page body, and rewrote every `review/` alias import in the test suite — zero behavior change, blame history preserved.

## What shipped

### Task 1 — Move review/ → stage-1/ verbatim and inline page.tsx
- Commit: `922f1a4`
- 28 files moved with `git mv` (12 visible siblings + `components/` 16 children + `__tests__/` 2 children + page.tsx)
- `stage-1/page.tsx` 22-line shim deleted, replaced by the 845-line body from `review/page.tsx` (relative imports already pointed at `./row-list`, `./detail-pane`, etc. — no edits needed to compile).
- `export const dynamic = "force-dynamic"` retained at the top.
- `${swarmType}-review` realtime channel name preserved (D-19 verified by grep).
- `review/` directory removed (`rmdir`); `test ! -d` passes.
- `git status` reported every move as R (rename), not D+A — blame history follows the file. `git log --follow` on `actions.ts` traverses cleanly across `922f1a4`.

### Task 2 — Rewrite alias imports
- Commit: `1253a57`
- 7 importer files rewritten as planned: detail-pane.test.tsx, race-cohort.test.tsx, keyboard-shortcuts.test.tsx, actions.test.ts, fetch-review-email-body.test.ts, plus the 2 self-aliased moved tests (load-page-data.test.ts, safety-review-loader.test.ts).
- **2 additional importers discovered and rewritten** (not in plan's <interfaces> inventory): `tests/queue/rule-filter.test.tsx` (3 mock paths) and `tests/queue/page.test.tsx` (8 references including `resolve(__dirname, …)` filesystem paths). Applied per deviation Rule 3 (blocking — without these the test files wouldn't import). See "Deviations" below.
- After rewrite, `rg -n 'automations/\[swarm\]/review'` returns only 4 hits, all intentional non-import references:
  - `web/middleware.ts:5` — comment documenting the legacy URL contract (the redirect itself is in `resolveReviewRedirect`, untouched).
  - `web/lib/swarms/__tests__/registry.test.ts:94` — `review_route: "/automations/[swarm]/review"` is a **data string** for a `SwarmRow` fixture, not an import. The `review_route` column is a registry config field; renaming it is out of scope for this plan.
  - `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:2` — header comment ("Original: …debtor-email-review/page.tsx") documenting the file's lineage.
  - `web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx:5` — `// Mirrors …/review/selection-context.tsx` doc comment.

### Task 3 — Smoke (verification-only, no commit)
- `__tests__/middleware-review-redirect.test.ts`: 11/11 green. D-03 confirmed intact.
- `tests/queue/`: 6/7 files pass cleanly. 1 assertion failure in `rule-filter.test.tsx` — see "Carry-forward failures" below.
- Moved `stage-1/__tests__/` suite: 5 passed / 7 failed — exactly the inherited Phase 71-08 `.schema()` failures explicitly allowed to carry forward per RESEARCH §Pitfall 4 + CONTEXT §Claude's Discretion. No new failures introduced by the path rewrite.
- `npx tsc --noEmit` scoped to `app/(dashboard)/automations/[swarm]/`: 0 source-level errors. (One `.next/types/validator.ts` complaint about `../review/page.js` appeared — that file is a gitignored Next.js build artifact that regenerates against `/stage-1/page.js` on the next build; not source code.)

## Deviations from Plan

### [Rule 3 — Blocking compile] Additional importers rewritten

**Found during:** Task 2 (the `rg` discovery step).

**Issue:** Plan §<interfaces> listed 7 external importer files. The actual `rg` sweep found 2 more files importing from `…/review/…` via the same alias pattern:
- `web/tests/queue/rule-filter.test.tsx` (3 `vi.doMock` paths at lines 38, 54, 71)
- `web/tests/queue/page.test.tsx` (8 references — 6 alias imports/mocks plus 2 `resolve(__dirname, "../../app/(dashboard)/automations/[swarm]/review/page.tsx")` filesystem paths used as fixture probes at lines 105 and 124)

Leaving these unrewritten would break test imports (blocking compile / blocking the test files from loading).

**Fix:** Same mechanical sed/perl substitution applied — `automations/[swarm]/review` → `automations/[swarm]/stage-1` across all hits. Filesystem `resolve()` paths follow the same rewrite (the page.tsx file now actually lives at that new path).

**Files modified:** `web/tests/queue/rule-filter.test.tsx`, `web/tests/queue/page.test.tsx`

**Commit:** `1253a57` (folded into the Task 2 commit since it's the same mechanical operation).

## Carry-forward failures (NOT introduced by this plan)

These failed BEFORE this plan and STILL fail after — explicitly allowed to carry forward.

1. **`stage-1/__tests__/safety-review-loader.test.ts`: 4 failures + `load-page-data.test.ts`: 3 failures** = 7 failures total. All trace to the same root cause: `admin.schema("email_pipeline").from("emails")` chain in the loader code (page.tsx line 659 and line 658 fetch paths) — a Phase 71-08 known issue. Plan 04 may revisit; out of scope here.

2. **`tests/queue/rule-filter.test.tsx`: 1 assertion failure** — `expect(onAr).toContainEqual(...)` doesn't match. Pre-existing logic-level test mismatch in the queue mock-call assertion, not a path-rewrite bug. On `main` before the move this same file failed to even load (importer pointed at the missing `review/page` re-export); after the rewrite the file loads and exposes the underlying assertion miss. Recording as carry-forward since the assertion behavior is not what this plan is designed to change.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. All STRIDE entries in the plan's <threat_model> remain `accept` — pure path move, no runtime data flow changes.

## Self-Check: PASSED

- `web/app/(dashboard)/automations/[swarm]/review/` directory: ABSENT (verified via `test ! -d`).
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx`: PRESENT, 845-line inlined body (no `export { default } from "../review/page"` line).
- `${swarmType}-review` channel name: PRESENT in `stage-1/page.tsx` (D-19).
- `export const dynamic = "force-dynamic"`: PRESENT in `stage-1/page.tsx`.
- All 11 sibling files + `components/` + `__tests__/` directories: PRESENT under `stage-1/`.
- Commit `922f1a4`: FOUND in `git log`.
- Commit `1253a57`: FOUND in `git log`.
- `git log --follow web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts`: traverses through `922f1a4` back to pre-rename history. PASS.
- `rg 'from ["\'].*automations/\[swarm\]/review' -- '*.ts' '*.tsx'`: 0 hits (only comment/data-string matches remain).
- `middleware-review-redirect.test.ts`: 11/11 green.
- `npx tsc --noEmit` on the route subtree: 0 source-level errors.
