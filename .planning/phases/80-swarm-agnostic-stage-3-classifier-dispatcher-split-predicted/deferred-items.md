# Phase 80 — Deferred / Out-of-Scope Items

## Pre-existing test failures (not introduced by Phase 80)

- `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` —
  2 tests fail with `TypeError: admin.schema is not a function`. The
  classifier-verdict-worker calls `admin.schema("email_pipeline").from(...)`
  but the test's Supabase mock does not implement `.schema()`. Pre-exists on
  main (verified by `git stash` + run on HEAD before Plan 80-03 started).
  Out of scope for Phase 80 — file untouched by this phase.

## Follow-up: v7 Kanban `assigned_agent` disambiguation (UAT Issue #2)

**Surfaced during:** Phase 80 UAT, Test 2.
**Decision (2026-05-11):** Ship Phase 80 as-is; create follow-up phase.

`web/lib/automations/swarm-bridge/sync.ts` — `triageAgentFromStatus()` and
`triageStageFromStatus()` receive only `row.status`, not `tool_outputs`. Since
`agent_runs.status='predicted'` is written by **five** workers across Stages
0–3 with different `tool_outputs` markers, the single-status switch mis-labels
non-Stage-3 predicted rows on the v7 kanban (`/swarm/[swarmId]`).

Pre-Phase-80 default: every `predicted` row → "Copy-Document Agent" (the
catch-all default).
Post-Phase-80 (80-04): every `predicted` row → "Stage 3 Dispatcher" (correct
for Stage 3, wrong for Stage 0/1/2).

**Live production counts (2026-05-11):** 216 `agent_runs.status='predicted'`
rows in last 7d — 125 sales-email + 91 debtor-email, all from Stage 1
screen-worker (`tool_outputs.stage1_category` populated, `intent_first_pass`
absent). Stage 3 predicted rows: 0 (not deployed yet).

**Fix (option B from UAT):** Thread `tool_outputs` into
`triageAgentFromStatus` / `triageStageFromStatus` and branch on:
- `tool_outputs ? 'intent_first_pass'` → Stage 3 Dispatcher
- `tool_outputs ? 'stage1_category'`   → Stage 1 (label per producer; e.g.
  Screen Worker, Label Resolver, Spotcheck Sampler — discriminate further on
  marker keys if needed)
- other shapes → Stage 0 Safety / Stage 2 Copy-Document handler as
  appropriate.

Plus tests for each branch, plus a soft regression test for the v7 kanban
rendering with mixed Stage 0/1/2/3 predicted rows.

**Suggested phase:** 80.1 — "v7 kanban assigned_agent disambiguation".
Single-plan phase, 1–2 commits. No data migration. Self-contained inside
`web/lib/automations/swarm-bridge/`.
