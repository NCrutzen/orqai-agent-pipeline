---
phase: 66-pipeline-consolidation-retire-triage-path
plan: 02
subsystem: inngest / debtor-email
tags: [refactor, directory-move, import-rewrite, dead-code-delete]
requirements: [CONS-02]
key-files:
  moved:
    - from: web/lib/automations/debtor-email/triage/agent-runs.ts
      to:   web/lib/automations/debtor-email/coordinator/agent-runs.ts
    - from: web/lib/automations/debtor-email/triage/invoke-intent.ts
      to:   web/lib/automations/debtor-email/coordinator/invoke-intent.ts
    - from: web/lib/automations/debtor-email/triage/types.ts
      to:   web/lib/automations/debtor-email/coordinator/types.ts
    - from: web/lib/automations/debtor-email/triage/detect-emotion.ts
      to:   web/lib/automations/debtor-email/coordinator/detect-emotion.ts
    - from: web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts
      to:   web/lib/automations/debtor-email/coordinator/__tests__/idempotency-cache-v2.test.ts
    - from: web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts
      to:   web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts
    - from: web/lib/automations/debtor-email/triage/__tests__/types-v2.test.ts
      to:   web/lib/automations/debtor-email/coordinator/__tests__/types-v2.test.ts
  deleted:
    - web/lib/automations/debtor-email/triage/circuit-breaker.ts
    - web/lib/automations/debtor-email/triage/invoke-body.ts
    - web/lib/automations/debtor-email/triage/  (now-empty directory)
  modified:
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
    - web/lib/automations/debtor-email/coordinator/orchestrator-types.ts
    - web/lib/automations/debtor-email/coordinator/escalation-gate.ts
    - web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts
    - web/lib/automations/debtor-email/handlers/output-adapter.ts
    - web/lib/automations/debtor-email/handlers/__tests__/output-adapter.test.ts
    - web/tests/labeling/classifier-invoice-copy-handler.test.ts
metrics:
  tasks_completed: 2
  commits: 3
  duration: ~7 min
  files_moved: 7
  files_deleted: 2
  import_sites_rewritten: 10
---

# Phase 66 Plan 02: Move triage helpers → coordinator/, delete dead files (Summary)

Mechanical directory move per CONS-02 / CONTEXT D-02 + D-06. Four live
helpers moved into the existing `coordinator/` directory, two dead-by-grep
files deleted, and ten external import sites rewritten so the codebase
no longer references the `triage/` namespace.

## Tasks Completed

| #   | Task                                                                                        | Status |
| --- | ------------------------------------------------------------------------------------------- | ------ |
| 2.1 | Verify dead-file claims, then move 4 live helpers + delete 2 dead helpers                   | done   |
| 2.2 | Rewrite the (planned 8 / actual 10) external import sites                                   | done   |

## Commits

| Hash      | Message                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `d29ce88` | refactor(66.02): move triage helpers to coordinator/, delete 2 dead files |
| `e820f78` | refactor(66.02): rewrite triage/* imports to coordinator/*               |
| (pending) | docs(66.02): summary                                                     |

## Pre-Move Grep Evidence (zero-importer proof for the 2 deletions)

Both greps run before any file was touched:

```
$ grep -rn "circuit-breaker\|circuitBreaker" web/ --include="*.ts" --include="*.tsx" \
    | grep -v ".next/" | grep -v "triage/circuit-breaker.ts"
(zero lines)

$ grep -rn "invokeBodyAgent\|invoke-body" web/ --include="*.ts" --include="*.tsx" \
    | grep -v ".next/" | grep -v "triage/invoke-body.ts"
(zero lines)
```

Both files had zero importers anywhere in `web/` outside themselves —
safe to delete per CONTEXT D-06 (no shims, no deprecation markers, git
history is the audit trail).

## Per-File Move Log

Source files (4 — `git mv`, history preserved):

| From                                       | To                                              |
| ------------------------------------------ | ----------------------------------------------- |
| `triage/agent-runs.ts`                     | `coordinator/agent-runs.ts`                     |
| `triage/invoke-intent.ts`                  | `coordinator/invoke-intent.ts`                  |
| `triage/types.ts`                          | `coordinator/types.ts`                          |
| `triage/detect-emotion.ts`                 | `coordinator/detect-emotion.ts`                 |

Test files (3 — `git mv`, all use `../<x>` relative imports so paths
remained valid post-move):

| From                                                  | To                                                       |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `triage/__tests__/idempotency-cache-v2.test.ts`       | `coordinator/__tests__/idempotency-cache-v2.test.ts`     |
| `triage/__tests__/invoke-intent-v2.test.ts`           | `coordinator/__tests__/invoke-intent-v2.test.ts`         |
| `triage/__tests__/types-v2.test.ts`                   | `coordinator/__tests__/types-v2.test.ts`                 |

Deletes (2 — `git rm`):

| File                          | Reason                  |
| ----------------------------- | ----------------------- |
| `triage/circuit-breaker.ts`   | zero importers verified |
| `triage/invoke-body.ts`       | zero importers verified |

Directory state: `web/lib/automations/debtor-email/triage/` no longer
exists (`rmdir` was a no-op since `git mv` + `git rm` had already
emptied it; commit removed the parent silently).

## Import-Site Rewrite Log

Plan RESEARCH § Triage Directory Inventory enumerated 8 external sites.
Actual scope was **10 files** — RESEARCH missed two `../triage/`
relative-imports inside the coordinator/ subtree itself, which became
dangling once Task 2.1's `git mv` emptied triage/. Auto-fixed under
Rule 3 (blocking issue — tsc would have failed without these).

| File                                                                                  | Lines touched | Pattern applied                                |
| ------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- |
| `web/lib/inngest/functions/debtor-email-coordinator.ts`                               | 22, 28, 32    | `@/.../triage/*` → `@/.../coordinator/*`       |
| `web/lib/inngest/functions/classifier-invoice-copy-handler.ts`                        | 31, 37        | `@/.../triage/*` → `@/.../coordinator/*`       |
| `web/lib/automations/debtor-email/coordinator/orchestrator-types.ts`                  | 3             | `@/.../triage/types` → `./types`               |
| `web/lib/automations/debtor-email/coordinator/escalation-gate.ts`                     | 11 (extra)    | `../triage/types` → `./types`                  |
| `web/lib/automations/debtor-email/handlers/output-adapter.ts`                         | 7             | `@/.../triage/types` → `@/.../coordinator/types` |
| `web/lib/automations/debtor-email/handlers/__tests__/output-adapter.test.ts`          | 7             | same                                           |
| `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts`                | 9, 75, 83     | `@/.../triage/*` (incl. vi.mock paths) → `@/.../coordinator/*` |
| `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts`         | 31            | `@/.../triage/detect-emotion` (vi.mock) → `@/.../coordinator/detect-emotion` |
| `web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts`      | 7 (extra)     | `../../triage/types` → `../types`              |
| `web/tests/labeling/classifier-invoice-copy-handler.test.ts`                          | 98            | `@/.../triage/detect-emotion` (vi.mock) → `@/.../coordinator/detect-emotion` |

## Verification

```
$ grep -rn "@/lib/automations/debtor-email/triage" web/ --include="*.ts" --include="*.tsx" | grep -v ".next/"
(0 lines)

$ grep -rn '"\.\./triage/' web/ --include="*.ts"
(0 lines)

$ test -d web/lib/automations/debtor-email/triage && echo PRESENT || echo ABSENT
ABSENT

$ ls web/lib/automations/debtor-email/coordinator/
__tests__/
agent-runs.ts                 (moved)
coordinator-complete.ts       (Phase 65, untouched)
detect-emotion.ts             (moved)
escalation-gate.ts            (Phase 65, import rewritten)
invoke-intent.ts              (moved)
orchestrator-types.ts         (Phase 65, import rewritten)
synthesis-types.ts            (Phase 65, untouched)
types.ts                      (moved)

$ cd web && ./node_modules/.bin/tsc --noEmit
(exit 0)

$ cd web && ./node_modules/.bin/vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts \
                                            lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts \
                                            lib/automations/debtor-email/coordinator/__tests__ \
                                            lib/automations/debtor-email/handlers/__tests__/output-adapter.test.ts \
                                            tests/labeling/classifier-invoice-copy-handler.test.ts
Test Files: 9 passed (9)
Tests:      39 passed (39)
```

All plan-66.02-touched test files green. Full-suite tsc clean.

## Deviations from Plan

### Rule 3 (auto-fix blocking issue): 2 extra import sites

**Found during:** Task 2.2.
**Issue:** RESEARCH § Triage Directory Inventory listed 8 external
import sites, but two `../triage/types` relative imports living *inside*
`coordinator/` itself (the destination directory) were missed:
  - `coordinator/escalation-gate.ts:11` → `import type { IntentAgentOutputV2 } from "../triage/types"`
  - `coordinator/__tests__/escalation-gate.test.ts:7` → `import type { IntentAgentOutputV2 } from "../../triage/types"`

These broke the build the moment Task 2.1's `git mv` emptied `triage/`.

**Fix:** rewrote both to relative-within-coordinator paths
(`./types` and `../types` respectively) — same approach used for
`orchestrator-types.ts` (a third coordinator-internal site that
RESEARCH did catch).

**Files modified:** 2 extra (10 total, vs planned 8).
**Commit:** `e820f78`.
**Rule:** Rule 3 — blocking issue caused by Task 2.1's directory move.

## Out-of-Scope Failures (Deferred)

Full vitest run produced 13 pre-existing failures across 4 test files
unrelated to plan 66-02. Verified pre-existing by stash-based baseline
run on commit `bf518b9` (Phase 66.01 head, before any 66.02 changes):

| Test file                                                                                                 | Failures | Cause (not 66.02-related)                 |
| --------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| `tests/labeling/orq-agents-client.test.ts`                                                                | 3        | pre-existing on baseline                  |
| `lib/pipeline/__tests__/stages.test.ts`                                                                   | 4        | pre-existing on baseline                  |
| `lib/v7/graph/__tests__/layout.test.ts`                                                                   | 1        | pre-existing on baseline                  |
| `app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts`                       | 5        | pre-existing on baseline (`.in is not a function` mock chain mismatch) |

None of these touch coordinator/, triage/, handlers/, or the import
paths rewritten in this plan. Per executor scope-boundary rule
(deviation_rules § SCOPE BOUNDARY), out-of-scope; not addressed in
plan 66-02. They predate Phase 66 entirely.

## Behavioural Preservation Audit

- All four moved helpers retained file contents verbatim (`git log
  --stat` shows pure-rename diffs at the move commit; all in-file
  edits happened in the import-rewrite commit only on the *importers*,
  not on the moved files).
- Phase 65's `step.run`-wrapped `run_id` (commit `dd2583a`) and
  `inngest.send` typed-cast pattern (commit `dae6276`) remain unchanged
  inside `debtor-email-coordinator.ts` — the only edits to that file
  were three import lines.
- Trigger event `{ event: "debtor/email.received" }` (line 58 of
  coordinator) untouched per plan — Plan 03 owns the retarget.
- `events.ts` untouched per plan — Plan 03 owns the event-catalogue
  edit.

## Next Steps

- **Plan 03:** retarget the trigger event from `debtor/email.received`
  to `debtor-email/coordinator.requested`; emit it from
  `classifier-label-resolver`; sync the test's synthetic emit at line ~104.
- **Plan 04:** docs (`docs/debtor-email-pipeline-architecture.md`,
  `docs/agentic-pipeline/stage-3-coordinator.md`).
- **Plan 05:** static-audit grep for `debtor-email-triage` /
  `debtorEmailTriage` / `triage/` import paths across the entire repo
  (must hit 0 — already passing today).

## Self-Check: PASSED

- `web/lib/automations/debtor-email/coordinator/agent-runs.ts` — FOUND
- `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` — FOUND
- `web/lib/automations/debtor-email/coordinator/types.ts` — FOUND
- `web/lib/automations/debtor-email/coordinator/detect-emotion.ts` — FOUND
- `web/lib/automations/debtor-email/triage/` — ABSENT (correct)
- `web/lib/automations/debtor-email/triage/circuit-breaker.ts` — ABSENT (correct)
- `web/lib/automations/debtor-email/triage/invoke-body.ts` — ABSENT (correct)
- Commits `d29ce88`, `e820f78` — both in `git log`
- `grep -rn "@/lib/automations/debtor-email/triage" web/ --include="*.ts" --include="*.tsx" | grep -v ".next/"` returns 0 lines
- `cd web && tsc --noEmit` exits 0
