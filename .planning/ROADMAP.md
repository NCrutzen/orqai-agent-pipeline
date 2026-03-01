# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them via the Orq.ai MCP server and API.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation — V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline — deploy, test, iterate, and harden agent swarms via MCP/API | In progress |
| **V2.1** | Automated KB Setup — provision vector stores and ingestion pipelines | Planned |
| **V3.0** | Browser Automation — Playwright scripts or natural language browser instructions | Planned |

---

<details>
<summary>v0.3 Core Pipeline + V2.0 Foundation (Phases 1-05.2) — SHIPPED 2026-03-01</summary>

**11 phases, 28 plans, 50 requirements satisfied**
**Full archive:** `milestones/v0.3-ROADMAP.md` | `milestones/v0.3-REQUIREMENTS.md`

- [x] Phase 1: Foundation — References, templates, architect subagent (completed 2026-02-24)
- [x] Phase 2: Core Generation Pipeline — 5 subagents: researcher, spec-gen, orch-gen, dataset-gen, readme-gen (completed 2026-02-24)
- [x] Phase 3: Orchestrator and Adaptive Pipeline — Orchestrator wiring with adaptive depth (completed 2026-02-24)
- [x] Phase 4: Distribution — Install script, update command, GSD integration (completed 2026-02-24)
- [x] Phase 04.1: Discussion Step — Structured gray area surfacing (completed 2026-02-24)
- [x] Phase 04.2: Tool Selection & MCP Servers — Tool resolver + unified catalog (completed 2026-02-24)
- [x] Phase 04.3: Prompt Strategy — XML-tagged, context-engineered instructions (completed 2026-02-24)
- [x] Phase 04.4: KB-Aware Pipeline — End-to-end knowledge base support (completed 2026-02-26)
- [x] Phase 5: References, Install, Capability Infrastructure — V2.0 references + modular install (completed 2026-03-01)
- [x] Phase 05.1: Fix Distribution Placeholders — OWNER/REPO → NCrutzen/orqai-agent-pipeline (completed 2026-03-01)
- [x] Phase 05.2: Fix Tool Catalog & Pipeline Wiring — Memory tool identifiers + research brief wiring (completed 2026-03-01)

</details>

---

## V2.0 — Autonomous Orq.ai Pipeline (IN PROGRESS)

**Value:** Go from natural language use case to fully deployed, tested, and iterated agent swarm in Orq.ai — autonomously. MCP-first integration with API fallback. Modular install lets users control which automation capabilities are enabled.

**Orq.ai integration coverage (researched 2026-03-01):**

| Capability | MCP | REST API | Pipeline stage |
|---|---|---|---|
| Agent creation/config | Yes | - | Deploy |
| Tool creation (5 types) | - | Yes | Deploy |
| Dataset management | Yes | Yes | Test |
| Experiments | Yes | SDK (evaluatorq) | Test |
| Evaluators (4 types) | Yes | Yes | Test |
| Prompt creation/versioning | - | Yes | Iterate |
| Memory Stores | - | Yes | Deploy (if KB) |
| Traces/Observability | Yes | - | Iterate |

### Phases

- [ ] **Phase 6: Orq.ai Deployment** — Deployer subagent, API adapter layer, idempotent agent/tool creation, orchestration wiring, verify-after-deploy
- [ ] **Phase 7: Automated Testing** — Tester subagent, dataset transformation, evaluator creation, experiment execution, structured results
- [ ] **Phase 8: Prompt Iteration Loop** — Iterator subagent, results analysis, diff-based proposals, per-iteration approval, hard stopping conditions
- [ ] **Phase 9: Guardrails and Hardening** — Evaluator promotion to runtime guardrails, threshold-based quality gates, incremental deployment

### Phase 6: Orq.ai Deployment
**Goal**: Users can deploy a generated agent swarm to Orq.ai with a single command and get back a verified, live deployment with all agents wired together
**Depends on**: Phase 5 (v0.3)
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, DEPL-06, DEPL-07
**Success Criteria** (what must be TRUE):
  1. User can run `/orq-agent:deploy` on any V1.0 swarm output and see all agents and tools created in their Orq.ai workspace, with orchestrator agents correctly wired to sub-agents via agent-as-tool relationships
  2. Re-running deploy on an already-deployed swarm updates existing agents and tools without creating duplicates
  3. After every deployment, the system reads back each agent's config from Orq.ai and confirms it matches the intended spec -- discrepancies are surfaced to the user
  4. Local `.md` spec files are updated with deployment metadata (agent IDs, version numbers, timestamps) and a deployment status summary table is displayed
**Plans**: TBD

### Phase 7: Automated Testing
**Goal**: Users can run automated evaluations against their deployed agents and receive structured, interpretable results that identify exactly where agents succeed and fail
**Depends on**: Phase 6
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. User can run `/orq-agent:test` and V1.0 markdown datasets are automatically transformed, split into train/test/holdout sets (minimum 30 examples), and uploaded to Orq.ai
  2. Domain-appropriate evaluators are created automatically -- LLM-as-judge for semantic quality assessment, function evaluators for structural validation checks
  3. Experiments run against deployed agents with 3-run median scoring and variance tracking, and results are presented in RESULTS.md with confidence intervals, per-evaluator scores, pass/fail summary, and worst-performing cases highlighted
**Plans**: TBD

### Phase 8: Prompt Iteration Loop
**Goal**: Users can improve underperforming agents through a guided analyze-propose-approve-retest cycle that explains every change in plain language and never acts without permission
**Depends on**: Phase 7
**Requirements**: ITER-01, ITER-02, ITER-03, ITER-04, ITER-05, ITER-06
**Success Criteria** (what must be TRUE):
  1. After testing, the system analyzes results and presents plain-language diagnosis tied to specific test failures
  2. Proposed prompt changes are shown as diffs with per-change reasoning, and the user must explicitly approve each iteration
  3. Approved changes update both local `.md` specs and deployed Orq.ai agents, then re-run tests
  4. Iteration automatically stops when any hard limit is reached: 3 iterations, 50 API calls, 10-minute timeout, or less than 5% improvement
  5. ITERATIONS.md audit trail records every iteration
**Plans**: TBD

### Phase 9: Guardrails and Hardening
**Goal**: Users can promote test evaluators to production guardrails and deploy agents incrementally with quality gates
**Depends on**: Phase 8
**Requirements**: GUARD-01, GUARD-02, GUARD-03
**Success Criteria** (what must be TRUE):
  1. User can promote any test evaluator to a runtime guardrail on its corresponding deployed Orq.ai agent
  2. User can configure threshold-based quality gates per evaluator
  3. User can deploy, test, and iterate each agent individually before wiring the full orchestration
**Plans**: TBD

---

## V2.1 — Automated KB Setup (PLANNED)

**Value:** Provision vector stores, configure embeddings, and generate ingestion pipelines — turning KB design guidance into fully automated setup.
**Depends on:** V2.0, Phase 04.4
**Requirements:** KB-01, KB-02, KB-03

---

## V3.0 — Browser Automation (PLANNED)

**Value:** Generate Playwright automation scripts or natural language browser instructions for agents that need web interaction capabilities.
**Depends on:** V2.0
**Requirements:** TBD

---

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6. Orq.ai Deployment | 0/? | Not started | - |
| V2.0 | 7. Automated Testing | 0/? | Not started | - |
| V2.0 | 8. Prompt Iteration Loop | 0/? | Not started | - |
| V2.0 | 9. Guardrails and Hardening | 0/? | Not started | - |
| V2.1 | Automated KB Setup | - | Not started | - |
| V3.0 | Browser Automation | - | Not started | - |
