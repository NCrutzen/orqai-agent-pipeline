# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete, copy-paste-ready Orq.ai agent swarm specifications. The build progresses from foundational knowledge (references, templates, architect subagent) through core generation (spec, orchestration, dataset subagents) to the orchestrator that wires them together with adaptive input handling, and finally distribution packaging for non-technical users.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - References, templates, and architect subagent with complexity gate (completed 2026-02-24)
- [ ] **Phase 2: Core Generation Pipeline** - Research, spec generation, orchestration, tool schemas, and dataset subagents
- [ ] **Phase 3: Orchestrator and Adaptive Pipeline** - Orchestrator workflow wiring all subagents with adaptive input depth
- [ ] **Phase 4: Distribution** - Claude Code plugin packaging, install script, update command, and GSD integration

## Phase Details

### Phase 1: Foundation
**Goal**: Establish the knowledge base and architect subagent so the pipeline has something to reference and a blueprint to work from
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, SPEC-10, OUT-01, OUT-02, OUT-04
**Success Criteria** (what must be TRUE):
  1. Architect subagent accepts a use case description and produces a blueprint specifying agent count, roles, responsibilities, and orchestration pattern
  2. Architect subagent defaults to single-agent design for simple use cases and requires justification for each additional agent (complexity gate)
  3. Architect subagent identifies which agents should be tools of an orchestrator agent when multi-agent patterns are needed
  4. Reference files exist for all Orq.ai agent fields, model catalog, orchestration patterns, and naming conventions
  5. Output templates exist for agent spec, orchestration doc, dataset, and README file types following the directory structure convention
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Orq.ai reference files (agent fields, model catalog, orchestration patterns, naming conventions)
- [ ] 01-02-PLAN.md — Output templates (agent spec, orchestration, dataset, README)
- [ ] 01-03-PLAN.md — Architect subagent with complexity gate and blueprint output

### Phase 2: Core Generation Pipeline
**Goal**: Build all generation subagents so the pipeline can produce complete, quality-gated Orq.ai agent specs, orchestration docs, tool schemas, and datasets
**Depends on**: Phase 1
**Requirements**: RSRCH-01, RSRCH-02, RSRCH-03, SPEC-01, SPEC-02, SPEC-03, SPEC-04, SPEC-05, SPEC-06, SPEC-07, SPEC-08, SPEC-09, SPEC-11, SPEC-12, ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, TOOL-01, TOOL-02, TOOL-03, TOOL-04, DATA-01, DATA-02, DATA-03, DATA-04, OUT-03
**Success Criteria** (what must be TRUE):
  1. Domain researcher subagent investigates best practices per agent role (model selection, prompt patterns, tools, guardrails, context) and is skippable when input is detailed
  2. Spec generator subagent produces a complete agent `.md` file with all Orq.ai fields (description, instructions, model, fallback models, tools by type, context, evaluators, guardrails, runtime constraints, key, input/output templates) that a non-technical user can copy-paste into Orq.ai Studio
  3. Orchestration generator produces an `ORCHESTRATION.md` documenting agent-as-tool assignments, data flow, error handling, and human-in-the-loop decision points
  4. Tool schema generator produces valid JSON Schema definitions for function tools, recommends built-in tools, and identifies HTTP/Python/MCP tool needs
  5. Dataset generator produces test inputs, eval pairs, and multi-model comparison matrices with at least 30% adversarial/messy cases
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Orchestrator and Adaptive Pipeline
**Goal**: Wire all subagents into a single orchestrator workflow that handles any input from brief to detailed and adapts pipeline depth accordingly
**Depends on**: Phase 2
**Requirements**: INPT-01, INPT-02, INPT-03
**Success Criteria** (what must be TRUE):
  1. User can provide a brief use case description (1-3 sentences) and receive a complete agent swarm specification in the correct directory structure
  2. User can provide a detailed multi-paragraph brief and receive a complete agent swarm specification without unnecessary research stages running
  3. Pipeline adapts its depth based on input detail level -- skipping research subagents when the user provides sufficient context
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Distribution
**Goal**: Package everything as an installable Claude Code plugin that non-technical colleagues can set up and update
**Depends on**: Phase 3
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. Non-technical user can install `/orq-agent` as a Claude Code slash command from the GitHub repo using a simple install process
  2. User can run `/orq-agent:update` to pull the latest version from GitHub
  3. Skill works standalone (`/orq-agent`) and is callable from within a GSD phase
  4. Total skill size stays within Claude Code character budget limits
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/3 | Complete    | 2026-02-24 |
| 2. Core Generation Pipeline | 0/3 | Not started | - |
| 3. Orchestrator and Adaptive Pipeline | 0/2 | Not started | - |
| 4. Distribution | 0/1 | Not started | - |
