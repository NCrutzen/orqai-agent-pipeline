---
phase: 110-visibility-foundation-bulk-review-swarm-row-enrichment-inges
plan: 04
subsystem: agentic-pipeline / swarm-registry / pipeline-gating
status: BLOCKED — Task 4 remote schema push gated on expired Supabase Management API token
tags: [SWARM-01, VERIFY-01, D-10, D-11, D-12, dry-run-gate, per-mailbox-health, sugar-disposition]
requires:
  - 110-01 (dry-run-gate-preservation RED contract)
  - 110-02 (load-page-data non-debtor re-scope)
  - 110-03
provides:
  - per-stage dry-run governance map (swarms.dry_run_config) — migration written + workers wired (NOT yet pushed)
  - sales-email full-funnel registry config (migration written, NOT yet pushed)
  - per-mailbox pipeline-health dimension (migration written + monitor wired, NOT yet pushed)
  - web/lib/pipeline-gating/dry-run-gate gate resolver module (live)
  - VERIFY-01 Sugar-disposition evidence (live, informative)
affects:
  - debtor-email side-effect workers (cleanup, resolver, label dispatch, invoice-copy)
  - pipeline-health-monitor
  - bulk-review load-page-data (non-debtor dry_run sourcing)
tech-stack:
  added: []
  patterns:
    - "Directory-module (index.ts + package.json main) so a vitest extensionless require() resolves a .ts module"
    - "Fail-closed per-stage gate: missing flag => blocked (true)"
    - "Fold registry gate with legacy per-mailbox flag (block if EITHER blocks) to preserve effective behavior while migrating the source of truth"
key-files:
  created:
    - supabase/migrations/20260603_sales_swarm_full_funnel_enrichment.sql
    - supabase/migrations/20260603b_swarms_dry_run_config.sql
    - supabase/migrations/20260603c_pipeline_health_per_mailbox.sql
    - web/lib/pipeline-gating/dry-run-gate/index.ts
    - web/lib/pipeline-gating/dry-run-gate/package.json
    - web/lib/inngest/functions/__tests__/sugar-ingest-verify.test.ts
  modified:
    - web/lib/swarms/types.ts
    - web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts
    - web/lib/inngest/functions/stage-2-customer-resolver.ts
    - web/lib/inngest/functions/stage-2-icontroller-label-applier.ts
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
    - web/lib/inngest/functions/pipeline-health-monitor.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/_lib/load-page-data.ts
    - web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts
decisions:
  - "stage-2-icontroller-label-applier gate kept at the SINGLE upstream dispatch decision (resolver), not duplicated in the tagger — the tagger owns tag mechanics, gating one place avoids changing its unit contract"
  - "dry_run_config typed optional (?:) on SwarmRow for pre-Phase-110 fixture assignability; gate treats null/undefined identically (fail-closed)"
  - "Sugar disposition is read-only/informative (D-13) — surfaces 34,725 count, never hard-fails, no row touched"
metrics:
  duration: ~18m (to block point)
  tasks_completed: 3 of 5 (Task 4 blocked at auth gate; Task 5 not reached)
  files: 14
  completed_date: 2026-06-03
---

# Phase 110 Plan 04: Visibility Foundation — Swarm Enrichment, Per-Stage Dry-Run Gate, Per-Mailbox Health + VERIFY-01 Summary

Per-stage dry-run governance gate wired across the four debtor side-effect workers (preserving debtor's effective behavior EXACTLY — cleanup LIVE, labeling/invoice-copy gated), sales-email registry enriched to a full inert funnel config, per-mailbox health dimension added, and VERIFY-01 Sugar-disposition evidence captured — but the **[BLOCKING] remote schema push is HALTED on an expired Supabase Management API token** (an authentication gate the user must clear).

## What shipped (Tasks 1–3, committed)

### Task 1 — three migrations (commit `ecb3d0cd`)
- `20260603_sales_swarm_full_funnel_enrichment.sql`: sales-email `entity_brand=['smeba']`, `stage3_coordinator_agent_key='sales-intent-agent'`, inert `stage2_entity_resolver` + `resolution_config` placeholder (v8.2 RESL-03 owns the real shape — OQ-2), `canonical_context_shape` v`2026-06-03.sales.v1`. Held inert per D-05 (`side_effects=[]`, `stage1_regex_module=null`). `resolution_config` uses `ADD COLUMN IF NOT EXISTS` (idempotent — column already exists live, value null, verified 2026-06-03).
- `20260603b_swarms_dry_run_config.sql`: `ADD COLUMN dry_run_config jsonb NOT NULL DEFAULT '{}'`. D-11 seed: **debtor `stage_1_cleanup=false` (LIVE)**, `stage_3_labeling=true`, `stage_1_archive=false`, `stage_4_handlers={"invoice-copy":true}`; **sales all `true` (blocked)**, `stage_4_handlers={}`. OQ-1 recorded (6 debtor mailboxes uniform `dry_run=true` → per-swarm flag safe).
- `20260603c_pipeline_health_per_mailbox.sql`: `ADD COLUMN source_mailbox text` (nullable; null = swarm aggregate) + composite index `(swarm_type, source_mailbox, checked_at DESC)`.
- RLS: all three only ALTER existing RLS-enabled tables; no new table/policy; **no `TO anon`/`TO public USING(true)`**.

### Task 2 — per-stage gate across workers + per-mailbox health (commit `a93f4abc`)
- New `web/lib/pipeline-gating/dry-run-gate/` resolver module (`isStageBlocked`, `isHandlerBlocked`, `resolveStageDryRun`). **Directory module** (`index.ts` + `package.json` `main`) so the Plan 01 RED test's extensionless `require("../../../pipeline-gating/dry-run-gate")` resolves under vitest (native `require` won't resolve a bare `.ts`).
- `stage-1-icontroller-noise-cleanup.ts`: **ADDS the gate it never had** (`stage_1_cleanup`). Debtor seed `false` keeps the 867-delete cleanup LIVE; a missing flag fail-closes to blocked (D-11 / Pitfall 2). Carefully avoids any bare `dry_run` word token (the RED test asserts its absence).
- `stage-2-customer-resolver.ts` + `classifier-invoice-copy-handler.ts`: fold `dry_run_config.stage_3_labeling` / `stage_4_handlers["invoice-copy"]` into the existing `dryRun` (blocks if EITHER blocks). Keeps the `settingsRow?.dry_run ?? true` per-mailbox layer (the RED test pins it). Debtor effective behavior unchanged.
- `stage-2-icontroller-label-applier.ts`: comment-only — gate lives at the single upstream dispatch decision (resolver).
- `pipeline-health-monitor.ts`: writes per-mailbox snapshot rows (`source_mailbox` from `automation_runs.result` JSONB) alongside the aggregate (`source_mailbox=null`); aggregate prev-read scoped to `source_mailbox IS NULL` so per-mailbox rows don't corrupt the went-silent comparison.
- `load-page-data.ts`: non-debtor per-row `dry_run` now registry-sourced (`stage_3_labeling`), fail-closed.
- `swarms/types.ts`: `dry_run_config?: DryRunConfig | null`.
- **`dry-run-gate-preservation.test.ts` fully GREEN (5/5).** Full inngest suite: **213 passed**. typecheck + lint: **0 errors**.

### Task 3 — VERIFY-01 (commit `91d7b84c`)
- `sugar-ingest-verify.test.ts` (3/3 passing): confirms `SALES_SOURCE='outlook'` (Outlook-only ingest), documents the per-mailbox `verkoop@smeba.nl` throughput query, and **surfaces the `source='sugarcrm'` count informatively — never hard-fails**.

## VERIFY-01 evidence (live queries, 2026-06-03)
| Check | Result |
|-------|--------|
| Sales ingest source | `SALES_SOURCE='outlook'` (Outlook-only) — confirmed in route |
| `email_pipeline.emails WHERE source='sugarcrm'` count | **34,725** |
| `email_pipeline.emails WHERE source='outlook' AND mailbox='verkoop@smeba.nl'` | 832 |
| debtor `labeling_settings.dry_run` (6 mailboxes) | all `true` UNIFORMLY (OQ-1) |

### D-13 conflict (on record for operator disposition)
CONTEXT **D-13's premise — "Sugar never connected, count==0" — is FACTUALLY WRONG**. The live count is **34,725** historical sales-email-analyzer rows on `verkoop@smeba.nl`. This is a source-conflict **flagged for operator disposition**, NOT touched this phase (no delete/mark/migrate — D-13 forbids machinery). Dead-code/data cleanup is out of Phase 110 scope; **Phase 115 (SugarCRM dead-code decommission) owns it.**

## BLOCKER — Task 4 [BLOCKING] remote schema push (authentication gate)

The three migrations are written and committed but **NOT applied to the remote project**. Every available apply path is blocked:

- **`SUPABASE_ACCESS_TOKEN` (Management API, `sbp_a9f9…`): returns 401 Unauthorized** — the token is expired (matches the long-standing STATE.md blocker "Supabase Management API token expired"). `GET /v1/projects` and `POST /v1/projects/{ref}/database/query` both 401.
- Supabase MCP `apply_migration` tool is **not exposed** in this executor's tool set (listed in the prompt but `No such tool available` at call time).
- Service role key works for **PostgREST data ops only (200)** — it **cannot run DDL** (`ALTER TABLE`/`CREATE INDEX`), which all three migrations require. No `exec_sql` RPC (404), no DB connection string, no Supabase CLI.

The user pre-authorized the push, but the **credential to execute it is invalid** — this is an authentication gate I cannot auto-fix (guessing/substituting credentials is excluded by Rule 3).

### Resume steps for the operator
1. Provide a fresh Supabase Management API token (`sbp_*`) in `web/.env.local` as `SUPABASE_ACCESS_TOKEN`, **OR** apply the three migration files (in this order) via the Supabase Studio SQL editor:
   - `supabase/migrations/20260603_sales_swarm_full_funnel_enrichment.sql`
   - `supabase/migrations/20260603b_swarms_dry_run_config.sql`
   - `supabase/migrations/20260603c_pipeline_health_per_mailbox.sql`
2. Then re-run (from `web/`): `npm run codegen && git diff --exit-code` — `entity.generated.ts` must show `"sales-email": ["smeba"]`; commit it atomically (SWARM-01 / D-06).
3. Run `npm run check:supabase` — RLS advisor must be green (no ERROR-level lint; altered tables inherit existing policies).
4. Verify live: sales `entity_brand=['smeba']` + `stage3_coordinator_agent_key='sales-intent-agent'` + `dry_run_config` present; **debtor `dry_run_config.stage_1_cleanup=false` (LIVE preserved)**.
5. Proceed to Task 5 (the production-write governance human checkpoint).

### Pre-apply seed safety (already verified)
`20260603b` encodes **debtor `stage_1_cleanup=false` (LIVE)** and **sales all side-effect flags `true` (blocked)** — confirmed before any apply attempt. The seed is safe; no wrong default that would auto-archive/delete live mail (T-110-11 mitigated).

## Deviations from Plan
- **[Rule 3 - blocking auth gate, escalated]** Task 4 remote push HALTED — `SUPABASE_ACCESS_TOKEN` expired (401). Not auto-fixable; returned as a checkpoint for the operator. Tasks 1–3 fully completed and committed; codegen + RLS-advisor + live-verify steps deferred to post-push resumption.
- **[Rule 1 - bug]** `pipeline-health-monitor` aggregate prev-snapshot read would have been corrupted by the new per-mailbox rows; scoped it to `source_mailbox IS NULL`. (commit `a93f4abc`)
- **[design]** `stage-2-icontroller-label-applier` per-stage gate NOT duplicated in the tagger — kept at the single upstream dispatch decision to avoid changing the tagger's unit contract (would have broken 27 tests and double-gated). Documented in-file.
- **[test-fixture]** Extended `stage-2-customer-resolver.test.ts` admin mock with a `swarms` select chain mirroring `settingsRow.dry_run` onto `stage_3_labeling` so the folded gate is exercised under the tests' single-control model.

## Known Stubs
- sales-email `stage2_entity_resolver` / `resolution_config` are INERT documented placeholders (forward-reference only; Phase 114 / v8.2 RESL-03 binds the real shape). Intentional per D-05 — Stage 2 no-ops until Phase 114. `side_effects=[]` keeps archive off until Phase 112; empty `swarm_intents` keeps Stage 3 a no-op until Phase 113.

## Threat Flags
None new beyond the plan's `<threat_model>`. T-110-11 (wrong dry_run default) mitigated by the verified seed; T-110-13 (mailbox PII) — `source_mailbox` is an address only, covered by existing RLS; T-110-15 (Sugar deletion) — Task 3 is strictly read-only.

## Self-Check: PASSED
- All 6 created files FOUND on disk.
- All 3 task commits FOUND in git (`ecb3d0cd`, `a93f4abc`, `91d7b84c`).
- Caveat: SWARM-01 / VERIFY-01 are NOT fully satisfied until the [BLOCKING] remote schema push (Task 4) lands — codegen atomic commit, RLS-advisor green, and live-verify are deferred to post-push resumption per the blocker above.
