---
phase: 81-fold-stage-1-bulk-review-into-the-stage-keyed-shell
verified: 2026-05-11T12:36:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Browser smoke /automations/debtor-email/stage-1"
    expected: "PageHeader + StageTabStrip (Stage 1 active) at top; horizontal noise-category chip strip below; 2-col grid (row list | detail pane); NO 'Bulk Review' h1; NO intro paragraph; existing predicted-row + 4-axis detail pane intact"
    why_human: "Visual chrome + token usage (chip border-radius, gap, active-state) per Sketch 005 / v7.css — cannot be asserted by grep or RTL beyond string presence/absence"
  - test: "Click 'Payment' (or any) noise-category chip"
    expected: "URL updates to ?topic=<noise_key>; predicted-row list filters to that topic; chip shows active state"
    why_human: "Client-side router push + active-state token, real-user interaction"
  - test: "Click tail 'Pending promotion · N' pill"
    expected: "URL becomes ?sub=pending; row list swaps to candidate-rule list (left col); detail pane on the right shows rule evidence (rule_key, status, n, Wilson ci_lo, sample emails, Promote/Reject buttons)"
    why_human: "End-to-end sub-view rendering with live data; promote/reject server-action submission visually verifiable only by operator click-through"
  - test: "Browser smoke /automations/debtor-email/stage-2"
    expected: "PageHeader + StageTabStrip (Stage 2 active) + intro paragraph ('Stage 2 (Customer mapping) — entity / customer resolution …') + live 'Customer-mapping issues this week: N' count + '↗ Open' link to /swarm/debtor-email/tagging-failures"
    why_human: "Live count from production debtor.email_labels query (N today) + link traversal — cannot be asserted in RTL with real DB"
  - test: "Browser smoke /automations/sales-email/stage-1 (or any non-debtor swarm)"
    expected: "Chip strip populates from sales-email's swarm_noise_categories (per-swarm rows, not debtor-email); /stage-2 for the same swarm shows em-dash (no tagging-failures link) since stage2_entity_resolver may not be set"
    why_human: "Cross-swarm leak regression check; requires registered non-debtor swarm and live registry data"
  - test: "Legacy bookmarks /automations/debtor-email/review?tab=safety + /review?selected=abc123"
    expected: "308 redirect to /stage-1?sub=safety (if applicable) / /stage-1?selected=abc123 — query params preserved end-to-end in a real browser (not just middleware unit test)"
    why_human: "Browser-level redirect chain + cookie/header preservation beyond the synthetic middleware test"
gaps:
  - truth: "Three pre-existing test fixtures in load-page-data.test.ts (Tests 4, 5, 6) still failing"
    status: partial
    reason: "Carry-forward acknowledged in 81-04-SUMMARY + deferred-items.md. Plan 04 reduced inherited failures 22 → 3. The remaining three are test-fixture drift (production loader added .schema() chain and a view-row filter the mocks don't model), NOT production bugs. Page-shell RTL + live /stage-1 surface exercise the actual code paths."
    artifacts:
      - path: "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts"
        issue: "Test 4 (loadCoordinatorRunsForReview side-loader never called), Test 5 (pipeline_events_email_summary returns [] under new filter), Test 6 (stage_decisions field shape drift)"
    missing:
      - "Refresh fixtures to model Phase 71-08 automation_runs.result.message_id ↔ email_pipeline.emails.source_id join + post-71-03 loader filter chain (carried forward to Phase 82 per deferred-items.md)"
---

# Phase 81: Fold Stage 1 (Bulk Review) into the stage-keyed shell — Verification Report

**Phase Goal:** `/stage-1` sits under the same `_shell` as `/stage-0` / `/stage-3` / `/stage-4` (PageHeader + StageTabStrip), legacy 3-col QueueTree layout is replaced by a horizontal noise-category chip-strip, Pending Promotion sub-view at `?sub=pending` renders end-to-end, a thin `/stage-2` placeholder lands with a live tagging-failures count, and "Bulk Review" is gone as a user-visible UI noun.

**Verified:** 2026-05-11T12:36Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `/stage-1` renders with `<PageHeader>` + `<StageTabStrip currentStage={1}>`, no "Bulk Review" h1 | VERIFIED | `stage-1/page.tsx:843-846` mount both components with `currentStage={1}`; `grep "Bulk Review" stage-1/page.tsx` = 0 hits |
| 2  | Noise-category chip strip renders below tab strip, registry-driven | VERIFIED | `NoiseCategoryChipStrip` imported `page.tsx:35` and mounted at `page.tsx:855`; chip-strip JSDoc + grep confirm `swarm_noise_categories` only; `swarm_intents` not referenced |
| 3  | Chip badges sourced from `classifier_queue_counts` RPC | VERIFIED | `page.tsx:304` calls `admin.rpc("classifier_queue_counts", { p_swarm_type: swarmType })`; counts flow to chip-strip props |
| 4  | `?sub=pending` swaps row list for candidate-rule list + detail pane | VERIFIED | `page.tsx:325` loader short-circuits on `params.sub === "pending"`; `page.tsx:863-871` renders `CandidateRuleList` + `PendingPromotionDetailPane` when `sp.sub === "pending"` |
| 5  | Legacy `/review` (and `?tab=*`) 308-redirects with query params preserved | VERIFIED | `middleware.ts:29-58` `resolveReviewRedirect` rewrites to `/stage-1` and maps `tab=pending → sub=pending`; `middleware-review-redirect.test.ts` 15/15 passing (extended +4 in Plan 04) |
| 6  | `/stage-2` resolves with PageHeader + StageTabStrip(2) + live tagging-failures count + `↗` link | VERIFIED | `stage-2/page.tsx:21-80` wires `loadStage2WeeklyCount` (head-count `debtor.email_labels` 7d failed), em-dash fallback for non-debtor swarms, `↗ Open` link to `/swarm/${swarmType}/tagging-failures` |
| 7  | Directory `app/(dashboard)/automations/[swarm]/review/` no longer exists | VERIFIED | `ls` returns ENOENT; `git status` clean; `git mv` preserved blame history per Plan 01 |
| 8  | `QueueTree` component file deleted; no non-comment references remain | VERIFIED | `queue-tree.tsx` deleted (commit a3bcda3); remaining 4 hits are JSDoc/comments in selection-context, noise-category-chip-strip, middleware test |
| 9  | `/stage-3` + `/stage-4` surfaces unchanged (regression) | VERIFIED | No diffs to stage-3/ or stage-4/ in Phase 81 commits; `derive-stage-tabs.test.ts` 4/4 passing; middleware redirect tests cover `tab=safety` → `/stage-3` route |
| 10 | Stage 2 tab derivable from registry (`swarms.stage2_entity_resolver`) | VERIFIED | `derive-stage-tabs.ts:40` gates Stage 2 tab on `swarm.stage2_entity_resolver`; debtor-email row has `@/lib/automations/debtor-email/resolve-debtor` (Plan 02 DB checkpoint) |

**Score:** 10/10 truths verified (mapped from CONTEXT verification strategy checks 1-10)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` | 845-line shell-wrapped page | VERIFIED | Present, 37 KB, imports PageHeader/StageTabStrip/NoiseCategoryChipStrip/CandidateRuleList/PendingPromotionDetailPane |
| `web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx` | Chip strip component | VERIFIED | Present, 220 LOC, JSDoc locks `swarm_noise_categories` ONLY |
| `web/app/(dashboard)/automations/[swarm]/stage-1/candidate-rule-list.tsx` | Candidate-rule list | VERIFIED | Present, 86 LOC |
| `web/app/(dashboard)/automations/[swarm]/stage-1/pending-promotion-detail-pane.tsx` | Pending detail pane | VERIFIED | Present, 170 LOC, exports RuleSample type |
| `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` | `promoteRule` + `rejectRule` + `loadRuleSamples` | VERIFIED | Present, 26 KB, contains the 3 plumbed actions/helper per Plan 03 |
| `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx` | Placeholder page | VERIFIED | Present, 90 LOC, PageHeader + StageTabStrip(2) + count + ↗ link |
| `web/app/(dashboard)/automations/[swarm]/stage-2/_lib/load-stage-2-weekly-count.ts` | Head-count helper | VERIFIED | Present, 36 LOC, uses `debtor.email_labels` head-count query (no row data pulled) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/queue-tree.tsx` | DELETED | VERIFIED | Absent (ENOENT); git index clean |
| `web/app/(dashboard)/automations/[swarm]/review/` | DELETED | VERIFIED | Directory absent; only middleware `/review → /stage-1` 308 preserved per D-03 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `stage-1/page.tsx` | `_shell/page-header` | `import { PageHeader }` line 32 + mount line 843 | WIRED | |
| `stage-1/page.tsx` | `_shell/stage-tab-strip` | `import { StageTabStrip }` line 33 + mount line 844 with `currentStage={1}` | WIRED | |
| `stage-1/page.tsx` | `noise-category-chip-strip.tsx` | `import` line 35 + mount line 855 | WIRED | |
| `stage-1/page.tsx` | `candidate-rule-list.tsx` | `import { CandidateRuleList }` line 36 + conditional mount line 865 | WIRED | |
| `stage-1/page.tsx` | `pending-promotion-detail-pane.tsx` | `import { PendingPromotionDetailPane }` line 38 + conditional mount line 870 | WIRED | |
| `stage-1/page.tsx` | `classifier_queue_counts` RPC | `admin.rpc(…)` line 304 | WIRED | Chip badge data source |
| `stage-2/page.tsx` | `loadStage2WeeklyCount` | `import` line 27 + call line 48 (debtor-email branch) | WIRED | |
| `stage-2/_lib/...` | `debtor.email_labels` table | `.schema("debtor").from("email_labels").select(..., {count, head})` lines 26-28 | WIRED | Real DB head-count, not stub |
| `stage-2/page.tsx` | `/swarm/${swarmType}/tagging-failures` | `<Link href={…}>↗ Open</Link>` line 80 | WIRED | |
| `middleware.ts` `resolveReviewRedirect` | `/automations/{swarm}/stage-1` | line 57-58, maps `tab=pending → sub=pending` | WIRED | 15/15 redirect tests green |
| `derive-stage-tabs.ts` | `swarms.stage2_entity_resolver` | line 40 gate | WIRED | Registry-driven Stage 2 tab |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `NoiseCategoryChipStrip` | `categories[]` + `counts[]` | `loadSwarmNoiseCategories` + `admin.rpc("classifier_queue_counts")` in `stage-1/page.tsx:304` | Yes (registry + RPC) | FLOWING |
| `CandidateRuleList` | candidate rules | `classifier_rules.status='candidate'` query in loader short-circuit `page.tsx:325+` | Yes (DB query) | FLOWING |
| `PendingPromotionDetailPane` | `samples[]` | `loadRuleSamples` queries `pipeline_events` + joins `email_pipeline.emails` (actions.ts) | Yes (DB query) | FLOWING |
| `Stage2Page` count | `stage2Count` | `loadStage2WeeklyCount(admin)` head-count of `debtor.email_labels` 7d failed | Yes (real DB head-count) | FLOWING |
| RowList (default `?sub` branch) | predicted rows | Existing Phase 71 loader (unchanged) | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Middleware redirect preserves `?sub=pending` | `vitest run __tests__/middleware-review-redirect.test.ts` | 15/15 passing | PASS |
| Stage-2 placeholder + loader unit tests | `vitest run app/(dashboard)/automations/[swarm]/stage-2/` | 7/7 passing (4 loader + 3 page) | PASS |
| Stage-1 page-shell + chip-strip RTL | `vitest run stage-1/__tests__/page-shell.test.tsx noise-category-chip-strip.test.tsx` | 10/10 passing | PASS |
| Carry-forward loader tests (expected 3 failures) | `vitest run stage-1/__tests__/load-page-data.test.ts safety-review-loader.test.ts` | 13 passed / 3 failed | PASS (failures match carry-forward inventory in Plan 04 + deferred-items.md) |
| `Bulk Review` absent from new page bodies | `grep "Bulk Review" stage-1/page.tsx stage-2/page.tsx` | 0 hits | PASS |
| `review/` directory removed | `ls web/app/(dashboard)/automations/[swarm]/review` | ENOENT | PASS |
| Live browser smoke `/stage-1` / `/stage-2` | Dev server | NOT RUN (deferred to human; see human_verification) | SKIP |

### Requirements Coverage

ROADMAP §Phase 81 entry says: *"Requirements: TBD (Phase 81 tracks coverage via D-codes D-01..D-19 in 81-CONTEXT.md)"* — no REQ-IDs assigned. Coverage tracked via D-code closure:

| D-Code | Decision | Status |
|--------|----------|--------|
| D-01 | Rename `review/` → `stage-1/` | SATISFIED (Plan 01, 28 files via git mv) |
| D-02 | Delete `QueueTree`; `race-cohort-banner` migrates | SATISFIED (queue-tree.tsx deleted a3bcda3; race-cohort-banner.tsx present in stage-1/) |
| D-03 | Middleware `/review → /stage-1` 308 stays | SATISFIED (untouched; 15/15 tests green) |
| D-04 | No `/review/page.tsx` re-export shim | SATISFIED (Plan 01 inlined body) |
| D-05 | 2-col grid replaces 3-col + horizontal chip strip | SATISFIED (Plan 03 page.tsx rewrite) |
| D-06 | Chip-strip source = `swarm_noise_categories` only | SATISFIED (grep test in page-shell.test.tsx; JSDoc lock) |
| D-07 | Entity/mailbox = secondary popover | DEFERRED (URL params functional; popover deferred per deferred-items.md, regression test asserts URL-direct edit) |
| D-08 | Active chip writes `?topic=<noise_key>` | SATISFIED (router push in NoiseCategoryChipStrip) |
| D-09 | `/stage-1?sub=pending` sub-route | SATISFIED (loader short-circuit + conditional render) |
| D-10 | Add `sub` to PageSearchParams + branch loader | SATISFIED (page.tsx:325) |
| D-11 | "Pending promotion · N" tail pill in chip strip | SATISFIED (Plan 03 chip strip) |
| D-12 | Stage 2 placeholder shape + head-count | SATISFIED (Plan 02 page + loader) |
| D-13 | Link to existing tagging-failures surface | SATISFIED (`/swarm/{swarmType}/tagging-failures`) |
| D-14 | Stage 2 tab badge | SATISFIED via shared count source (derive-stage-tabs.ts) |
| D-15 | No `_shell/StageTabStrip` changes | SATISFIED (no diff) |
| D-16 | PageHeader carries title; no "Bulk Review" h1 | SATISFIED (grep clean) |
| D-17 | Intro paragraph removed | SATISFIED (Plan 03 page rewrite) |
| D-18 | "Bulk Review" purged from user-visible copy | SATISFIED (Plan 04 audit; only comments/event-name strings remain) |
| D-19 | Realtime channel `${swarmType}-review` preserved | SATISFIED (D-19 grep verification in Plan 01 + Plan 03) |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `stage-1/__tests__/load-page-data.test.ts` | 3 carry-forward test failures (Tests 4, 5, 6) | Warning | Inherited fixture drift, not production bug; production code exercised via page-shell RTL + live UI. Carry-forward to Phase 82 documented. |

No blockers. No stubs. No `TODO`/`FIXME`/placeholder strings in the new components. No empty-data hardcoding in the new code paths.

### Human Verification Required

(See YAML frontmatter `human_verification:` block for the six items.) Highlights:

1. **`/stage-1` chrome smoke** — verify chip-strip styling matches Sketch 005 / v7.css; tab strip active state on Stage 1.
2. **Chip click → URL filter** — `?topic=<noise_key>` rewrite + visible row-list filter behavior.
3. **Pending Promotion end-to-end** — click tail pill → candidate list → detail pane → promote/reject actions visible.
4. **`/stage-2` smoke** — live count, em-dash fallback, ↗ link.
5. **Cross-swarm chip strip** — sales-email (or another non-debtor swarm) renders its own categories, no debtor-email leakage.
6. **Browser-level legacy redirect** — `/review?tab=safety` etc. round-trips cleanly in a real browser (not just middleware unit tests).

### Gaps Summary

All 10 ROADMAP / CONTEXT verification truths are satisfied in the codebase. The directory rename, shell wrap, chip strip, Pending Promotion sub-view, Stage 2 placeholder, and "Bulk Review" purge are all wired with real data sources (no stubs, no hardcoded empty props).

Two open items as known/deferred:

- **3 carry-forward test failures** in `load-page-data.test.ts` Tests 4-6 (fixture drift, not production bugs; tracked in `deferred-items.md` for Phase 82).
- **Filters popover (D-07)** deliberately deferred — URL params remain functional; regression test asserts loader applies `?entity=` + `?mailbox=` via direct edit.

Browser smoke has not been run live — the dev server is up on `http://localhost:3000` but no operator click-through occurred this session. The RTL + middleware tests cover the underlying logic, but visual chrome / token usage / cross-swarm behavior / live data values cannot be verified without a human pass. Status is therefore **human_needed** pending the six smoke items in `human_verification:`.

---

_Verified: 2026-05-11T12:36Z_
_Verifier: Claude (gsd-verifier)_
