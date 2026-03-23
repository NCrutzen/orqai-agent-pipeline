# Action Plan: Browser Automation Integration into Pipeline Agents

**Date:** 2026-03-23
**Based on:** BROWSER-AUTOMATION-ASSESSMENT.md
**Scope:** Changes to orqai-agent-pipeline agents to support V4.0 Browser Automation Builder

---

## 1. New Pipeline Subagents

### 1.1 orq-sop-analyzer

- **Name and key:** `orq-sop-analyzer`
- **Purpose:** Parses uploaded SOP documents (Word/PDF) and correlates each step with uploaded screenshots of the target system using AI vision. Produces a structured workflow definition with annotated UI elements.
- **Input contract:** SOP document file path, screenshot file paths, target system name and auth method (from architect blueprint `browser_automation` field), researcher browser automation context
- **Output contract:** `workflow-definition.json` -- structured array of steps, each with action description, UI elements, screenshot references, coordinate annotations. Consumed by script-generator.
- **Pipeline position:** After spec-generator output, after user uploads SOP + screenshots (HITL checkpoint). Before script-generator.
- **Tools needed:** Read, Write, Vision API (via Orq.ai agent or direct API call with screenshot base64), Bash (file handling)
- **Estimated instruction file size:** Large (~600 lines) -- complex vision analysis, multi-step user confirmation flow, SOP parsing heuristics

### 1.2 orq-script-generator

- **Name and key:** `orq-script-generator`
- **Purpose:** Generates Playwright scripts from structured workflow definitions, executes them on Browserless.io for testing, iterates on failures using DOM accessibility tree context, and produces verified scripts ready for MCP tool deployment.
- **Input contract:** `workflow-definition.json` (from sop-analyzer), Browserless.io API token, target system credentials (from credential vault or user input), credential injection method
- **Output contract:** Verified Playwright script file (`scripts/{target-system}-{action}.js`), MCP tool definition JSON (key, type, description, server_url), test evidence (Session Replay URLs, execution times, pass/fail per iteration). Consumed by deployer.
- **Pipeline position:** After sop-analyzer. Before deployer.
- **Tools needed:** Read, Write, Bash (for running Playwright via Browserless.io WebSocket or REST), WebFetch (for Browserless.io API calls -- `/function`, `/screenshot`, `/content`)
- **Estimated instruction file size:** Large (~600+ lines) -- Playwright code generation patterns, iterative test-fix loop with DOM analysis, MCP tool configuration output, credential injection patterns

---

## 2. Existing Agent Modifications

### 2.1 architect.md -- HIGH priority

**Change type:** New instruction section + output format addition

**Specific changes:**

1. Add `<browser_automation_detection>` section to instructions:

```markdown
### Diff sketch

BEFORE (output_format section):
```
#### 1. [agent-key]
- **Role:** [role description]
- **Tools needed:** [list of tool types]
- **Knowledge base:** [none | type]
```

AFTER:
```
#### 1. [agent-key]
- **Role:** [role description]
- **Tools needed:** [list of tool types]
- **Knowledge base:** [none | type]
- **Browser automation:** [none | required: {target_system_name}]
- **Target system auth:** [N/A | username-password | sso | certificate]
```
```

2. Add new `<browser_automation_detection>` section after `<complexity_gate>`:

```xml
<browser_automation_detection>
When the use case mentions interacting with a system, determine the integration method:

1. Check systems.json (if available) for known system entries
2. If the system has a known API: set browser_automation to "none"
3. If the system has no API (NXT, iController, Intelly, or unrecognized internal web apps):
   set browser_automation to "required: {system-name}"
4. Detection signals: "log into", "click", "fill form", "navigate to", "web portal",
   "manual entry", "copy-paste between systems", mentions of specific internal systems

Browser automation does NOT justify adding an extra agent -- the Playwright script
runs as an MCP tool on the existing agent. Only add a separate agent if the
browser automation requires a fundamentally different model or tool set (complexity
gate justification c).
</browser_automation_detection>
```

**Effort estimate:** Small -- two additions to existing sections

---

### 2.2 researcher.md -- HIGH priority

**Change type:** New conditional section in research brief output

**Specific changes:**

1. Add conditional `### Browser Automation Context` section to per-agent research brief format (only when `browser_automation: required`):

```markdown
### Diff sketch

BEFORE (per-agent brief ends with):
### Knowledge Base Design: [name]
(or no KB section if Knowledge base is none)

AFTER (new section appended when browser_automation is required):
### Browser Automation Context
**Target system:** [system name from architect blueprint]
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
```

**Effort estimate:** Small -- conditional section, additional search patterns

---

### 2.3 spec-generator.md -- HIGH priority

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

2. Add template for generated `<browser_automation>` section content (see ASSESSMENT.md for full template)

3. Add MCP tool placeholder to Tools section generation logic:

```markdown
When architect blueprint flags browser_automation: required for this agent:
- Add placeholder MCP tool entry:
  { "type": "mcp", "tool_id": "{{BROWSER_AUTOMATION_TOOL_ID}}", "description": "..." }
- Add note: "Tool ID will be populated after browser automation builder completes"
```

4. Increase Runtime Constraints defaults for browser automation agents:
   - `max_execution_time`: 600 seconds (vs 300 standard)
   - `max_iterations`: 15 (vs 10 standard)

**Effort estimate:** Medium -- conditional section template, tool placeholder logic, constraint adjustments

---

### 2.4 tool-resolver.md -- HIGH priority

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
   verification by browser automation builder."
5. HTTP tool
6. Function tool
7. Code tool
```

2. Add entry to `references/tool-catalog.md`:

```markdown
### Browser Automation Tools

| Capability | Tool Type | Tool Key Pattern | Status |
|-----------|-----------|------------------|--------|
| Interact with [target-system] via Playwright | mcp | browser-automation-{system}-{action} | Generated by browser automation builder |
```

3. Add "Browser Automation Tools (Pending)" section to TOOLS.md template

**Effort estimate:** Small -- catalog entry, placeholder pattern, TOOLS.md section

---

### 2.5 deployer.md -- HIGH priority

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
   - Skip tools still marked as "pending" (not yet verified by browser automation builder)

3. Add browser automation MCP tool entries to Phase 4 verification
4. Add browser automation tool IDs to Phase 5 annotation

**Effort estimate:** Medium -- new phase with create/verify/annotate logic

---

### 2.6 orchestration-generator.md -- MEDIUM priority

**Change type:** Additions to data flow, error handling, and HITL sections

**Specific changes:**

1. When any agent in the swarm has `browser_automation: required`:
   - Add "Browser Automation Stage" to the data flow diagram (both ASCII and Mermaid)
   - Add browser automation error handling rows to the error handling table
   - Add 3 HITL decision points (SOP upload, AI confirmation, script test verification)
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

### 2.9 readme-generator.md -- MEDIUM priority

**Change type:** New conditional section

**Specific changes:**

1. Add conditional "Browser Automation Setup" section when any agent has browser automation
2. Include: Browserless.io account setup, credential configuration, MCP tool verification steps

**Effort estimate:** Small -- conditional section template

---

## 3. Implementation Order

### Phase A: Foundation Changes (agents that other changes depend on)

**What:** Establish the detection mechanism and data model

| Agent | Action | Dependencies |
|-------|--------|-------------|
| architect.md | Add `browser_automation_detection` section and output field | None -- this is the trigger |
| references/tool-catalog.md | Add browser automation tool category | None |
| systems.json (NEW) | Create known systems config file | None |

**Estimated effort:** 1 planning session + execution
**Output:** Architect can detect no-API systems and flag agents for browser automation

---

### Phase B: Core Browser Automation Agents (new subagents)

**What:** Create the new pipeline stage subagents

| Agent | Action | Dependencies |
|-------|--------|-------------|
| sop-analyzer.md (NEW) | Create full instruction file | Phase A (needs architect output format) |
| script-generator.md (NEW) | Create full instruction file | Phase A (needs architect output format) |

**Estimated effort:** 2 planning sessions + execution (each subagent ~600 lines)
**Output:** Full browser automation pipeline stage capability

---

### Phase C: Integration Changes (existing agents that wire to new agents)

**What:** Update existing agents to be browser-automation-aware

| Agent | Action | Dependencies |
|-------|--------|-------------|
| researcher.md | Add browser automation context section | Phase A |
| spec-generator.md | Add conditional sections and tool placeholders | Phase A |
| tool-resolver.md | Add placeholder pattern and TOOLS.md section | Phase A |
| deployer.md | Add Phase 1.7 for browser automation MCP tool deployment | Phase B (needs verified scripts) |
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
| kb-generator.md | Optional SOP-derived KB generation | Phase C |
| iterator.md | Tool vs prompt failure distinction note | Phase C |

**Estimated effort:** 1 planning session + execution
**Output:** Complete end-to-end browser automation support in the pipeline

---

## 4. Pipeline Flow Diagram

```
                                    EXISTING PIPELINE
                                    =================

User Input ──> discussion ──> architect* ──> researcher* ──> tool-resolver*
                                   |                              |
                                   |  *now detects no-API         |  *now creates
                                   |   systems                    |   placeholder tools
                                   v                              v
                              spec-generator* ──> orchestration-generator*
                                   |                    |
                                   |  *now adds         |  *now shows browser
                                   |   <browser_auto>   |   automation flow
                                   |   sections         |
                                   v                    v
                         dataset-generator* ──> readme-generator*
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
                                     [USER] uploads SOP + screenshots
                                              |
                                              v
                                     sop-analyzer (NEW)
                                     - Parses SOP document
                                     - Analyzes screenshots via AI vision
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
                         deployer* ──> tester pipeline* ──> iterator pipeline
                            |
                            |  *now also deploys browser automation MCP tools
                            v
                         hardener
```

Legend:
- `*` = modified agent
- `(NEW)` = new subagent
- `[USER]` = HITL checkpoint requiring user action

### Key Decision Points in the Flow

1. **No-API detection checkpoint:** Architect examines use case and systems.json, flags agents needing browser automation
2. **SOP upload checkpoint:** User provides SOP document and target system screenshots (HITL)
3. **AI interpretation confirmation:** User reviews and corrects the AI's understanding of the workflow (HITL)
4. **Script test verification:** User watches Session Replay of test execution, confirms correct behavior (HITL)
5. **Pipeline continues normally:** After browser automation stage, deployer handles both standard tools and browser automation MCP tools

---

## 5. Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browserless.io availability during pipeline execution | Script generation/testing fails | Retry with backoff; allow user to resume pipeline from browser automation stage |
| Target system UI changes breaking scripts | Deployed MCP tools fail silently | Session Replay monitoring; periodic health checks; easy re-run of script generator |
| AI vision misinterpreting screenshots | Incorrect workflow definition -> broken scripts | Mandatory user confirmation step; high-quality annotation presentation |
| Credential management complexity | Security risk if credentials leak; rotation breaks scripts | Credential vault with encryption; never log credentials; rotation reminders |
| Pipeline execution time increase | Browser automation stage adds 5-30 minutes per agent | Parallel script generation across agents; clear progress indicators |

### Assumption Risks

| Assumption | Risk if Wrong | Validation Needed |
|------------|---------------|-------------------|
| NXT/iController/Intelly UIs are stable enough for fixed scripts | Scripts break frequently, high maintenance cost | Test with real systems before full pipeline integration |
| SOP documents are accurate and complete | Generated scripts miss steps or include wrong actions | User confirmation step mitigates, but SOP quality varies |
| AI vision can reliably identify UI elements in screenshots | Low-quality screenshots or complex UIs cause failures | Test with real screenshots from target systems |
| Browserless.io pricing is acceptable for test iterations | Cost exceeds budget during script development | Estimate unit consumption per automation; monitor usage |
| Single MCP tool per agent is sufficient | Complex workflows may need multiple scripts/tools | Allow multiple browser automation tools per agent if needed |

### Scope Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Feature creep into dynamic browser-use territory | Scope expands beyond fixed scripts; conflicts with existing Orq.ai MCP tools | Hard scope boundary: only SOP-defined fixed workflows; dynamic exploration stays with existing tools |
| Over-engineering the detection mechanism | Architect changes become complex; delays Phase A | Start with simple keyword matching + systems.json; iterate later |
| Testing browser automation tools in CI/CD | No Browserless.io in CI environments | Mock Browserless.io responses for unit tests; real integration tests in staging only |

### Pre-Implementation Validation Checklist

Before implementing Phase A, validate:

- [ ] Access to Browserless.io API with a working token
- [ ] At least one target system (NXT, iController, or Intelly) available for testing
- [ ] SOP document for that system available (even a draft)
- [ ] Screenshots of the target system's key screens available
- [ ] Credential vault design decided (Supabase encrypted storage vs environment variables vs separate secrets manager)
- [ ] MCP tool hosting approach decided (Vercel serverless function vs VPS vs Browserless.io /function endpoint)
