# Requirements — v8.0 Agentic Platform

**Milestone goal:** Establish a standardized 4-stage funnel architecture for every automation swarm at Moyne Roberts, validated against Anthropic's canonical agentic guidance, hardened with production guardrails (input safety, per-run budgets, capability/regression evals), and proven by onboarding a second swarm (sales-email/SugarCRM) in under a day.

**Source:** 2026-04-30 strategic design session, validated against Anthropic engineering posts (Building Effective Agents, Multi-Agent Research System, Demystifying Evals, Constitutional Classifiers).

---

## v1 Requirements

### Architecture (RFC)

- [ ] **RFC-01**: Operator can read a single canonical RFC document (`docs/agentic-pipeline-architecture.md`) that defines the 4-stage funnel shape (Stage 0 safety, Stage 1 regex, Stage 2 entity enrichment, Stage 3 intent coordinator, Stage 4 handler) and supersedes the existing `debtor-email-pipeline-architecture.md`
- [ ] **RFC-02**: RFC documents the canonical Stage 2 → Stage 3 context-shape contract (customer_id, customer_name, language, entity_brand, recent_documents[]) so cross-swarm agents are agnostic to the lookup backend (NXT vs SugarCRM)
- [ ] **RFC-03**: RFC documents the 4-axis override model (Stage 1 = wrong category, Stage 2 = wrong customer, Stage 3 = wrong intent, Stage 4 = wrong handler output) and how each override produces an independent learning signal
- [ ] **RFC-04**: RFC documents the graduated automation hooks per stage (when LLM-handled patterns should promote down to deterministic rules, sender mappings, or prompt-tunes)

### Stage 0 — Input safety

- [ ] **SAFE-01**: System detects prompt-injection attempts (e.g. "ignore previous instructions") in inbound email body before any LLM call sees the content
- [ ] **SAFE-02**: Suspect emails are flagged `injection_suspected` and routed to human-only review, never to coordinator or handler
- [ ] **SAFE-03**: Detection uses a layered approach (regex patterns + lightweight LLM classifier) per Anthropic's Constitutional Classifiers / prompt-injection-defenses guidance
- [ ] **SAFE-04**: Operator can audit injection-flagged emails in Bulk Review with the trigger pattern surfaced

### Per-run budgets & tool guardrails

- [ ] **BUDG-01**: Each pipeline run has a hard token + cost ceiling enforced in Inngest; runs exceeding the ceiling halt and escalate to human queue
- [ ] **BUDG-02**: Tool calls are gated by an intent allowlist (`zapier_tools.allowed_for_intents`) — a copy-document handler cannot call payment-update tools
- [ ] **BUDG-03**: Operator sees per-email token cost in the Bulk Review UI; outliers (>3× median) surface as their own override axis

### Stage 3 coordinator redesign

- [ ] **CORD-01**: Stage 3 coordinator emits an ordered list of intents (primary + secondaries) with confidence scores, not a single label
- [ ] **CORD-02**: Coordinator escalates to a Stage 3.5 orchestrator-worker when `confidence < threshold` OR `intent_count >= 3` OR an intent is registry-tagged `requires_orchestration`
- [ ] **CORD-03**: Orchestrator-worker spawns multiple Stage 4 handlers in parallel and synthesises their outputs into a single iController draft
- [ ] **CORD-04**: Default path (~80% of inbound) remains a single-shot router with no orchestrator overhead

### Pipeline consolidation

- [ ] **CONS-01**: Inbound debtor-email automatically goes through `regex → label-resolver → coordinator → handler` (single canonical flow)
- [ ] **CONS-02**: Existing `debtor-email-triage` Inngest function is retired; intent agent role moves to Stage 3 coordinator slot in `classifier-label-resolver`
- [ ] **CONS-03**: All Stage 4 handlers (copy-document body agent, future dispute/address-change/etc.) are invoked via canonical `debtor-email/<intent>.requested` events

### Stage 2 closure — iController DOM tagging

- [ ] **TAG-01**: When the resolver returns a matched customer in live mode, an iController DOM step automatically tags the email under that customer account
- [ ] **TAG-02**: Tagging step is non-blocking for downstream Stage 3+4 (failure surfaces as a deferred run, doesn't break the coordinator)
- [ ] **TAG-03**: Operator can audit tagging actions in `email_labels` (existing) plus screenshots before/after

### Bulk Review redesign

- [ ] **REVW-01**: Operator can override at Stage 1 (wrong category) → re-routes to noise / archive / different category
- [ ] **REVW-02**: Operator can override at Stage 2 (wrong customer) → corrects customer_account_id, optionally re-runs Stage 3+4
- [ ] **REVW-03**: Operator can override at Stage 3 (wrong intent) → re-emits to a different handler-agent
- [ ] **REVW-04**: Operator can override at Stage 4 (wrong handler output) → records `draft_quality` + reason for handler prompt tuning
- [ ] **REVW-05**: Each override is tagged with `eval_type ∈ {capability, regression}` so model swaps don't silently break previously-correct decisions
- [ ] **REVW-06**: Operator sees one row per email aggregating all 4 stage decisions + per-run cost + tool calls

### swarm_registry generalisation

- [ ] **SWRM-01**: `public.swarms` table extended with `stage1_regex_module`, `stage2_entity_resolver`, `stage3_coordinator_agent_key`, `side_effects[]` jsonb, canonical context-shape contract
- [ ] **SWRM-02**: New `swarm_intents` table (`intent_key`, `handler_agent_key`, `handler_event`, `requires_orchestration`) replaces hardcoded intent → handler mappings
- [ ] **SWRM-03**: Adding a new swarm = registry INSERTs only; zero edits to verdict-worker / classifier code
- [ ] **SWRM-04**: `verdict-worker` `if swarm_type === 'debtor-email'` gate replaced by `side_effects[]` lookup

### Handler-agent canonicalisation (cross-swarm reuse)

- [ ] **CANO-01**: `debtor-copy-document-body-agent` accepts a canonical context shape; entity_register block parameterized so it works for sales-email, future UK/IE brands, and brand expansions without prompt edits
- [ ] **CANO-02**: Brand list is data-driven (from `swarms.entity_brand` registry rows), not hardcoded enums in agent prompts
- [ ] **CANO-03**: All Stage 4 handler-agents declared `swarm_type='cross-cutting'` in `public.orq_agents` where domain-agnostic; per-swarm specialisation only when truly needed
- [ ] **CANO-04**: Existing UK/IE backlog (999.1) and future brand expansions onboard via `INSERT entity_brand` row, no agent prompt change

### Promotion recommender (graduated automation)

- [ ] **LERN-01**: New `promotion_candidates` table aggregates per-stage telemetry into actionable recommendations (suggest regex rule / sender mapping / prompt tune)
- [ ] **LERN-02**: Inngest cron runs the recommender periodically; never blocks the synchronous pipeline
- [ ] **LERN-03**: Operator sees a "Learning Inbox" UI with each candidate as an actionable card (volume, expected savings, suggested change)
- [ ] **LERN-04**: Operator can approve a candidate → auto-creates a migration / PR / config change with full audit trail
- [ ] **LERN-05**: Promotion events are traceable; if a new rule later proves wrong it can be rolled back with the original LLM-handled signal restored

### Telemetry consolidation

- [ ] **TELE-01**: Single canonical `pipeline_events` table records every stage decision (`swarm_type`, `stage`, `decision`, `confidence`, `override?`, `eval_type`)
- [ ] **TELE-02**: Existing tables (`classifier_rules`, `agent_runs`, `email_labels`, `automation_runs`) preserved as denormalized read-models — no consumer breakage
- [ ] **TELE-03**: Promotion recommender + Bulk Review consume from `pipeline_events` (single source of truth) instead of fragile multi-table joins

### Second-swarm validation (sales-email)

- [ ] **SALES-01**: Sales-email swarm onboarded via registry INSERTs only — one regex module, one Stage 2 SugarCRM resolver, one Stage 3 coordinator agent, zero new handler-agents (reuse `debtor-copy-document-body-agent` and friends)
- [ ] **SALES-02**: Sales-email handles its own copy-invoice requests via the canonicalised cross-swarm body agent
- [ ] **SALES-03**: Sales-email Bulk Review surface emerges automatically via the registry-driven UI — no new components

---

## Out of Scope (v8.0)

- New handler-agents beyond what already exists (payment-dispute, address-change, contract-inquiry, credit-request, peppol-request, general-inquiry) — comes in opvolg-milestone after the platform shape proves itself
- UK/IE mailbox onboarding execution (CANO-04 lays the foundation; actual mailbox provisioning + Zapier setup is a separate operational milestone)
- Dashboard / UI polish beyond Bulk Review redesign (V7.0 dashboard is shipped; further UI work is paused per pivot)
- Migration of legacy `triage_shadow_mode` flag handling — new flow renders it obsolete; legacy emails just never trigger v7-mode
- CLI skill ports for the new architecture — toolkit users go via the web app

---

## Future Requirements (deferred)

- New per-intent handler-agents (payment-dispute, address-change, contract-inquiry, credit-request, peppol-request, general-inquiry) — opvolg-milestone
- UK/IE mailbox provisioning + brand-specific regex tuning — operational milestone
- Cross-swarm orchestrator (a single super-coordinator that picks which swarm an inbound goes to when ambiguous) — speculative future work
- Native Orq.ai eval runners replacing manual capability/regression dataset management

---

## Traceability

Filled by roadmapper after phase mapping.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| RFC-01..04 | TBD | pending |
| SAFE-01..04 | TBD | pending |
| BUDG-01..03 | TBD | pending |
| CORD-01..04 | TBD | pending |
| CONS-01..03 | TBD | pending |
| TAG-01..03 | TBD | pending |
| REVW-01..06 | TBD | pending |
| SWRM-01..04 | TBD | pending |
| CANO-01..04 | TBD | pending |
| LERN-01..05 | TBD | pending |
| TELE-01..03 | TBD | pending |
| SALES-01..03 | TBD | pending |

**Total:** 47 v1 requirements across 12 categories.
