---
created: 2026-06-17T00:00:00.000Z
title: Rename the generic Stage-3 coordinator off its legacy "debtor-email" name
area: agentic-pipeline
priority: cleanup-refactor
files:
  - web/lib/inngest/functions/debtor-email-coordinator.ts
  - (all importers + tests referencing debtorEmailCoordinator)
---

## Context

Raised by the operator during Phase 131. `web/lib/inngest/functions/debtor-email-coordinator.ts` is in
fact the **generic cross-swarm Stage-3 coordinator** — it listens to the producer-agnostic
`pipeline/coordinator.requested` event and serves debtor-email, sales-email AND info-routing, all via
the registry (zero `swarm_type` literal). The name is a legacy artifact from when it started as the
debtor coordinator (~Phase 85) and was later generalized; the name never caught up. It is genuinely
confusing ("hoe zit het met sales?").

## Target

Rename to a swarm-neutral name, e.g. `stage3-coordinator` / `automations/pipeline-coordinator`.

## Why this is its own task (not a bolt-on)

The Inngest **function id** `automations/debtor-email-coordinator` is a **durable identity**. Changing
it = a new function to Inngest; in-flight runs and replay history are keyed to the old id. This needs a
deliberate migration (register the new id alongside the old, drain in-flight, then retire the old),
NOT a spontaneous rename. The rest (export name `debtorEmailCoordinator`, file name, imports, tests) is
mechanical but wide.

## Scope checklist (when picked up)

- [ ] New Inngest function id + migration plan for in-flight/replay safety
- [ ] Rename export `debtorEmailCoordinator` + file + all imports
- [ ] Update tests + any docs referencing the old name
- [ ] Confirm `pipeline/coordinator.requested` subscription unchanged (event name is already neutral)
