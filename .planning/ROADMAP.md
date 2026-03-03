# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them via the Orq.ai MCP server and API. V3.0 adds a browser-based interface with real-time dashboard, node graph visualization, and HITL approval workflows for non-technical colleagues. V4.0 adds cross-swarm intelligence so that agent swarms don't operate in silos -- overlaps are surfaced, missing coordination is identified, and fixes are proposed across the entire ecosystem. V5.0 extends the pipeline to detect browser automation needs, generate deterministic Playwright scripts, deploy them to a VPS-hosted MCP server, and wire agent specs with the right MCP tools.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with real-time visibility, node graph, HITL approvals | **Defined** |
| **V4.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |
| **V5.0** | Browser Automation -- Playwright script generation, VPS MCP server, automated deployment, agent spec wiring | **In Progress** |

---

<details>
<summary>v0.3 Core Pipeline + V2.0 Foundation (Phases 1-05.2) -- SHIPPED 2026-03-01</summary>

**11 phases, 28 plans, 50 requirements satisfied**
**Full archive:** `milestones/v0.3-ROADMAP.md` | `milestones/v0.3-REQUIREMENTS.md`

- [x] Phase 1: Foundation -- References, templates, architect subagent (completed 2026-02-24)
- [x] Phase 2: Core Generation Pipeline -- 5 subagents: researcher, spec-gen, orch-gen, dataset-gen, readme-gen (completed 2026-02-24)
- [x] Phase 3: Orchestrator and Adaptive Pipeline -- Orchestrator wiring with adaptive depth (completed 2026-02-24)
- [x] Phase 4: Distribution -- Install script, update command, GSD integration (completed 2026-02-24)
- [x] Phase 04.1: Discussion Step -- Structured gray area surfacing (completed 2026-02-24)
- [x] Phase 04.2: Tool Selection & MCP Servers -- Tool resolver + unified catalog (completed 2026-02-24)
- [x] Phase 04.3: Prompt Strategy -- XML-tagged, context-engineered instructions (completed 2026-02-24)
- [x] Phase 04.4: KB-Aware Pipeline -- End-to-end knowledge base support (completed 2026-02-26)
- [x] Phase 5: References, Install, Capability Infrastructure -- V2.0 references + modular install (completed 2026-03-01)
- [x] Phase 05.1: Fix Distribution Placeholders -- OWNER/REPO to NCrutzen/orqai-agent-pipeline (completed 2026-03-01)
- [x] Phase 05.2: Fix Tool Catalog & Pipeline Wiring -- Memory tool identifiers + research brief wiring (completed 2026-03-01)

</details>

<details>
<summary>V2.0 Autonomous Orq.ai Pipeline (Phases 6-11) -- SHIPPED 2026-03-02</summary>

**7 phases, 11 plans, 23 requirements satisfied**
**Full archive:** `milestones/V2.0-ROADMAP.md` | `milestones/V2.0-REQUIREMENTS.md`

- [x] Phase 6: Orq.ai Deployment -- Deployer subagent, MCP/REST adapter, idempotent deploy (completed 2026-03-01)
- [x] Phase 7: Automated Testing -- Tester subagent, dataset pipeline, evaluator selection, 3x experiments (completed 2026-03-01)
- [x] Phase 7.1: Test Pipeline Tech Debt -- SDK-to-REST mapping, package declaration, template cleanup (completed 2026-03-01)
- [x] Phase 8: Prompt Iteration Loop -- Iterator subagent, diagnosis, proposals, HITL approval, audit trail (completed 2026-03-01)
- [x] Phase 9: Guardrails and Hardening -- Hardener subagent, guardrail promotion, quality gates, --agent flags (completed 2026-03-01)
- [x] Phase 10: Fix Holdout Dataset Path -- Holdout dataset ID alignment, step label fixes (completed 2026-03-02)
- [x] Phase 11: Flag Conventions + Tech Debt -- Flag alignment, step renumbering, files_to_read fixes (completed 2026-03-02)

</details>

<details>
<summary>V3.0 Web UI & Dashboard (Phases 12-16) -- DEFINED</summary>

**5 phases, 34 requirements defined**

- [ ] Phase 12: Foundation & Auth -- Next.js + Supabase project with M365 SSO, DB schema, Inngest pipeline skeleton, and prompt adapter
- [ ] Phase 13: Self-Service Pipeline -- Use case input to deployed agents via browser with live status and error recovery
- [ ] Phase 14: Pipeline Dashboard -- Run list, step-by-step progress, duration tracking, log stream, and agent performance scores
- [ ] Phase 15: Node Graph -- Interactive agent swarm visualization with execution overlay, status badges, and export
- [ ] Phase 16: HITL Approval Flow -- In-app approve/reject with queue, history, email notifications, and pipeline pause/resume

</details>

<details>
<summary>V4.0 Cross-Swarm Intelligence (Phases 17-21) -- DEFINED</summary>

**5 phases, 25 requirements defined**

- [ ] Phase 17: Ecosystem Foundation -- Unified inventory of all swarms from local specs and live Orq.ai state with tool/KB registries and human-readable report
- [ ] Phase 18: Drift Detection -- Field-by-field comparison between spec and deployed state with severity classification and reconciliation recommendations
- [ ] Phase 19: Overlap & Gap Analysis -- Semantic role overlap, tool duplication, blind spot identification, and coordination gap reporting across swarms
- [ ] Phase 20: Fix Proposals -- Structured fix proposals with diff previews, risk classification, HITL approval, and provenance tracking
- [ ] Phase 21: Command Integration & Auto-Trigger -- On-demand audit command and lightweight auto-trigger after new swarm designs

</details>

---

## V5.0 -- Browser Automation (IN PROGRESS)

**Goal:** Pipeline detects browser automation needs, generates deterministic Playwright scripts, deploys them to a VPS-hosted MCP server, and wires agent specs with the right MCP tools -- end-to-end for at least one real system (NXT).

## Phases

**Phase Numbering:**
- Integer phases (22, 23, 24, 25): Planned milestone work
- Decimal phases (e.g., 23.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 22: Capabilities Config & VPS Scaffold** - Application capabilities config file with NXT entry, VPS MCP server with Streamable HTTP transport, TLS, and bearer token auth
- [ ] **Phase 23: Script Generation & Pipeline Integration** - Playwright script generator subagent, pipeline browser-use detection, tool resolver browser path, mixed swarm support
- [ ] **Phase 24: Deployment, Wiring & NXT Validation** - Automated script deployment to VPS, agent spec wiring with MCP tool references, end-to-end NXT validation
- [ ] **Phase 25: Hardening & Second System** - Script health monitoring, iController validation

## Phase Details

### Phase 22: Capabilities Config & VPS Scaffold
**Goal**: Pipeline has a reliable source of truth for per-system integration methods, and a secure VPS MCP server is running and reachable
**Depends on**: V2.0 (deployer patterns, MCP/REST adapter)
**Requirements**: CAP-01, CAP-02, CAP-03, VPS-01, VPS-02, VPS-03, VPS-04
**Success Criteria** (what must be TRUE):
  1. User can define a system in the capabilities config file with its integration method (API / browser-only / headed browser), base URL, auth type, and available flows -- and the pipeline reads it
  2. Pipeline correctly identifies which agents in a use case need browser automation by matching systems against the capabilities config
  3. Discussion step asks about unknown systems' integration method and writes discovered capabilities back to the config file
  4. VPS MCP server is running with Streamable HTTP transport, TLS encryption, and bearer token authentication -- and responds to a health-check tool call
  5. VPS MCP server resolves credentials internally -- no credentials flow through agent tool parameters
**Plans**: TBD

Plans:
- [ ] 22-01: TBD
- [ ] 22-02: TBD

### Phase 23: Script Generation & Pipeline Integration
**Goal**: Pipeline generates working Playwright scripts for browser-only systems and integrates browser automation into the existing design flow
**Depends on**: Phase 22 (capabilities config provides system metadata and DOM context; VPS server provides the deployment target interface contract)
**Requirements**: SCRIPT-01, SCRIPT-02, SCRIPT-03, SCRIPT-04, SCRIPT-05, CAP-04, WIRE-01
**Success Criteria** (what must be TRUE):
  1. Pipeline generates deterministic Playwright TypeScript scripts from flow descriptions that use typed interface contracts (async function with typed params and return values)
  2. Generated scripts accept runtime parameters (customer ID, invoice number) via parameterized templates -- not hardcoded values
  3. Pipeline tries LLM-only script generation first, then falls back to requesting a Playwright codegen recording if the self-test fails
  4. Pipeline produces correct output for mixed swarms where some agents use APIs and others use browser automation -- both types coexist in the same swarm spec
  5. Tool resolver includes a "browser" resolution path that maps browser automation needs to VPS MCP tool references
**Plans**: TBD

Plans:
- [ ] 23-01: TBD
- [ ] 23-02: TBD

### Phase 24: Deployment, Wiring & NXT Validation
**Goal**: Generated scripts deploy to the VPS automatically, agent specs wire up correctly, and the full pipeline works end-to-end for NXT
**Depends on**: Phase 22 (VPS server running), Phase 23 (scripts generated, tool resolver extended)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, WIRE-02, VAL-01
**Success Criteria** (what must be TRUE):
  1. Pipeline deploys generated scripts to VPS automatically without manual SSH/SCP -- user never touches a terminal for deployment
  2. Deployed scripts are tracked by version with rollback capability
  3. Generated scripts run against the target system and pass self-test before being deployed to VPS
  4. Generated agent specs include correct MCP tool references pointing to the VPS server for browser automation flows
  5. User describes a use case involving NXT, and the pipeline detects browser need, generates script, deploys to VPS, and wires agent spec -- end-to-end without manual intervention
**Plans**: TBD

Plans:
- [ ] 24-01: TBD
- [ ] 24-02: TBD

### Phase 25: Hardening & Second System
**Goal**: Deployed scripts are monitored for health, and the pipeline generalizes beyond NXT to at least one additional system
**Depends on**: Phase 24 (NXT end-to-end working)
**Requirements**: HARD-01, HARD-02
**Success Criteria** (what must be TRUE):
  1. MCP tool runs smoke tests on all deployed scripts and reports health status -- broken scripts are surfaced before agents try to use them
  2. Pipeline works end-to-end for iController (not just NXT) -- capabilities config entry, script generation, deployment, and agent spec wiring all succeed for the second system
**Plans**: TBD

Plans:
- [ ] 25-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 22 -> 23 -> 24 -> 25

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 22. Capabilities Config & VPS Scaffold | 0/TBD | Not started | - |
| 23. Script Generation & Pipeline Integration | 0/TBD | Not started | - |
| 24. Deployment, Wiring & NXT Validation | 0/TBD | Not started | - |
| 25. Hardening & Second System | 0/TBD | Not started | - |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V3.0 | 12-16 (5 phases) | 0/TBD | **Defined** | - |
| V4.0 | 17-21 (5 phases) | 0/TBD | **Defined** | - |
| V5.0 | 22-25 (4 phases) | 0/TBD | **In Progress** | - |
