---
phase: 113-stage-3-sales-intent-agent-greenfield
plan: 03
subsystem: stage-3-discovery/retro-classify + orq-agent-mgmt
tags: [stage-3, retro-classify, vocabulary-discovery, bootstrap-bypass, side-channel-isolation, orq-agent, sales-email]
status: checkpoint-blocked
requires:
  - sales-email/retro/select-candidates.ts (Phase 111 — dual-corpus selector + 40k fail-loud cap)
  - sales-email/retro/reconstruct-input.ts (Plan 02 — per-email input builder w/ attachment fold)
  - sales-email/coordinator/invoke-intent.ts (Plan 01 — invokeSalesIntentAgent, cache-bypass invoke)
  - sales-email/coordinator/types.ts (Plan 01 — salesIntentOutputSchema, the json_schema mirror)
  - public.stage_3_retro_runs (Phase 87 migration — RLS-enabled, sales writes w/ swarm_type)
  - public.swarm_intents (the emptiness bound the bootstrap bypass depends on)
provides:
  - salesEmailStage3RetroClassify Inngest fn — side-channel-isolated retro classifier
  - bounded bootstrap bypass of the R-04 cluster precondition gate (empty-swarm_intents-only)
  - sales-email/retro-classify.requested event (data.bootstrap flag)
  - bootstrap row tagging via ranked_intents._meta.run_type
  - manage-sales-intent-agent.ts — list_models-validated create→PATCH→get-verify script (D-13)
affects:
  - Plan 04 (consumes the promoted vocabulary; finalizes the agent enum post-seed+codegen)
  - the operator (must complete the Studio json_schema + bootstrap retro + cluster promotion)
tech-stack:
  added: []
  patterns:
    - side-channel retro mirrors debtor Phase 87 (6 locks); writes ONLY stage_3_retro_runs
    - bounded gate bypass — a caller flag is honored only inside a proven-safe precondition (empty swarm_intents), throws otherwise, and tags its rows for auditability
    - bootstrap tagging via a JSONB sibling key (ranked_intents._meta.run_type) — no schema migration
    - Orq model validation by BARE model_id (catalog drops the provider prefix list_models-side)
    - agent shell-then-finalize: created with placeholder enum in Plan 03, real enum finalized Plan 04 post-codegen
key-files:
  created:
    - web/lib/inngest/functions/sales-email-stage-3-retro-classify.ts
    - web/lib/inngest/functions/__tests__/sales-stage-3-retro-side-channel-isolation.test.ts
    - web/lib/inngest/functions/__tests__/sales-stage-3-retro-bootstrap-gate.test.ts
    - web/scripts/orq/manage-sales-intent-agent.ts
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
decisions:
  - "bootstrap bypass bounded to swarm_intents(sales)===0; bootstrap-after-seed THROWS (T-113-11)"
  - "bootstrap rows tagged run_type via ranked_intents._meta.run_type (JSONB sibling, no migration); downstream intent_proposals/cluster refresh reads intent_proposal/proposal_reason columns, unaffected by the envelope"
  - "no Stage-3 baseline aggregation — sales aggregate-baseline.ts is Stage-1-shaped; baseline optional for V1 discovery, omitted to keep side-channel tight"
  - "retro window operator-scoped (since/until explicit) — NO full-SugarCRM-sweep default (~$170 Haiku); mirrors Stage-1 retro contract"
  - "originals (original_top_intent/confidence) null — sales Stage 3 is greenfield, never ran live"
  - "Orq model validation compares the BARE model_id (segment after last '/') — list_models returns ids without the provider prefix the agent config carries"
  - "agent created as a SHELL in Plan 03 (placeholder enum); script refuses --finalize while the sales enum is empty — real enum finalized Plan 04 post seed+codegen"
metrics:
  duration: 8m
  completed: 2026-06-09
---

# Phase 113 Plan 03: Stage 3 Sales Retro-Classify + Agent Management Summary

Built the offline vocabulary-discovery machinery for the sales Stage 3 intent agent: a side-channel-isolated `sales-email-stage-3-retro-classify` Inngest function (mirroring debtor Phase 87's 6 locks) that re-runs the sales intent agent over the post-Stage-1 corpus into `stage_3_retro_runs`, plus a **bounded bootstrap bypass** of the R-04 cluster precondition gate that solves the greenfield empty-cluster chicken-and-egg — honored ONLY when sales `swarm_intents` is empty, refusing (throwing) after seeding, with bootstrap rows distinctly tagged. And the `manage-sales-intent-agent.ts` create→PATCH→verify script (D-13), live-validated against the Orq catalog.

**Status: CHECKPOINT-BLOCKED.** Task 1 is fully complete and committed. Task 2's automated portion (the management script) is complete, committed, and verified live (all 4 model ids present in the catalog). The remaining Task 2 work is a genuine human/external checkpoint that cannot be completed autonomously — see "Checkpoint" below.

## What Was Built

### Task 1 — retro-classify side-channel + bounded bootstrap bypass (commit `e9cbb3fe`) — COMPLETE

- **`sales-email-stage-3-retro-classify.ts`** — new Inngest fn (`id: sales-email-stage-3-retro-classify`, trigger `sales-email/retro-classify.requested`, `retries: 3`, `concurrency: { limit: 1 }`). Mirrors the debtor Phase 87 analog's 6 locks:
  1. **Side-channel isolation** — writes ONLY `stage_3_retro_runs`; zero references to `automation_runs`/`agent_runs`/`pipeline_events`/`coordinator_runs` (grep = 0).
  2. **Cache bypass** — calls `invokeSalesIntentAgent` DIRECTLY (not the live coordinator).
  3. **R-04 precondition gate WITH the bounded bootstrap bypass** (the divergence — see below).
  4. **Replay-safe run_id** — generated inside `step.run("resolve-run-id", ...)`.
  5. **Step-memo discipline** — each per-email step returns ONLY the token count; the full verdict is upserted inside the step with `onConflict: "run_id,email_id", ignoreDuplicates: true`.
  6. **inngest.send** never destructured / never called (no downstream events).
- **Bounded bootstrap bypass** (`step.run("bootstrap-precondition", ...)`):
  - `bootstrap=true` AND `swarm_intents(sales)` count === 0 → SKIP the cluster gate, `runType="bootstrap"` (the legitimate empty-vocabulary first pass that POPULATES the surface).
  - `bootstrap=true` AND count > 0 → **THROW** `bootstrap retro refused: sales swarm_intents already seeded (count=N) …` (T-113-11 — a bootstrap re-run must not silently bypass the gate after seeding).
  - `bootstrap` falsy → normal cluster gate (blocks on clusters < 5 OR max(refreshed_at) > 7d stale), `runType="normal"`.
- **Bootstrap row tagging** — every row this run stamps `ranked_intents = { ranked, _meta: { run_type } }`. The downstream `intent_proposals`/cluster refresh reads the `intent_proposal`/`proposal_reason` COLUMNS, so the JSONB envelope is non-breaking. Operators filter bootstrap-quality rows via `_meta.run_type`.
- **Event + serve registration** — `sales-email/retro-classify.requested` added to `events.ts` (with `bootstrap?: boolean`); `salesEmailStage3RetroClassify` added to the `functions:` array in `route.ts` next to `salesEmailStage1RetroClassify`.
- **Tests** — `sales-stage-3-retro-side-channel-isolation.test.ts` (source-grep guard: forbidden write targets absent, only `stage_3_retro_runs` written, `invokeSalesIntentAgent` called, `run_id` inside step.run, no `inngest.send`) + `sales-stage-3-retro-bootstrap-gate.test.ts` (all 4 cases: bypass-when-empty, refuse-when-seeded, tag-on-bootstrap vs run_type='normal', normal-gate-intact). **9 tests green.**

### Task 2 — manage-sales-intent-agent.ts (commit `48974e66`) — AUTOMATED PORTION COMPLETE; checkpoint remains

- **`scripts/orq/manage-sales-intent-agent.ts`** — one-off tsx following the canonical CLAUDE.md Orq workflow:
  1. **list_models FIRST** — fetches `/v2/models`, validates the primary (`aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0`) + every fallback (`openai/gpt-4o-mini`, `google-ai/gemini-2.5-flash`, `mistral/mistral-large-2411`) against the live catalog, throwing if any is absent (f980a2a1). **Live-verified: all 4 present.**
  2. **create_agent** with the BARE primary model id (create drops `response_format` — cba7352b).
  3. **update_agent PATCH** the full `model.parameters` (`temperature: 0`, `max_tokens: 1000`, root-level `fallback_models`, strict `json_schema` `response_format`).
  4. **get_agent** to verify persistence.
  - The `response_format` mirrors `salesIntentOutputSchema` with `anyOf` for EVERY nullable (`intent_proposal`/`proposal_reason`/`entity_relationship`), never `["string","null"]` (3970bad9).
  - The `intent` enum is sourced from `SWARM_INTENTS_BY_SWARM["sales-email"]` — **empty until Plan 04 seeds + codegens**. The script REFUSES `--finalize` while empty (exits non-zero with a clear "run after Plan 04" message); without `--finalize` it validates models + prints the json_schema (dry).
  - Does NOT create the json_schema TOOL RESOURCE — Studio-only (D-13). It prints the schema for the operator to paste.

## Verification

- `npx vitest run …sales-stage-3-retro-side-channel-isolation.test.ts …sales-stage-3-retro-bootstrap-gate.test.ts` → **9 tests green**; sibling `sales-email-stage-1-retro-classify.test.ts` still green (18 total).
- `npx tsc --noEmit` → **0 errors** (function + event + serve + script all type-check).
- Acceptance greps: forbidden write targets = **0**; `invokeSalesIntentAgent`/`swarm_intents`/`bootstrap`/`run_type` all present; `sales-email/retro-classify.requested` in `events.ts`; `salesEmailStage3RetroClassify` served.
- `npx tsx scripts/orq/manage-sales-intent-agent.ts` (live, dry) → **list_models validated all 4 model ids present**; json_schema printed; empty-enum guard fired (exit 2) as designed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Orq /v2/models validation matched on the wrong field + id form**
- **Found during:** Task 2 first live run.
- **Issue:** The script initially compared the wanted (provider-prefixed) model ids against the catalog's `id`/`model` fields. The Orq catalog returns the BARE model id in `model_id` (e.g. `eu.anthropic.claude-haiku-4-5-20251001-v1:0`, `gpt-4o-mini`) WITHOUT the `aws/`,`openai/`,… provider prefix the agent config carries. Result: all 4 valid ids were flagged "NOT in catalog" — a false fail that would have blocked agent creation.
- **Fix:** Parse `model_id` and compare the BARE wanted id (segment after the last `/`) against the catalog set. Re-verified live: all 4 present.
- **Files modified:** `web/scripts/orq/manage-sales-intent-agent.ts`.
- **Commit:** `48974e66`.

### Intentional divergences-from-debtor (planned)

- **Bounded bootstrap bypass** of the R-04 gate (the debtor analog always enforces ≥5 fresh clusters). Documented in the function header with the rationale (empty-cluster chicken-and-egg) and the safety bound (empty-swarm_intents-only, refuse-after-seed, tagged rows). Planned in the PLAN; not an unplanned deviation.
- **No baseline aggregation** — the sales `aggregate-baseline.ts` is Stage-1-shaped; a Stage-3 sales baseline is optional for V1 discovery and omitted to keep the side-channel tight. Documented inline.

## Checkpoint

**Type:** human-verify (blocking-human). The remaining Task 2 steps require human/external action I cannot perform autonomously — no Orq agent-CRUD MCP tool is available in this environment, and the json_schema tool resource is Studio-only by D-13/Pitfall 6.

**Completed autonomously (committed):**
- The retro-classify function + guard tests + event/serve registration (`e9cbb3fe`).
- The `manage-sales-intent-agent.ts` script, live-validated against the Orq catalog (`48974e66`).

**Awaiting operator (the 4 checkpoint steps):**
1. **Create the agent SHELL + json_schema in Orq Studio.** Run `cd web && npx tsx scripts/orq/manage-sales-intent-agent.ts` to print the json_schema; in Studio → Tools → Add → JSON Schema paste it, then on the `sales-intent-agent` set Model parameters → Response Format = that schema. Confirm the Model dropdown is NON-EMPTY (a bad model id renders it empty — Pitfall 5). NOTE: the script's `--finalize` path is intentionally blocked until Plan 04 (empty enum); in Plan 03 the agent is a SHELL with a placeholder schema so the bootstrap retro can run a discovery-grade pass.
2. **Run the bootstrap retro.** Trigger `sales-email/retro-classify.requested` with `bootstrap: true` + a recent Outlook `since`/`until` (e.g. last ~30–90d — do NOT default to a full SugarCRM sweep). Confirm `stage_3_retro_runs` gains sales rows tagged `ranked_intents._meta.run_type = "bootstrap"` and the sales `intent_proposal_clusters` surface becomes non-empty.
3. **Promote the vocabulary.** Review the populated `intent_proposal_clusters` and promote clusters up to the ~80% coverage threshold (D-02). This is a human judgment call — the vocabulary emerges from data + operator promotion, never hand-curated (STAGE3-02).
4. **Record the promoted vocabulary** in the yaml block below (one snake_case `intent_key` per item). Plan 04 Task 1 reads this block to seed `swarm_intents` deterministically; if it stays empty, Plan 04 falls back to reading the promoted clusters directly from the DB.

**Resume signal:** Type "agent created" (with the promoted intent_keys) or describe issues.

## Promoted Intents (operator hand-off to Plan 04)

> PENDING — populated by the operator after checkpoint step 3 (cluster promotion).
> Until then this list is intentionally EMPTY. Plan 04 Task 1's documented
> fallback (read promoted `intent_proposal_clusters` directly from the DB) covers
> the empty case. Replace the empty list with one snake_case intent_key per line
> once the operator promotes the vocabulary.

```yaml
promoted_intents: []
```

## Known Stubs

- **The sales intent enum is still `["other"]` placeholder** in `salesIntentOutputSchema` (inherited from Plan 01/02 — `sales-email` absent from `SWARM_INTENTS_BY_SWARM` until Plan 04 seeds `swarm_intents` + reruns codegen). This is the documented cross-plan handoff, not a stub introduced here. The retro function, the management script, and the json_schema all work with the placeholder and pick up the real enum automatically post-codegen with zero code change. The `manage-sales-intent-agent.ts --finalize` path is deliberately gated on the non-empty enum so the agent json_schema cannot ship with an empty `intent` enum.

## Threat Flags

None beyond the planned `<threat_model>`. T-113-04 (retro leak into live pipeline) mitigated by the source-grep side-channel guard; T-113-11 (bootstrap bypass seeding a degraded vocabulary) mitigated by the empty-swarm_intents bound + refuse-after-seed throw + run_type tagging; T-113-02 (ORQ_API_KEY) mitigated — the script reads the key from env only and logs the agent id, never the key; T-113-07 (cross-tenant SugarCRM) mitigated by the reused `selectCandidates` single-tenant invariant. No new network endpoint, auth path, or schema migration.

## Commits

- `e9cbb3fe` feat(113-03): sales Stage 3 retro-classify side-channel + bounded bootstrap bypass
- `48974e66` feat(113-03): manage-sales-intent-agent.ts — list_models-validated create→PATCH→verify (D-13)

## Self-Check: PASSED

All 4 created files exist; both task commits present in git history; new tests + sibling regression green; tsc clean; the management script live-validated against the Orq catalog.
