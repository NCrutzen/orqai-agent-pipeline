# Browser Automation Assessment: Pipeline Agents vs Browserless.io

**Date:** 2026-03-23
**Context:** V4.0 Browser Automation Builder (agent-workforce project) adds a pipeline stage where agents can interact with no-API systems (NXT, iController, Intelly) via Playwright scripts on Browserless.io. This assessment evaluates all 17 CLI pipeline agents in orqai-agent-pipeline for browser automation relevance.

**Key V4.0 decisions from agent-workforce:**
- Browser automation as inline pipeline stage during initial agent creation
- Browserless.io for cloud execution (no VPS management)
- AI vision for screenshot analysis
- MCP tool as automation output (verified Playwright script deployed as MCP tool)
- Fixed scripts over dynamic browser-use
- No-API detection at architect/discussion phase
- SOP + screenshot upload after spec generation, before deployment

---

## Executive Summary

Of the 17 pipeline agents, **5 are HIGH priority** (core logic must change), **4 are MEDIUM priority** (benefit from awareness but core logic intact), **3 are LOW priority** (minor awareness), and **5 require NO changes**. Additionally, **2-3 new subagents** are needed for the browser automation pipeline stage itself.

The integration surface is concentrated in the early pipeline (architect, researcher, spec-generator) where no-API system detection and browser automation awareness must be embedded, and in the late pipeline (tool-resolver, deployer) where MCP tool configuration and deployment of generated Playwright scripts must be handled.

The testing/iteration pipeline (tester, dataset-*, experiment-runner, results-analyzer, iterator, failure-diagnoser, prompt-editor, hardener) requires minimal changes because browser automation scripts are deployed as MCP tools -- once attached to an agent, the existing test infrastructure treats them like any other tool.

---

## Overzicht: Prioriteitstabel Alle 17 Agents

| # | Agent | Priority | Rationale Summary |
|---|-------|----------|-------------------|
| 1 | **architect** | **HIGH** | Must detect no-API systems and flag agents needing browser automation |
| 2 | **researcher** | **HIGH** | Must research target system UI patterns, SOP requirements, credential approaches |
| 3 | **spec-generator** | **HIGH** | Must generate browser-automation-aware specs with MCP tool placeholders |
| 4 | **tool-resolver** | **HIGH** | Must resolve Browserless.io MCP tools and browser automation tool configurations |
| 5 | **deployer** | **HIGH** | Must deploy Playwright-script MCP tools and attach to agents |
| 6 | **orchestration-generator** | MEDIUM | Must document browser automation data flow and pipeline branching |
| 7 | **dataset-generator** | MEDIUM | Should generate browser-automation-specific test cases |
| 8 | **tester** | MEDIUM | Must handle agents with browser automation tools (longer timeouts, different evaluation) |
| 9 | **readme-generator** | MEDIUM | Must document browser automation setup when applicable |
| 10 | **dataset-preparer** | LOW | Minor: augmentation should account for browser automation test scenarios |
| 11 | **kb-generator** | LOW | Minor: could generate SOP-derived KB content for browser automation agents |
| 12 | **iterator** | LOW | Minor: prompt iteration may need awareness of browser automation tool failures |
| 13 | **experiment-runner** | NONE | Runs experiments via Orq.ai API -- MCP tools are transparent |
| 14 | **results-analyzer** | NONE | Pure computation -- analyzes scores regardless of tool types |
| 15 | **failure-diagnoser** | NONE | Diagnoses prompt failures -- browser automation is a tool, not a prompt issue |
| 16 | **prompt-editor** | NONE | Applies prompt diffs -- tool configuration is out of scope |
| 17 | **hardener** | NONE | Attaches guardrails -- browser automation is orthogonal |

---

## Gedetailleerde Analyse: HIGH Priority Agents

### 1. architect.md -- Priority: HIGH

**Current role:** Analyzes use case descriptions and designs agent swarm topology. Determines agent count, roles, orchestration pattern, and agent-as-tool assignments. Defaults to single-agent design with complexity gate.

**Browser automation relevance:** The architect is the first agent to encounter a use case description. It must detect when a described use case involves systems without APIs (NXT, iController, Intelly, or other internal web applications). This detection is the trigger for the entire browser automation pipeline stage. Without architect awareness, the pipeline would design agents that assume API access to systems that only have web UIs.

**What changes are needed:**

1. **New `<browser_automation_detection>` section** in the architect's instructions:
   - Add heuristics for detecting no-API systems from use case descriptions
   - Keywords/patterns: mentions of specific internal systems (NXT, iController, Intelly), references to "logging into a portal", "clicking through a web interface", "manual data entry", "copy-paste between systems"
   - Application capabilities config lookup: check a `systems.json` or similar config that maps known system names to their integration method (API, browser automation, manual)

2. **New blueprint output field: `browser_automation_needed`**
   - Per-agent boolean flag in the blueprint output
   - When true, includes `target_system` name, `integration_method: "browser-automation"`, and `sop_required: true`
   - Downstream agents use this flag to activate browser automation awareness

3. **Modification to `<output_format>` section:**
   - Add `browser_automation` field to each agent definition:
     ```markdown
     - **Browser automation:** [none | required: {target_system}]
     ```

4. **Modification to `<decision_framework>` / complexity gate:**
   - Browser automation does NOT by itself justify an additional agent (the script runs as an MCP tool on the existing agent)
   - But if an agent needs BOTH API tools AND browser automation for different systems, that COULD justify separation (different tool sets -- justification c)

**Effort estimate:** Medium -- new section, output field addition, decision framework update

---

### 2. researcher.md -- Priority: HIGH

**Current role:** Investigates domain best practices per agent role and produces structured research briefs with model, prompt, tool, guardrail, and context recommendations.

**Browser automation relevance:** When an agent is flagged for browser automation, the researcher must investigate the target system's UI patterns, authentication methods, and common workflows. This domain research directly informs the quality of generated Playwright scripts later in the pipeline.

**What changes are needed:**

1. **New conditional section in per-agent research brief: `### Browser Automation Context`**
   - Only included when architect blueprint flags `browser_automation: required` for the agent
   - Contents:
     - Target system name and URL pattern
     - Authentication method (username/password form, SSO redirect, certificate)
     - Known UI framework (if discoverable -- React, Angular, legacy ASP.NET, etc.)
     - Typical workflow complexity (number of steps, form interactions, file uploads/downloads)
     - Session persistence needs (cookies, localStorage, server-side sessions)
     - Credential rotation frequency and management approach

2. **New web search queries for browser automation research:**
   - `"[system-name] automation"`, `"[system-name] playwright"`, `"[system-name] browser automation"`
   - `"[system-name] login flow"`, `"[system-name] API"` (to confirm no API exists)

3. **Addition to Tool Recommendations section:**
   - When browser automation is needed, recommend MCP tool type for the Browserless.io-backed Playwright script
   - Tool description: "Executes verified Playwright script on Browserless.io to interact with [target-system]"

4. **Addition to Guardrail Suggestions:**
   - Browser automation-specific guardrails: credential handling (never log credentials), session timeout handling, screenshot capture for audit trail

**Effort estimate:** Medium -- new conditional section, additional search patterns, tool/guardrail additions

---

### 3. spec-generator.md -- Priority: HIGH

**Current role:** Generates individual Orq.ai agent specifications from architect blueprint and research brief. Fills agent-spec template with all fields including production-ready system prompts.

**Browser automation relevance:** When generating a spec for an agent that needs browser automation, the spec must include: (1) the MCP tool configuration for the Playwright script, (2) instructions for how the agent should invoke the browser automation tool, (3) awareness that the tool interacts with a web UI (latency expectations, error patterns, retry needs).

**What changes are needed:**

1. **New conditional `<browser_automation>` section in generated Instructions:**
   - Only included when architect blueprint flags `browser_automation: required`
   - Content template:
     ```xml
     <browser_automation>
     You have access to browser automation tools that interact with [target-system] via
     verified Playwright scripts running on Browserless.io. When you need to perform
     actions in [target-system]:

     - Use the [mcp-tool-name] tool with the required parameters
     - Browser automation is slower than API calls -- expect 10-30 second execution times
     - If the tool returns an error, it may be a transient UI issue -- retry once before reporting failure
     - Never include credentials in your response -- the tool handles authentication internally
     - Session Replay recordings are available for verification -- reference them when confirming actions
     </browser_automation>
     ```

2. **Modification to Tools section generation:**
   - When browser automation is flagged, include a placeholder MCP tool entry:
     ```json
     {
       "type": "mcp",
       "tool_id": "{{BROWSER_AUTOMATION_TOOL_ID}}",
       "description": "Executes Playwright script to [action] in [target-system] via Browserless.io"
     }
     ```
   - The actual tool_id is filled during/after the browser automation builder pipeline stage

3. **Modification to Runtime Constraints:**
   - Browser automation agents need higher `max_execution_time` (300-600s vs 120-300s for standard agents)
   - Higher `max_iterations` to accommodate retry-after-browser-failure patterns

4. **Addition to `<constraints>` section generation:**
   - Add credential safety constraint: "Never expose, log, or include target system credentials in responses"
   - Add session awareness: "Browser automation actions may fail due to session timeouts -- indicate when re-authentication may be needed"

**Effort estimate:** Medium -- conditional section generation, tool placeholder, constraint additions

---

### 4. tool-resolver.md -- Priority: HIGH

**Current role:** Resolves tool needs for each agent in a swarm by consulting a curated catalog and web search, producing a TOOLS.md with verified, copy-paste-ready Orq.ai tool configurations.

**Browser automation relevance:** The tool resolver must recognize browser automation requirements and produce MCP tool configurations that point to the Browserless.io-backed script execution endpoint. This is a new category of tool that does not exist in the current curated catalog.

**What changes are needed:**

1. **New entry in resolution priority chain for browser automation tools:**
   - When architect blueprint flags `browser_automation: required`, the tool resolver should:
     - Recognize this as a "pending MCP tool" -- the Playwright script hasn't been generated yet
     - Generate a placeholder MCP tool config with `{{PLACEHOLDER}}` values
     - Document that the tool will be created by the browser automation builder stage

2. **Addition to curated tool catalog (references/tool-catalog.md):**
   - New category: "Browser Automation Tools"
   - Entry for Browserless.io MCP tool pattern:
     ```
     Type: mcp
     Pattern: browser-automation-{target-system}
     Server URL: {{BROWSERLESS_MCP_SERVER_URL}}
     Description: Executes Playwright script for [action] in [target-system]
     Note: Script generated and verified by browser automation builder
     ```

3. **New section in TOOLS.md output: "Browser Automation Tools (Pending)"**
   - Lists tools that will be created by the browser automation pipeline stage
   - Includes target system, expected capabilities, and placeholder configurations
   - Makes clear these are not yet deployable -- they require the browser automation builder to complete

4. **Modification to per-agent tool limit:**
   - Browser automation MCP tools count toward the 3-5 tool limit per agent
   - If an agent already has 5 tools and needs browser automation, recommend consolidating

**Effort estimate:** Medium -- new catalog category, placeholder pattern, TOOLS.md section

---

### 5. deployer.md -- Priority: HIGH

**Current role:** Deploys all tools, sub-agents, and orchestrator from a swarm output to Orq.ai in correct dependency order with idempotent create-or-update logic.

**Browser automation relevance:** After the browser automation builder generates and verifies a Playwright script, that script must be deployed as an MCP tool and attached to the target agent. The deployer must handle this new resource type.

**What changes are needed:**

1. **New Phase 1.7: Deploy Browser Automation MCP Tools**
   - After standard tool deployment (Phase 1) and KB provisioning (Phase 1.5)
   - For each browser automation tool in the manifest:
     - Create MCP tool entry on Orq.ai pointing to the script execution server
     - The tool's `server_url` points to the Vercel/VPS endpoint hosting the Playwright script
     - Record `tool_id` for agent wiring

2. **Modification to Step 0.3 (Read Swarm Directory):**
   - Parse browser automation tool definitions from TOOLS.md "Browser Automation Tools" section
   - Identify tools marked as "pending" vs "verified" (only deploy verified tools)

3. **Modification to Phase 2/3 (Deploy Agents):**
   - When wiring agent tools, include browser automation MCP tool_ids in `settings.tools`
   - Verify browser automation tools exist before deploying agents that reference them

4. **New verification in Phase 4 (Read-Back Verification):**
   - Verify browser automation MCP tools are correctly configured
   - Verify agent `settings.tools` includes the browser automation tool references

5. **Modification to Phase 5 (Annotate):**
   - Annotate browser automation tool IDs in TOOLS.md frontmatter alongside standard tool IDs

**Effort estimate:** Large -- new deployment phase, manifest changes, verification additions

---

## Gedetailleerde Analyse: MEDIUM Priority Agents

### 6. orchestration-generator.md -- Priority: MEDIUM

**Current role:** Generates ORCHESTRATION.md documents for multi-agent swarms. Produces agent-as-tool assignments, data flow diagrams, error handling tables, and HITL decision points.

**Browser automation relevance:** When a swarm includes agents with browser automation, the orchestration document must reflect the additional data flow and potential failure modes. The browser automation pipeline stage introduces a checkpoint between spec generation and deployment.

**What changes are needed:**

1. **Modification to Data Flow section:**
   - When browser automation is present, add a "Browser Automation Stage" node in the data flow diagram
   - Show the SOP + screenshot upload step and script generation flow
   - Indicate that this is a HITL checkpoint (user uploads SOP and confirms AI interpretation)

2. **Modification to Error Handling table:**
   - Add error handling rows for browser automation scenarios:
     - "Browser automation tool timeout" -- retry with fresh session, then escalate
     - "Target system authentication failure" -- credential rotation needed, HITL escalation
     - "UI element not found" -- script may need update, flag for browser automation builder re-run

3. **Addition to HITL Decision Points:**
   - "SOP + screenshot upload" -- user provides SOP document and system screenshots
   - "AI annotation confirmation" -- user verifies AI's interpretation of the workflow
   - "Script test verification" -- user watches Session Replay and confirms correct behavior

4. **Addition to Setup Steps:**
   - For agents with browser automation: "Configure Browserless.io credentials", "Verify MCP tool connectivity"

**Effort estimate:** Small -- additions to existing sections, no structural changes

---

### 7. dataset-generator.md -- Priority: MEDIUM

**Current role:** Generates per-agent test datasets with clean evaluation pairs and adversarial edge cases.

**Browser automation relevance:** Agents with browser automation tools need test cases that exercise the browser automation integration -- including scenarios where the tool succeeds, fails, times out, or returns unexpected results.

**What changes are needed:**

1. **New test case category: `browser-automation`**
   - Test cases where input triggers the agent to use its browser automation tool
   - Expected behavior should describe what the agent does WITH the tool result (not testing the script itself)

2. **Addition to adversarial test cases:**
   - "Browser automation tool returns error" -- agent should report the failure gracefully
   - "Browser automation tool times out" -- agent should explain the delay and suggest retry
   - "User asks agent to do something in target system that the script doesn't support" -- agent should explain limitations

3. **Modification to eval pair generation:**
   - For browser-automation test cases, expected output should demonstrate tool invocation patterns
   - Pass criteria should include "invokes [tool-name]" checks

**Effort estimate:** Small -- new test case category, additional adversarial patterns

---

### 8. tester.md -- Priority: MEDIUM

**Current role:** Orchestrates the full test pipeline from dataset transformation through results reporting.

**Browser automation relevance:** When testing agents that have browser automation tools, the tester must account for: (1) longer execution times (browser automation adds 10-30s per invocation), (2) the possibility that Browserless.io is unavailable during testing, (3) different evaluator expectations for browser automation responses.

**What changes are needed:**

1. **Modification to Phase 7 (Execute Experiments):**
   - When an agent has browser automation tools, increase polling timeout from 5 minutes to 10 minutes
   - Add "browser automation tool not available" as a known error pattern (Browserless.io might be down)

2. **Addition to role inference (Phase 6):**
   - Detect browser automation signals in agent specs (presence of Browserless.io MCP tool)
   - Browser automation agents default to `hybrid` role (they produce structured tool invocations AND conversational explanations)

3. **Addition to terminal summary:**
   - Flag agents with browser automation tools so testers know execution will be slower

**Effort estimate:** Small -- timeout adjustment, detection heuristic, summary flag

---

### 9. readme-generator.md -- Priority: MEDIUM

**Current role:** Generates per-swarm README files with plain-language overview and setup instructions.

**Browser automation relevance:** When a swarm includes agents with browser automation, the README must document: Browserless.io setup, credential configuration, SOP upload process, and how to verify browser automation tools are working.

**What changes are needed:**

1. **New conditional section: "Browser Automation Setup"**
   - Only included when any agent in the swarm has browser automation tools
   - Content:
     - Browserless.io account setup and API key configuration
     - Target system credential storage
     - How to re-run the browser automation builder if workflows change
     - Session Replay location for troubleshooting

2. **Addition to Setup Steps:**
   - For agents with browser automation: add step for verifying MCP tool connectivity
   - Add step for testing browser automation in isolation before full swarm testing

**Effort estimate:** Small -- conditional section, setup step additions

---

## Korte Notities: LOW Priority Agents

### 10. dataset-preparer.md -- Priority: LOW

Current role: Parses V1.0 markdown datasets, augments to 30+, splits stratified, uploads to Orq.ai. Minor impact: augmentation should be aware of browser-automation test case category when generating variations. No structural changes needed.

### 11. kb-generator.md -- Priority: LOW

Current role: Generates KB-ready documents from pipeline context or domain templates. Minor impact: could generate SOP-derived documents for browser automation agents' knowledge bases (e.g., "how to use NXT" FAQ derived from the SOP). No structural changes needed; this is a potential enhancement.

### 12. iterator.md -- Priority: LOW

Current role: Orchestrates analyze-propose-approve-retest cycle for prompt iteration. Minor impact: when iterating on agents with browser automation, the iterator should recognize that tool-related failures (browser automation script errors) are not prompt issues and should be flagged for the browser automation builder instead. No structural changes needed; add a note about tool-vs-prompt failure distinction.

---

## Korte Notities: NONE Priority Agents

### 13. experiment-runner.md -- Priority: NONE

Current role: Creates and runs experiments on Orq.ai via REST API, polls for completion, exports results. No changes needed. The experiment runner invokes agents via the Orq.ai API -- it is agnostic to what tools the agent uses internally. MCP tools (including browser automation) are transparent to the experiment execution layer.

### 14. results-analyzer.md -- Priority: NONE

Current role: Pure computation subagent. Reads experiment-raw.json, computes statistics, determines pass/fail. No changes needed. The analyzer processes numerical scores regardless of whether they came from browser automation interactions or standard API calls.

### 15. failure-diagnoser.md -- Priority: NONE

Current role: Maps evaluator failures to XML-tagged prompt sections, proposes diffs. No changes needed. The diagnoser works at the prompt instruction level. Browser automation is a tool-level concern, not a prompt concern. If an agent fails because of browser automation issues, the diagnoser correctly identifies it as out of scope (tool failure, not prompt failure).

### 16. prompt-editor.md -- Priority: NONE

Current role: Applies approved prompt changes to agent spec files, delegates re-deploy and re-test. No changes needed. The prompt editor modifies instruction sections within spec files. Browser automation tool configurations are separate from instructions and are handled by the deployer.

### 17. hardener.md -- Priority: NONE

Current role: Analyzes test results, suggests guardrails, attaches guardrails to agents via Orq.ai API. No changes needed. Guardrails operate at the input/output level of the agent. Browser automation tools are internal implementation details that don't affect the guardrail layer.

---

## Nieuwe Subagent Voorstellen

### Proposed New Subagent 1: `orq-browser-automation-detector`

**Purpose:** Analyze architect blueprint and detect which agents need browser automation. Cross-reference against a known systems registry and the use case description. Output a structured detection result consumed by the browser automation builder.

**Pipeline position:** After architect (consumes blueprint), before/alongside spec-generator.

**Input contract:**
- Architect blueprint with agent list and responsibilities
- Known systems registry (`systems.json` or similar config file)
- Use case description (original user input)

**Output contract:**
- Per-agent detection result: `{ agent_key, needs_browser_automation: boolean, target_system, confidence, evidence }`
- List of SOP requirements: which systems need SOP + screenshot upload

**Tools needed:** Read, Grep (to check config files)

**Estimated size:** Small (~200 lines) -- focused detection logic

**Alternative approach:** This detection could be embedded in the architect agent itself (as a new section) rather than a separate subagent. Given the simplicity of the detection logic, **embedding in architect is recommended** over a separate subagent. A separate subagent is only justified if detection becomes complex (e.g., multi-system analysis, web scraping target systems to confirm no API exists).

---

### Proposed New Subagent 2: `orq-sop-analyzer`

**Purpose:** Parse SOP documents (Word, PDF) and correlate SOP steps with uploaded screenshots using AI vision. Produce a structured workflow definition that the script generator can consume.

**Pipeline position:** After spec-generation, after user uploads SOP + screenshots. This is a new pipeline stage inserted between spec-generation and deployment.

**Input contract:**
- SOP document (PDF or Word, uploaded by user)
- Screenshots of target system UI (PNG/JPEG, uploaded by user)
- Detection result from architect (target system name, authentication method)

**Output contract:**
- Structured workflow definition:
  ```json
  {
    "target_system": "NXT",
    "auth_method": "username-password",
    "steps": [
      {
        "step_number": 1,
        "action": "Navigate to login page",
        "ui_elements": ["username field", "password field", "login button"],
        "screenshot_ref": "screenshot-01.png",
        "annotations": [{ "element": "username field", "coordinates": [x, y, w, h] }]
      }
    ]
  }
  ```

**Tools needed:** Read, Write, Vision API (via Orq.ai), WebFetch (for Browserless.io screenshot capture)

**Estimated size:** Large (~600+ lines) -- complex vision analysis, SOP parsing, multi-step confirmation flow with user

---

### Proposed New Subagent 3: `orq-script-generator`

**Purpose:** Generate Playwright scripts from structured workflow definitions, execute them on Browserless.io for testing, iterate on failures using DOM accessibility tree analysis, and produce verified scripts ready for MCP tool deployment.

**Pipeline position:** After SOP analyzer. Consumes workflow definition, produces verified Playwright script.

**Input contract:**
- Structured workflow definition (from SOP analyzer)
- Browserless.io API credentials
- Target system credentials (from credential vault)

**Output contract:**
- Verified Playwright script (JavaScript/TypeScript file)
- Test results: success/failure, Session Replay URL, execution time
- MCP tool definition: ready for deployment
  ```json
  {
    "key": "browser-automation-nxt-create-invoice",
    "type": "mcp",
    "description": "Creates an invoice in NXT by filling the invoice form and submitting",
    "script_path": "scripts/nxt-create-invoice.js",
    "status": "verified",
    "test_runs": 3,
    "avg_execution_time": "15s"
  }
  ```

**Tools needed:** Read, Write, Bash (for script execution), WebFetch (for Browserless.io API calls)

**Estimated size:** Large (~600+ lines) -- script generation, iterative testing, DOM analysis, MCP tool configuration

---

## Pipeline-Integratie Analyse

### Current Pipeline Flow (V2.1)

```
User Input
  -> discussion (surfaces gray areas)
    -> architect (designs swarm topology)
      -> researcher (domain research per agent)
        -> tool-resolver (identifies tools)
        -> spec-generator (generates agent specs)
          -> orchestration-generator (documents agent wiring)
          -> dataset-generator (generates test data)
            -> readme-generator (generates documentation)
              -> [V1.0 output complete]
                -> deployer (deploys to Orq.ai)
                  -> tester/dataset-preparer/experiment-runner/results-analyzer (tests agents)
                    -> iterator/failure-diagnoser/prompt-editor (iterates on failures)
                      -> hardener (attaches guardrails)
```

### Enhanced Pipeline Flow with Browser Automation

```
User Input
  -> discussion (surfaces gray areas + no-API system questions)
    -> architect (designs swarm topology + detects browser automation needs)
      -> researcher (domain research + browser automation context)
        -> tool-resolver (resolves tools + browser automation placeholders)
        -> spec-generator (generates specs + browser automation sections)
          -> orchestration-generator (documents flow + browser automation stage)
          -> dataset-generator (generates data + browser automation test cases)
            -> readme-generator (documents setup + browser automation instructions)
              -> [V1.0 output complete]

                *** BROWSER AUTOMATION CHECKPOINT (if any agent needs it) ***
                -> [USER] uploads SOP document + screenshots
                -> sop-analyzer (NEW) (parses SOP, analyzes screenshots with AI vision)
                -> [USER] confirms/corrects AI interpretation
                -> script-generator (NEW) (generates Playwright scripts)
                -> script-generator (executes on Browserless.io, iterates)
                -> [USER] watches Session Replay, confirms behavior
                -> script-generator (outputs verified MCP tool definition)
                *** END BROWSER AUTOMATION STAGE ***

                -> deployer (deploys agents + browser automation MCP tools)
                  -> tester pipeline (tests agents including browser automation interactions)
                    -> iterator pipeline (iterates, distinguishing tool vs prompt failures)
                      -> hardener (attaches guardrails)
```

### Key Integration Points

1. **Detection trigger:** Architect blueprint includes `browser_automation: required` flag per agent
2. **Research enrichment:** Researcher adds browser automation context to research briefs
3. **Spec preparation:** Spec generator includes MCP tool placeholders and instruction sections
4. **Pipeline branching:** After V1.0 output, if any agent needs browser automation, the pipeline branches to the browser automation checkpoint before deployment
5. **Tool resolution:** Tool resolver creates placeholder entries in TOOLS.md for browser automation tools
6. **Deployment integration:** Deployer handles browser automation MCP tools alongside standard tools
7. **Testing awareness:** Tester adjusts timeouts and evaluation for browser automation agents

### Contract Between Existing and New Agents

| Existing Agent | New Agent | Contract |
|----------------|-----------|----------|
| architect | sop-analyzer | Architect provides `target_system` name and `auth_method` hint |
| researcher | sop-analyzer | Researcher provides UI framework hints and credential approach |
| spec-generator | script-generator | Spec generator provides MCP tool placeholder ID that script generator fills |
| tool-resolver | script-generator | Tool resolver provides placeholder tool config; script generator provides verified config |
| deployer | script-generator | Script generator provides verified MCP tool definition; deployer deploys it |
| tester | script-generator | Tester tests the agent with the browser automation tool attached |

---

## Samenvatting en Aanbevelingen

1. **The integration is surgical, not pervasive.** Most of the 17 agents are unaffected because browser automation scripts deploy as MCP tools -- the standard Orq.ai tool interface. The existing test/iterate/harden pipeline works unchanged.

2. **Focus investment on 5 HIGH-priority agents.** The architect, researcher, spec-generator, tool-resolver, and deployer need the most attention. These form the "awareness backbone" that detects browser automation needs and prepares the infrastructure.

3. **2 new subagents are essential.** The SOP analyzer and script generator are new capabilities that don't map to any existing agent. They represent a new pipeline stage, not modifications to existing stages.

4. **The browser automation detector should be embedded in the architect,** not a separate subagent. The detection logic is simple enough to be an additional section in the architect's instructions.

5. **The pipeline branching point is natural.** The browser automation stage slots between V1.0 output generation and deployment. This preserves the existing pipeline flow and adds a conditional branch only when needed.

6. **Consider a `systems.json` config file** in the pipeline that maps known system names to their integration method (API, browser automation, manual). This gives the architect a lookup table instead of relying solely on heuristic detection from the use case description.
