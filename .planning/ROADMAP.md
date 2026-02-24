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
- [x] **Phase 3: Orchestrator and Adaptive Pipeline** - Orchestrator workflow wiring all subagents with adaptive input depth (completed 2026-02-24)
- [x] **Phase 4: Distribution** - Claude Code plugin packaging, install script, update command, and GSD integration (completed 2026-02-24)

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
**Plans**: 5 plans

Plans:
- [ ] 02-01-PLAN.md — Domain researcher subagent with web search and structured research briefs
- [ ] 02-02-PLAN.md — Spec generator subagent with all Orq.ai fields, tool schemas, and self-validation
- [ ] 02-03-PLAN.md — Orchestration generator subagent with Mermaid diagrams and error handling
- [ ] 02-04-PLAN.md — Dataset generator subagent with dual datasets and adversarial taxonomy
- [ ] 02-05-PLAN.md — README generator subagent and SKILL.md update

### Phase 3: Orchestrator and Adaptive Pipeline
**Goal**: Wire all subagents into a single orchestrator workflow that handles any input from brief to detailed and adapts pipeline depth accordingly
**Depends on**: Phase 2
**Requirements**: INPT-01, INPT-02, INPT-03
**Success Criteria** (what must be TRUE):
  1. User can provide a brief use case description (1-3 sentences) and receive a complete agent swarm specification in the correct directory structure
  2. User can provide a detailed multi-paragraph brief and receive a complete agent swarm specification without unnecessary research stages running
  3. Pipeline adapts its depth based on input detail level -- skipping research subagents when the user provides sufficient context
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Orchestrator command with input handling, classification, and architect stage (Steps 1-5)
- [ ] 03-02-PLAN.md — Generation pipeline waves, output assembly, metadata, and SKILL.md update (Steps 6-7)

### Phase 4: Distribution
**Goal**: Package everything as an installable Claude Code plugin that non-technical colleagues can set up and update
**Depends on**: Phase 3
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. Non-technical user can install `/orq-agent` as a Claude Code slash command from the GitHub repo using a simple install process
  2. User can run `/orq-agent:update` to pull the latest version from GitHub
  3. Skill works standalone (`/orq-agent`) and is callable from within a GSD phase
  4. Total skill size stays within Claude Code character budget limits
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Plugin packaging, install script with prerequisite checks, version tracking, and rollback
- [ ] 04-02-PLAN.md — Update command, help command, GSD integration flags, and SKILL.md update
- [ ] 04-03-PLAN.md — Gap closure: Replace hardcoded ./Agents/ paths with {OUTPUT_DIR} in Waves 1-3 and Step 7

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/3 | Complete    | 2026-02-24 |
| 2. Core Generation Pipeline | 0/3 | Not started | - |
| 3. Orchestrator and Adaptive Pipeline | 2/2 | Complete   | 2026-02-24 |
| 4. Distribution | 0/1 | Complete    | 2026-02-24 |

### Phase 04.3: Beste Prompt Strategy (INSERTED)

**Goal:** Upgrade all generation subagents to produce XML-tagged, heuristic-first agent instructions with Anthropic context engineering patterns (delegation frameworks, context budget awareness, Memory Store integration, few-shot examples as primary calibration)
**Depends on:** Phase 4
**Requirements:** SPEC-02, SPEC-05, SPEC-06, SPEC-12, ORCH-01, ORCH-02, RSRCH-02, TOOL-01, TOOL-02
**Plans:** 3 plans

Plans:
- [ ] 04.3-01-PLAN.md — Spec generator and agent-spec template: XML-tagged instructions, heuristic-first, context management, few-shot examples
- [ ] 04.3-02-PLAN.md — Orchestration generator, researcher, and orchestration template: delegation frameworks, effort scaling, tool overlap detection, context management recommendations
- [ ] 04.3-03-PLAN.md — Orchestrator prompt and secondary subagents (architect, dataset-gen, readme-gen): XML tags, heuristic guidelines, consistent patterns

### Phase 04.2: Tool Selection and MCP Servers (INSERTED)

**Goal:** Build a tool resolver pipeline stage and unified tool catalog so generated Orq.ai agent specs include accurate, verified tool recommendations with copy-paste-ready configuration
**Depends on:** Phase 4
**Requirements:** TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Plans:** 2/2 plans complete

Plans:
- [ ] 04.2-01-PLAN.md — Unified tool catalog reference, TOOLS.md template, and tool resolver subagent prompt
- [ ] 04.2-02-PLAN.md — Wire tool resolver into orchestrator pipeline, update downstream subagents and SKILL.md

### Phase 04.1: Introducing a Discussion phase on start if needed (INSERTED)

**Goal:** Replace the classify-then-confirm flow with a GSD-style structured discussion that always runs, surfaces domain-specific gray areas, and enriches user input before the architect runs
**Depends on:** Phase 3
**Requirements:** INPT-01, INPT-02, INPT-03
**Success Criteria** (what must be TRUE):
  1. Every `/orq-agent` invocation presents a structured discussion step with domain-specific gray areas before the architect runs
  2. Discussion adapts naturally to input detail level -- brief inputs produce longer discussions, detailed inputs produce shorter ones
  3. Researcher skip classification still functions internally after discussion enrichment without user-facing checkpoint
**Plans:** 1/1 plans complete

Plans:
- [ ] 04.1-01-PLAN.md — Replace Steps 2-3 with discussion step, renumber flow, update SKILL.md
