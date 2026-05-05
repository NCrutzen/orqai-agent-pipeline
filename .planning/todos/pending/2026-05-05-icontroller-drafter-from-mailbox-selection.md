---
title: Fix iController drafter From-mailbox selection
created: 2026-05-05
area: automation
priority: high
related_phase: 69
---

# Fix iController drafter From-mailbox selection

## Problem

`web/lib/automations/debtor-email/drafter.ts:370-393` (`clickSaveAsDraft`) clicks **Save as draft** in iController's reply composer without first picking a From mailbox. iController now blocks the save with a `Selecteer een item in de lijst` validation popover on the From dropdown.

Every direct invoice-copy dispatch (operator override in Bulk Review → invoice-copy-handler → create-draft) returns `create-draft failed: save_failed`. Surfaced 2026-05-04 during Phase 69 production verification when the body agent succeeded but iController draft creation died at the From-selection gate.

The April 23 attempt also failed at iController (`message_not_found` reason then; UI behaviour may have changed since), so this surface has been intermittently broken for a while — it just rarely got exercised because operator overrides into invoice_copy_request are infrequent.

## Fix

Add a `selectFromMailbox(page, icontroller_company)` step BEFORE `clickSaveAsDraft(page)` in `drafter.ts`.

Mapping source: `debtor.labeling_settings.icontroller_company` carries the right value already (e.g. `smebabrandbeveiliging` for `debiteuren@smeba.nl`). Pass it through `CreateDraftInput` from the route → drafter, or look it up inside the drafter from the `entity` field that's already in scope.

## Implementation steps

1. **DOM probe** on iController's reply composer (production, `https://my.icontroller.eu` or wherever the live tenant lives) to confirm the From `<select>` selector + the option-text/value format.
   - Expected: a `<select name="..." />` or similar near the "From" label in the composer header.
   - Capture screenshot of the composer with the dropdown open showing the option labels — needed to write the mapping table.

2. **Mapping table**: build a `ICONTROLLER_COMPANY_TO_DROPDOWN_LABEL` dict (or similar) from `icontroller_company` → option visible label.
   - For `smebabrandbeveiliging` likely matches "Smeba Brandbeveiliging BV" or similar.
   - Other entities (`smebabrandbeveiliging-fire`, `sicli-noord`, `sicli-sud`, `berki`) need probing too.

3. **Add `selectFromMailbox` function** in `drafter.ts`:
   ```ts
   async function selectFromMailbox(page: Page, icontrollerCompany: string): Promise<void> {
     const expectedLabel = ICONTROLLER_COMPANY_TO_DROPDOWN_LABEL[icontrollerCompany];
     if (!expectedLabel) {
       throw new Error(`No iController From-mailbox mapping for company=${icontrollerCompany}`);
     }
     // selector + selectOption call once DOM is probed
     // …
   }
   ```

4. **Wire it in** before `clickSaveAsDraft(page)` in the main flow (around line 396+).

5. **Plumb `icontrollerCompany` through `CreateDraftInput`** so the drafter has access to it — currently it's only in `labeling_settings`, not passed forward.

6. **Test on a non-production scenario** before shipping. Wrong selector silently breaks ALL drafts in production. Options:
   - iController acceptance environment if one exists (drafter already supports `IControllerEnv` switching).
   - One-off manual smoke run on a real but disposable email row before declaring done.

## Acceptance criteria

- For Phase 69's test row (`3949cc35-0583-4714-a730-c57085f3f2c9`, smeba), re-firing the invoice-copy dispatch produces `automation_runs.status='completed'` with a draft visible in iController's drafts list — From field correctly populated.
- All five Benelux brands' `icontroller_company` values have a mapped From option.
- Existing handler tests still green; new test mocks `selectFromMailbox`.

## Context references

- `memory/project_icontroller_drafter_from_mailbox.md` — same finding from yesterday's session.
- `.planning/STATE.md` — last-session note.
- Phase 69 verification commits: `c57b24f` (last) chains back to `0fb9b23` and `e5b44f5` for the broader handler hardening done while debugging.
- Original blocking error captured in `automation_runs.error_message='create-draft failed: save_failed'` for `automation_run_id='e09a8e6a-12f0-4499-a4f9-2c42b4fef0a5'`.
