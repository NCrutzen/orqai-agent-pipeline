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
- [x] Phase 05.1: Fix Distribution Placeholders — OWNER/REPO to NCrutzen/orqai-agent-pipeline (completed 2026-03-01)
- [x] Phase 05.2: Fix Tool Catalog & Pipeline Wiring — Memory tool identifiers + research brief wiring (completed 2026-03-01)

</details>

---

## V2.0 — Autonomous Orq.ai Pipeline (IN PROGRESS)

**Value:** Go from natural language use case to fully deployed, tested, and iterated agent swarm in Orq.ai — autonomously. MCP-first integration with API fallback. Modular install lets users control which automation capabilities are enabled.

**Stack constraints (from research 2026-03-01):**
- Pin `@orq-ai/node@^3.14.45` — v4 dropped MCP server binary
- `@orq-ai/evaluatorq@^1.1.0` for experiment execution (peer dep on node@^3)
- Guardrails API surface unconfirmed on Agents API — validate in Phase 6

**Orq.ai integration coverage:**

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

- [ ] **Phase 6: Orq.ai Deployment** — Deployer subagent, MCP/REST adapter, idempotent agent/tool creation, orchestration wiring, deploy-verify-record pattern
- [ ] **Phase 7: Automated Testing** — Tester subagent, dataset transformation, role-based evaluator selection, 3x median experiment execution, structured results
- [ ] **Phase 7.1: Test Pipeline Tech Debt** — SDK-to-REST mapping, undeclared package declaration, deploy-log template cleanup
- [ ] **Phase 8: Prompt Iteration Loop** — Iterator subagent, failure analysis, diff-based proposals, per-iteration HITL approval, 4 hard stopping conditions, audit trail
- [ ] **Phase 9: Guardrails and Hardening** — Evaluator promotion to runtime guardrails, threshold-based quality gates, incremental per-agent deployment
- [x] **Phase 10: Fix Holdout Dataset Path** — Resolve holdout dataset ID path mismatch in test-results.json template and iterator, fix stale step labels (completed 2026-03-02)
- [x] **Phase 11: Flag Conventions + Tech Debt Cleanup** — Align harden.md flag syntax, pass TOOLS.md to Wave 3, fix orchestrator references (completed 2026-03-02)

## Phase Details

### Phase 6: Orq.ai Deployment
**Goal**: Users can deploy a generated agent swarm to Orq.ai with a single command and get back a verified, live deployment with all agents and tools wired together
**Depends on**: Phase 05.2 (v0.3)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, DEPLOY-06, DEPLOY-07, DEPLOY-08
**Success Criteria** (what must be TRUE):
  1. User runs `/orq-agent:deploy` on any V1.0 swarm output and all tools, sub-agents, and orchestrator agent are created in Orq.ai in correct dependency order (tools first, sub-agents second, orchestrator last with agent-as-tool wiring)
  2. Re-running deploy on an already-deployed swarm creates new agent versions without duplicates — user sees "updated" not "created" in the deploy log
  3. Every deployed resource is read back from Orq.ai and compared to intended spec — discrepancies are surfaced to the user, never silently ignored
  4. Local `.md` spec files are annotated with deployment metadata (agent ID, version, timestamp) and `deploy-log.md` shows a status table with created/updated/failed per resource
  5. When MCP server is unavailable, deployment completes via REST API fallback without user intervention
**Plans:** 2 plans
- [ ] 06-01-PLAN.md — Deploy pipeline core: deployer subagent + deploy command with ordered deployment, idempotent create-or-update, MCP/REST fallback
- [ ] 06-02-PLAN.md — Verification, logging, and metadata: read-back verification, deploy-log.md, YAML frontmatter annotation

### Phase 7: Automated Testing
**Goal**: Users can run automated evaluations against deployed agents and receive statistically robust, interpretable results that identify exactly where agents succeed and fail
**Depends on**: Phase 6
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. User runs `/orq-agent:test` and V1.0 markdown datasets are transformed to Orq.ai row format, split into train/test/holdout sets, and uploaded — with minimum 30 examples enforced
  2. Evaluators are auto-selected by agent role: structural agents get JSON/schema validators, conversational agents get coherence/helpfulness/relevance, all agents get instruction_following — no manual evaluator configuration needed
  3. Experiments execute 3 times per agent with median scores and variance tracking, and results appear in `test-results.md` with per-agent scores, confidence intervals, pass/fail summary, and worst-performing cases highlighted
**Plans:** 2 plans
- [ ] 07-01-PLAN.md — Tester subagent with dataset transformation pipeline (parse, augment, merge, split, upload) and evaluator auto-selection by agent role
- [ ] 07-02-PLAN.md — Experiment execution (3x via evaluatorq, median aggregation) + test command wiring + results reporting (JSON, markdown, terminal)

### Phase 7.1: Test Pipeline Tech Debt
**Goal**: Resolve integration issues and tech debt from Phases 6-7 before iteration loop depends on them
**Depends on**: Phase 7
**Requirements**: None (tech debt — addresses integration gaps from V2.0 audit)
**Gap Closure**: Closes 2 integration gaps + 1 tech debt item from V2.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. `orqai-api-endpoints.md` documents the SDK-to-REST mapping for `agents.responses.create()` → `POST /v2/agents/{id}/execute`, and tester.md REST fallback path covers agent invocation
  2. `@orq-ai/evaluators` package is declared with version pin in install surface (install script, SKILL.md, or test.md) alongside existing `@orq-ai/node` and `@orq-ai/evaluatorq` pins
  3. `deploy-log.json` template is either removed (orphaned) or updated to match live `deploy-log.md` markdown format with `unchanged` status support
**Plans:** 1 plan
- [ ] 07.1-01-PLAN.md — SDK-to-REST mapping, package declaration, and orphaned template cleanup

### Phase 8: Prompt Iteration Loop
**Goal**: Users can improve underperforming agents through a guided analyze-propose-approve-retest cycle that explains every change in plain language and never acts without permission
**Depends on**: Phase 7
**Requirements**: ITER-01, ITER-02, ITER-03, ITER-04, ITER-05, ITER-06, ITER-07
**Success Criteria** (what must be TRUE):
  1. After testing, the system presents plain-language diagnosis of failing agents with patterns tied to specific XML-tagged prompt sections and linked to specific test failures
  2. Proposed prompt changes are shown as diff-style views with per-change reasoning, and the user must explicitly approve each change per-agent before it is applied
  3. Approved changes update both local `.md` spec files and re-deploy agents to Orq.ai, then re-test only changed agents with before-vs-after score comparison
  4. Iteration automatically stops when any of 4 conditions is met: max 3 iterations reached, less than 5% score improvement, user declines changes, or 10-minute wall-clock timeout
  5. All iterations are logged locally — `iteration-log.md` per cycle and `audit-trail.md` append-only — with reasoning, diffs, and before/after scores for every change
**Plans**: TBD

### Phase 9: Guardrails and Hardening
**Goal**: Users can promote test evaluators to production guardrails and deploy agents incrementally with quality gates that prevent shipping underperforming agents
**Depends on**: Phase 8
**Requirements**: GUARD-01, GUARD-02, GUARD-03
**Success Criteria** (what must be TRUE):
  1. User can promote any test evaluator to a runtime guardrail on its corresponding deployed agent — either via native Orq.ai evaluator attachment (if API supports it) or application-layer post-execution gating (fallback validated in Phase 6)
  2. User can set minimum score thresholds per evaluator as quality gates — agents below threshold are flagged as not production-ready
  3. User can deploy, test, and iterate individual agents before wiring the full orchestration — enabling incremental confidence building
**Plans**: TBD

### Phase 10: Fix Holdout Dataset Path
**Goal**: Resolve the holdout dataset ID path mismatch between test-results.json template and iterator.md so the re-test-on-holdout flow works end-to-end
**Depends on**: Phase 8
**Requirements**: ITER-05 (integration fix)
**Gap Closure**: Closes INT-01, FLOW-01, and iterator step label tech debt from V2.0 audit
**Success Criteria** (what must be TRUE):
  1. `test-results.json` template `per_agent_datasets[]` entries include `train_dataset_id`, `test_dataset_id`, and `holdout_dataset_id` fields
  2. `tester.md` Phase 5.3 populates per-split dataset IDs when uploading datasets
  3. `iterator.md` Phase 7 Step 7.2 reads holdout dataset ID from the correct field path in test-results.json
  4. `iterator.md` Phase 9 step labels use correct `Step 9.x` numbering (not stale `Step 7.x`)
**Plans:** 1/1 plans complete

### Phase 11: Flag Conventions + Tech Debt Cleanup
**Goal**: Align CLI flag conventions across all commands and resolve carried-forward tech debt from v0.3
**Depends on**: Phase 9
**Requirements**: GUARD-03 (integration fix)
**Gap Closure**: Closes INT-02 and 3 carried-forward v0.3 tech debt items from V2.0 audit
**Success Criteria** (what must be TRUE):
  1. `harden.md` Step 3 uses `--agent` flag (not positional argument), matching deploy/test/iterate commands and SKILL.md documentation
  2. TOOLS.md is included in Wave 3 `files_to_read` for dataset-gen and readme-gen subagents
  3. `agentic-patterns.md` is included in orchestration-generator `files_to_read`
  4. Step 5.5/5 numbering inversion in orchestrator is corrected
**Plans:** 1/1 plans complete
- [ ] 11-01-PLAN.md — Flag convention alignment, step renumbering, files_to_read completeness, and consistency sweep

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
| V2.0 | 6. Orq.ai Deployment | 2/2 | Verified | 2026-03-01 |
| V2.0 | 7. Automated Testing | 2/2 | Verified | 2026-03-01 |
| V2.0 | 7.1. Test Pipeline Tech Debt | 0/? | Not started | - |
| V2.0 | 8. Prompt Iteration Loop | 2/2 | Verified | 2026-03-01 |
| V2.0 | 9. Guardrails and Hardening | 0/? | Not started | - |
| V2.0 | 10. Fix Holdout Dataset Path | 1/1 | Complete    | 2026-03-02 |
| V2.0 | 11. Flag Conventions + Tech Debt | 1/1 | Complete   | 2026-03-02 |
| V2.1 | Automated KB Setup | - | Not started | - |
| V3.0 | Browser Automation | - | Not started | - |
