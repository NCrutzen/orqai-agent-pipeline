---
phase: 121-attachment-borne-identifier-extraction
plan: 02
subsystem: attachment-extraction
tags: [attachments, xlsx, csv, exceljs, stage-2, corroboration, security]
requires:
  - "116-05 attachment text → Stage 2 body_text fold (extracted-status branch)"
  - "exceljs@^4.4.0 (already in package.json + lockfile)"
  - "scoreCorroboration (Phase 120) + number back-search distinctRoots guard (engine, unedited)"
provides:
  - "extractAttachment .xlsx branch (exceljs, string-only, capped, fail-soft, UNTRUSTED-fenced)"
  - "extractAttachment text/csv + application/csv branch"
  - "358-distinct-root corroboration-demotion proof (verify-first many-customer guard)"
affects:
  - "web/lib/automations/attachments/extract.ts"
  - "scripts/no-engine-diff-check.sh (donor re-baselined to post-123)"
tech-stack:
  added: [tdd-guard-vitest@^0.2.0]
  patterns:
    - "lazy await import(\"exceljs\") (serverless cold-start posture)"
    - "defensive exceljs cell→string coercion mirroring uren-controle/excel-parser.ts"
    - "early in-loop char cap (no full-string materialisation) for DoS safety"
key-files:
  created:
    - web/lib/agentic-pipeline/resolve/__tests__/corroborate-many-customer.test.ts
  modified:
    - web/lib/automations/attachments/extract.ts
    - web/lib/automations/attachments/__tests__/extract.test.ts
    - web/vitest.config.ts
    - scripts/no-engine-diff-check.sh
    - .gitignore
    - web/package.json
decisions:
  - "many-customer guard = STRUCTURAL, no new adapter-side code (verify-first proof passed)"
  - "no-engine-diff donor re-baselined b831e3f6 (post-120) → b816c627 (post-123) — the 120+123 merge legitimately evolved engine.ts; 121-02 itself adds zero engine diff"
  - "stage-2-customer-resolver.ts NOT touched"
metrics:
  duration: ~14m
  completed: 2026-06-18
---

# Phase 121 Plan 02: xlsx/csv Attachment Extraction + Many-Customer Guard Summary

Adds swarm-agnostic `.xlsx` (exceljs) and `text/csv` content-type branches to the
pure `extractAttachment` service so spreadsheet/CSV identifiers fold into the Stage 2
body via the existing 116-05 path — engine byte-identical — and PROVES (verify-first)
that a ~358-distinct-root spreadsheet cannot land a confident-single AUTO.

## What was built

- **`.xlsx` branch** (`extract.ts`): lazy `await import("exceljs")`, `wb.xlsx.load(bytes)`,
  walk sheets/rows, coerce each cell to a string defensively (string/number/boolean/Date/
  `{formula,result}`→`result ?? formula ?? ""`), join non-empty cells with `,` and rows
  with `\n`. Routes through the existing `wrapUntrusted` + `maxExtractedChars` output cap.
- **`text/csv` + `application/csv` branch**: UTF-8 decode through the same wrap+cap path.
- **Security mitigations** (all verified by unit tests):
  - T-121-01 (decompression bomb / corrupt): `maxSizeBytes` pre-parse cap (unchanged) +
    whole parse+walk in `try/catch` → `extraction_failed`, never throws (D-03).
  - T-121-02 (oversized sheet OOM): EARLY in-loop projected-length cap → `skipped_cap`
    with empty text the moment the budget would be exceeded; no full-string materialisation.
  - T-121-03 (formula injection / DDE): cell values read as strings only, formula cells
    coerced to their cached `result`, never evaluated, never `[object Object]`.
  - T-121-05 (prompt injection): reuses the 116 WR-01 posture — extracted text wrapped in
    `UNTRUSTED_ATTACHMENT_OPEN/CLOSE` and folded under the untrusted-data label.
- **Verify-first many-customer proof** (`corroborate-many-customer.test.ts`): drives a
  358-distinct-customer signal set (≥2 distinct kinds) through the unedited
  `scoreCorroboration` → disagreement demote → `confidence !== "high"` (medium),
  `reason = "demote: disagreement"`. Documents the engine-tier number back-search
  `distinctRoots !== 1 → null` fail-closed (identifier-match.ts:240) as the second guard.

## Many-customer guard decision (explicit)

**STRUCTURAL — sufficient. NO new adapter-side guard built.** The verify-first proof
passed against the unedited `corroborate.ts`: a 358-distinct-root flood demotes below AUTO
via the disagreement path, and the number back-search fails closed on ≥2 distinct roots.
Per RESEARCH Pattern 2 (verify-then-build) the gap is already closed by existing structure,
so `stage-2-customer-resolver.ts` was **not touched** and no `nxtRequest`/`/api/*/search`
call was introduced.

## No-engine-diff gate (STAGE2-01)

`./scripts/no-engine-diff-check.sh` → **PASS — STAGE2-01 holds**, exit 0. engine.ts /
config.ts / steps/* are byte-identical to the donor; `web/lib/swarms/dynamic.ts` unchanged.

The donor baseline was **re-pointed from `b831e3f6` (post-120) to `b816c627` (post-123)**.
This is a Rule 3 blocking-issue fix, not a 121-02 engine change: when Phase 120 + 123 were
merged into this workspace from origin/main (commit `631ec6d9`), engine.ts and
sender-match.ts legitimately gained the Phase 123 `resolve_candidates` sender_match rewire
and the corroboration collect-path no-op tiebreaker. Against the stale post-120 donor the
gate correctly reported that drift; against the merged-in post-123 engine the gate confirms
121-02 introduces ZERO further engine diff (`git diff HEAD` on engine/config/steps/dynamic
is empty — only `extract.ts` changed). Follows the documented 120-04 re-baseline precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TDD-guard reporter was not wired → guard blocked all GREEN edits**
- **Found during:** Task 1 (first implementation edit)
- **Issue:** The project's `vitest.config.ts` had no `tdd-guard-vitest` reporter and the
  reporter package was not installed, so the PreToolUse TDD guard had zero RED/GREEN
  evidence (`.claude/tdd-guard/data/test.json` never written) and fail-closed-blocked every
  implementation edit — even with a genuinely failing test present.
- **Fix:** Installed `tdd-guard-vitest@^0.2.0` (the guard-authored reporter matching the
  installed tdd-guard plugin v1.3.0) and wired it into `vitest.config.ts` with
  `projectRoot` = workspace root (where `.claude/tdd-guard/data` lives). Added the guard's
  runtime data dir to `.gitignore`.
- **Files modified:** `web/vitest.config.ts`, `web/package.json`, `web/package-lock.json`, `.gitignore`
- **Commit:** 35bc3b6e
- **Consequence:** Tasks then executed strict one-test-at-a-time RED→GREEN (a stricter but
  plan-compatible variant of Task 0's "write all RED tests at once").

**2. [Rule 3 - Blocking] no-engine-diff donor baseline stale after 120+123 merge**
- **Found during:** Task 2 (running the STAGE2-01 gate)
- **Issue:** Gate FAILed reporting engine.ts drift vs donor `b831e3f6`; the drift was
  entirely the Phase 123 merge (resolve_candidates sender_match + no-op tiebreaker), not a
  121-02 change.
- **Fix:** Re-baselined the donor default to `b816c627` (post-123 engine tip). `git diff HEAD`
  on all engine/config/steps/dynamic files is empty for 121-02.
- **Files modified:** `scripts/no-engine-diff-check.sh`
- **Commit:** ca810e1e

## Verification results

- `npx vitest run` (both 121-02 files) → 27 passed.
- `npx vitest run` (full suite) → 2756 passed, 0 failed (22 files skipped, no regression).
- `npx tsc --noEmit` → clean (0 errors).
- `./scripts/no-engine-diff-check.sh` → PASS, exit 0.
- `grep -nE "=== '(sales|debtor)" extract.ts` → no match (swarm-agnostic, ATID-03).
- `grep -c "spreadsheetml.sheet" extract.ts` → 1 (xlsx constant present).
- `git diff HEAD` on engine/config/steps/dynamic → empty (ATID-02 / STAGE2-01).

## Known Stubs

None. The xlsx/csv branches are fully wired into the existing fold; no placeholder data.

## Commits

- 35bc3b6e — test(121-02): xlsx/csv extraction + many-customer demotion tests + TDD-guard reporter
- 62685a1a — feat(121-02): exceljs .xlsx + text/csv branches in extractAttachment (#24)
- ca810e1e — chore(121-02): re-baseline no-engine-diff donor to post-123 (b816c627)

## Self-Check: PASSED

- All created/modified files exist on disk.
- All three commits (35bc3b6e, 62685a1a, ca810e1e) present in git history.
