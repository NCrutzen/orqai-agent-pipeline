# Action Plan: Browser Automation Integration into Pipeline Agents (v2 -- Revised Model)

**Date:** 2026-03-23 (revised)
**Based on:** BROWSER-AUTOMATION-ASSESSMENT.md (v2 -- workflow-discovery + workflow-builder model)
**Scope:** Changes to orqai-agent-pipeline agents to support V4.0 Browser Automation Builder

---

## 1. New Pipeline Subagents

### 1.1 orq-workflow-discovery (NEW)

- **Name and key:** `orq-workflow-discovery`
- **Purpose:** Conversationally identifies which systems and workflows a use case requires. Reasons about integration methods (API, browser automation, manual) for each identified system. Presents findings to the user for confirmation or correction before the architect begins swarm design.
- **Pipeline position:** After discussion (receives use case description with gray areas resolved), BEFORE architect. This is the earliest point where browser automation needs are identified.
- **Input contract:**
  - Use case description (from discussion output -- what the user wants the agent to do)
  - Optional: `systems.json` config file (maps known system names to integration methods)
  - Conversation context for follow-up questions with the user
- **Output contract:** Per-system structured discovery result:
  ```json
  [
    {
      "system_name": "NXT",
      "integration_method": "browser-automation",
      "workflows_identified": [
        { "name": "customer-lookup", "description": "Look up customer details by name or ID" }
      ],
      "confidence": "HIGH",
      "user_confirmed": true
    },
    {
      "system_name": "FAQ Knowledge Base",
      "integration_method": "standard-tool",
      "workflows_identified": [],
      "confidence": "HIGH",
      "user_confirmed": true
    }
  ]
  ```
- **Key differentiator from old model:** The old model embedded detection in the architect as keyword matching. Workflow-discovery uses conversational reasoning: it asks the user about systems, reasons about known integration methods, and confirms with the user. This handles unknown systems gracefully -- if the user mentions a system workflow-discovery doesn't recognize, it asks: "Does [system] have an API, or is it a web-only application?"
- **Tools needed:** Read (for systems.json lookup), conversation context
- **Estimated instruction file size:** Medium (~400 lines) -- conversational reasoning heuristics, system detection patterns, user confirmation flow, output formatting

### 1.2 orq-workflow-builder (NEW -- replaces SOP-dependent approach)

- **Name and key:** `orq-workflow-builder`
- **Purpose:** Builds structured workflow definitions from multiple input sources. Does NOT assume SOP documents exist. Works from whatever the user can provide: conversational description (most common), screenshots, SOP documents, or any combination.
- **Pipeline position:** After spec-generation output is complete (V1.0 output), before script-generator. This sits in the browser automation pipeline stage.
- **Input contract:**
  - Workflow-discovery output (system name, integration method, identified workflow names)
  - **Primary path (most common):** User conversation about the workflow -- the user describes step by step what they do in the target system
  - **Secondary path:** Uploaded screenshots of the target system (PNG/JPEG) -- AI vision identifies UI elements
  - **Tertiary path:** SOP document (PDF/Word) -- when available, parsed for step-by-step instructions
  - **Combined path:** Any mix of the above
  - Researcher's browser automation context (UI framework, auth method, session persistence needs)
- **Output contract:** `workflow-definition.json` -- structured array of steps, each with action description, UI elements, screenshot references (if available), coordinate annotations (if screenshots provided). Same output format regardless of input source:
  ```json
  {
    "target_system": "NXT",
    "auth_method": "username-password",
    "input_sources_used": ["conversation", "screenshots"],
    "steps": [
      {
        "step_number": 1,
        "action": "Navigate to login page",
        "ui_elements": ["username field", "password field", "login button"],
        "screenshot_ref": "screenshot-01.png",
        "annotations": [{ "element": "username field", "coordinates": [120, 340, 200, 40] }]
      }
    ]
  }
  ```
- **Key differentiator from old model:** The old model required an SOP document. The workflow-builder works conversation-first -- the most common path is the user describing what they do step by step, with the builder asking clarifying questions ("What do you see after you click 'Search'?", "Is the customer list a table or a dropdown?"). Screenshots and SOPs supplement the conversation when available.
- **Tools needed:** Read, Write, Vision API (via Orq.ai agent or direct API for screenshot analysis), conversation context
- **Estimated instruction file size:** Large (~600+ lines) -- multi-source input handling, conversational workflow extraction with clarifying questions, AI vision analysis for screenshots, SOP parsing (when available), multi-step user confirmation flow

### 1.3 orq-script-generator

- **Name and key:** `orq-script-generator`
- **Purpose:** Generates Playwright scripts from structured workflow definitions, executes them on Browserless.io for testing, iterates on failures using DOM accessibility tree analysis, and produces verified scripts ready for MCP tool deployment.
- **Pipeline position:** After workflow-builder. Consumes workflow definition, produces verified Playwright script.
- **Input contract:** `workflow-definition.json` (from workflow-builder), Browserless.io API token, target system credentials (from credential vault or user input), credential injection method
- **Output contract:** Verified Playwright script file (`scripts/{target-system}-{action}.js`), MCP tool definition JSON (key, type, description, server_url), test evidence (Session Replay URLs, execution times, pass/fail per iteration). Consumed by deployer.
  ```json
  {
    "key": "browser-automation-nxt-customer-lookup",
    "type": "mcp",
    "description": "Looks up customer details in NXT by searching the customer database",
    "script_path": "scripts/nxt-customer-lookup.js",
    "status": "verified",
    "test_runs": 3,
    "avg_execution_time": "15s",
    "session_replay_urls": ["https://browserless.io/replay/abc123"]
  }
  ```
- **Tools needed:** Read, Write, Bash (for running Playwright via Browserless.io WebSocket or REST), WebFetch (for Browserless.io API calls -- `/function`, `/screenshot`, `/content`)
- **Estimated instruction file size:** Large (~600+ lines) -- Playwright code generation patterns, iterative test-fix loop with DOM analysis, MCP tool configuration output, credential injection patterns

---

## 2. Existing Agent Modifications

### 2.1 researcher.md -- HIGH priority

**Change type:** New conditional section in research brief output + search protocol additions

**Specific changes:**

1. Add conditional `### Browser Automation Context` section to per-agent research brief format (only when workflow-discovery flags `integration_method: "browser-automation"` for a system this agent interacts with):

```markdown
### Diff sketch

BEFORE (per-agent brief ends with):
### Knowledge Base Design: [name]
(or no KB section if Knowledge base is none)

AFTER (new section appended when browser automation is involved):
### Browser Automation Context
**Target system:** [system name from workflow-discovery output]
**Authentication method:** [username-password | sso | certificate]
**UI complexity:** [simple (5-10 steps) | moderate (10-25 steps) | complex (25+ steps)]
**Session persistence needs:** [stateless | cookies | localStorage | server-side]
**Credential rotation:** [none | monthly | quarterly | on-demand]
**Known automation challenges:** [list any known issues with the target system]
**Confidence:** [HIGH/MEDIUM/LOW]
```

2. Add browser automation web search queries to search protocol:

```
"[system-name] automation" -- existing automation approaches
"[system-name] playwright" -- existing Playwright scripts
"[system-name] login flow" -- authentication patterns
"[system-name] UI framework" -- front-end technology identification
```

3. Add MCP tool type to tool recommendations when browser automation is flagged.

4. Add browser automation-specific guardrail suggestions (credential handling, session timeout handling).

**Effort estimate:** Small -- conditional section, additional search patterns

---

### 2.2 spec-generator.md -- HIGH priority

**Change type:** Conditional instruction section generation + tool placeholder + constraint additions

**Specific changes:**

1. Add conditional `<browser_automation>` section generation to the Instructions generation rules:

```markdown
### Diff sketch

BEFORE (conditional sections list):
- `<memory_patterns>` -- Include when agent has Memory Store tools
- `<delegation_framework>` -- Include for orchestrator agents only

AFTER:
- `<memory_patterns>` -- Include when agent has Memory Store tools
- `<delegation_framework>` -- Include for orchestrator agents only
- `<browser_automation>` -- Include when architect blueprint flags browser_automation: required
```

2. Add template for generated `<browser_automation>` section content (see ASSESSMENT.md for full template).

3. Add MCP tool placeholder to Tools section generation logic:

```markdown
When architect blueprint flags browser_automation: required for this agent:
- Add placeholder MCP tool entry:
  { "type": "mcp", "tool_id": "{{BROWSER_AUTOMATION_TOOL_ID}}", "description": "..." }
- Add note: "Tool ID will be populated after workflow-builder + script-generator completes"
```

4. Increase Runtime Constraints defaults for browser automation agents:
   - `max_execution_time`: 600 seconds (vs 300 standard)
   - `max_iterations`: 15 (vs 10 standard)

**Effort estimate:** Medium -- conditional section template, tool placeholder logic, constraint adjustments

---

### 2.3 deployer.md -- HIGH priority

**Change type:** New deployment phase + manifest parsing + verification

**Specific changes:**

1. Add Phase 1.7 to the deployment pipeline:

```markdown
### Diff sketch

BEFORE (deployment phases):
Phase 1: Deploy Tools
Phase 1.5: Provision Knowledge Bases
Phase 2: Deploy Sub-Agents
Phase 3: Deploy Orchestrator

AFTER:
Phase 1: Deploy Tools
Phase 1.5: Provision Knowledge Bases
Phase 1.7: Deploy Browser Automation MCP Tools (NEW)
Phase 2: Deploy Sub-Agents
Phase 3: Deploy Orchestrator
```

2. Phase 1.7 implementation:
   - Read TOOLS.md for browser automation tool entries marked as "verified"
   - Create MCP tool on Orq.ai with `server_url` pointing to script hosting endpoint
   - Record `tool_id` in the tool ID map
   - Skip tools still marked as "pending" (not yet verified by script-generator)

3. Add browser automation MCP tool entries to Phase 4 verification
4. Add browser automation tool IDs to Phase 5 annotation

**Effort estimate:** Medium -- new phase with create/verify/annotate logic

---

### 2.4 architect.md -- MEDIUM priority

**Change type:** New input consumption + output format addition (NO detection logic)

**Specific changes:**

1. Add `workflow_discovery_output` as a new input field:
   - Read structured discovery results from workflow-discovery
   - Use `integration_method` per system to annotate agents in the blueprint

2. Add `browser_automation` field to output format:

```markdown
### Diff sketch

BEFORE (output_format section):
#### 1. [agent-key]
- **Role:** [role description]
- **Tools needed:** [list of tool types]
- **Knowledge base:** [none | type]

AFTER:
#### 1. [agent-key]
- **Role:** [role description]
- **Tools needed:** [list of tool types]
- **Knowledge base:** [none | type]
- **Browser automation:** [none | required: {target_system_name}]
```

3. Modification to complexity gate:
   - Browser automation does NOT by itself justify an additional agent (MCP tool on existing agent)
   - BOTH API tools AND browser automation for different systems COULD justify separation (justification c)

**No `<browser_automation_detection>` section needed** -- all detection logic is in workflow-discovery. The architect simply consumes the discovery output and uses it for swarm design decisions.

**Effort estimate:** Small -- input consumption, output field addition, complexity gate note

---

### 2.5 tool-resolver.md -- MEDIUM priority

**Change type:** New catalog category + placeholder tool pattern + TOOLS.md section

**Specific changes:**

1. Add "Browser Automation" category to resolution priority chain:

```markdown
### Diff sketch

BEFORE (resolution priority chain):
1. Built-in tool
2. MCP server from curated catalog
3. MCP server found via web search
4. HTTP tool
5. Function tool
6. Code tool

AFTER:
1. Built-in tool
2. MCP server from curated catalog
3. MCP server found via web search
4. **Browser automation MCP tool** -- When architect flags browser_automation: required.
   Generate placeholder config with {{BROWSERLESS_*}} placeholders. Mark as "pending
   verification by workflow-builder + script-generator."
5. HTTP tool
6. Function tool
7. Code tool
```

2. Add entry to `references/tool-catalog.md`:

```markdown
### Browser Automation Tools

| Capability | Tool Type | Tool Key Pattern | Status |
|-----------|-----------|------------------|--------|
| Interact with [target-system] via Playwright | mcp | browser-automation-{system}-{action} | Generated by workflow-builder + script-generator |
```

3. Add "Browser Automation Tools (Pending)" section to TOOLS.md template

**Effort estimate:** Small -- catalog entry, placeholder pattern, TOOLS.md section

---

### 2.6 orchestration-generator.md -- MEDIUM priority

**Change type:** Additions to data flow, error handling, and HITL sections

**Specific changes:**

1. When any agent in the swarm has `browser_automation: required`:
   - Add "Browser Automation Stage" to the data flow diagram (both ASCII and Mermaid)
   - Add browser automation error handling rows to the error handling table
   - Add HITL decision points for workflow description confirmation and script test verification
   - Add Browserless.io setup to Setup Steps

**Effort estimate:** Small -- conditional additions to existing sections

---

### 2.7 dataset-generator.md -- MEDIUM priority

**Change type:** New test case category + adversarial patterns

**Specific changes:**

1. Add `browser-automation` category to clean dataset test case distribution
2. Add 3 browser-automation-specific adversarial test cases to the taxonomy:
   - Tool error response handling
   - Tool timeout handling
   - Unsupported action request handling
3. Modify eval pair generation to include tool invocation checks

**Effort estimate:** Small -- category addition, 3 test case templates

---

### 2.8 tester.md -- MEDIUM priority

**Change type:** Timeout adjustment + detection heuristic

**Specific changes:**

1. Increase polling timeout from 5 minutes to 10 minutes when agent has browser automation tools
2. Add browser automation detection to role inference (presence of Browserless.io MCP tool -> default hybrid role)
3. Add browser automation flag to terminal summary output

**Effort estimate:** Small -- 3 minor additions

---

### 2.9 readme-generator.md -- LOW priority

**Change type:** New conditional section

**Specific changes:**

1. Add conditional "Browser Automation Setup" section when any agent has browser automation
2. Include: Browserless.io account setup, credential configuration, MCP tool verification steps

**Effort estimate:** Small -- conditional section template

---

## 3. Implementation Order

### Phase A: Workflow Discovery Foundation

**What:** Build the conversational workflow discovery agent -- the new entry point for browser automation awareness in the pipeline.

| Agent | Action | Dependencies |
|-------|--------|-------------|
| workflow-discovery.md (NEW) | Create full instruction file | None -- this is the foundation |
| systems.json (NEW) | Create known systems config file | None -- optional lookup for workflow-discovery |
| architect.md | Add `workflow_discovery_output` input and `browser_automation` output field | workflow-discovery (needs output format defined) |

**Estimated effort:** 1 planning session + execution
**Output:** Pipeline can conversationally identify which systems need browser automation and feed structured output to the architect

**Why this is Phase A (not architect detection):** In the old model, Phase A was about embedding detection logic in the architect. In the revised model, Phase A creates the workflow-discovery agent -- this is the trigger for everything downstream. The architect changes are minimal (consume input, add output field) and can be done alongside.

---

### Phase B: Core Browser Automation Agents

**What:** Create the workflow-builder and script-generator -- the new pipeline stage agents

| Agent | Action | Dependencies |
|-------|--------|-------------|
| workflow-builder.md (NEW) | Create full instruction file | Phase A (needs workflow-discovery output format) |
| script-generator.md (NEW) | Create full instruction file | Phase A (needs architect output format with browser_automation field) |
| references/tool-catalog.md | Add browser automation tool category | None |

**Estimated effort:** 2 planning sessions + execution (each subagent ~600 lines)
**Output:** Full browser automation pipeline stage capability -- from workflow definition building (multiple input sources) through script generation and verification

---

### Phase C: Integration Changes (existing agents that wire to new agents)

**What:** Update existing agents to be browser-automation-aware

| Agent | Action | Dependencies |
|-------|--------|-------------|
| researcher.md | Add browser automation context section | Phase A (needs workflow-discovery output) |
| spec-generator.md | Add conditional sections and tool placeholders | Phase A (needs architect output format) |
| tool-resolver.md | Add placeholder pattern and TOOLS.md section | Phase A (needs architect output format) |
| deployer.md | Add Phase 1.7 for browser automation MCP tool deployment | Phase B (needs verified scripts from script-generator) |
| orchestration-generator.md | Add browser automation flow to data flow and HITL | Phase A |

**Estimated effort:** 1-2 planning sessions + execution
**Output:** Existing pipeline agents handle browser automation seamlessly

---

### Phase D: Testing and Documentation Agents

**What:** Update downstream agents for awareness

| Agent | Action | Dependencies |
|-------|--------|-------------|
| dataset-generator.md | Add browser-automation test cases | Phase C |
| tester.md | Adjust timeouts and detection | Phase C |
| readme-generator.md | Add browser automation setup section | Phase C |
| dataset-preparer.md | Minor augmentation awareness | Phase C |
| kb-generator.md | Optional workflow-derived KB generation | Phase C |
| iterator.md | Tool vs prompt failure distinction note | Phase C |

**Estimated effort:** 1 planning session + execution
**Output:** Complete end-to-end browser automation support in the pipeline

---

## 4. Pipeline Flow Diagram

```
                                    EXISTING PIPELINE
                                    =================

User Input --> discussion --> workflow-discovery* --> [USER confirms]
                                   |
                                   |  *NEW: conversational system
                                   |   + workflow identification
                                   v
                              architect** --> researcher* --> tool-resolver*
                                   |                              |
                                   |  **MEDIUM: consumes          |  *creates
                                   |   discovery output           |   placeholder tools
                                   v                              v
                              spec-generator* --> orchestration-generator*
                                   |                    |
                                   |  *adds             |  *shows browser
                                   |   <browser_auto>   |   automation flow
                                   |   sections         |
                                   v                    v
                         dataset-generator* --> readme-generator*
                                   |
                                   v
                         [V1.0 Output Complete]
                                   |
                    +--------------+--------------+
                    |                             |
              No browser auto              Browser auto needed
              needed                       for 1+ agents
                    |                             |
                    v                             v
                                     +---------------------------+
                                     | BROWSER AUTOMATION STAGE  |
                                     | (New Pipeline Checkpoint) |
                                     +---------------------------+
                                              |
                                     [USER] describes workflow conversationally
                                     (or uploads screenshots / provides SOP)
                                              |
                                              v
                                     workflow-builder (NEW)
                                     - Builds workflow definition from
                                       conversation, screenshots, or SOP
                                     - Produces workflow-definition.json
                                              |
                                     [USER] confirms/corrects AI understanding
                                              |
                                              v
                                     script-generator (NEW)
                                     - Generates Playwright scripts
                                     - Executes on Browserless.io
                                     - Iterates on failures (up to 5x)
                                     - Produces verified MCP tool config
                                              |
                                     [USER] watches Session Replay, confirms
                                              |
                                     +---------------------------+
                                     | END BROWSER AUTOMATION    |
                                     +---------------------------+
                    |                             |
                    +-----------------------------+
                                   |
                                   v
                         deployer* --> tester pipeline* --> iterator pipeline
                            |
                            |  *now also deploys browser automation MCP tools
                            v
                         hardener
```

Legend:
- `*` = modified existing agent
- `**` = existing agent with reduced scope (MEDIUM vs old HIGH)
- `(NEW)` = new subagent
- `[USER]` = HITL checkpoint requiring user action/confirmation

### Key Decision Points in the Flow

1. **System identification (NEW):** Workflow-discovery conversationally identifies systems and integration methods, presents findings to user for confirmation
2. **Architect consumption (REVISED):** Architect receives confirmed discovery output and designs swarm with full browser automation knowledge
3. **Workflow definition building (NEW):** User describes workflow conversationally (most common), or provides screenshots/SOP; workflow-builder constructs structured definition
4. **AI interpretation confirmation:** User reviews and corrects the AI's understanding of the workflow (HITL)
5. **Script test verification:** User watches Session Replay of test execution, confirms correct behavior (HITL)
6. **Pipeline continues normally:** After browser automation stage, deployer handles both standard tools and browser automation MCP tools

---

## 5. Contract Table: Data Flow Between Agents

| From | To | Data Contract | Format |
|------|-----|--------------|--------|
| discussion | workflow-discovery | Use case description with gray areas resolved | Markdown text |
| workflow-discovery | architect | Per-system discovery result (system name, integration method, workflows, confidence, user confirmation) | JSON array |
| architect | researcher | Blueprint with `browser_automation` field per agent | Blueprint markdown |
| architect | spec-generator | Blueprint with `browser_automation` field per agent | Blueprint markdown |
| architect | tool-resolver | Blueprint with `browser_automation` field per agent | Blueprint markdown |
| workflow-discovery | workflow-builder | System name, integration method, identified workflow names | JSON |
| researcher | workflow-builder | Browser automation context (UI framework, auth method, session needs) | Research brief markdown |
| workflow-builder | script-generator | `workflow-definition.json` with steps, UI elements, annotations | JSON file |
| script-generator | deployer | Verified MCP tool definition (key, type, description, script_path, status) | JSON file |
| script-generator | tool-resolver | Verified tool config replacing `{{PLACEHOLDER}}` entries | TOOLS.md update |

---

## 6. Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browserless.io availability during pipeline execution | Script generation/testing fails | Retry with backoff; allow user to resume pipeline from browser automation stage |
| Target system UI changes breaking scripts | Deployed MCP tools fail silently | Session Replay monitoring; periodic health checks; easy re-run of script-generator |
| AI vision misinterpreting screenshots | Incorrect workflow definition -> broken scripts | Mandatory user confirmation step; high-quality annotation presentation |
| Credential management complexity | Security risk if credentials leak; rotation breaks scripts | Credential vault with encryption; never log credentials; rotation reminders |
| Pipeline execution time increase | Browser automation stage adds 5-30 minutes per agent | Parallel script generation across agents; clear progress indicators |
| Conversational workflow extraction missing steps | Workflow-builder misses critical steps in user's description | Multi-step confirmation: builder presents its understanding, user corrects, builder refines |

### Assumption Risks

| Assumption | Risk if Wrong | Validation Needed |
|------------|---------------|-------------------|
| NXT/iController/Intelly UIs are stable enough for fixed scripts | Scripts break frequently, high maintenance cost | Test with real systems before full pipeline integration |
| **Users can describe workflows conversationally** | Workflow-builder gets incomplete/inaccurate input | Build robust clarifying question logic; allow screenshots as supplement |
| AI vision can reliably identify UI elements in screenshots | Low-quality screenshots or complex UIs cause failures | Test with real screenshots from target systems |
| Browserless.io pricing is acceptable for test iterations | Cost exceeds budget during script development | Estimate unit consumption per automation; monitor usage |
| Single MCP tool per agent is sufficient | Complex workflows may need multiple scripts/tools | Allow multiple browser automation tools per agent if needed |
| Workflow-discovery can identify unknown systems | Discovery fails for systems not in systems.json | Fall back to asking user directly: "Does [system] have an API?" |

**Removed assumption from old model:** "SOP documents are accurate and complete" -- no longer relevant because SOPs are optional input, not a requirement.

### Scope Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Feature creep into dynamic browser-use territory | Scope expands beyond fixed scripts | Hard scope boundary: only defined workflows; dynamic exploration stays with existing tools |
| Over-engineering workflow-discovery's conversational logic | Discovery agent becomes too complex | Start with systems.json lookup + simple heuristics; add conversational depth iteratively |
| Testing browser automation tools in CI/CD | No Browserless.io in CI environments | Mock Browserless.io responses for unit tests; real integration tests in staging only |

### Pre-Implementation Validation Checklist

Before implementing Phase A, validate:

- [ ] Access to Browserless.io API with a working token
- [ ] At least one target system (NXT, iController, or Intelly) available for testing
- [ ] A user willing to describe a workflow conversationally for that target system
- [ ] Optionally: screenshots of the target system's key screens
- [ ] Optionally: SOP document for that system (NOT required -- workflow-builder handles no-SOP cases)
- [ ] Credential vault design decided (encrypted storage vs environment variables vs separate secrets manager)
- [ ] MCP tool hosting approach decided (Vercel serverless function vs VPS vs Browserless.io /function endpoint)

**Removed from old checklist:** "SOP document for that system available (even a draft)" -- no longer a requirement. Workflow-builder works without SOPs.
