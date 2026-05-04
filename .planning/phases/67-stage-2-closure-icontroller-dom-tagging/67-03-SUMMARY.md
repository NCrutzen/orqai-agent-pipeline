---
phase: 67
plan: 03
subsystem: debtor-email-labeling
tags: [browserless, icontroller, select2, brand-mismatch, R-04, D-05]
requires: [67-01, 67-02]
provides:
  - filled-in labelEmailInIcontroller (no more TODO(probe-artifact))
  - LabelEmailStatus union with 'brand_mismatch' (5 variants)
  - MAILBOX_BRAND_PATTERNS + matchesExpectedBrand helpers
  - Vitest coverage of four-step DOM dance + R-04 defenses
affects:
  - web/lib/automations/debtor-email/label-email-in-icontroller.ts
  - web/lib/automations/debtor-email/mailboxes.ts
  - web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts
tech-stack:
  added: []
  patterns: [select2-typeahead, brand-suffix-defensive-layer, mocked-page-vitest]
key-files:
  created: []
  modified:
    - web/lib/automations/debtor-email/label-email-in-icontroller.ts
    - web/lib/automations/debtor-email/mailboxes.ts
    - web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts
decisions:
  - Used regex map MAILBOX_BRAND_PATTERNS keyed by labeling_settings.entity slug (not by source_mailbox). Unmapped entities fail brand-check (defensive default).
  - Highlighted-result click is the only Save action — Select2 onSelect auto-saves (per SELECTORS.md operator confirmation 2026-04-29).
  - Brand-mismatch path captures a screenshot labeled "brand-mismatch" before bailing, satisfies T-67-06 repudiation mitigation.
metrics:
  duration: ~10m
  completed: 2026-05-04
  tasks: 3
  files: 3
---

# Phase 67 Plan 03: Wave-2 Fill-in (iController Label DOM Selectors) Summary

Wave 2 of Phase 67 closes Stage-2 by replacing the four `TODO(probe-artifact)` blocks in `label-email-in-icontroller.ts` with the production-verified Select2 typeahead flow from `SELECTORS.md` lines 65-125, plus the brand-mismatch defensive layer (R-04 mandatory) from lines 142-184. Adds the `MAILBOX_BRAND_PATTERNS` regex map + `matchesExpectedBrand` helper to `mailboxes.ts`, and fills the Wave-0 vitest scaffold with 4 mocked-Page tests covering labeled / brand-mismatch / selection-not-stuck / already-labeled paths.

## Tasks

| Task | Name                                            | Commit    | Files                                                                                                  |
| ---- | ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| 1    | Add MAILBOX_BRAND_PATTERNS to mailboxes.ts      | `2e6d4d7` | `web/lib/automations/debtor-email/mailboxes.ts`                                                        |
| 2    | Paste iController DOM selectors + R-04 defense  | `5412384` | `web/lib/automations/debtor-email/label-email-in-icontroller.ts`                                       |
| 3    | Cover label module with mocked-Page vitest      | `fd941f9` | `web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts`                        |

## Verification

### `tsc --noEmit`

```
$ cd web && npx tsc --noEmit
(exit 0; no output)
```

### `vitest run` for label module test

```
$ cd web && npx vitest run lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts
 RUN  v4.1.0 /Users/nickcrutzen/Developer/agent-workforce/web

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  720ms
```

All 4 tests pass:
- clicks trigger, types customer_id, then clicks highlighted result
- returns 'brand_mismatch' WITHOUT clicking highlighted on suffix mismatch
- returns 'failed' with SELECTION_DID_NOT_STICK when after-text is "None selected"
- returns 'already_labeled' WITHOUT opening picker when widget already shows target

### Before/after grep — `TODO(probe-artifact)` removed

Before:
```
$ git show 7df759a:web/lib/automations/debtor-email/label-email-in-icontroller.ts | grep -c "TODO(probe-artifact)"
2
```

After:
```
$ grep -c "TODO(probe-artifact)" web/lib/automations/debtor-email/label-email-in-icontroller.ts
0
```

### Plan acceptance criteria (must_haves.truths)

- [x] No `TODO(probe-artifact)` comments remain in label-email-in-icontroller.ts (grep returns 0)
- [x] LabelEmailStatus union includes 'brand_mismatch' as a fifth value
- [x] MAILBOX_BRAND_PATTERNS constant exists in mailboxes.ts mapping each entity to a regex
- [x] The Select2 typeahead flow per SELECTORS.md lines 65-125 is the body of labelEmailInIcontroller

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` blocks were faithful, type-checked, and the verification commands all passed first try (after switching `--reporter=basic` to the default reporter, since vitest 4.x removed the `basic` reporter; this is a verification-tooling adjustment, not a code deviation).

## Decisions Made

1. **MAILBOX_BRAND_PATTERNS keys = entity slugs, not mailbox addresses.** The plan's text matched this — `labeling_settings.entity` is the value passed in. Unmapped entity → `matchesExpectedBrand` returns false → brand-mismatch fires defensively.
2. **No Save button click.** Per SELECTORS.md operator-verified note: Select2 `onSelect` auto-saves. Module clicks highlighted result and waits 800ms for the widget text to update.
3. **`captureScreenshot` on brand-mismatch and selection-not-stuck paths** so operators can audit which result was about to be clicked / what the widget looked like when it failed (T-67-06 repudiation mitigation).

## Self-Check: PASSED

- FOUND: web/lib/automations/debtor-email/label-email-in-icontroller.ts (modified)
- FOUND: web/lib/automations/debtor-email/mailboxes.ts (modified)
- FOUND: web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts (modified)
- FOUND: commit 2e6d4d7 (Task 1)
- FOUND: commit 5412384 (Task 2)
- FOUND: commit fd941f9 (Task 3)
