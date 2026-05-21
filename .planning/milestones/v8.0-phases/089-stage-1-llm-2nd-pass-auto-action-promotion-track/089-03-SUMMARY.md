---
phase: 089
plan: 03
subsystem: stage-1-classifier
tags: [stage-1, classifier, llm, inngest, seed, registry]
requirements: [SC-89-01, SC-89-05]
key-files:
  created:
    - web/lib/inngest/functions/classifier-llm-rules-seed.ts
    - web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
decisions:
  - "Used vi.hoisted() for mock state — vitest hoists vi.mock() factories above top-level const, so the analog pattern from classifier-screen-worker.gate.test.ts (which uses bare top-level vi.fn()) tripped the 'Cannot access before initialization' TDZ guard in this newer file. Switching to vi.hoisted() makes the harness hoist-safe."
metrics:
  duration: "~15min"
  tasks_complete: 2
  files_changed: 4
  tests_added: 5
completed: 2026-05-20
---

# Phase 089 Plan 03: Stage 1 LLM Rules Seed Summary

One-shot Inngest seed `classifier/llm-rules-seed.run` that upserts candidate `llm:{cat}:high` rows into `classifier_rules` for every (active swarm × enabled `swarm_noise_categories` row != 'unknown'), enabling the existing Wilson-CI promotion cron to promote LLM 2nd-pass verdicts.

## What Was Built

- **`classifier-llm-rules-seed.ts`** — Inngest one-shot function (event-only, `retries: 1`). Reads `swarms.enabled=true` directly, loops `loadSwarmNoiseCategories(swarm)` filtering `category_key !== 'unknown' && enabled !== false`, upserts `kind='agent_intent', status='candidate', n=0, agree=0, ci_lo=null` with `onConflict: "swarm_type,rule_key" do nothing`. Idempotent. JSDoc documents the RE-FIRE requirement (Pitfall 4) and the `unknown`-exclusion rationale (Anti-Pattern A6).
- **Vitest harness (5 cases)** — `unknown`-exclusion negative assertion, `onConflict` shape, multi-swarm walk, payload shape (`kind=agent_intent / status=candidate / n=0 / agree=0 / ci_lo=null`), disabled-category skip.
- **`events.ts` typed Event** — Added `classifier/llm-rules-seed.run` to the `Events` map for type-safe `inngest.send()`.
- **`route.ts` registration** — Added import + array entry to the Inngest serve() so the event is dashboard-fireable.

## Hard Invariants Verified

| Invariant | Verified by |
| --- | --- |
| Loops `swarms.enabled=true` (cross-swarm ready: debtor-email today, info@/sales@/order@ later) | Source L42-45; test "walks every enabled swarm" |
| Filters `category_key !== 'unknown'` | Source L52; test "not in keys" |
| `onConflict: "swarm_type,rule_key"` on every upsert | Source L70; test "every upsert uses onConflict" |
| `kind='agent_intent'`, `status='candidate'`, zeroed metrics | Source L62-67; test "payload shape" |
| Never inserts `llm:unknown:high` | Test asserts `expect(keys).not.toContain("llm:unknown:high")` |
| Replay-safe (all side effects inside `step.run`, deterministic rule_key) | Source L37 wraps whole loop |
| Does NOT touch `classifier-promotion-cron.ts` or `classifier_rule_telemetry.sql` (SC-89-05) | `git diff HEAD~3 HEAD -- <those files> \| wc -l` = 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Add `classifier/llm-rules-seed.run` to `Events` type map**
- **Found during:** Task 1 GREEN (`tsc --noEmit`).
- **Issue:** Inngest's `createFunction` overload constrains the trigger's `event` name to `keyof Events`. Without a typed entry, `tsc` reported `Type '"classifier/llm-rules-seed.run"' is not assignable to type 'undefined'`.
- **Fix:** Added a typed event entry next to the other `classifier/*.run` seed/backfill events in `web/lib/inngest/events.ts`.
- **Files modified:** `web/lib/inngest/events.ts`.
- **Commit:** `56bcb71`.

**2. [Rule 3 - Blocking] vitest hoist-safety for mock state**
- **Found during:** Task 1 first GREEN attempt.
- **Issue:** Copying the analog harness pattern from `classifier-screen-worker.gate.test.ts` (top-level `const inngestSend = vi.fn(); vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend, ...}}))`) failed under `vitest@4.1.5` with `ReferenceError: Cannot access 'inngestSend' before initialization`. `vi.mock` factories are hoisted above top-level `const` initializers; the gate test works only because its imported module path is also hoisted in a compatible order.
- **Fix:** Refactored mock state into a single `vi.hoisted(() => ({...}))` object (`h.swarmsData`, `h.catsQueue`, `h.classifierUpserts`, `h.adminMock`) referenced inside the `vi.mock` factories. This is the documented vitest-supported pattern and survives the hoisting reorder.
- **Files modified:** `web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts`.
- **Commit:** `56bcb71`.

No other deviations. No checkpoints. No authentication gates.

## Verification

- `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` → **Test Files 1 passed, Tests 5 passed**.
- `tsc --noEmit` clean for Phase 89 surfaces. (Two pre-existing, unrelated errors in `.next/types/validator.ts` and `lib/stage-0/strip-quoted-history.ts` — out of scope.)
- `git diff HEAD~3 HEAD -- classifier-promotion-cron.ts classifier_rule_telemetry.sql` = 0 lines (SC-89-05).

## Commits

| Hash | Type | Message |
| --- | --- | --- |
| `45d89a5` | test | (089-03) add failing tests for classifier-llm-rules-seed (RED) |
| `56bcb71` | feat | (089-03) seed candidate llm:*:high classifier_rules per active swarm (GREEN) |
| `9362a38` | chore | (089-03) register classifierLLMRulesSeed in Inngest serve() |

## Self-Check: PASSED

- FOUND: `web/lib/inngest/functions/classifier-llm-rules-seed.ts`
- FOUND: `web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts`
- FOUND commit `45d89a5`
- FOUND commit `56bcb71`
- FOUND commit `9362a38`
- All acceptance grep counts match plan spec (`classifier/llm-rules-seed.run=2`, `category_key !== "unknown"=1`, `onConflict=1`, `kind=agent_intent=1`, `status=candidate=1`).
