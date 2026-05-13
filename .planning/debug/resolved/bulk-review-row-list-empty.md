---
slug: bulk-review-row-list-empty
status: resolved
trigger: Bulk Review Stage 1 row list is empty in the browser; database has 245 resolvable predicted email_ids and the chip count "All 371" populates, but the list area shows the "Nothing to review" empty-state copy. User confirmed the page worked yesterday but is broken today; bisect to c0c3579 (pre-Phase-82.3) reproduces, so this is NOT a 82.3 regression.
created: 2026-05-13T10:50:00Z
updated: 2026-05-13T11:05:00Z
resolved: 2026-05-13T11:05:00Z
---

## Resolution

- **root_cause**: `stage-1/page.tsx::loadPageData()` issues a single `.in("source_id", predictedMessageIds)` call against `email_pipeline.emails` with up to 251 Outlook EwsId base64 strings (~150 chars each). The resulting PostgREST URL exceeds ~8KB and the gateway silently drops the body → `peRes.data === []` with no error. Downstream `predictedEmailIds` is empty, `effectiveFilterSet` is empty, `summaryRows` is empty, RowList shows "Nothing to review". Print-debug evidence: `predictedMessageIdsCount: 251, predictedEmailIdsCount: 0, listResDataCount: 100, summaryRowsCount: 0` with `listResError: null`.
- **fix**: Chunk the `.in("source_id", …)` call into batches of 50 message_ids, fired in parallel via `Promise.all`, then concatenate the rows. Same anti-pattern was already documented at line 716 for a different `.in()` call but never applied here. The threshold (250 message_ids) was only crossed today as backlog grew past ~50 predicted runs with message_ids.
- **commit**: pending — applied as edit to `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` lines 701-732.
- **verification**: User hard-reloaded `/automations/debtor-email/stage-1` after the chunking fix landed; row list populates as expected.

## Why this was "pre-existing but new today"

The bug was latent. The `.in()` call grew silently as the predicted-runs backlog accumulated. Yesterday's predicted-runs count must have produced a URL just under the gateway limit; today's growth pushed it over.

# Debug: bulk-review-row-list-empty

## Symptoms

DATA_START
- **Expected**: Navigating to `/automations/debtor-email/stage-1` in the Bulk Review surface should render a list of predicted (operator-review-pending) emails on the left, with a chip strip showing topic buckets ("All 371", "Payment Admittance 23", "Auto-reply 59", etc.) and detail pane on the right after row selection.
- **Actual**: Chip strip renders with correct totals ("All 371", per-bucket counts present). Row list area is EMPTY and shows the locked empty-state copy: "Nothing to review — Predicted classifications appear here as the ingest route writes them." Detail pane shows the unselected-state hint. Page is also unusually slow (~8s SSR render).
- **Error messages**: None in dev-server terminal — all responses are 200 OK. Browser console shows extension noise (`searchAnalyzer.js` "Search engine null is not supported", "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received") confirmed unrelated to app code; same empty result reproduces in incognito with extensions disabled.
- **Timeline**: User reports the page was working yesterday (2026-05-12). First observed today (2026-05-13) during operator UAT for Phase 82.3.
- **Reproduction**: Navigate to `http://localhost:3000/automations/debtor-email/stage-1` with `npm run dev` running from `web/`. Page returns 200 in ~8s, list area is empty regardless of selected topic chip (All, Payment Admittance, Auto-reply, etc.) or mailbox filter.

### Bisect (already done by orchestrator)
- HEAD `f06b014` (Phase 82.3 complete + Plan 11 wiring) → empty list
- HEAD `c0c3579` (commit immediately before any Phase 82.3 code change) → ALSO empty list
- **Conclusion: NOT a Phase 82.3 regression.** Pre-existing bug present at least one commit before 82.3 work started.

### Database state (already verified via SQL)
- `pipeline_events_email_summary` has **496 rows** where `swarm_type='debtor-email' AND stage_1_decision IS NOT NULL`.
- `automation_runs` has **377 rows** with `swarm_type='debtor-email' AND status='predicted'`. Of these: 254 have `result.message_id` populated, 123 do not.
- JOIN `automation_runs` (predicted, has message_id) ⋈ `email_pipeline.emails` ON `e.source_id = ar.result->>'message_id'` yields **245 distinct email_ids** (the `predictedEmailIds` set the loader builds).
- Top-400 (`PAGE_SIZE * 4`) rows of `pipeline_events_email_summary` for the swarm ordered by `last_event_at DESC` ∩ those 245 predicted email_ids = **245 rows** (full overlap, no recency cutoff loss).
- → Expected: `effectiveFilterSet` ∩ `listRes.data` should yield 245 rows, sliced to PAGE_SIZE (100). User sees 0.

### Code path of interest
`web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx::loadPageData()` (non-safety branch, lines ~485-728):
1. `predictedRunsRes` — SELECT id,result FROM automation_runs WHERE status=predicted (377 rows)
2. `listQuery` — pipeline_events_email_summary top 400 by last_event_at (~400 rows)
3. `filterPromise` — only fires when URL filters active; returns `string[] | null`
4. `peRes` — JOIN automation_runs.result.message_id → email_pipeline.emails.source_id → builds `predictedEmailIds`
5. `effectiveFilterSet = filterEmailIds === null ? predictedEmailIds : predictedEmailIds.filter(...)`
6. `summaryRows = listRes.filter(r => effectiveFilterSet.has(r.email_id)).slice(0, PAGE_SIZE)`
7. `rows = summaryRows.map(mapSummaryToPredictedRow)` → returned to client shell
8. Client shell (`Stage1ClientShell`) applies `selectedMailboxes` filter on top (URL `?mailbox=` params); defaults to no filter when array is empty (returns `unifiedRows` as-is).

### Hypotheses to test (in priority order)
1. **listRes silently returns null/empty** — supabase-js view query failing without throwing. Either an RLS regression on `public.pipeline_events_email_summary`, the view itself missing/renamed, or the `.limit(PAGE_SIZE*4)` call producing an empty body.
2. **`predictedEmailIds` is empty at runtime** — the join logic produces empty in JS even though the DB JOIN works. Possible cause: `result?.message_id` extraction returning undefined for all rows due to JSON parsing difference between SQL `->>` and JS `.message_id` (e.g., result column stored as text vs jsonb).
3. **`PAGE_SIZE` regression** — PAGE_SIZE constant changed to 0 (typo) or somewhere upstream a Math.min/clamp returns 0.
4. **`effectiveFilterSet` constructed incorrectly** — e.g., `predictedEmailIds.filter(id => filterEmailIds.includes(id))` where `filterEmailIds` is non-null but empty (defaulted to []) when no URL filters set — meaning intersection is always empty.
5. **`mapSummaryToPredictedRow` throws** — page renders empty list silently if RowList receives malformed Row[].
6. **Client-side `Stage1ClientShell` filtering** — `selectedMailboxes.length === 0` should pass through, but if `unifiedRows` has all rows with `mailbox_id === null` AND something else triggers the filter branch, returns empty.
7. **`pipeline_events_email_summary` view regression** — DB-side: view was recently altered and `email_id` column or `last_event_at` semantic changed; SELECT returns rows but in a shape the JS mapper doesn't recognise.
DATA_END

## Current Focus

- **hypothesis**: At least one of: (1) `effectiveFilterSet` defaults to empty because `filterEmailIds === null` is false when no URL filters present (recent loader change introduced regression); OR (2) `predictedEmailIds` is empty at runtime due to `result?.message_id` JS-side extraction failing.
- **test**: Add temporary `console.error` logging in `loadPageData()` to print `predictedRuns.length`, `predictedMessageIds.length`, `predictedEmailIds.length`, `filterEmailIds`, `listRes.data?.length`, `effectiveFilterSet.size`, `summaryRows.length`. Reload page, read dev-server terminal output.
- **expecting**: If the bug is hypothesis (1), `filterEmailIds` will be `[]` instead of `null` when no URL filters are active. If hypothesis (2), `predictedMessageIds.length === 0` despite 377 predicted runs (indicating JS extraction failure). If neither, jump to deeper hypotheses (RLS, view shape).
- **next_action**: gather initial evidence — add the print-debugging in `stage-1/page.tsx::loadPageData()` and reload the page

## Evidence

(none yet)

## Eliminated

- Phase 82.3 caused it — eliminated by bisect to c0c3579 reproducing same empty result.
- Browser extension interference — eliminated by reproducing in incognito with extensions disabled.
- Database has no rows — eliminated by SQL queries showing 496 summary rows, 245 resolvable predicted email_ids.
- Server-side render hard-failure — eliminated by clean 200 responses in dev terminal.

## Resolution

(populated when fix verified)
