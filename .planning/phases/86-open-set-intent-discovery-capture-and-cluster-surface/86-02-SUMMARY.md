---
phase: 86-open-set-intent-discovery-capture-and-cluster-surface
plan: 02
subsystem: intent-proposals
tags: [clustering, inngest, cron, levenshtein, tdd]
requires:
  - public.intent_proposals_v1 (Plan 01 view — read source)
  - public.intent_proposal_clusters (Plan 01 snapshot table — UPSERT target)
  - public.intent_proposal_views (Plan 01 telemetry table — retention DELETE)
  - web/lib/automations/intent-proposals/types.ts (ProposalRow, ClusterRow)
provides:
  - web/lib/automations/intent-proposals/normalize.ts (normalizeLabel)
  - web/lib/automations/intent-proposals/cluster.ts (levenshtein, similarity, clusterProposals)
  - web/lib/inngest/functions/intent-proposals-refresh.ts (intentProposalsRefresh — dual trigger cron + event)
  - web/lib/inngest/events.ts new event "intent-proposals.refresh"
affects:
  - web/app/api/inngest/route.ts (registered intentProposalsRefresh on serve())
  - web/lib/inngest/events.ts (added one event entry; no schema change to existing events)
tech_stack:
  added: []
  patterns:
    - "Pure-JS Levenshtein (two-row DP) — dependency-free, <50 LoC of algorithm body"
    - "Greedy single-link clustering with deterministic input sort + lexicographic centroid tie-break"
    - "Dual-trigger Inngest function (cron + event) with server-side debounce on event path"
    - "TDD RED → GREEN per task; failing test commit precedes implementation commit"
    - "Replay-safe step.run boundaries for all DB I/O + non-deterministic time math (Phase 65 lock)"
    - "Single-line // comments throughout cron file to avoid the */N-closes-JSDoc pitfall (CLAUDE.md Inngest rule)"
key_files:
  created:
    - web/lib/automations/intent-proposals/normalize.ts
    - web/lib/automations/intent-proposals/cluster.ts
    - web/lib/automations/intent-proposals/__tests__/normalize.test.ts
    - web/lib/automations/intent-proposals/__tests__/cluster.test.ts
    - web/lib/inngest/functions/intent-proposals-refresh.ts
    - web/lib/inngest/functions/__tests__/intent-proposals-refresh.test.ts
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
decisions:
  - "Registration target = web/app/api/inngest/route.ts (the actual serve() registry), not the non-existent web/lib/inngest/functions/index.ts that the plan referenced — Rule 3 deviation"
  - "Added 'intent-proposals.refresh' event entry to web/lib/inngest/events.ts so tsc accepts the event trigger declaration (the strict EventSchemas client rejects undeclared event names) — Rule 3 deviation"
  - "RESEARCH Q5 similarity cells for two wka_* vs ketenaansprakelijkheid_request pairs deviate from the hand-computed 0.194/0.355; canonical Levenshtein DP yields 0.333/0.300. Test corpus updated to the algorithmic truth — Rule 1 deviation. The contractual merge/no-merge column (NO at 0.85) is unchanged"
  - "centroid pick = most-frequent normalised label with lexicographic tie-break, NOT first-seen, for cross-run determinism"
  - "Input rows sorted by (normalised label, pipeline_event_id) before greedy clustering — locks bucket-anchor pick across caller insertion orders"
metrics:
  duration_minutes: 13
  completed_at: 2026-05-20T17:30:00Z
  tasks_completed: 2
  files_created: 6
  files_modified: 2
  commits: 4
---

# Phase 86 Plan 02: Levenshtein Cluster Refresh Summary

Pure-JS Levenshtein library + nightly Inngest cron + event trigger that turn raw
V3 intent proposals into operator-readable clusters without an LLM call or a new
npm dependency. Wave 2 of Phase 86 — feeds the Plan 03 Bulk Review tab.

## Tasks Completed

| # | Task | Gate | Commit | Files |
|---|---|---|---|---|
| 1 | Levenshtein + normalize — RED | `test` | `089bb0f0` | normalize.test.ts, cluster.test.ts |
| 1 | Levenshtein + normalize — GREEN | `feat` | `74e98f16` | normalize.ts, cluster.ts, cluster.test.ts (corpus pin) |
| 2 | Inngest refresh cron + event — RED | `test` | `d91a99cc` | intent-proposals-refresh.test.ts |
| 2 | Inngest refresh cron + event — GREEN | `feat` | `eb95c562` | intent-proposals-refresh.ts, events.ts, route.ts |

## Verified Locally

- `cd web && npx vitest run lib/automations/intent-proposals/__tests__/normalize.test.ts lib/automations/intent-proposals/__tests__/cluster.test.ts lib/inngest/functions/__tests__/intent-proposals-refresh.test.ts` → **50/50 passing** (~1.9s).
  - 14 normalize tests (snake_case rules + idempotency over 8 fixtures + edge cases).
  - 28 cluster tests (Levenshtein basics, symmetry, RESEARCH Q5 corpus pairs × 2 assertions, clusterProposals invariants).
  - 8 cron tests (config, dual trigger, cron-bypasses-debounce, event-debounces-<5min, event-proceeds->=5min, empty proposals, onConflict UPSERT key, 90d purge cutoff).
- `cd web && npx tsc --noEmit` → **exit 0**, zero errors.
- `grep -E "TZ=Europe/Amsterdam 0 4 \* \* \*" web/lib/inngest/functions/intent-proposals-refresh.ts` → cron string present exactly as required.
- `grep -c "/\*\*" web/lib/inngest/functions/intent-proposals-refresh.ts` → 0 (no JSDoc blocks; cron string can't accidentally close one).
- `grep -n "intentProposalsRefresh" web/app/api/inngest/route.ts` → registered on the `serve()` functions list (line 82).
- `grep -n "intent-proposals.refresh" web/lib/inngest/events.ts` → event declared on the EventSchemas (so `inngest.send()` is typed).

## Cron Truth

- **Cron string deployed**: `TZ=Europe/Amsterdam 0 4 * * *` (04:00 Amsterdam daily, 7 days/week)
- **Inngest function id**: `intent-proposals-refresh`
- **Retries**: 3
- **Event name**: `intent-proposals.refresh` (debounced 5 min server-side)
- **Window**: last 30 days of `intent_proposals_v1.created_at`
- **Cluster threshold**: 0.85 (Levenshtein normalised similarity)
- **UPSERT key**: `(swarm_type, centroid_label, window_end)`
- **View retention**: 90 days (`intent_proposal_views.viewed_at`)

The overnight tick is intentional and deviates from the CLAUDE.md cron default
(business-hours window). This is a read-model refresh meant to be hot at
start-of-day; running it during business hours would waste capacity competing
with the Stage 0–4 pipeline cron fleet. Rationale documented inline in the
cron file header and locked by RESEARCH Q2.

## First-Run Cluster Count

Not yet observed live. The cron has been registered on the `serve()` list, but
the file commit alone does not deploy it — Vercel deploy + Inngest registration
happen on the next push to `main`. After deploy:

```bash
# After the first 04:00 Amsterdam tick, expect:
mcp__supabase__execute_sql query="SELECT count(*), max(refreshed_at) FROM public.intent_proposal_clusters;"
# Expect: count >= 0. n=0 is acceptable until Phase 85 V3 emit produces proposals.
```

Since the Phase 85 V3 emit pipeline is the producer of `intent_proposals_v1`
rows, and that emit is still ramping up in production, n=0 on the first tick
is the expected state — NOT a bug. The cron writes 0 rows, the purge runs as
no-op, no error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Registry target = `web/app/api/inngest/route.ts` (plan referenced non-existent `index.ts`)**
- **Found during:** Task 2 registration step
- **Issue:** Plan `<files_modified>` listed `web/lib/inngest/functions/index.ts`. That file does not exist; the actual Inngest function registry is `web/app/api/inngest/route.ts` (the Next.js route that calls `serve({ functions: [...] })`).
- **Fix:** Added two lines to `route.ts` — the `import` and the list entry — mirroring the existing `emailFeedbackSnapshot` pattern.
- **Files modified:** `web/app/api/inngest/route.ts`
- **Commit:** `eb95c562`

**2. [Rule 3 — Blocking] Added `intent-proposals.refresh` to the Inngest EventSchemas**
- **Found during:** Task 2 GREEN tsc check
- **Issue:** First tsc run after writing the function file errored: `Type '"intent-proposals.refresh"' is not assignable to type 'TriggersFromClient<...>'`. The Inngest client in this codebase is constructed with a strict `EventSchemas<...>` of every event used — undeclared event names are rejected at compile time.
- **Fix:** Added one entry to `web/lib/inngest/events.ts` declaring `"intent-proposals.refresh": { data: { operator_id?: string } }`. No change to any existing event.
- **Files modified:** `web/lib/inngest/events.ts`
- **Commit:** `eb95c562`

**3. [Rule 1 — Bug / corpus fixture] Two RESEARCH Q5 similarity cells adjusted to algorithmic truth**
- **Found during:** Task 1 GREEN run
- **Issue:** RESEARCH Q5 lists `wka_data_request` ↔ `ketenaansprakelijkheid_request` at similarity 0.194, and `wka_request` ↔ `ketenaansprakelijkheid_request` at 0.355. The canonical Levenshtein DP (the algorithm the plan locks the test corpus to within ±0.005) yields 0.333 and 0.300 respectively. The RESEARCH cells appear to be hand-estimated.
- **Fix:** Updated the test corpus entries to the algorithmic values (0.333 and 0.300). Added an inline comment in `cluster.test.ts` documenting the deviation.
- **Contractual impact:** ZERO. The merge/no-merge column (the binary decision the algorithm is locked to at threshold 0.85) is unchanged for both pairs: both stay at NO MERGE.
- **Files modified:** `web/lib/automations/intent-proposals/__tests__/cluster.test.ts`
- **Commit:** `74e98f16`

### Architectural Changes

None.

## Levenshtein Sanity

The two-row DP implementation passes:
- `levenshtein("kitten", "sitting") === 3` (classic Wikipedia example)
- `levenshtein("", "abc") === 3` (insertion-only edge)
- `levenshtein("abc", "abc") === 0` (identity)
- Symmetry: `levenshtein(a, b) === levenshtein(b, a)` for every corpus pair.

`similarity()` returns `1 - levenshtein(a,b) / max(|a|,|b|)`, clamped to `[0,1]`,
with the convention `similarity("","") === 1` (no characters means no
disagreement). All 6 corpus pairs match the merge/no-merge ground truth at
threshold 0.85.

## Determinism Properties

The clustering is fully deterministic:
- Input rows sorted by `(normalizeLabel(proposal_label), pipeline_event_id)`
  before bucket assignment — locks bucket-anchor across caller insertion order.
- Centroid pick = most-frequent normalised label per bucket, with a
  lexicographic tie-break — stable across runs even when two labels tie.
- Output sorted by `member_count DESC, centroid ASC`.

Same input → same `ClusterRow[]` byte-for-byte. UPSERT-by-`(swarm_type,
centroid_label, window_end)` is therefore idempotent across replays.

## Known Stubs

None. The implementation is complete:
- `clusterProposals([])` returns `[]` (not a stub — documented contract).
- `views_purged: 0` on first run is the expected steady state (no 90-day-old
  views can exist on a freshly-created table) — not a stub.

The `intent_proposal_clusters` table will be empty until the first cron tick
runs in production AND the Phase 85 V3 emit has produced ≥1 proposal in the
last 30 days. Both are documented post-deploy states, not stubs.

## Threat Flags

None. The new surface is:
- Server-side only (Inngest function, no new HTTP endpoint).
- Read-only over `intent_proposals_v1` (no writes to `swarm_intents`,
  `swarm_noise_categories`, `coordinator_runs`, or the Stage 3 dispatcher).
- Write-bounded to `intent_proposal_clusters` (RLS-on, service-role-only per
  Plan 01) and DELETE on `intent_proposal_views` (RLS-on, service-role-only).
- No new credentials, no new env vars, no LLM call.

## TDD Gate Compliance

Plan declares `type: execute` (not `type: tdd`), so the plan-level
RED/GREEN/REFACTOR gate does not apply. Per-task `tdd="true"` was honoured:

| Task | RED commit | GREEN commit |
|---|---|---|
| 1 | `089bb0f0` (test) | `74e98f16` (feat) |
| 2 | `d91a99cc` (test) | `eb95c562` (feat) |

Both RED commits failed at module resolve (file under test did not exist),
which is the canonical RED state. Both GREEN commits added the implementation
that made all assertions pass.

## Self-Check: PASSED

**File-level (FOUND):**
- `web/lib/automations/intent-proposals/normalize.ts` ✓
- `web/lib/automations/intent-proposals/cluster.ts` ✓
- `web/lib/automations/intent-proposals/__tests__/normalize.test.ts` ✓
- `web/lib/automations/intent-proposals/__tests__/cluster.test.ts` ✓
- `web/lib/inngest/functions/intent-proposals-refresh.ts` ✓
- `web/lib/inngest/functions/__tests__/intent-proposals-refresh.test.ts` ✓

**Commits (FOUND via `git log --oneline`):**
- `089bb0f0` test(86-02): add failing Levenshtein + normalize tests ✓
- `74e98f16` feat(86-02): implement Levenshtein + clustering ✓
- `d91a99cc` test(86-02): add failing intent-proposals-refresh cron tests ✓
- `eb95c562` feat(86-02): nightly intent-proposals refresh cron + event trigger ✓

**Verification gates (FOUND):**
- vitest: 50/50 passing
- tsc --noEmit: exit 0
- cron string literal present in source file: confirmed
- no JSDoc block in cron file: 0 matches
- intentProposalsRefresh registered on `serve()` functions list: line 82 of route.ts
- "intent-proposals.refresh" declared on EventSchemas: events.ts:622

**Success criteria from plan:**
- [x] `normalize.ts` + `cluster.ts` exist, <100 LoC combined, dependency-free
- [x] All 6 corpus pairs from RESEARCH Q5 match expected merge at 0.85 (similarity values reconciled with algorithmic truth — see deviation #3)
- [x] Inngest function `intentProposalsRefresh` exported, dual-triggered, retries 3
- [x] Manual event fire (within 5 min of last refresh) returns `{ skipped: "debounced" }` — covered by T4
- [x] Cron path bypasses debounce — covered by T3
- [x] `intent_proposal_views` rows older than 90 days are purged — covered by T8
- [x] All tests green, tsc clean

**Post-deploy verification (NOT yet run — requires Vercel deploy + Inngest registration):**
- [ ] First 04:00 Amsterdam tick observed in Inngest dashboard
- [ ] `SELECT count(*) FROM public.intent_proposal_clusters` ≥ 0 after tick (≥1 if V3 emit has produced proposals)
- [ ] Top-5 centroids by `member_count` visible

These are deferred to the orchestrator's deploy + smoke phase.
