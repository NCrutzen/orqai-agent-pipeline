---
phase: quick-260323-bzl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/BROWSER-AUTOMATION-ASSESSMENT.md
  - .planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/ACTION-PLAN.md
autonomous: true
requirements: [BZL-ASSESS]

must_haves:
  truths:
    - "Every one of the 17 pipeline agents has been individually assessed for browser automation relevance"
    - "Each agent has a clear priority rating (high/medium/low/none) with rationale"
    - "New pipeline subagent needs are identified with integration points"
    - "Specific instruction changes are documented per agent that needs modification"
    - "An actionable implementation plan exists with ordering and dependencies"
  artifacts:
    - path: ".planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/BROWSER-AUTOMATION-ASSESSMENT.md"
      provides: "Per-agent assessment of browser automation relevance, priority, and needed changes"
      min_lines: 200
    - path: ".planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/ACTION-PLAN.md"
      provides: "Implementation plan with new subagents, instruction changes, and ordering"
      min_lines: 80
  key_links:
    - from: "BROWSER-AUTOMATION-ASSESSMENT.md"
      to: "ACTION-PLAN.md"
      via: "Assessment findings drive action items"
      pattern: "Priority: (high|medium)"
---

<objective>
Assess all 17 CLI pipeline agents (orq-agent/agents/) against Browserless.io browser automation capabilities from V4.0 context. Produce a comprehensive analysis of which agents need to become browser-automation-aware, whether new pipeline subagents are needed, and what specific instruction changes are required.

Purpose: V4.0 Browser Automation Builder adds a pipeline stage where agents can interact with no-API systems (NXT, iController, Intelly) via Playwright scripts on Browserless.io. The existing pipeline agents were designed without browser automation awareness. This assessment determines the integration surface between the existing pipeline and V4.0 capabilities -- informing which agents need modifications, which new agents are needed, and what the implementation order should be.

Output: Two documents -- a detailed per-agent assessment and an actionable implementation plan.
</objective>

<execution_context>
@/Users/nickcrutzen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nickcrutzen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md

Key context already loaded by planner:
- All 17 agent .md files in orq-agent/agents/ (architect, researcher, spec-generator, orchestration-generator, dataset-generator, tool-resolver, deployer, tester, dataset-preparer, experiment-runner, results-analyzer, failure-diagnoser, prompt-editor, iterator, hardener, kb-generator, readme-generator)
- Browserless.io capabilities research from /Users/nickcrutzen/Developer/agent-workforce/.planning/research/BROWSERLESS-CAPABILITIES.md
- V4.0 roadmap context from /Users/nickcrutzen/Developer/agent-workforce/.planning/ROADMAP.md and PROJECT.md

<interfaces>
<!-- Browserless.io API surface (from research) -->
REST APIs: /function (Puppeteer code), /screenshot, /content, /scrape, /download, /unblock
BaaS: WebSocket sessions with Puppeteer/Playwright, persistent sessions, reconnection
BrowserQL: Stealth automation with anti-detection
Session Replay: RRWeb full session recording

<!-- V4.0 Pipeline Stages (from agent-workforce ROADMAP) -->
Phase 39: Infrastructure & Credential Foundation (Browserless.io connectivity, credential vault)
Phase 40: Detection, SOP Upload & Vision Analysis (no-API detection, SOP parsing, AI vision)
Phase 41: Script Generation, Testing & MCP Deployment (Playwright scripts, Browserless.io execution, MCP tool deployment)
Phase 42: Standalone Automations & Triggers (dashboard, scheduling, webhooks)

<!-- Key V4.0 decisions -->
- Browser automation as inline pipeline stage during initial agent creation
- Browserless.io for cloud execution (no VPS management)
- AI vision for screenshot analysis
- MCP tool as automation output
- Fixed scripts over dynamic browser-use
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Per-agent browser automation assessment</name>
  <files>.planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/BROWSER-AUTOMATION-ASSESSMENT.md</files>
  <action>
Read all 17 agent instruction files from orq-agent/agents/ and produce a structured assessment document. For EACH of the 17 agents, analyze:

1. **Current role and responsibilities** (1-2 sentence summary from the agent's description/role)
2. **Browser automation relevance** (how V4.0 browser automation capabilities intersect with this agent's job)
3. **What changes are needed** (specific instruction modifications, new sections, new tool awareness, or "none")
4. **Priority** (high/medium/low/none with clear rationale)

Use this analysis framework for each agent:

**HIGH priority** = Agent's core logic must change to accommodate browser automation (e.g., architect must detect no-API systems, tool-resolver must know about Browserless MCP tools, spec-generator must generate browser-automation-aware specs)

**MEDIUM priority** = Agent benefits from browser automation awareness but core logic doesn't change fundamentally (e.g., dataset-generator could generate browser automation test cases, orchestration-generator should document browser automation data flow)

**LOW priority** = Minor awareness needed (e.g., readme-generator should mention browser automation setup when applicable)

**NONE** = No changes needed (e.g., results-analyzer is pure computation, experiment-runner only runs Orq.ai experiments)

For agents rated HIGH or MEDIUM, specify EXACTLY what instruction changes are needed:
- Which XML section(s) to modify (e.g., add to `<task_handling>`, add new `<browser_automation>` section)
- What new decision heuristics or rules to add
- What new output format elements are needed
- What new tool awareness is required

Additionally, assess:
- Whether new pipeline subagent(s) are needed and what they would do
- How new agents integrate into the existing pipeline flow (after which existing stage, what data they consume/produce)
- What the contract between existing agents and new browser automation agents looks like

Structure the document with:
- Executive summary (key findings)
- Per-agent assessment table (all 17 agents with priority at a glance)
- Detailed per-agent analysis sections (only for HIGH and MEDIUM priority agents)
- Brief notes for LOW and NONE priority agents
- New subagent proposals section
- Pipeline integration analysis section

Base the analysis on these specific V4.0 requirements:
- No-API system detection must happen during architect/discussion phase
- SOP + screenshot upload flow integrates after agent spec generation but before deployment
- Playwright script generation requires understanding of the agent's target system
- Generated scripts deploy as MCP tools attached to the Orq.ai agent
- Credential management for target systems (NXT, iController, Intelly)
- Session Replay replaces screenshot capture for testing verification

Write in Dutch section headers where appropriate since the task description is in Dutch, but keep technical content in English for consistency with the codebase.
  </action>
  <verify>
    <automated>test -f /Users/nickcrutzen/Developer/orqai-agent-pipeline/.planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/BROWSER-AUTOMATION-ASSESSMENT.md && wc -l /Users/nickcrutzen/Developer/orqai-agent-pipeline/.planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/BROWSER-AUTOMATION-ASSESSMENT.md | awk '{if ($1 >= 200) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <done>Assessment document exists with 200+ lines covering all 17 agents individually, each with priority rating and rationale, plus new subagent proposals and pipeline integration analysis</done>
</task>

<task type="auto">
  <name>Task 2: Actionable implementation plan</name>
  <files>.planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/ACTION-PLAN.md</files>
  <action>
Based on the assessment from Task 1, produce a concrete implementation plan document. This should be a roadmap for making the existing pipeline browser-automation-ready.

Structure the plan as:

## 1. New Pipeline Subagents

For each proposed new subagent:
- **Name and key** (following existing convention: `orq-{name}`)
- **Purpose** (1-2 sentences)
- **Input contract** (what data it receives, from which existing agent)
- **Output contract** (what data it produces, consumed by which agent)
- **Pipeline position** (after which stage, before which stage)
- **Tools needed** (Read, Write, Bash, WebFetch, vision APIs, Browserless.io APIs)
- **Estimated instruction file size** (small ~200 lines, medium ~400 lines, large ~600+ lines)

## 2. Existing Agent Modifications

For each HIGH and MEDIUM priority agent from the assessment:
- **Agent name**
- **Change type** (instruction addition, new section, modified heuristic, new output field)
- **Specific change description** (what exactly to add/modify in the .md file)
- **Diff sketch** (abbreviated before/after showing the key change)
- **Effort estimate** (small/medium/large based on scope of instruction changes)

## 3. Implementation Order

Ordered phases for making the pipeline browser-automation-ready:
- Phase A: Foundation changes (agents that other changes depend on)
- Phase B: Core browser automation agents (new subagents)
- Phase C: Integration changes (existing agents that wire to new agents)
- Phase D: Testing and documentation agents

For each phase, list:
- Which agents to create or modify
- Dependencies on prior phases
- Estimated effort (in terms of instruction file creation/modification complexity)

## 4. Pipeline Flow Diagram

ASCII diagram showing the enhanced pipeline with browser automation integrated:
- Where the no-API detection checkpoint occurs
- Where SOP + screenshot upload integrates
- Where Playwright script generation fits
- Where script testing and MCP deployment occur
- How the flow returns to the main pipeline

## 5. Risk Assessment

- What could go wrong with the integration approach
- What assumptions are being made
- What needs validation before implementation

Keep all content actionable -- every item should be something that can be directly implemented. No vague recommendations.
  </action>
  <verify>
    <automated>test -f /Users/nickcrutzen/Developer/orqai-agent-pipeline/.planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/ACTION-PLAN.md && wc -l /Users/nickcrutzen/Developer/orqai-agent-pipeline/.planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/ACTION-PLAN.md | awk '{if ($1 >= 80) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <done>Action plan exists with 80+ lines containing new subagent proposals with contracts, existing agent modification specs with diff sketches, phased implementation order, pipeline flow diagram, and risk assessment</done>
</task>

</tasks>

<verification>
- All 17 agents assessed individually with priority rating
- HIGH/MEDIUM agents have specific instruction change proposals
- New subagent proposals include input/output contracts and pipeline position
- Implementation plan has clear phases with dependencies
- Both documents are internally consistent (assessment findings match action plan items)
</verification>

<success_criteria>
- BROWSER-AUTOMATION-ASSESSMENT.md covers all 17 agents with individual analysis
- Each agent has a priority rating (high/medium/low/none) with clear rationale
- At least 3-5 agents identified as HIGH or MEDIUM priority
- New subagent proposals are concrete with names, contracts, and pipeline position
- ACTION-PLAN.md provides a phased implementation roadmap
- Changes are specific enough to implement without further research
</success_criteria>

<output>
After completion, create `.planning/quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/260323-bzl-SUMMARY.md`
</output>
