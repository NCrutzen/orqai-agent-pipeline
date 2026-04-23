---
created: 2026-04-23T09:05:00.000Z
title: v7 email review dashboard — icontroller delete screenshots missing in detail view
area: ui
files:
  - web/components/v7/
  - web/lib/browser/screenshots.ts
  - web/app/(dashboard)/automations/debtor-email-review/
---

## Problem

The debtor-email-cleanup route uploads before/after screenshots to Supabase `automation-screenshots` bucket and stores signed URLs in `automation_runs.result`. The v7 review dashboard's detail pop-out (when it works — see sibling todo `2026-04-23-v7-review-dashboard-card-popout-missing.md`) is supposed to render these screenshots as part of the completed-action view.

Today (2026-04-23) entries like `icontroller delete → AutoReplyHandler, COMPLETED, 23 apr 10:40` show no screenshots. Either the bucket lookup fails, the signed-URL has expired (1h TTL), or the render component was never wired.

## Likely causes

1. **Signed URL TTL** — current upload helper generates 1h-lifetime URLs. For historical entries older than 1h, they 404. Fix: switch to public-bucket + permanent URL, OR regenerate signed URLs on-demand when the pop-out opens.
2. **UI component not reading the right key** — check whether the kanban detail view looks for `result.screenshots` / `result.screenshot` / both.
3. **Upload helper failing silently** — verify `web/lib/browser/screenshots.ts` `captureScreenshot` actually uploads; the route logs failures as non-fatal, so a broken upload would look like "no screenshot" not "error".

## Note on data-source coupling

The v7 dashboard is reading from a different table than `public.automation_runs` (my direct query at 2026-04-23 09:00 returned no `cleanup` rows for today, yet the UI shows a COMPLETED cleanup at 10:40). Map the dashboard's source tables and unify if possible — having two sources of truth for completed actions will rot.

## Acceptance

Open a completed `icontroller delete` card → pop-out shows before + after screenshots as inline images, or at minimum links that open the PNG in a new tab.

## Sequencing

Not blocking the copy-document sub-agent or intent-agent swarm design. This is v7 dashboard polish, wait for the backend to stabilise before chasing UI bugs.
