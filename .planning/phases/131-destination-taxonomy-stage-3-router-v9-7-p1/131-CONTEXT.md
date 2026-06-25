# Phase 131: Destination taxonomy + Stage-3 router - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Stage-3 routing layer for the info-routing swarm: a brand-aware destination registry + an `info-routing-coordinator` Orq agent that classifies each Stage-1-cleared actionable info@ email onto a destination and persists a rich destination verdict. Verdict-only — no Outlook forward, no Stage 2. The WHAT is locked by `131-SPEC.md` (8 requirements); this context captures the HOW.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `131-SPEC.md` for full requirements, boundaries, and acceptance criteria. Downstream agents MUST read `131-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):** frozen 6-7 bucket destination taxonomy as a brand-aware registry (bucket × brand → verified mailbox); `info-routing-coordinator` Stage-3 Orq agent (destination + brand on the closed list); rich persisted verdict (bucket/brand/mailbox/confidence/dedup/unrouted); two-layer dedup guard; explicit `unrouted` → human triage; shadow measurement (verdict vs human-actual destination).
**Out of scope (from SPEC.md):** Outlook forward / Stage-4 (Phase 132); info-routing Bulk Review surface (132); NL routing-config UI (133); verkoop@→order@ (133); Stage 2 / customer resolution; the 4 dormant info@ mailboxes; the **multi-mailbox delta-sync extension to info@ + Outlook-category capture** (hard prerequisite, delivered OUTSIDE 131); draft-replies.

</spec_lock>

<decisions>
## Implementation Decisions

### Destination registry shape
- **D-01:** New table `public.routing_destinations` — **one row per (bucket × brand)**. Minimum fields: `swarm_type`, `destination_key` (bucket), `brand` (smeba | fire-control | berki), `target_mailbox`, `outlook_category` (the category name used as measurement ground truth), `active` (bool), timestamps. NOT modeled as `swarm_intents` rows (destinations are neither noise nor intents — keeps the hard-separation invariant clean) and NOT split into two normalized tables (single denormalized row per bucket×brand is simplest to seed/INSERT-grow). RLS + a service-role policy per CLAUDE.md; this is registry data (source of truth), grows by INSERT, no `swarm_type` literal in code.

### Verdict persistence
- **D-02:** Reuse the existing Stage-3 persistence path (the debtor/sales pattern), do NOT create a `routing_verdicts` table. The rich 6-field verdict (bucket, brand, resolved mailbox, confidence, dedup status + matching layer, unrouted flag) goes in `coordinator_runs.decision_details`; dual-write `pipeline_events` (TELE-01) for the per-mailbox/stage telemetry; flip `agent_runs.status` `classifying→predicted` (race-guarded). Bulk Review (Phase 132) reads `coordinator_runs` for free; consistent with debtor/sales Stage-3.

### Coordinator architecture — composable Stage-3 capabilities
- **D-03:** Routing is an **independent, registry-gated Stage-3 capability** in the **generic `coordinator-orchestrator`**, NOT a dedicated per-swarm worker and NOT a mutually-exclusive "verdict-only mode". The orchestrator runs, per swarm, whichever Stage-3 capabilities the registry declares: *intent-handlers* (`swarm_intents`) and/or *destination-routing* (`routing_destinations`). Routing runs **iff the swarm has `routing_destinations`**, independent of Stage 2 (gated as today by `swarms.stage2_entity_resolver`) and independent of intents.
  - **info-routing (this phase):** routing-only — no Stage 2 (`stage2_entity_resolver=null`), no intents → only a destination verdict is produced.
  - **Future verkoop@ / debiteuren@:** Stage 2 → intent-handlers → *and* a destination verdict, composed, with zero per-swarm code. (Rationale: the user flagged that these swarms will combine Stage 2 + intents + routing; the seam must compose, not branch.)
  - The destination verdict is produced by the routing capability **regardless of whether Stage 2 / intents also ran**.

### Duplicate-delivery guard (dedup) wiring
- **D-04:** Data source = `email_pipeline.emails` (confirmed columns: `recipients` jsonb, `internet_message_id`, `conversation_id`, `mailbox`).
  - **Layer (a) — always:** parse the email's `recipients` jsonb for the resolved target mailbox address in To/CC. Catches the "customer CC's info@ + order@ at once" case. No extra data needed.
  - **Layer (b) — opportunistic:** match `internet_message_id` (or `conversation_id`) for the same message where `mailbox = target_mailbox`, **only for ingested target mailboxes** (order@ is ingested now). For non-ingested target mailboxes, **graceful skip + log the coverage gap** — do not block. Rely on layer (a) there.
  - On match → verdict `dedup_status = already_addressed` + which layer matched → flagged not-to-forward (Phase 132 honors it).

### Claude's Discretion
- The confidence threshold value for unrouted (per-bucket in the registry vs a single config knob) — planner/researcher to choose a sensible default; SPEC only requires that below-threshold → `unrouted`.
- The exact `coordinator_runs.decision_details` JSON shape for the 6 verdict fields (naming), as long as Bulk Review (132) can read it.
- The Orq `info-routing-coordinator` agent's prompt + json_schema details (closed-list enforcement of bucket+brand) — follow CLAUDE.md Orq conventions (`anyOf` nullable, `list_models` first, Zod validation).
- The shadow measurement harness shape (likely mirrors `web/scripts/eval/info-unknown-pool-noise-baseline.ts` `report` style: read synced Outlook category off the email record, compare to the verdict bucket, emit per-bucket + overall match-rate).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/131-destination-taxonomy-stage-3-router-v9-7-p1/131-SPEC.md` — the 8 locked ROUTE requirements, boundaries, acceptance criteria. MUST read before planning.

### Milestone + routing design
- `docs/routing-swarm-milestone-charter.md` §2 (verified destination mailboxes table + brand-awareness), §4 (in/out scope), §5 (registry-driven architecture, V10 ambient link) — source of the bucket taxonomy + verified mailboxes.
- `.planning/REQUIREMENTS.md` (V9.7) — milestone requirements + P1 line.

### Pipeline architecture (read before touching the coordinator)
- `docs/agentic-pipeline/README.md` — canonical 5-stage funnel, 4-axis override model, Swarm Shapes (Handler/Router/Hybrid), Stage 2→3 context-shape contract.
- `docs/agentic-pipeline/stage-3-coordinator.md` — ranked-intent classifier; `swarm_intents` dispatch; hard-separation (a row in exactly one of `swarm_noise_categories` or `swarm_intents`).
- `docs/agentic-pipeline/stage-1-regex.md` — Stage 1 contract (the upstream that clears actionable mail into this router); the swarm-agnostic shared-block-rule + adoption-pool pattern from Phase 130.

### Code patterns (reuse)
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — the generic Stage-3 orchestrator to extend with the composable routing capability.
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — the Stage-3 verdict persistence pattern (`coordinator_runs` + `pipeline_events` TELE-01 + `agent_runs` status flip) to mirror for the destination verdict.
- `supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql` — `swarm_intents` shape (the registry analog `routing_destinations` mirrors structurally, not by reuse).
- `web/scripts/eval/info-unknown-pool-noise-baseline.ts` — `report`-mode automated-metric style to mirror for the ROUTE-08 measurement harness.

### Project skills (auto-loaded, fold in)
- `.claude/skills/spike-findings-agent-workforce/SKILL.md` — Phase 88 info-routing blueprint: registry-driven Stage-1 noise, cross-swarm rule transferability, router workload sizing, v8.1 prereqs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `coordinator-orchestrator.ts` — generic Stage-3 orchestrator; extend with a registry-gated routing capability (D-03).
- `coordinator_runs` + `pipeline_events` (TELE-01) + `agent_runs` status-flip — the Stage-3 verdict home (D-02), already wired into Bulk Review.
- `email_pipeline.emails` (`recipients` jsonb, `internet_message_id`, `conversation_id`, `mailbox`) — the dedup data source (D-04).
- `swarms.stage3_coordinator_agent_key` (null for info-routing today) — set it to the new `info-routing-coordinator` agent key; `stage2_entity_resolver` stays null (no Stage 2).

### Established Patterns
- Registry-as-source-of-truth + no `swarm_type` literal (SWARM-02 / Phase 130) — destinations + routing are registry data; new mailbox/destination = INSERT.
- `env_id='BX'` hard brand filter; `scope_key`/brand logic — brand resolution combines with the agent's brand classification.
- Orq agent conventions (CLAUDE.md): strict `response_format` json_schema, `anyOf` nullable, `list_models` before create/update, Zod validation, closed-list output.

### Integration Points
- New `routing_destinations` table read by the orchestrator's routing step → resolves (bucket × brand) → target_mailbox.
- Destination verdict on `coordinator_runs.decision_details` → consumed by Phase 132 (forward) + Bulk Review.
- ROUTE-08 measurement reads the delta-synced Outlook category off the email record (prerequisite-dependent) and compares to the verdict.

</code_context>

<specifics>
## Specific Ideas

- The dedup requirement came directly from the operator: customers blast the same message to many mailboxes (info@ + order@ + verkoop@) at once — the verdict must flag `already_addressed` so 132 never double-forwards.
- Measurement ground truth = **what staff actually do**: a human applies an Outlook category (intended destination) and/or actually forwards; delta-sync observes it; incorrect labels are cleaned; the router's shadow verdict is graded against the human-actual destination (this also doubles as the V10 ambient/correction signal). Precision gate ≥85%.

</specifics>

<deferred>
## Deferred Ideas

- **Outlook forward side-effect + Bulk Review surface** → Phase 132 (consumes the 131 verdict + the `already_addressed`/`unrouted` flags).
- **Natural-language routing-config UI + verkoop@→order@ routing** → Phase 133.
- **Reworking the noise registry (`classifier_rules`/`swarm_noise_categories`) into the shared-pool-with-adoption model** (from Phase 130's forward-note) — separate future phase.
- **Stage 2 + intents + routing composed on verkoop@/debiteuren@** — the composable coordinator seam (D-03) is built to support this, but those swarms' actual onboarding is later work.
- **Ingesting the remaining target mailboxes** (to give dedup layer (b) full coverage) — opportunistic; not a 131 blocker.

</deferred>

<dependencies>
## Hard Dependency (flagged)

- **Multi-mailbox delta-sync extended to the info@ mailboxes + Outlook-category capture** — required for the ROUTE-08 measurement to run; delivered OUTSIDE 131 (connects to the open 112.5 delta-sync extension, see memory [[debtor-intent-labeling-rollout]] context). The router build itself does not depend on it; only the accuracy measurement does. Sequence it before 131's measurement step.

</dependencies>

---

*Phase: 131-destination-taxonomy-stage-3-router-v9-7-p1*
*Context gathered: 2026-06-17*
*Next step: /gsd:plan-phase 131*
