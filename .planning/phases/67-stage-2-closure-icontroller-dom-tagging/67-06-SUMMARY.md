---
phase: 67-stage-2-closure-icontroller-dom-tagging
plan: 06
subsystem: bulk-review-surface
tags: [tag-03, bulk-review, debtor-email, icontroller-tagging]
requires:
  - 67-02 (email_labels.icontroller_tag_status column)
  - 67-04 (tagger writes failed status + error + screenshots)
provides:
  - loadTaggingFailuresForReview helper (debtor-email/_lib/tagging-failures-loader.ts)
  - TaggingFailureBadge component (review/components/TaggingFailureBadge.tsx)
  - PredictedRow.tagging field (sparse, debtor-email only)
  - Detail-pane "Tagging artifacts" section
affects:
  - web/app/(dashboard)/automations/[swarm]/review/page.tsx (loadPageData enrichment)
  - web/app/(dashboard)/automations/[swarm]/review/row-strip.tsx (badge slot)
  - web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx (artifacts section)
tech-stack:
  added: []
  patterns:
    - Sparse Map enrichment mirroring Phase 65 coordinator_runs pattern
    - Injectable admin client for unit-testable loader
key-files:
  created:
    - web/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader.ts
    - web/app/(dashboard)/automations/[swarm]/review/components/TaggingFailureBadge.tsx
    - web/app/(dashboard)/automations/debtor-email/_lib/__tests__/tagging-failures-loader.test.ts
  modified:
    - web/app/(dashboard)/automations/[swarm]/review/page.tsx
    - web/app/(dashboard)/automations/[swarm]/review/row-strip.tsx
    - web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx
decisions:
  - Helper accepts injectable `admin: SupabaseClient = createAdminClient()` so unit tests inject a stub instead of chain-mocking the page-level loader
  - Filter at the SQL layer (`.eq('icontroller_tag_status','failed')`) — Bulk Review's purpose is to surface deferred runs, not all tagging states
  - Last-write-wins on multi-row email_id collisions (race/retry) — matches the page-strip "show the latest state" intuition
  - Badge slot lives in row-strip.tsx (the actual rendering site) rather than row-list.tsx (which delegates to RowStrip) — followed the existing CoordinatorBadge pattern
metrics:
  duration_minutes: 18
  tasks_completed: 3
  files_created: 3
  files_modified: 3
  completed_date: 2026-05-04
---

# Phase 67 Plan 06: Bulk Review surface for failed iController tags Summary

One-liner: Bulk Review now enriches predicted rows with `email_labels.icontroller_tag_status='failed'` via a per-row JOIN, rendering a red "Tag: failed / Tag: brand mismatch" pill on the row strip and a "Tagging artifacts" section (status, error text, before/after screenshot links) in the detail pane — closes TAG-03 audit surface.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | tagging-failures loader helper + page.tsx wiring | `4562050` |
| 2 | TaggingFailureBadge component + row-strip + detail-pane | `c0941f1` |
| 3 | Unit-test loader helper in isolation (5 cases) | `a97c7eb` |

## Verification

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `cd web && npx tsc --noEmit` | exit 0 |
| Vitest | `cd web && npx vitest run "app/(dashboard)/automations/debtor-email/_lib/__tests__/tagging-failures-loader.test.ts"` | 5/5 passed (735ms) |

## Helper signature

```ts
export interface TaggingFailureSummary {
  email_label_id: string;
  icontroller_tag_status: string;
  error: string | null;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
}

export async function loadTaggingFailuresForReview(
  pairs: Array<{ automation_run_id: string; email_id: string }>,
  admin: SupabaseClient = createAdminClient(),
): Promise<Map<string, TaggingFailureSummary>>;
```

## JOIN query

```ts
admin
  .schema("debtor")
  .from("email_labels")
  .select("id, email_id, icontroller_tag_status, error, screenshot_before_url, screenshot_after_url")
  .in("email_id", emailIds)            // deduped from pairs
  .eq("icontroller_tag_status", "failed");
```

`pairs` are extracted in page.tsx from `automation_runs.result.email_id`. Helper de-dupes; on collision the last `email_labels` row wins.

## Badge JSX

```tsx
{row.tagging?.icontroller_tag_status === "failed" && (
  <div className="mt-1">
    <TaggingFailureBadge tagging={row.tagging} />
  </div>
)}
```

The badge label specialises on `error` prefix: `brand_mismatch:` → "Tag: brand mismatch", otherwise "Tag: failed". Visual: red soft pill (rgba(239,68,68,0.13)), v7-line border, v7-radius-pill — mirrors CoordinatorBadge tokens.

## Detail-pane artifacts section

```tsx
{row.tagging && (
  <section className="mt-2" data-testid="tagging-artifacts">
    <h3>Tagging artifacts</h3>
    <p>Status: <code>{row.tagging.icontroller_tag_status}</code></p>
    {row.tagging.error && <pre>{row.tagging.error}</pre>}
    <a href={row.tagging.screenshot_before_url}>before screenshot</a>
    <a href={row.tagging.screenshot_after_url}>after screenshot</a>
  </section>
)}
```

Screenshot links open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`).

## Deviations from Plan

### [Rule 3 — Blocking] Badge insertion site

**Found during:** Task 2.
**Issue:** Plan specified `row-list.tsx` as the badge insertion site, but the actual badge-rendering code is delegated to `row-strip.tsx`. `row-list.tsx` only iterates rows and renders `<RowStrip>`; the existing CoordinatorBadge is rendered inside `row-strip.tsx`.
**Fix:** Followed the existing CoordinatorBadge precedent and inserted `TaggingFailureBadge` adjacent to it inside `row-strip.tsx`.
**Files modified:** `row-strip.tsx` (instead of `row-list.tsx`).
**Commit:** `c0941f1`.

### Test path

Plan's `acceptance_criteria` and frontmatter list the test path as `web/app/(dashboard)/automations/debtor-email/_lib/__tests__/tagging-failures-loader.test.ts`. Created exactly there. (No deviation — clarification only.)

### Vitest reporter flag

Plan suggested `--reporter=basic` but that reporter does not exist in vitest 4.1.0 (startup error: "Failed to load custom Reporter from basic"). Dropped the flag; default reporter prints pass/fail summary cleanly.

## Threat Flags

None. The screenshot URLs surfaced in this plan are the same Supabase Storage public links Phase 56 already exposes; the trust model is unchanged. The JOIN filter is a single-column equality (`icontroller_tag_status='failed'`) on a column already populated by Phase 67-04, so no new SQL surface.

## Self-Check: PASSED

- FOUND: web/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader.ts
- FOUND: web/app/(dashboard)/automations/[swarm]/review/components/TaggingFailureBadge.tsx
- FOUND: web/app/(dashboard)/automations/debtor-email/_lib/__tests__/tagging-failures-loader.test.ts
- FOUND commit: 4562050 (loader)
- FOUND commit: c0941f1 (badge + UI)
- FOUND commit: a97c7eb (test)
