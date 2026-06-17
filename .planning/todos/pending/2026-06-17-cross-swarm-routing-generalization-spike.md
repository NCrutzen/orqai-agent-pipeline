---
created: 2026-06-17T00:00:00.000Z
title: Spike — routing as a generic cross-swarm Stage-3 capability (not info-routing-only)
area: agentic-pipeline
priority: milestone-design
trigger: when a SECOND concrete router is needed (sales / debtor / order-entry)
files:
  - web/lib/inngest/functions/debtor-email-coordinator.ts
  - web/lib/automations/info-routing/verdict.ts
  - web/lib/swarms/registry.ts
  - public.routing_destinations
---

## Context

Raised by the operator during Phase 131 (destination taxonomy + Stage-3 router). Phase 131 built
routing for the info-routing swarm, but routing is **not** an info-routing-specific concern — sales,
debtor, and order-entry will all want it (e.g. a customer sends one payment-confirmation mail to 5
mailboxes, or to 1; observed live 2026-06-17). Routing is "fairly general — at most a split per
business line (Middelen vs Opleidingen/Trainingen) or region (BX vs UK vs IE)."

## What already generalizes (do NOT rebuild)

- `routing_destinations` is keyed by `swarm_type`; the coordinator routing block is **capability-gated**
  (`routingDestinations.length > 0`), not swarm-hardcoded. Any swarm can get routing today by seeding
  rows + setting `stage3_coordinator_agent_key`. Zero `swarm_type` literal in the pipeline code.
- Per-swarm bucket enums are codegen'd from the registry (`routing-destinations.generated.ts`).

## Open design decisions (decide BEFORE rolling routing out to swarm #2)

1. **Agent strategy:** per-swarm router agent generated from the registry (current; keeps strict
   `json_schema` enum enforcement + per-swarm prompt nuance) vs. ONE generic router agent with the
   destination list injected per-call (no strict enum → Zod-validate against registry; zero per-swarm
   agents). Leaning toward per-swarm-generated-from-one-template.
2. **Registry dimensions:** the operator's variation axes — business line (Middelen vs
   Opleidingen/Trainingen) and region (BX vs UK vs IE; cf. the charter's `env_id='BX'` hard filter) —
   should become **columns** on `routing_destinations` (e.g. `scope`/`region`, `business_line`) that the
   resolver matches on, alongside `destination_key` + `brand`. NOT new agents, NOT code branches.
3. **Dedup as a shared Stage-3.5 capability:** the two-layer dedup guard (Phase 131 ROUTE-05) — "is this
   mail already delivered to the target mailbox?" — is also cross-swarm. Generalize it alongside the
   router (the 5-addresses payment-confirmation case is a dedup problem, not a routing one).

## Why deferred (premature-abstraction guard)

Only ONE concrete router exists today (info-routing). Abstracting from one example risks the wrong
abstraction. The generic machinery is already in place, so generalizing later is an EXTENSION (add a
column, register an agent), not a rewrite. Right trigger = router #2 (rule of three). Decide the three
points above deliberately at that point rather than rebuilding routing five times.
