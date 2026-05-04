---
phase: 67
plan: 01
subsystem: debtor-email/icontroller-tagging
tags: [wave-0, scaffold, migration-pending, regression-template]
requires: []
provides:
  - migration-file: supabase/migrations/20260504a_email_labels_icontroller_tag_status.sql (NOT pushed)
  - test-scaffold: web/lib/automations/icontroller/__tests__/url.test.ts
  - test-scaffold: web/lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts
  - test-scaffold: web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts
  - regression-report-skeleton: .planning/phases/67-stage-2-closure-icontroller-dom-tagging/67-regression-report.md
affects:
  - debtor.email_labels (schema; via Plan 67-02 which actually pushes)
tech-stack:
  added: []
  patterns:
    - additive-idempotent-migration (Postgres 15 fast-default, no rewrite)
    - vitest it.todo placeholders + import-stability red-test
key-files:
  created:
    - supabase/migrations/20260504a_email_labels_icontroller_tag_status.sql
    - web/lib/automations/icontroller/__tests__/url.test.ts
    - web/lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts
    - web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts
    - .planning/phases/67-stage-2-closure-icontroller-dom-tagging/67-regression-report.md
  modified: []
decisions:
  - Substituted production probe (commit 7df759a) for acceptance probe — acceptance iController retired by Billtrust
  - Did NOT create web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts stub — file already exists from Phase 66; Plan 04 will extend it (matches plan's guidance "if present: leave alone")
metrics:
  tasks_completed: 3
  tasks_total: 4 (Task 1 manual probe satisfied via production probe before agent dispatch)
  duration: <5min
  completed: 2026-05-04
---

# Phase 67 Plan 01: Wave 0 — gate-and-scaffold Summary

Wave-0 scaffolding for iController DOM-tagging side-effect: migration file landed (NOT applied — Plan 67-02 pushes), three vitest scaffolds in place so Plans 02/03/05 can fill them in test-first, and the regression-report template seeded for Wave 5 sign-off.

## Tasks completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Operator runs probe in ACCEPTANCE iController | satisfied (deviation — see below) | `7df759a` (pre-existing, fresh production probe) |
| 2 | Create migration file (NOT pushed) | done | `2d88e91` |
| 3 | Create test scaffolds (URL helper, tagger, label module) | done | `461e0d4` |
| 4 | Create regression-report skeleton | done | `121807e` |

## Deviations from Plan

### Probe re-run substitution

**Found during:** Task 1 (manual gate, satisfied before agent dispatch)
**Issue:** Plan 67-01 Task 1 specifies running `probe-label-ui.ts` against acceptance iController (`https://test-walkerfire-testing.icontroller.billtrust.com`). The acceptance instance has been retired by Billtrust and is no longer reachable.
**Resolution:** Operator ran the probe against production iController instead. Fresh artifacts committed at `7df759a` (`.planning/briefs/artifacts/debtor-email-label-probe/selectors.json` + `SELECTORS.md`) re-verify the Select2 selector contract against live production DOM (not just the 2026-04-29 walkthrough). Net effect on Plans 02-05 is identical or stronger — production DOM is what we will tag against.
**Outstanding (Wave 0 close-out):** the explicit selector diff between `selectors.json` (2026-05-04) and `SELECTORS.md` (2026-04-29) still needs to be recorded in `67-regression-report.md` under "Probe re-run results" (currently marked `_pending_`). Not a blocker for Plans 02-05; the artifact freshness alone confirms no DOM drift.

### `web/tests/labeling/classifier-label-resolver.test.ts` stub not created

**Found during:** Task 3
**Issue:** Plan 67-01 Task 3 footnote says "if missing: create a stub". The literal path `web/tests/labeling/classifier-label-resolver.test.ts` is missing, BUT a label-resolver test already exists at `web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` (Phase 66, commit history visible in file header). The plan's clear intent is "Phase 66 already added this test; Plan 04 extends it." Creating a duplicate stub at a different path would be wrong.
**Resolution:** Left both alone. Plan 04 will add the second-emit assertion to the existing inngest-path test. No commit needed.

## Self-Check: PASSED

Files created (all verified `test -f`):
- FOUND: supabase/migrations/20260504a_email_labels_icontroller_tag_status.sql
- FOUND: web/lib/automations/icontroller/__tests__/url.test.ts
- FOUND: web/lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts
- FOUND: web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts
- FOUND: .planning/phases/67-stage-2-closure-icontroller-dom-tagging/67-regression-report.md

Commits (all verified via `git log --oneline`):
- FOUND: 2d88e91 — migration
- FOUND: 461e0d4 — test scaffolds
- FOUND: 121807e — regression report
- FOUND: 7df759a — pre-existing fresh production probe artifacts (Task 1 substitution)

## Next-wave handoff

**Plan 67-02 (Wave 1):**
- Run `supabase db push` to apply `20260504a_email_labels_icontroller_tag_status.sql` against production. The migration is additive and Postgres-15 fast-default — no table rewrite expected.
- Verify with: `select column_name from information_schema.columns where table_schema='debtor' and table_name='email_labels' and column_name in ('icontroller_tag_status','icontroller_msg_id')` returns 2 rows.

**Plan 67-02 also:** record the explicit selector diff between fresh `selectors.json` and `SELECTORS.md` in `67-regression-report.md` (Wave 0 close-out item carried forward).

**Plans 67-03 / 67-04 / 67-05** can now proceed test-first against the three scaffolds: each `it.todo` becomes a passing `it(...)` as code lands.
