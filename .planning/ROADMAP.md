# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them via the Orq.ai MCP server and API. V3.0 adds a browser-based interface with real-time dashboard, node graph visualization, and HITL approval workflows for non-technical colleagues. V4.0 adds cross-swarm intelligence so that agent swarms don't operate in silos -- overlaps are surfaced, missing coordination is identified, and fixes are proposed across the entire ecosystem.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with real-time visibility, node graph, HITL approvals | **Defined** |
| **V4.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **In Progress** |

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

---

## V4.0 -- Cross-Swarm Intelligence (IN PROGRESS)

**Goal:** Give the agent design pipeline cross-swarm awareness so that swarms don't operate in silos -- overlaps are surfaced, missing coordination is identified, and fixes are proposed or auto-applied.

## Phases

**Phase Numbering:**
- Integer phases (17, 18, 19, 20, 21): Planned milestone work
- Decimal phases (e.g., 18.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 17: Ecosystem Foundation** - Unified inventory of all swarms from local specs and live Orq.ai state with tool/KB registries and human-readable report
- [ ] **Phase 18: Drift Detection** - Field-by-field comparison between spec and deployed state with severity classification and reconciliation recommendations
- [ ] **Phase 19: Overlap & Gap Analysis** - Semantic role overlap, tool duplication, blind spot identification, and coordination gap reporting across swarms
- [ ] **Phase 20: Fix Proposals** - Structured fix proposals with diff previews, risk classification, HITL approval, and provenance tracking
- [ ] **Phase 21: Command Integration & Auto-Trigger** - On-demand audit command and lightweight auto-trigger after new swarm designs

## Phase Details

### Phase 17: Ecosystem Foundation
**Goal**: Users can see a complete, accurate picture of their entire agent swarm ecosystem from both local specs and live Orq.ai state
**Depends on**: V2.0 (deployer's MCP/REST patterns, field comparison logic)
**Requirements**: ECO-01, ECO-02, ECO-03, ECO-04, ECO-05, ECO-06
**Success Criteria** (what must be TRUE):
  1. User can see a unified list of all agent swarms showing agents from both local spec files and live Orq.ai, with per-agent sync status (in-sync, drifted, spec-only, deployed-only)
  2. User can identify orphan agents (deployed on Orq.ai without a local spec) and ghost specs (local spec with no deployment) at a glance
  3. User can see which tools and knowledge bases are used across which swarms via dedicated registries
  4. User can read a human-readable ecosystem report summarizing the entire swarm landscape in one document
**Plans**: TBD

Plans:
- [ ] 17-01: TBD
- [ ] 17-02: TBD

### Phase 18: Drift Detection
**Goal**: Users can see exactly what has changed between their local spec files and what is actually deployed on Orq.ai, with clear severity and direction guidance
**Depends on**: Phase 17 (ecosystem map provides the dual-source data model)
**Requirements**: DRIFT-01, DRIFT-02, DRIFT-03, DRIFT-04
**Success Criteria** (what must be TRUE):
  1. User can see a field-by-field comparison for each agent showing differences between local spec and deployed Orq.ai state
  2. User can see each drift finding classified as CRITICAL (model/instructions/tools), WARNING (settings), or INFO (description/role wording)
  3. User can see a swarm-level drift summary showing how many agents are drifted per swarm
  4. User can see a reconciliation direction recommendation (update spec to match deployed, or re-deploy to match spec) for each drift finding
**Plans**: TBD

Plans:
- [ ] 18-01: TBD

### Phase 19: Overlap & Gap Analysis
**Goal**: Users can see where their swarms duplicate work, conflict with each other, or fail to coordinate on shared business processes
**Depends on**: Phase 17 (ecosystem model), Phase 18 (drift results feed into current-state model)
**Requirements**: OVLP-01, OVLP-02, OVLP-03, OVLP-04, OVLP-05
**Success Criteria** (what must be TRUE):
  1. User can see semantic role overlaps across swarms classified as REDUNDANT, COMPLEMENTARY, or CONFLICTING
  2. User can see a tool duplication report showing which tools are shared across swarms and whether that sharing is intentional
  3. User can see blind spots -- missing handoffs between swarms that should be coordinating on shared business processes
  4. User can see a coordination gap report with specific, actionable recommendations for each gap
  5. User can dismiss overlap findings as accepted so they do not resurface in future analyses
**Plans**: TBD

Plans:
- [ ] 19-01: TBD
- [ ] 19-02: TBD

### Phase 20: Fix Proposals
**Goal**: Users receive concrete, reviewable fix proposals for every drift finding, overlap, and coordination gap -- with clear risk levels and before/after previews
**Depends on**: Phase 18 (drift findings), Phase 19 (overlap and gap findings)
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-06
**Success Criteria** (what must be TRUE):
  1. User can see structured fix proposals with before/after diff previews showing exact spec changes for each finding
  2. User can see each proposal classified as LOW, MEDIUM, or HIGH risk
  3. User can approve or reject each fix proposal individually via HITL flow, with approved fixes applied to local spec files
  4. User can see shared context injection proposals (adding cross-swarm awareness to agent instructions) and data contract proposals (inter-swarm communication schemas)
  5. User can see a provenance trail for every fix (what triggered it, what changed, who approved, what the outcome was)
**Plans**: TBD

Plans:
- [ ] 20-01: TBD
- [ ] 20-02: TBD

### Phase 21: Command Integration & Auto-Trigger
**Goal**: Users can trigger cross-swarm analysis on demand and get automatic overlap checks whenever they design a new swarm
**Depends on**: Phase 17, 18, 19, 20 (all subagents must be stable before wiring them together)
**Requirements**: CMD-01, CMD-02, CMD-03, CMD-04
**Success Criteria** (what must be TRUE):
  1. User can run `/orq-agent:audit` and receive a full cross-swarm analysis (ecosystem map, drift, overlaps, fix proposals) in a single command
  2. User can read a structured ECOSYSTEM-REPORT.md after audit completes, covering the full swarm landscape with all findings
  3. After completing a new swarm design via `/orq-agent`, a lightweight cross-swarm check (map + overlap) runs automatically and surfaces findings
  4. The auto-trigger runs in lightweight mode only (no full drift or fix proposal generation) so it does not block the primary design pipeline
**Plans**: TBD

Plans:
- [ ] 21-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 17 -> 18 -> 19 -> 20 -> 21

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 17. Ecosystem Foundation | 0/TBD | Not started | - |
| 18. Drift Detection | 0/TBD | Not started | - |
| 19. Overlap & Gap Analysis | 0/TBD | Not started | - |
| 20. Fix Proposals | 0/TBD | Not started | - |
| 21. Command Integration & Auto-Trigger | 0/TBD | Not started | - |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V3.0 | 12-16 (5 phases) | 0/TBD | **Defined** | - |
| V4.0 | 17-21 (5 phases) | 0/TBD | **In Progress** | - |
