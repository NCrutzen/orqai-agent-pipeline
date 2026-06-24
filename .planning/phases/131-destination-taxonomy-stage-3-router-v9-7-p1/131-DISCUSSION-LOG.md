# Phase 131 — Discussion Log

**Date:** 2026-06-17
**Mode:** discuss (SPEC.md loaded — implementation decisions only)

Human-reference audit trail. Not consumed by downstream agents (they read CONTEXT.md + SPEC.md).

## Areas selected
Destination-registry shape · Verdict persistence · Coordinator integration · Dedup-lookup wiring (all four).

## Decisions

| Area | Options presented | Selected | Decision |
|------|-------------------|----------|----------|
| Registry shape | New `routing_destinations` table / extend `swarm_intents` / normalized 2-table | New `routing_destinations` table | D-01 — one row per (bucket × brand): destination_key, brand, target_mailbox, outlook_category, active |
| Verdict home | Reuse coordinator_runs+pipeline_events+agent_runs / new `routing_verdicts` table | Reuse existing Stage-3 path | D-02 — 6-field verdict in `coordinator_runs.decision_details` + pipeline_events TELE-01 + agent_runs status flip |
| Coordinator | Generic orchestrator + verdict-only mode / dedicated worker / forward-handler intent — **user follow-up: swarms like verkoop@/debiteuren@ will have Stage 2 + routing** | Composable Stage-3 capability | D-03 — routing is an independent registry-gated capability in the generic orchestrator; runs iff swarm has `routing_destinations`; composes with Stage 2 (gated by stage2_entity_resolver) + intents; info-routing = routing-only |
| Dedup wiring | Layer (a) always + layer (b) ingested-only / require all targets ingested | Layer (a) always; layer (b) ingested-only | D-04 — To/CC via `recipients` jsonb always; internet_message_id/conversation_id cross-mailbox only for ingested target mailboxes (order@ now), graceful skip + log otherwise |

## Notable user inputs
- Operator-introduced dedup requirement (from spec round): customers blast the same message to many mailboxes simultaneously → verdict must flag `already_addressed`.
- Measurement ground truth = staff's real action (Outlook category + actual forward), observed via delta-sync; incorrect labels cleaned; ≥85% precision gate. Doubles as V10 ambient/correction signal.
- Coordinator follow-up: routing must compose with Stage 2 + intents for future verkoop@/debiteuren@ swarms — drove D-03 from "verdict-only mode" to "composable capability".

## Deferred
- Forward + Bulk Review (132); NL routing-config + verkoop@→order@ (133); noise-registry shared-pool rework (future); composed Stage2+intents+routing onboarding for verkoop@/debiteuren@ (later); ingest remaining target mailboxes for full dedup layer-(b) coverage.

## Hard dependency flagged
- Multi-mailbox delta-sync extended to info@ + Outlook-category capture (required for ROUTE-08 measurement; delivered outside 131).
