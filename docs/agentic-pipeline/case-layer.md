# Case Layer & Outbound Entry

> **Status:** RFC stub — shape proposal, not yet locked. Pinned ahead of Invoice→Payment cycle integration to constrain the design space before code lands.
> **Audience:** engineers about to extend the v8.0 funnel from inbound-reactive (debtor email) to full-cycle (invoice → dunning → payment / escalation).
> **Relationship to existing RFC:** additive. Does NOT supersede [`./README.md`](./README.md), the [context-shape contract](./context-shape-contract.md), or the [4-axis override model](./override-model.md). It adds a layer ABOVE the funnel and a second ENTRY into it.

## Why This Doc Exists

The 5-stage funnel is **inbound-reactive**: an email (or webhook) arrives, gets classified, and a handler acts. The full debtor cycle is **outbound-stateful**: an invoice ages, dunning step 1 fires on day N, step 2 on day N+M, a phone call on day N+M+K, legal handoff on day N+M+K+L — interleaved with whatever inbound emails happen to arrive about that same invoice.

Three structural gaps make today's funnel insufficient on its own for the cycle:

1. **No case spine.** Today `automation_runs` is per-email. A cycle needs an entity that owns lifecycle state across many emails, calls, and outbound nudges for the same invoice / debtor.
2. **No outbound entry.** A cron-driven "send dunning step 2" event has no body to safety-check or regex-route. It must enter the funnel partway in, with intent already known.
3. **No case-level override axis.** "Pause all dunning for debtor X for two weeks" is not a per-stage correction — it's a policy decision scoped to a case, not a pipeline run.

This RFC names those three gaps and proposes the smallest shape that closes them without re-architecting the funnel.

## Shape At A Glance

```
                      ┌────────────────────────────────────┐
                      │            CASE LAYER              │
                      │  debtor_case (one per invoice or   │
                      │  per debtor cycle — TBD)           │
                      │  state machine + policy table      │
                      └────────────────────────────────────┘
                          ▲                          │
              writes      │                          │  emits outbound
              events      │                          ▼  events (cron / state)
                          │              ┌──────────────────────┐
                          │              │ OUTBOUND ENTRY       │
                          │              │ (skips Stage 0 + 1;  │
                          │              │  intent already set) │
                          │              └──────────┬───────────┘
                          │                         │
   inbound (email)        │                         │
        │                 │                         │
        ▼                 │                         ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Stage 0 │→ │ Stage 1 │→ │ Stage 2 │→ │ Stage 3 │→ │ Stage 4 │→ side-effects
   └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
                                  │             │           │
                                  └─────────────┴───────────┘
                                  every stage carries case_id
                                  and writes events to the case
```

The funnel itself is unchanged. What's added: a case entity above it, a second entry path into Stage 2/4, and a `case_id` field on the cross-stage context.

## The Case Entity (sketch — not locked)

| Field | Notes |
|---|---|
| `case_id` | Stable identifier. One case per invoice (probably) — see [Open Questions](#open-questions). |
| `entity_brand` | Same registry-driven dimension as everywhere else (Phase 68 `swarms.entity_brand`). |
| `customer_id` | Backend-stable, same vocabulary as `PipelineStageContext.customer_id`. |
| `subject_ref` | Foreign reference to the thing the case is about — invoice id today; later possibly contract id, claim id, etc. |
| `state` | State-machine value: `open` → `dunning_1` → `dunning_2` → `call_pending` → `legal_review` → `closed_paid` / `closed_writeoff` (illustrative — actual states defined per swarm). |
| `next_action_at` | Timestamp the case-runner cron compares against. Null = no scheduled outbound action. |
| `policy` | JSONB of case-level overrides (see Axis 5 below): `paused_until`, `force_channel`, `skip_step`, etc. |
| `last_event_id` | Pointer into `pipeline_events` (Phase 70) for fast "what happened last" lookup. |

**Key invariant:** the case is the *spine*, not a participant in the funnel. Stages 0-4 read `case_id` from context and write events back to the case; they don't ask the case to make decisions for them. The case's own decisions (what's `next_action_at`, which state to advance to) live in a deterministic state machine + policy table — explicitly NOT an LLM agent. See [When To Add A Case-Level Orchestrator](#when-to-add-a-case-level-orchestrator).

## Outbound Entry Path

Outbound events (cron-driven dunning, scheduled callback, manual operator nudge) bypass Stage 0 and Stage 1 because there's no inbound payload to safety-check or regex-classify. They enter at Stage 2 with the intent already known.

| Stage | Inbound (today) | Outbound (proposed) |
|---|---|---|
| Stage 0 — safety | runs | **skipped** (no untrusted body) |
| Stage 1 — regex | runs | **skipped** (intent set by case state machine) |
| Stage 2 — entity | runs (resolves customer from sender) | runs (customer already on case; Stage 2 enriches `recent_documents`) |
| Stage 3 — coordinator | runs (ranks intents) | **skipped** OR runs in a degenerate "single-intent confirmed" mode (TBD — see [Open Questions](#open-questions)) |
| Stage 4 — handler | runs | runs (handler chosen by case state, not by Stage 3) |

The outbound entry MUST still:

- Stamp `case_id`, `context_version`, and the originating state-machine transition onto the `pipeline_events` row.
- Use the same `zapier_tools` allowlist machinery as inbound — Stage 4 doesn't know whether it was called from inbound or outbound, and shouldn't.
- Be subject to the per-run cost ceiling (`BUDG-01`, Phase 64) just like inbound.

What outbound entry MUST NOT do: invent a new tool path, new prompt structure, or new telemetry shape. If it needs something the inbound path doesn't have, that's a signal to add it to the shared contract — not to fork.

## Axis 5 — Case-Policy Override (proposed)

The current 4-axis model corrects per-pipeline-run decisions. Case-level decisions need their own axis.

| Axis | Stage / Layer | Override meaning | Hook |
|---|---|---|---|
| 1 | Stage 1 | Wrong category | regex-rule promotion |
| 2 | Stage 2 | Wrong customer | sender-mapping promotion |
| 3 | Stage 3 | Wrong intent | prompt-tune trigger |
| 4 | Stage 4 | Wrong handler output | prompt-tune / handler replacement |
| **5** | **Case layer** | **Wrong case action / timing** | **policy-rule promotion (e.g. "always pause dunning for customers on payment plan X")** |

Axis 5 captures things the per-stage axes can't express: pause/resume, channel forcing (email vs call), step skipping, escalation timing changes. The graduated-automation ladder applies the same way — once an operator-applied policy has enough samples, it promotes from manual override to a deterministic rule in the case state machine.

## When To Add A Case-Level Orchestrator

Same rule as Stage 3.5 (Debbie): **only when telemetry forces it.**

- Day-1: case advances via deterministic state machine + rules table. No LLM.
- Promote to LLM orchestrator only when (a) ≥3 competing policies exist, (b) the rules table is being patched weekly, and (c) operators are routinely overriding the deterministic choice on Axis 5.
- Until those conditions hold, an LLM "case manager" is unjustified cost and an extra debug surface.

A debtor-cycle Debbie ("Cassie"? — naming TBD) is plausibly a Phase 7x or 8x conversation, not Phase 65.

## Contract Touchpoints

These are the concrete edits the case layer implies on existing contracts. Listed so they can be reviewed before the first PR lands:

- **`PipelineStageContext`** — add optional `case_id: string | null` and optional `case_state: string | null`. Additive, stays at `context_version: 1`.
- **`pipeline_events` (Phase 70)** — add `case_id` column; add `entry_mode: 'inbound' | 'outbound'`.
- **`zapier_tools`** — no schema change required; outbound just calls the same allowlist.
- **Override-model doc** — add Axis 5 section once Axis 5 capture surface is designed.

## Open Questions

These are the things this stub explicitly does NOT decide. Each needs an answer before code lands.

1. **Case granularity.** One case per invoice, or one rolling case per debtor with invoices as line items? Affects how multi-invoice reminders are modelled.
2. **Stage 3 on outbound.** Skip entirely, or run in a "confirm single-intent" mode that lets the coordinator veto a stale outbound action (e.g. don't send dunning if the latest inbound says "paid yesterday")? Latter is safer; former is cheaper.
3. **Case ↔ thread linkage.** When inbound arrives, how is `case_id` resolved? Subject-line invoice number? Customer + open-case lookup? LLM tiebreaker? Probably mirrors Stage 2 entity resolution.
4. **State machine location.** Inngest functions (durable, fits the tooling) vs Supabase + cron (simpler, no new infra). Likely Inngest given the rest of the stack.
5. **Outbound rate limits.** Per-debtor "no more than one outbound per 24h" guard — case layer concern or Stage 0 budget concern?
6. **Closure semantics.** Who closes a case — the state machine on payment confirmation (NXT poll), or a handler intent like `payment_confirmed`?

## Phase Mapping (provisional)

| Work | Earliest phase | Notes |
|---|---|---|
| Lock case entity shape + open questions 1–6 | Pre-implementation spec phase | Discuss-phase first, do not jump to plan. |
| `case_id` on `PipelineStageContext` | Phase 64 or 70 (whichever codifies types first) | Additive, no version bump. |
| `debtor_case` table + state machine | New phase (7x) | Inngest-driven. |
| Outbound entry path | Same phase as `debtor_case` | Reuses Stage 2/4. |
| Axis 5 capture surface | Aligns with Phase 71 Bulk Review 4-axis UI — extend to 5-axis | Don't ship a separate UI. |
| Case-level orchestrator (LLM) | Not before Axis 5 telemetry shows it's needed | See [When To Add](#when-to-add-a-case-level-orchestrator). |

## See Also

- [`./README.md`](./README.md) — RFC entry point, 5-stage funnel, tenancy.
- [`./context-shape-contract.md`](./context-shape-contract.md) — Stage 2→3 contract; the place `case_id` will be added.
- [`./override-model.md`](./override-model.md) — current 4-axis model; Axis 5 extends this.
- [`./graduated-automation.md`](./graduated-automation.md) — same promotion ladder applies to case-level rules.
- [`../debtor-email-pipeline-architecture.md`](../debtor-email-pipeline-architecture.md) — debtor-email implementation map (today's inbound-only scope).
