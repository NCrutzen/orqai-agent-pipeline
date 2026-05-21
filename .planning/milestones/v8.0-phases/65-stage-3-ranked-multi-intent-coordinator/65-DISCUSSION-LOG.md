# Phase 65: Stage 3 ranked multi-intent coordinator — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `65-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 65-stage-3-ranked-multi-intent-coordinator
**Areas discussed:** Coordinator agent identity + model, Stage 3.5 orchestrator-worker mechanics, requires_orchestration + interim threshold, Backwards-compat + Phase 66 alignment

---

## Coordinator agent identity + model

### Q1: How do we evolve the existing single-label `debtor-intent-agent` into the ranked-intent coordinator?

| Option | Description | Selected |
|---|---|---|
| New agent: `debtor-coordinator-agent` | Fresh `orq_agents` row + Orq Studio agent with ranked output_schema. Parallel run for compare; Phase 66 deletes loser. | |
| Replace in-place: bump `debtor-intent-agent` to ranked schema | Update `orq_agents.output_schema`, version v2, same agent_key. | ✓ |
| Wrap pattern: TS code calls existing agent | Code-level rank synthesis; loses ranking model benefit. | |

**User's choice:** Replace in-place (after asking "Why do we need this intent agent?" and then "Why do you want to defer from the debtor-intent-agent?").

**Notes:** User pushed back on the "new agent" recommendation. Honest re-analysis showed the role is unchanged, the only delta is output shape, and a parallel new agent buys ~10 days of A/B insurance at the cost of double-registry maintenance — exactly the failure mode burned in Phase 64 (learning `f980a2a1`). Locked in-place replacement; agent_key stays `debtor-intent-agent`; version bumps `2026-04-23.v1` → `2026-05-01.v2`.

### Q2: Coordinator model

| Option | Description | Selected |
|---|---|---|
| Sonnet 4.5 | `anthropic/claude-sonnet-4-5-20250929` (Anthropic-direct) or Bedrock-EU. Strong ranking quality, modest cost. | ✓ |
| Haiku 4.5 (current) | `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0`. Cheapest; ranking quality risk. | |
| Opus 4.6 | `aws/eu.anthropic.claude-opus-4-6-v1` (Bedrock EU). Highest quality, ~5–10x cost vs Sonnet. | |

**User's choice:** Sonnet 4.5.

**Notes:** Brief explicitly recommended Sonnet. Fallback chain: Bedrock-EU Sonnet → `openai/gpt-4o` → `google-ai/gemini-2.5-pro` → `mistral/mistral-large-2411`. (CLAUDE.md notes `mistral-large-latest` does not exist in Orq's catalog — must use the dated pin.)

---

## Stage 3.5 orchestrator-worker mechanics

### Q3: How should fan-out + synthesis actually work when the coordinator escalates?

| Option | Description | Selected |
|---|---|---|
| Inngest fan-out | Coordinator emits N parallel handler events; fan-in worker runs synthesis. | |
| Orq orchestrator agent (tools-as-handlers) | One orchestrator LLM with handler agents as Orq tools; fan-out lives inside one Orq call. | |
| Hybrid: orchestrator agent plans, Inngest executes | Orchestrator returns plan; Inngest dispatches; synthesis agent merges. | ✓ |

**User's choice:** Hybrid.

**Notes:** Hybrid was framed in the description as adding a third LLM call (planner) on top of ranking. User picked it anyway, signalling that per-handler context extraction and cross-handler dependency expression — what the planner adds beyond pure ranking — were considered worth the extra call.

### Q4: Where does the orchestrator-planner live?

| Option | Description | Selected |
|---|---|---|
| Separate `debtor-orchestrator-agent` | New row, runs only on escalation. | ✓ |
| Single agent: coordinator returns rank + plan | Conditional output_schema, one LLM call on escalation. | |
| Code-only planner (no LLM) | Deterministic TS mapping; loses planner-LLM benefit. | |

**User's choice:** Separate `debtor-orchestrator-agent`.

**Notes:** Keeps coordinator prompt focused on rank-only so the 80% fast path stays cheap. Sonnet 4.5 for both.

### Q5: How does Inngest know all parallel handlers finished?

| Option | Description | Selected |
|---|---|---|
| Supabase counter + RPC trigger | `coordinator_runs.expected_handlers` + atomic increment; RPC emits `synthesis.requested` when complete. | ✓ |
| Inngest `step.waitForEvent` fan-in | Orchestrator awaits N events in parallel; orchestrator stays alive for whole window. | |
| Per-handler emit + idempotent synthesis worker | Each handler emits `handler-completed`; worker checks count in DB. | |

**User's choice:** Supabase counter + RPC trigger.

**Notes:** Pattern aligns with how `automation_runs` already works; the counter row is also the home for the run-level decisions, not just fan-in plumbing.

### Q6: Failure semantics when one of N parallel handlers fails or times out

| Option | Description | Selected |
|---|---|---|
| Synthesise from successful handlers + flag partial | Partial draft + `partial_synthesis=true` + footer noting unaddressed intents. | ✓ |
| Fail the whole run — route to human queue | Any failure aborts; lands in Kanban Human Review. | |
| Fall back to top-intent single-shot | Drop orchestrator path on any failure; secondary intents silently dropped. | |

**User's choice:** Synthesise + flag partial.

**Notes:** Operator UX wins; never silently drop secondary intents.

### Q7: Synthesis step — new dedicated agent, or extend the existing body agent?

| Option | Description | Selected |
|---|---|---|
| New `debtor-synthesis-agent` | Per-swarm synthesis, debtor-prefixed. | |
| Extend `debtor-copy-document-body-agent` | Bump input_schema to accept `intent_results[]`. | |
| (added during discussion) Cross-cutting `synthesis-agent` on canonical `HandlerOutput` | Single cross-swarm agent; each handler conforms to canonical output. | ✓ |

**User's choice:** Cross-cutting (after asking "What is the best solution for the long term as more single-shot agents/automations enter the workforce?").

**Notes:** User's question pulled in Phase 69's cross-swarm scaling concern. Honest answer: per-swarm synthesis agents would be copy-pasted by phase 73; cross-cutting on a canonical output shape costs about a half-plan now and saves a Phase 69 backport. Pulled forward part of CANO-*'s work to land here. Synthesis agent model = Sonnet 4.5.

### Q8: Budget propagation across parallel children

| Option | Description | Selected |
|---|---|---|
| Parent budget passed via event.data, children check before LLM calls | Shared counter in `coordinator_runs`, breach via existing `pipeline.budget_breached`. | ✓ |
| Per-child slice (budget / N) | Equal division; under-utilises and arbitrary. | |
| Defer to planner | Claude's Discretion. | |

**User's choice:** Parent budget shared via event.data + counter RPC.

**Notes:** Honours Phase 64 D-15 ("per-run = one top-level Inngest invocation") by treating the orchestrator family as one logical run via shared `run_id`.

---

## requires_orchestration + interim threshold

### Q9: Where does `requires_orchestration` live until Phase 68 ships `swarm_intents`?

| Option | Description | Selected |
|---|---|---|
| `swarm_categories.requires_orchestration` boolean column | ALTER TABLE adds boolean DEFAULT false; Phase 68 migrates cleanly. | ✓ |
| Hardcoded array in code | `web/lib/agentic-pipeline/orchestration.ts` constants set; deploy to toggle. | |
| Registry-driven from `orq_agents.notes` JSON | Reuse existing table; the flag belongs to intent, not handler. | |

**User's choice:** `swarm_categories` column.

**Notes:** Phase 64 D-07 already chose `swarm_categories.key` as the intent identifier; reuse the same row.

### Q10: Interim escalation gate (RFC defers numeric thresholds to Phase 71)

| Option | Description | Selected |
|---|---|---|
| Tri-state mapping + intent_count rule | Reuse existing `{low, medium, high}` enum; escalate on `low` OR count≥3 OR flag. | ✓ |
| Numeric pin: 0.7 hard-coded in env | Schema becomes float; arbitrary number drives debate. | |
| Per-intent override in `swarm_categories` | Per-row `escalate_below_confidence`; high config surface. | |

**User's choice:** Tri-state.

**Notes:** No numeric threshold to defend; matches the agent's existing enum; Phase 71 cleanly swaps in numeric on a separate axis.

---

## Backwards-compat + Phase 66 alignment

### Q11: How does Phase 65 land relative to `debtor-email-triage`?

| Option | Description | Selected |
|---|---|---|
| Replace in-place + pre-stage Phase 66 events | Rewrite triage function to be the new coordinator; emit canonical `debtor-email/<intent>.requested` events now. | ✓ |
| Build coordinator alongside, Phase 66 cuts over | New function gated by feature flag; A/B for one phase. | |
| Freeze triage, route only NEW flows through coordinator | Coordinator handles new emails only; degenerate (no clean boundary). | |

**User's choice:** Replace in-place + pre-stage.

**Notes:** Phase 66's diff shrinks to a rename + legacy-code delete. No parallel paths in production; no feature flag.

### Q12: Where does the ranked list + escalation decision get persisted until Phase 70 ships `pipeline_events`?

| Option | Description | Selected |
|---|---|---|
| New `coordinator_runs` table | Holds ranked_intents, escalation_decision, expected/completed_handlers, partial_synthesis. | ✓ |
| Extend `automation_runs.result` jsonb | No new table; jsonb increments don't atomically support fan-in counter. | |
| Reuse `agent_runs` | Per-call telemetry; ranked list is per-RUN, not per-call. | |

**User's choice:** New `coordinator_runs` table.

**Notes:** Single home for the ranked list + the fan-in counter (D-04 requires the row anyway). Phase 70 either backfills `pipeline_events` from it or keeps it as a denormalised read-model.

---

## Claude's Discretion

- Concurrency limits on fan-out (per-`(entity, run_id)` scoping).
- Idempotency keys for orchestrator + synthesis steps.
- iController draft creation post-synthesis (reuse vs shared helper).
- Exact RPC name + signature for `coordinator_complete_handler`.
- Coordinator agent idempotency cache invalidation (handled by `intent_version` literal).
- Orchestrator-planner output schema `notes` field shape.
- Eval / regression strategy on the rank-shape change (size of backfill sample).

## Deferred Ideas

- Numeric confidence threshold → Phase 71.
- `swarm_intents` table migration → Phase 68.
- Canonical handler INPUT shape → Phase 69.
- Canonical `pipeline_events` table → Phase 70.
- Bulk Review override UI for ranked output → Phase 71.
- Sales-email coordinator → Phase 73.
- Per-coordinator-run cost tracking → tied to Phase 64's deferred cost-tracking gap.
