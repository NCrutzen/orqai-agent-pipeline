---
phase: 110-visibility-foundation-bulk-review-swarm-row-enrichment-inges
plan: 02
subsystem: bulk-review-surface
tags: [bulk-review, codegen, swarm-generalization, review-surface, registry]
requires:
  - 110-01 (RED review-anchor + out-of-band contracts; per-swarm-map type expectations)
provides:
  - "email_id-anchored generic Bulk Review hydrator (debtor + sales + info-routing uniform)"
  - "per-swarm ENTITY_BRANDS_BY_SWARM + SWARM_INTENTS_BY_SWARM generated maps"
  - "swarm-generic /automations/[swarm]/review route (no debtor-only 404)"
  - "bucket list-unit branch (email_labels.id for debtor, email_id for others)"
  - "sales-email sidebar review entry"
affects:
  - "web/app/(dashboard)/automations/[swarm]/review surface (all swarms)"
  - "Plan 04 enrichment migration (regenerates maps with sales entity_brand=['smeba'])"
tech-stack:
  added: []
  patterns:
    - "registry-as-source-of-truth codegen → per-swarm *_BY_SWARM literal-union maps (mirrors TENANT_DOMAINS_BY_SWARM)"
    - "surface-layer swarm branch (SC-3 scope) — never a shared pipeline-worker branch"
    - "fail-closed per-swarm map lookup: (MAP[swarm_type] ?? []) → empty list rejects every value"
key-files:
  created: []
  modified:
    - web/scripts/gen-entity-types.ts
    - web/scripts/gen-intent-types.ts
    - web/lib/automations/debtor-email/coordinator/entity.generated.ts
    - web/lib/automations/debtor-email/coordinator/intent.generated.ts
    - web/lib/bulk-review/hydrate.ts
    - web/app/(dashboard)/automations/[swarm]/review/page.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/_lib/load-bucket-label-ids.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/_lib/load-page-data.ts
    - web/components/v7/swarm-sidebar.tsx
decisions:
  - "D-01: anchor the hydrator on email_pipeline.emails.id (email_id), the shared corpus all 3 swarms write — NOT a per-swarm label store (D-02 rejects building a sales label store)"
  - "D-08: generalize entity/intent codegen to per-swarm maps mirroring gen-tenant-domains.ts; keep the SAME physical generated-file path (single file per concern, no per-swarm dir → avoids the `type X = never` footgun)"
  - "OQ-4 / SC-3: the bucket list-unit and dry_run swarm branches live at the SURFACE layer (page-data loaders), not in any shared Stage 0-4 worker — Plan-01 coordinator-swarm-branch-guard stays green"
  - "Sidebar sales entry left static (not registry-driven): SwarmWithCounts carries no swarm_type/slug nor email-swarm flag, so registry-driving is non-trivial within budget — TODO(D-03) left in place"
metrics:
  tasks_completed: 3
  files_modified: 9
  completed: 2026-06-03
---

# Phase 110 Plan 02: Generalize Bulk Review Sourcing + Per-Swarm Codegen Summary

Generalized the Bulk Review row hydrator off the debtor-only `email_labels` anchor onto the shared `email_pipeline.emails.id` corpus, generalized the entity/intent codegen to per-swarm `*_BY_SWARM` literal-union maps, and un-404'd the `/automations/[swarm]/review` route so sales-email and the already-dead info-routing surfaces render end-to-end — the LOW-RISK half of SWARM-02 (surface + build-time only, no shared pipeline worker touched) plus the codegen half of SWARM-01 and all of REVIEW-01.

## Execution Note (recovery run)

Tasks 1 and 2 were committed by a prior executor run that died mid-Task-3 with an API error; its uncommitted Task-3 edit was discarded. This run executed ONLY Task 3 and then authored this SUMMARY covering all three tasks. Task 1 + Task 2 commits were verified present in history before proceeding (not re-done).

## Tasks Completed

### Task 1 — Generalize entity + intent codegen to per-swarm maps (pre-committed: `564ea215`)
Rewrote `gen-entity-types.ts` and `gen-intent-types.ts` to mirror `gen-tenant-domains.ts`: one query over ALL swarms (dropped the `process.env.SWARM_TYPE ?? "debtor-email"` hack), emitting `ENTITY_BRANDS_BY_SWARM` (source `swarms.entity_brand`) and `SWARM_INTENTS_BY_SWARM` (source `swarm_intents.intent_key` grouped by swarm_type, no `enabled` filter) plus a union-over-all-swarms literal type. Same physical output paths; alphabetical sort for stable diffs; idempotent skip-if-identical. Generated maps now carry `"debtor-email": [...non-empty...]` and `"sales-email": []` (sales `entity_brand` ships with Plan 04); `type Intent` / `type Entity` are non-empty unions (never footgun avoided).

### Task 2 — Generalize hydrator anchor to email_id + repoint codegen imports (pre-committed: `7d8c3a0d`)
`hydrate.ts` now anchors on `email_pipeline.emails.id` (email_id) instead of `debtor.email_labels.id`. `HydrateOptions` accepts `email_id` (keeps `email_label_id` optional for debtor back-compat). `debtor.email_labels` is read ONLY inside a `swarm_type === "debtor-email"` enrichment branch (Stage-4 + override slots); for sales/info-routing those slots stay null. Codegen imports repointed to the per-swarm maps with fail-closed `(MAP[swarm_type] ?? [])` lookups. Flipped `review-anchor.test.ts` RED→GREEN; `out-of-band.test.ts` stays GREEN (no `@/lib/inngest/*` import leaked).

### Task 3 — Un-404 the route, branch the bucket list-unit, add the sidebar entry (this run: `b8769f06`)
1. **`review/page.tsx`** — Deleted the `if (swarmType !== "debtor-email") { notFound(); }` block; the `loadSwarm` registry gate (unknown/disabled → 404) is now the sole gate. Branched the hydrator anchor: `email_label_id` for debtor (per-label granularity — one email_id can carry 2 label rows), `email_id` for every other swarm.
2. **`load-bucket-label-ids.ts`** — Added `allEmailIdsForSwarm` (range-paged at 1000) + `loadEmailIdBucketPage` so non-debtor swarms list the DISTINCT `email_id` as the reviewable unit, partitioned by the SAME decided-or-done membership predicate. Debtor path is byte-for-byte unchanged. Surface-layer branch carries an explicit SC-3 / OQ-4 comment; chunk-at-50 and range-paged-at-1000 guards (Pitfall 3) preserved exactly.
3. **`load-page-data.ts`** — Re-scoped the `debtor.labeling_settings` read to debtor only (per its inline TODO); non-debtor swarms skip the cross-schema read and every row defaults to `dry_run=true` without throwing.
4. **`swarm-sidebar.tsx`** — Added a static `Sales Review` → `/automations/sales-email/review` entry. Registry-driving was attempted but is non-trivial within budget (`SwarmWithCounts` exposes no swarm_type/slug nor email-swarm flag); left a `TODO(D-03)` to registry-drive `AUTOMATIONS_ITEMS`.

## Verification

- `cd web && npm run typecheck` → exit 0
- `cd web && npm run lint` → 0 errors (65 pre-existing warnings in unrelated files, out of scope)
- `cd web && npx vitest run --changed` → 6 files / 44 tests GREEN (`review-anchor`, `out-of-band`, `page.test.tsx`, bucket + load-page-data suites)
- Plan-01 `coordinator-swarm-branch-guard.test.ts` → 4/4 GREEN (no shared-worker branch introduced — SWARM-02 surface-only invariant holds)
- Codegen drift gate (Task 1): `entity.generated.ts` / `intent.generated.ts` contain `ENTITY_BRANDS_BY_SWARM` / `SWARM_INTENTS_BY_SWARM` with `debtor-email` non-empty + `sales-email: []`

### Task 3 acceptance grep
- `grep 'swarmType !== "debtor-email"'` in `review/page.tsx` → only a comment reference remains (executable 404 block removed)
- `const CHUNK = 50` and `AGENT_RUNS_PAGE = 1000` both present in `load-bucket-label-ids.ts`
- SC-3 / OQ-4 surface-layer comment present on the list-unit branch
- `sales-email/review` href present in `swarm-sidebar.tsx`

## Deviations from Plan

None — Task 3 executed as written. No bugs, missing critical functionality, or blocking issues required auto-fix. No package installs.

One observation logged (not a deviation): running `npx vitest run --changed` in default parallel mode produced a one-shot flaky failure (cross-file `vi.mock` module-state pollution between `page.test.tsx` and the bucket test — a timeout + a "called 2 times" assertion). The page test passes deterministically in isolation, the full changed set passes with `--no-file-parallelism`, and a re-run in default parallel mode also passed. This is pre-existing test-isolation fragility in the shared-mock harness, NOT a defect in the Task 3 code; no source change was made for it.

## Known Stubs

`sales-email` appears as `"sales-email": []` in the generated entity/intent maps and the sidebar `Sales Review` entry is static. Both are INTENTIONAL and documented in-plan: Plan 04 regenerates the maps with `sales entity_brand=['smeba']`, and the sidebar `TODO(D-03)` tracks registry-driving once `SwarmWithCounts` exposes a swarm_type/slug. Neither blocks the plan goal (REVIEW-01: the surface renders end-to-end for sales-email today).

## Self-Check: PASSED

- Created files: none (all modifications)
- Commits verified in history:
  - `564ea215` (Task 1 codegen) — FOUND
  - `7d8c3a0d` (Task 2 hydrator anchor) — FOUND
  - `b8769f06` (Task 3 route/bucket/sidebar) — FOUND
- Modified files verified present on disk: all 9 key-files present
