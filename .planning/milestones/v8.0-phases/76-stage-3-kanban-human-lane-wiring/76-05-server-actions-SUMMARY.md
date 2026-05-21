---
phase: 76
plan: 05
subsystem: kanban-server-actions
tags: [server-actions, kanban, override-handler, security, registry-validation]
requires:
  - "Plans 76-01..04 complete: handler_status column, Stage 3 dispatch writes Kanban rows"
  - "@/lib/swarms/registry: loadSwarm, loadSwarmIntents, loadSwarmNoiseCategories, loadHandlerEvent"
  - "@/lib/automations/runs/emit: emitAutomationRunStale"
  - "@/lib/inngest/client: inngest"
provides:
  - "closeKanbanRow Server Action (web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts)"
  - "replayKanbanRow Server Action with same-intent / edited-intent branch (D-01)"
  - "reclassifyAsNoise Server Action emitting axis-1 override (D-03)"
  - "loadKanbanRows server-side loader with deterministic event_id surfacing (W4)"
affects:
  - "Plans 76-06, 76-07: tab UIs that call these Server Actions and consume loadKanbanRows"
  - "debtor-email-override-handler.ts: now receives axis-1 + axis-3 emits from operator-driven path"
tech-stack:
  added: []
  patterns:
    - "registry-driven validation before any state-mutating Server Action call (loadSwarm, loadSwarmIntents, loadSwarmNoiseCategories)"
    - "compound-filter UPDATE (.eq id + .eq swarm_type + .eq status='pending') for cross-swarm IDOR safety"
    - "inngest.send via SendFn binding cast (CLAUDE.md commit dae6276 — preserve `this` context)"
    - "first-write-wins Map after ORDER BY DESC for deterministic per-key surfacing across replay"
key-files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts (121 lines)"
    - "web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts (49 lines)"
    - "web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts (126 lines)"
    - "web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts (107 lines)"
  modified:
    - "web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts (it.todo → 8 GREEN it())"
    - "web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts (it.todo → 5 GREEN it())"
    - "web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts (it.todo → 8 GREEN it())"
    - "web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts (it.todo → 6 GREEN it())"
decisions:
  - "D-01 LOCKED: replay branches on intent. same-intent → direct handler_event dispatch (no override row). edited-intent → axis-3 override.submitted; existing handler writes pipeline_events + re-dispatch."
  - "D-03 LOCKED: reclassify emits axis-1 override.submitted with eval_type='regression'. Defensive 'unknown' rejection before any DB call (CONTEXT.md deferred-ideas: dropdown excludes 'unknown')."
  - "W3 LOCKED: swarm_noise_categories canonical field is `category_key`. No `noise_key || category_key` fallback shipped — registry has one field name."
  - "W4 LOCKED: pipeline_events join uses ORDER BY created_at DESC + first-write-wins Map. Surfaced event_id is deterministically the most-recent prior emit per (email_id, stage)."
  - "Security model: every operator-supplied identifier (swarmType, chosenIntent, noiseKey) is registry-validated before any side effect. Compound filter on UPDATE prevents cross-swarm IDOR even if registry validation is bypassed."
metrics:
  duration: "~25 min (sequential on main tree, no checkpoint)"
  tasks_completed: 3
  files_changed: 8
  tests_added: 27
  completed_date: "2026-05-07"
---

# Phase 76 Plan 05: Server Actions Summary

**One-liner:** Three operator Server Actions (Close, Replay, Reclassify-as-noise) plus the kanban-loader.ts SELECT helper — registry-validated, IDOR-safe, with deterministic pipeline_events lineage surfacing for axis-1/axis-3 overrides.

## What shipped

### Production files (4)

| File | Lines | Provides |
|------|-------|----------|
| `kanban/_lib/kanban-loader.ts` | 121 | `loadKanbanRows(admin, swarmType)` — pending Kanban rows with stage_1_event_id + stage_3_event_id surfaced for override emits |
| `kanban/actions/close.ts` | 49 | `closeKanbanRow({ kanbanRowId, swarmType })` — terminal Close action with registry + compound-filter guards |
| `kanban/actions/replay.ts` | 126 | `replayKanbanRow({ ... })` — D-01 two-branch dispatch (same-intent direct handler_event vs edited-intent axis-3 override) |
| `kanban/actions/reclassify-noise.ts` | 107 | `reclassifyAsNoise({ ... })` — D-03 axis-1 override; 'unknown' defensively rejected |

### Test files (4) — all GREEN

| File | Cases | Coverage |
|------|-------|----------|
| `kanban-loader.test.ts` | 8 | SELECT shape, W4 ordering, W4 first-write-wins, populated event_ids, R-3 null email_id graceful, empty result, SELECT error |
| `close.test.ts` | 5 | Missing args, T-76-05-03 unknown swarm, happy path, T-76-05-04 IDOR, supabase update error |
| `replay.test.ts` | 8 | Missing args, T-76-05-03, T-76-05-01 (typo + injection), D-01 same-intent, no-handler_event, D-01 edited-intent, R-4 placeholder, T-76-05-04 IDOR |
| `reclassify-noise.test.ts` | 6 | Missing args, D-03 'unknown' guard, T-76-05-03, T-76-05-02 (typo + injection), happy path, R-3 null event_id |

**Total: 27 tests, all GREEN. `cd web && npx tsc --noEmit` clean.**

## Security gate evidence

### Cross-swarm reuse target (RESEARCH §R-6)

```
$ grep -nE "'(debtor-email|sales-email)'" <production files> | wc -l
0
$ grep -nE '"(debtor-email|sales-email)"' <production files> | wc -l
0
```

Zero literal swarm names in any of the 4 production files. The string `"debtor-email/override.submitted"` IS present in replay.ts + reclassify-noise.ts — but it's an Inngest **event name**, not a swarm_type value. Phase 78 (sales-email) drops in by registry insert; this event name is the override-handler's input contract and is renamed only when the override-handler itself is generalized (out of Phase 76 scope).

### IDOR test results (T-76-05-04)

- `close.test.ts` — "T-76-05-04 IDOR: cross-swarm rowId returns no rows → { ok:false }" — PASS
- `replay.test.ts` — "T-76-05-04 IDOR: cross-swarm row UPDATE matches 0 rows → { ok:false }" — PASS
- All three Server Actions use compound `.eq('id', rowId).eq('swarm_type', swarmType).eq('status', 'pending')` filter pattern.

### Registry-validation tests

- `replay.test.ts` "T-76-05-01" — rejects `'not_in_registry'` AND `"'; DROP TABLE swarm_intents--"` — both return `{ ok:false, error:'unknown intent' }`.
- `reclassify-noise.test.ts` "T-76-05-02" — rejects `'not_in_registry'` AND `"'; DROP TABLE swarm_noise_categories--"` — both return `{ ok:false, error:'unknown noise key' }`.

## W3 gate evidence (single canonical noise field)

```
$ grep -nE 'noise_key\s*\|\|\s*category_key|noise_key\s*\?\?\s*category_key' \
    web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts | wc -l
0

$ grep -nE 'c\.category_key' \
    web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts | wc -l
3
```

The Server Action reads `c.category_key === args.noiseKey` exclusively. No defensive `||` / `??` fallback shipped — `web/lib/swarms/types.ts:86` is the source of truth: `category_key: string` is the single canonical field.

## W4 gate evidence (deterministic pipeline_events lineage)

```
$ grep -E 'order\(.*created_at.*ascending: false' \
    web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts | wc -l
2
```

Both the automation_runs SELECT and the pipeline_events SELECT are ordered DESC.

```
$ grep -nE '!stage1Map\.has|!stage3Map\.has' \
    web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts
104:    if (ev.stage === 1 && !stage1Map.has(ev.email_id)) {
107:    if (ev.stage === 3 && !stage3Map.has(ev.email_id)) {
```

First-write-wins guards in place on both stage maps. Combined with the DESC ordering, this guarantees the surfaced `stage_1_event_id` / `stage_3_event_id` is the **most recent** prior emit per email — deterministic across replay and across Postgres planner choice.

The dedicated test "W4: first-write-wins — most recent stage_1 event wins when multiple exist for same email_id" (kanban-loader.test.ts) feeds two stage-1 rows for the same email_id (`ev-newest` then `ev-older`) and asserts the surfaced id is `ev-newest`. PASS.

## Pipeline architecture compliance

Hard separation rule from RFC `docs/agentic-pipeline/README.md`:

- **replay.ts** consumes `swarm_intents` only via `loadSwarmIntents` + `loadHandlerEvent`. Never reads `swarm_noise_categories`. Emits axis-3 (`stage_3_intent`).
- **reclassify-noise.ts** consumes `swarm_noise_categories` only via `loadSwarmNoiseCategories`. Never reads `swarm_intents`. Emits axis-1 (`stage_1_category`).
- **kanban-loader.ts** queries Stage 1 + Stage 3 events via the `pipeline_events.stage` column but does NOT blur per-stage semantics — Stage 1 event_ids feed reclassify (axis-1); Stage 3 event_ids feed replay (axis-3).

## Deviations from Plan

None. Plan executed exactly as written. The 'mistral/mistral-large-2411' / Anthropic-routing notes in CLAUDE.md are not exercised by this plan (no Orq.ai calls).

## Open known gaps (carried from plan, not regressions)

- **R-3 nullable originalEventId**: emits with `original_event_id: null`. The override-handler accepts this today (test `R-3` in reclassify-noise.test.ts asserts the null is forwarded). If a future override-handler tightens its schema to require an event_id, that's a downstream regression to address there, not in this plan.
- **R-4 edited-intent → placeholder intent**: when operator picks an intent whose `handler_status='placeholder'`, the override handler will resolve the new intent and try to dispatch — landing on the same `no_handler` path that this Phase 76 wires up. Result: a NEW Kanban row for the operator-chosen intent. Acceptable for v1; a UI hint ("This intent has no handler yet — it will land back in Kanban") is a Plan 76-06/07 polish item.

## Commits

| Hash | Message |
|------|---------|
| `e1da117` | feat(76-05): kanban-loader + closeKanbanRow Server Action |
| `0e4e066` | feat(76-05): replayKanbanRow Server Action — D-01 two-branch dispatch |
| `9175869` | feat(76-05): reclassifyAsNoise Server Action — D-03 axis-1 override |

## Self-Check

- `web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts` — FOUND
- `web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts` — FOUND
- `web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts` — FOUND
- `web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts` — FOUND
- Commit `e1da117` — FOUND
- Commit `0e4e066` — FOUND
- Commit `9175869` — FOUND

## Self-Check: PASSED
