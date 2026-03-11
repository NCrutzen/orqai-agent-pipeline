# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them via the Orq.ai MCP server and API. V3.0 adds a browser-based interface with real-time dashboard, node graph visualization, and HITL approval workflows for non-technical colleagues. V4.0 adds cross-swarm intelligence so that agent swarms don't operate in silos -- overlaps are surfaced, missing coordination is identified, and fixes are proposed across the entire ecosystem. V5.0 extends the pipeline to detect browser automation needs, generate deterministic Playwright scripts, deploy them to a VPS-hosted MCP server, and wire agent specs with the right MCP tools.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure -- rewrite test/iterate with native MCP, smaller subagents | **In Progress** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with real-time visibility, node graph, HITL approvals | **Defined** |
| **V4.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |
| **V5.0** | Browser Automation -- Playwright script generation, VPS MCP server, automated deployment, agent spec wiring | **Defined** |

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

<details>
<summary>V5.0 Browser Automation (Phases 22-25) -- DEFINED</summary>

**4 phases, 21 requirements defined**

- [ ] Phase 22: Capabilities Config & VPS Scaffold -- Application capabilities config file with NXT entry, VPS MCP server with Streamable HTTP transport, TLS, and bearer token auth
- [ ] Phase 23: Script Generation & Pipeline Integration -- Playwright script generator subagent, pipeline browser-use detection, tool resolver browser path, mixed swarm support
- [ ] Phase 24: Deployment, Wiring & NXT Validation -- Automated script deployment to VPS, agent spec wiring with MCP tool references, end-to-end NXT validation
- [ ] Phase 25: Hardening & Second System -- Script health monitoring, iController validation

</details>

---

## V2.1 -- Experiment Pipeline Restructure (IN PROGRESS)

**Goal:** Rewrite the test/iterate pipeline to use native Orq.ai MCP tools for experiments, break monolithic tester.md (771 lines) and iterator.md (544 lines) into 5 focused subagents, and reduce token/context load so experiments actually run successfully. Same features, better architecture, working experiments.

## Phases

**Phase Numbering:**
- Integer phases (26-32): Planned milestone work
- Decimal phases (e.g., 27.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 26: Dataset Preparer** - New subagent that parses markdown datasets, augments to 30+, splits stratified, and uploads with correct row format via MCP/REST (completed 2026-03-11)
- [x] **Phase 27: Experiment Runner** - New subagent that creates and runs experiments via native MCP create_experiment with adaptive polling and triple-run execution (completed 2026-03-11)
- [ ] **Phase 28: Results Analyzer** - New subagent that aggregates triple-run scores, determines pass/fail, produces category-sliced analysis and backward-compatible output
- [ ] **Phase 29: Test Command Rewrite** - Simplified test.md orchestrating dataset-preparer, experiment-runner, results-analyzer in sequence with intermediate failure checks
- [ ] **Phase 30: Failure Diagnoser** - New subagent that maps evaluator failures to prompt sections, proposes diffs, and collects HITL approval
- [ ] **Phase 31: Prompt Editor** - New subagent that applies approved changes, delegates re-deploy and holdout re-test, and computes before/after score comparison
- [ ] **Phase 32: Iterate Command Rewrite** - Simplified iterate.md orchestrating failure-diagnoser and prompt-editor in loop with 5 stop conditions

## Phase Details

### Phase 26: Dataset Preparer
**Goal**: Users get correctly formatted datasets uploaded to Orq.ai with the required `messages` field, stratified splits, and a JSON contract for downstream subagents
**Depends on**: Nothing (first V2.1 phase; foundational -- all downstream phases need dataset IDs)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. Dataset-preparer uploads datapoints where each row contains a `messages` field with `[{role: "user", content: ...}]` -- and a test experiment on Orq.ai produces non-null evaluator scores
  2. Dataset-preparer creates datasets and datapoints via MCP tools first, falling back to REST API if MCP is unavailable
  3. Dataset-preparer reads existing markdown eval pairs, augments to 30+ examples, and splits into 60/20/20 train/validation/holdout sets with stratified distribution
  4. Dataset-preparer writes a `dataset-prep.json` file containing per-agent dataset IDs, inferred agent role, and status fields that downstream subagents can read
**Plans**: 1 plan

Plans:
- [ ] 26-01-PLAN.md — Create dataset-preparer.md subagent with 8 internal phases (parse, augment, split, smoke test, upload, role inference, JSON contract)

### Phase 27: Experiment Runner
**Goal**: Users get working experiment execution on Orq.ai using native MCP/REST tools instead of the broken evaluatorq SDK, with triple-run reliability and adaptive polling
**Depends on**: Phase 26 (needs dataset IDs from dataset-prep.json)
**Requirements**: EXPR-01, EXPR-02, EXPR-03, EXPR-04, EXPR-05, EXPR-06
**Success Criteria** (what must be TRUE):
  1. Experiment-runner creates experiments via MCP `create_experiment` with `task.type: "agent"` and the agent's `key` identifier -- and experiments actually execute on Orq.ai without timing out
  2. Experiment-runner resolves evaluator IDs by creating custom evaluators via MCP or referencing built-in evaluators by name -- experiments include working evaluators
  3. Experiment-runner executes 3 runs per agent with an adaptive polling loop (10-30s interval) and writes raw per-run per-evaluator scores to `experiment-raw.json`
  4. Experiment-runner accepts a `dataset_id` directly as input for holdout re-test mode -- skipping dataset-preparer entirely
**Plans**: 1 plan

Plans:
- [ ] 27-01-PLAN.md — Create experiment-runner.md subagent with 6 internal phases (read inputs, resolve evaluators, create experiments, execute runs, export results, write JSON)

### Phase 28: Results Analyzer
**Goal**: Users get clear, actionable test results with statistical rigor and backward-compatible output that hardener.md continues to consume without changes
**Depends on**: Phase 27 (needs raw scores from experiment-raw.json)
**Requirements**: ANLZ-01, ANLZ-02, ANLZ-03, ANLZ-04, ANLZ-05
**Success Criteria** (what must be TRUE):
  1. Results-analyzer computes triple-run aggregation (median, variance, 95% CI) and determines pass/fail per evaluator per agent against configured thresholds
  2. Results-analyzer produces category-sliced scoring when `inputs.category` metadata is present in dataset rows
  3. Results-analyzer writes `test-results.json` that preserves the exact schema hardener.md expects -- hardener continues working without modification
  4. Results-analyzer produces a `test-results.md` human-readable report and a terminal summary table showing per-agent per-evaluator scores
**Plans**: TBD

Plans:
- [ ] 28-01: TBD

### Phase 29: Test Command Rewrite
**Goal**: Users run `/orq-agent:test` and get the same end-to-end test pipeline behavior as before, but orchestrated through 3 focused subagents instead of one monolithic tester
**Depends on**: Phase 26, Phase 27, Phase 28 (all 3 subagent interfaces must be locked)
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Test command orchestrates dataset-preparer, experiment-runner, and results-analyzer in sequence -- completing the full pipeline from markdown datasets to scored results
  2. Test command preserves the `--agent` flag for single-agent testing -- users can test one agent at a time
  3. Test command checks intermediate JSON files (`dataset-prep.json`, `experiment-raw.json`) between subagent steps and aborts with a clear error message if an upstream step failed
**Plans**: TBD

Plans:
- [ ] 29-01: TBD

### Phase 30: Failure Diagnoser
**Goal**: Users get precise, section-level diagnosis of why their agents failed specific evaluators, with diff proposals they can approve before any changes are made
**Depends on**: Phase 29 (needs confirmed test-results.json schema from the working test pipeline)
**Requirements**: ITPIPE-01, ITPIPE-02, ITPIPE-03
**Success Criteria** (what must be TRUE):
  1. Failure-diagnoser reads test-results.json and identifies which evaluators failed for each agent, mapping failures to specific XML-tagged sections in the agent's prompt
  2. Failure-diagnoser proposes section-level diffs with plain-language reasoning explaining why each change should improve the failing evaluator's score
  3. Failure-diagnoser collects per-agent HITL approval from the user before any file modifications occur -- no changes without explicit consent
**Plans**: TBD

Plans:
- [ ] 30-01: TBD

### Phase 31: Prompt Editor
**Goal**: Users get approved prompt changes applied safely, with automatic re-deploy and holdout re-test to verify improvements, and clear before/after score comparison
**Depends on**: Phase 30 (needs iteration-proposals.json), Phase 27 (delegates holdout re-test to experiment-runner)
**Requirements**: ITPIPE-04, ITPIPE-05, ITPIPE-06
**Success Criteria** (what must be TRUE):
  1. Prompt-editor applies approved section-level changes to agent spec files preserving YAML frontmatter and all non-instruction sections intact
  2. Prompt-editor delegates re-deploy to deployer.md and holdout re-test to experiment-runner (not dataset-preparer) -- no duplicate dataset uploads during iteration
  3. Prompt-editor computes before/after score comparison and flags any evaluator regressions -- user sees whether the iteration actually helped
**Plans**: TBD

Plans:
- [ ] 31-01: TBD

### Phase 32: Iterate Command Rewrite
**Goal**: Users run `/orq-agent:iterate` and get automated iteration loops with clear stopping conditions, producing the same audit trail and iteration logs as before
**Depends on**: Phase 30, Phase 31 (both iteration subagent interfaces must be locked)
**Requirements**: LOOP-01, LOOP-02, LOOP-03
**Success Criteria** (what must be TRUE):
  1. Iterate command orchestrates failure-diagnoser and prompt-editor in a loop -- each cycle diagnoses failures, proposes changes, gets approval, applies changes, re-deploys, and re-tests
  2. Iterate command enforces all 5 stop conditions (max_iterations reached, timeout exceeded, min_improvement not met, all evaluators pass, user declined changes) and stops the loop when any condition triggers
  3. Iterate command preserves the `--agent` flag and produces iteration-log.md and audit-trail.md documenting every change across all cycles
**Plans**: TBD

Plans:
- [ ] 32-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 26 -> 27 -> 28 -> 29 -> 30 -> 31 -> 32

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 26. Dataset Preparer | 1/1 | Complete    | 2026-03-11 |
| 27. Experiment Runner | 1/1 | Complete    | 2026-03-11 |
| 28. Results Analyzer | 0/TBD | Not started | - |
| 29. Test Command Rewrite | 0/TBD | Not started | - |
| 30. Failure Diagnoser | 0/TBD | Not started | - |
| 31. Prompt Editor | 0/TBD | Not started | - |
| 32. Iterate Command Rewrite | 0/TBD | Not started | - |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V2.1 | 26-32 (7 phases) | 0/TBD | **In Progress** | - |
| V3.0 | 12-16 (5 phases) | 0/TBD | **Defined** | - |
| V4.0 | 17-21 (5 phases) | 0/TBD | **Defined** | - |
| V5.0 | 22-25 (4 phases) | 0/TBD | **Defined** | - |
