---
phase: 66-pipeline-consolidation-retire-triage-path
plan: 01
subsystem: inngest / debtor-email
tags: [refactor, rename, inngest]
requirements: [CONS-02]
key-files:
  modified:
    - web/app/api/inngest/route.ts
  renamed:
    - from: web/lib/inngest/functions/debtor-email-triage.ts
      to:   web/lib/inngest/functions/debtor-email-coordinator.ts
    - from: web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts
      to:   web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
metrics:
  tasks_completed: 3
  commits: 6
  duration: ~3 min
---

# Phase 66 Plan 01: Rename debtor-email-triage → debtor-email-coordinator (Summary)

Mechanical Inngest function rename per CONS-02 / CONTEXT D-01. Three task surfaces renamed in lock-step (file + function id + exported const + route registration + colocated test) with all behavioural code (Phase 65 replay-safe `step.run`-wrapped run_id, `inngest.send`-binding-safe cast pattern, trigger event line, intra-package `triage/*` imports) preserved verbatim.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1.1 | Rename source file + function id + exported const | done |
| 1.2 | Update `route.ts` import + functions[] entry | done |
| 1.3 | Rename colocated test file + update symbol-level refs | done |

## Commits

| Hash | Message |
|------|---------|
| `edfecfd` | refactor(66.01): rename debtor-email-triage → debtor-email-coordinator (git mv) |
| `1fb5092` | refactor(66.01): update function id + const name in coordinator file |
| `58d6029` | refactor(66.01): wire renamed coordinator into inngest route |
| `0f88a12` | refactor(66.01): rename coordinator test file (git mv) |
| `461c971` | refactor(66.01): update symbol references inside renamed test file |
| (pending) | docs(66.01): summary |

> Note: each `git mv` produced a pure-rename commit (zero insertions/deletions because the index moved before the in-file edits were staged). The follow-up commit on each pair carries the symbol-level edits. Both halves of each rename should be read together — they form one logical task per the plan.

## Verification

- `grep -q 'id: "automations/debtor-email-coordinator"' web/lib/inngest/functions/debtor-email-coordinator.ts` → match
- `grep -q "export const debtorEmailCoordinator" web/lib/inngest/functions/debtor-email-coordinator.ts` → match
- `grep "debtorEmailTriage\|debtor-email-triage" web/lib/inngest/functions/debtor-email-coordinator.ts` → 0 matches (header comment was rephrased to avoid the literal old name)
- `grep "debtorEmailTriage\|debtor-email-triage" web/app/api/inngest/route.ts` → 0 matches
- `grep -c "debtorEmailCoordinator" web/app/api/inngest/route.ts` → 2 (import + functions[] entry)
- `grep "debtorEmailTriage" web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` → 0 matches
- `cd web && ./node_modules/.bin/vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` → 5/5 passed (834 ms)
- `cd web && ./node_modules/.bin/tsc --noEmit` → exit 0 (clean)

> The plan predicted tsc would still be red until Plan 02 lands; in fact the rename surface is internally consistent and tsc is green. Plan 02's directory move and Plan 03's trigger retarget will continue to keep tsc green throughout.

### Plan-level grep (RESEARCH § Inngest Rename Mechanics expectation)

```
grep -rn "debtor-email-triage\|debtorEmailTriage" web/lib/inngest/ --include="*.ts"
→ web/lib/inngest/functions/coordinator-orchestrator.ts:4:// debtor-email-triage when the escalation gate fires per CORD-02).
```

One match in a sibling file's comment (not a function-name literal import or symbol use). This file is owned by a different plan; the Plan 05 static audit will sweep stale comments at phase end. Zero hits on the function-name literals (function id / exported const / import path) anywhere in the inngest tree.

## Behavioural Preservation Audit

Per CLAUDE.md Inngest pitfalls (Phase 65 commits `dd2583a` + `dae6276`):

- `step.run("resolve-run-id", ...)` wrapper around `event.data.run_id ?? crypto.randomUUID()` → preserved verbatim (line 76-81 of new file).
- `(inngest.send as unknown as DynamicSend)({...})` cast pattern at single-shot dispatch (line 218) and orchestrator dispatch (line 260) → preserved verbatim. No `const send = inngest.send` introduced.
- Trigger event: `{ event: "debtor/email.received" }` (line 58) → untouched (Plan 03 retargets).
- `from "@/lib/automations/debtor-email/triage/..."` imports (3 occurrences) → untouched (Plan 02 owns directory move).
- JSDoc `*/` cron-glob hazard → N/A (no cron strings in this file).

## Deviations from Plan

None of substance. One incidental note:

- **[Mechanical] Header comment rephrased.** The plan's acceptance criterion "File contains zero occurrences of `debtorEmailTriage` or `debtor-email-triage`" required rewording the file-top history comment, which originally referenced the old function id literal. New comment text describes the rename without re-stating the old id. Behavioural impact: none.
- **[Process] Each rename split into two commits.** `git mv` followed by content-edit staging produced two atomic commits per task instead of one combined commit. Both still satisfy "commit each task atomically" — the rename diff and the symbol-edit diff are both clearly attributable to task 1.1 / 1.3. Documented above for traceability.

## Next Steps

- Plan 02: move `web/lib/automations/debtor-email/triage/*` → its target directory; rewrite the 3 import paths still pointing at `triage/` inside the renamed coordinator file (and the test file's mock-module paths).
- Plan 03: retarget the trigger event from `debtor/email.received` to `debtor-email/coordinator.requested`; sync the test's synthetic emit at line ~104.
- Plan 05: static-audit grep for `debtor-email-triage` / `debtorEmailTriage` across the entire repo (must hit 0).

## Self-Check: PASSED

- `web/lib/inngest/functions/debtor-email-coordinator.ts` — FOUND
- `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — FOUND
- `web/lib/inngest/functions/debtor-email-triage.ts` — absent (correct)
- `web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` — absent (correct)
- Commits `edfecfd`, `1fb5092`, `58d6029`, `0f88a12`, `461c971` — all in `git log`
