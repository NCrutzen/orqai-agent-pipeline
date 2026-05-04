---
phase: 67
slug: stage-2-closure-icontroller-dom-tagging
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 67 — Validation Strategy

> Source: `67-RESEARCH.md` § Validation Architecture (line 386).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && pnpm exec vitest run lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts lib/inngest/functions/__tests__/classifier-label-resolver.test.ts lib/automations/icontroller/__tests__/url.test.ts` |
| **Full suite command** | `cd web && pnpm exec vitest run` |
| **Estimated runtime** | ~30s quick / ~120s full |

---

## Sampling Rate

- **After every task commit:** quick command (tagger + label-resolver + url helper).
- **After every wave merge:** full suite + static-audit grep.
- **Before `/gsd-verify-work`:** full suite green + acceptance e2e smoke (Browserless run on acceptance iController) + production smoke (one matched-customer email tagged after smeba `dry_run=false` flip).
- **Max feedback latency:** 30s quick / 120s full.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 67-00-XX | 00 (probe re-run) | 0 | TAG-01 | manual | acceptance Browserless run; selectors.json captured | ❌ W0 (acceptance run) | ⬜ pending |
| 67-01-XX | 01 (migration) | 1 | TAG-02, TAG-03 | static | `grep -c "icontroller_tag_status" supabase/migrations/20260504*.sql` ≥ 1 | ❌ W0 (migration file) | ⬜ pending |
| 67-01-XX | 01 | 1 | TAG-02 | static | applied migration: `select column_name from information_schema.columns where table_schema='debtor' and table_name='email_labels' and column_name='icontroller_tag_status'` returns 1 row | ❌ W0 | ⬜ pending |
| 67-02-XX | 02 (URL helper) | 2 | TAG-01 | unit | `vitest run lib/automations/icontroller/__tests__/url.test.ts` exits 0; helper produces correct mailbox-list URL for smeba acceptance + production environments | ❌ W0 (helper + test) | ⬜ pending |
| 67-03-XX | 03 (selectors paste) | 2 | TAG-01 | static | `! grep -rn "TODO(probe-artifact)" web/lib/automations/debtor-email/label-email-in-icontroller.ts` (expect 0 lines) | ❌ W0 (paste from probe artifact) | ⬜ pending |
| 67-03-XX | 03 | 2 | TAG-01 | unit | `vitest run lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts` — mocked Browserless page asserts the four DOM steps fire in order | ❌ W0 (test added) | ⬜ pending |
| 67-04-XX | 04 (label-resolver second emit) | 3 | TAG-01 | unit | `vitest run lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` — assert second `inngest.send` call with `{ name: "debtor-email/icontroller-tag.requested", data: { …extended payload } }` AND assert it's only emitted when `dry_run=false` AND `customer_account_id` non-null | ✅ (extends Phase 66's test) | ⬜ pending |
| 67-04-XX | 04 | 3 | TAG-01 | static | `grep -c "debtor-email/icontroller-tag.requested" web/lib/inngest/events.ts web/lib/inngest/functions/classifier-label-resolver.ts web/lib/inngest/functions/debtor-email-icontroller-tagger.ts` ≥ 3 | ❌ W0 | ⬜ pending |
| 67-05-XX | 05 (tagger function) | 3 | TAG-01, TAG-02, TAG-03 | unit | `vitest run lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts` — mock Browserless + Supabase admin; assert: success path UPDATEs `icontroller_tag_status='tagged'` + screenshots; brand-mismatch path UPDATEs `'failed'` with brand_mismatch error; Browserless throw path UPDATEs `'failed'` with error text; tagger never re-throws (Inngest run stays green) | ❌ W0 (test added) | ⬜ pending |
| 67-05-XX | 05 | 3 | TAG-02 | static | `grep -A 30 "createFunction" web/lib/inngest/functions/debtor-email-icontroller-tagger.ts \| grep -E "retries: 1\|concurrency"` returns expected lines | ❌ W0 | ⬜ pending |
| 67-05-XX | 05 | 3 | TAG-02 | static | `grep -c "debtorEmailIcontrollerTagger" web/app/api/inngest/route.ts` ≥ 2 (import + array entry) | ❌ W0 | ⬜ pending |
| 67-06-XX | 06 (Bulk Review badge) | 4 | TAG-03 | manual + static | grep finds the JOIN-by-`email_id` enrichment in `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (or its `loadPageData` site); UI renders badge for `icontroller_tag_status='failed'` rows; visual confirm in dev | ❌ W0 (page edit) | ⬜ pending |
| 67-07-XX | 07 (e2e smoke) | 5 | TAG-01, TAG-02, TAG-03 | manual integration | acceptance Browserless run: emit one synthetic event for an acceptance email_id, observe `email_labels.icontroller_tag_status` transition `pending → tagged`, screenshots populated, before/after captured | ❌ W0 (regression report) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Acceptance probe run** — `ICONTROLLER_ENV=acceptance pnpm tsx web/lib/automations/debtor-email/probe-label-ui.ts` against acceptance iController; capture fresh `selectors.json` to confirm DOM hasn't drifted since 2026-04-29 production walkthrough. If selectors match the existing `SELECTORS.md`, proceed; if drift detected, update `SELECTORS.md` first and reflect in Plan 03.
- [ ] **Migration file** — `supabase/migrations/20260504a_email_labels_icontroller_tag_status.sql` (letter suffix per project convention).
- [ ] **URL helper test scaffold** — `web/lib/automations/icontroller/__tests__/url.test.ts` with fixture mailboxes (smeba, sicli-noord, berki) covering acceptance + production envs.
- [ ] **Tagger function test scaffold** — `web/lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts` with Browserless mock + Supabase admin mock.
- [ ] **Label-email module test scaffold** — `web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts` with mocked Playwright page asserting the 4-step DOM dance.
- [ ] **Acceptance regression report** — `67-regression-report.md` template (adapted from Phase 66's structure).
- [ ] **No new framework install** — Vitest + playwright-core both present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end acceptance smoke | TAG-01, TAG-02, TAG-03 | Requires acceptance iController auth + Browserless + Supabase Storage | (1) Verify acceptance probe run captured fresh selectors. (2) Pick an acceptance email row with a known matched-customer. (3) Manually emit `debtor-email/icontroller-tag.requested` for it (via Inngest dashboard or cli). (4) Observe `email_labels.icontroller_tag_status` transition `pending → tagged`. (5) Open both `screenshot_before_url` and `screenshot_after_url` to confirm tagging is visible. (6) Capture results in `67-regression-report.md`. |
| First production live-mode flip | TAG-01 | Requires operator approval to flip `labeling_settings.dry_run=false` on a real entity | (1) Operator picks a low-risk window. (2) Flip `labeling_settings.dry_run=false` for `debiteuren@smeba.nl` only. (3) Watch Inngest dashboard for the first matched-customer event firing the new tagger. (4) Verify `icontroller_tag_status='tagged'` on the row + screenshots populated. (5) Visually confirm in iController web UI that the email is now under the matched customer account. (6) Roll back via `dry_run=true` if anything looks wrong. |
| Brand-mismatch defense | TAG-01 | Requires constructing a synthetic event where the typeahead would match a cross-brand customer | Inject a synthetic event with `customer_account_id` from a different brand; verify the tagger UPDATEs `'failed'` with `error LIKE '%brand_mismatch%'` and does NOT click confirm. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers MISSING refs (migration, helper test, tagger test, label module test, regression template)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s quick / 120s full
- [ ] `nyquist_compliant: true` set in frontmatter (after planner approval)

**Approval:** pending
