# Phase 67 — Regression Report

**Status:** in-progress
**Last updated:** 2026-05-04

---

## Probe re-run results (Wave 0)

- [x] Probe run completed (production probe substituted for acceptance — see deviation note in 67-01-SUMMARY.md)
- Run timestamp: 2026-05-04 (artifacts committed at `7df759a`)
- Acceptance host (planned): https://test-walkerfire-testing.icontroller.billtrust.com
- Actual host used: production iController (acceptance instance retired by Billtrust per operator)
- Selector diff vs. production SELECTORS.md (2026-04-29): _pending — fill in after diffing fresh `selectors.json` vs. SELECTORS.md_
- GO / NO-GO for Plan 03: _pending_

## Acceptance e2e smoke (Wave 5)

- [ ] Synthetic emit of `debtor-email/icontroller-tag.requested` for an acceptance email_id
- email_label_id: TBD
- email_labels.icontroller_tag_status transition observed: TBD (expect pending → tagged)
- screenshot_before_url: TBD
- screenshot_after_url: TBD

## Production smoke — first mailbox flip (Wave 5)

- [ ] Operator approval to flip labeling_settings.dry_run=false for debiteuren@smeba.nl
- Window: TBD
- First matched-customer email tagged: TBD (email_label_id)
- Visual confirmation in iController web UI: TBD
- Rollback executed (dry_run=true again): N/A or TBD

## Brand-mismatch defense

- [ ] Synthetic event with cross-brand customer_account_id
- Result: TBD (expect icontroller_tag_status='failed' with error LIKE 'brand_mismatch:%')

## Sign-off

- [ ] All TAG-01/02/03 success criteria observed in acceptance
- [ ] All TAG-01/02/03 success criteria observed in production (smeba)
- Operator: ___________________
- Date: ___________________
