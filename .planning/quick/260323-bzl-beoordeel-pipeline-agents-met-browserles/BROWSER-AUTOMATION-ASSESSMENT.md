# Browser Automation Assessment: Pipeline Agents vs Browserless.io (v2 -- Revised Model)

**Date:** 2026-03-23 (revised)
**Supersedes:** Original assessment from 2026-03-23 (SOP-dependent model)
**Context:** V4.0 Browser Automation Builder (agent-workforce project) adds a pipeline stage where agents can interact with no-API systems (NXT, iController, Intelly) via Playwright scripts on Browserless.io. This revised assessment introduces a workflow-discovery + workflow-builder model that replaces the earlier SOP-dependent model.

**Key V4.0 decisions from agent-workforce:**
- Browser automation as inline pipeline stage during initial agent creation
- Browserless.io for cloud execution (no VPS management)
- AI vision for screenshot analysis
- MCP tool as automation output (verified Playwright script deployed as MCP tool)
- Fixed scripts over dynamic browser-use
- Session Replay for verification

**Why this revision exists:**

The original assessment made two flawed assumptions:

1. **SOPs always exist.** They don't. Most business processes live in people's heads. A user describing a "Klanten Service agent" that needs NXT access won't have a formal SOP document. The previous model assumed SOP documents would always be available as input -- that assumption is wrong for most use cases.

2. **No-API detection belongs in the architect.** It shouldn't. Detection of which systems need browser automation is inherently a conversational discovery process: the user describes what their agent needs to do, and the pipeline reasons about integration methods. This belongs in a dedicated early-pipeline agent (workflow-discovery), not embedded in the architect's already-complex swarm design logic.

This revision introduces:
- **workflow-discovery** (NEW, HIGH priority): sits after discussion, before architect. Conversationally identifies systems and integration methods.
- **workflow-builder** (replaces the previous SOP-dependent agent): works from multiple input sources (conversation, screenshots, optional SOP), not just SOPs.
- **architect demoted to MEDIUM**: receives workflow-discovery output instead of detecting no-API systems itself.

---

## Executive Summary

Of the 17 pipeline agents, **3 are HIGH priority** (core logic must change), **5 are MEDIUM priority** (benefit from awareness but core logic intact), **4 are LOW priority** (minor awareness), and **5 require NO changes**. Additionally, **3 new subagents** are needed: workflow-discovery (early pipeline), workflow-builder (mid pipeline), and script-generator (mid pipeline).

The key insight driving this revised model is that **workflow identification is a conversational process, not a detection algorithm**. Users describe what they want their agent to do. The pipeline must reason about which systems are involved and how to integrate them -- and this reasoning happens best through structured conversation, early in the pipeline, before the architect designs the swarm.

The integration surface is concentrated in:
- **Early pipeline (workflow-discovery):** Conversational identification of systems and integration methods, feeding structured output to the architect
- **Mid pipeline (workflow-builder + script-generator):** Building workflow definitions from multiple input sources and generating verified Playwright scripts
- **Late pipeline (deployer):** Deploying generated MCP tools alongside standard tools

The testing/iteration pipeline (tester, dataset-*, experiment-runner, results-analyzer, iterator, failure-diagnoser, prompt-editor, hardener) requires minimal changes because browser automation scripts are deployed as MCP tools -- once attached to an agent, the existing test infrastructure treats them like any other tool.

---

## Overzicht: Prioriteitstabel Alle 17 Agents

| # | Agent | Priority | Rationale Summary |
|---|-------|----------|-------------------|
| 1 | **researcher** | **HIGH** | Must research target system UI patterns, authentication methods, and workflow complexity for workflow-builder |
| 2 | **spec-generator** | **HIGH** | Must generate browser-automation-aware specs with MCP tool placeholders and instruction sections |
| 3 | **deployer** | **HIGH** | Must deploy Playwright-script MCP tools and attach to agents |
| 4 | **architect** | MEDIUM | Receives workflow-discovery output; uses it to design swarm topology with browser automation awareness |
| 5 | **tool-resolver** | MEDIUM | Must resolve Browserless.io MCP tools and browser automation tool configurations |
| 6 | **orchestration-generator** | MEDIUM | Must document browser automation data flow and pipeline branching |
| 7 | **dataset-generator** | MEDIUM | Should generate browser-automation-specific test cases |
| 8 | **tester** | MEDIUM | Must handle agents with browser automation tools (longer timeouts, different evaluation) |
| 9 | **readme-generator** | LOW | Must document browser automation setup when applicable |
| 10 | **dataset-preparer** | LOW | Minor: augmentation should account for browser automation test scenarios |
| 11 | **kb-generator** | LOW | Minor: could generate workflow-derived KB content for browser automation agents |
| 12 | **iterator** | LOW | Minor: prompt iteration may need awareness of browser automation tool failures |
| 13 | **experiment-runner** | NONE | Runs experiments via Orq.ai API -- MCP tools are transparent |
| 14 | **results-analyzer** | NONE | Pure computation -- analyzes scores regardless of tool types |
| 15 | **failure-diagnoser** | NONE | Diagnoses prompt failures -- browser automation is a tool, not a prompt issue |
| 16 | **prompt-editor** | NONE | Applies prompt diffs -- tool configuration is out of scope |
| 17 | **hardener** | NONE | Attaches guardrails -- browser automation is orthogonal |

**Key changes from original assessment:**
- architect dropped from HIGH to MEDIUM (detection responsibility moved to workflow-discovery)
- tool-resolver dropped from HIGH to MEDIUM (receives discovery output, simpler role)
- researcher remains HIGH (now researches for workflow-builder input, not architect detection)

---

## Gedetailleerde Analyse: HIGH Priority Agents

### 1. researcher.md -- Priority: HIGH

**Current role:** Investigates domain best practices per agent role and produces structured research briefs with model, prompt, tool, guardrail, and context recommendations. Uses web search to find domain-specific patterns.

**Browser automation relevance:** When workflow-discovery has identified a system needing browser automation, the researcher must investigate the target system's UI patterns, authentication methods, session management, and common workflow structures. This research directly informs the workflow-builder later in the pipeline -- the builder needs to know what it's working with before it can construct workflow definitions from user conversation or screenshots.

**What changes are needed:**

1. **New conditional section in per-agent research brief: `### Browser Automation Context`**
   - Only included when workflow-discovery output flags `integration_method: "browser-automation"` for a system this agent interacts with
   - Contents:
     - Target system name and URL pattern
     - Authentication method (username/password form, SSO redirect, certificate)
     - Known UI framework (if discoverable -- React, Angular, legacy ASP.NET, etc.)
     - Typical workflow complexity (number of steps, form interactions, file uploads/downloads)
     - Session persistence needs (cookies, localStorage, server-side sessions)
     - Credential rotation frequency and management approach
     - Known automation challenges (CAPTCHAs, anti-bot detection, dynamic element IDs)

2. **New web search queries for browser automation research:**
   - `"[system-name] automation"`, `"[system-name] playwright"`, `"[system-name] browser automation"`
   - `"[system-name] login flow"`, `"[system-name] API"` (to confirm no API exists)
   - `"[system-name] UI framework"` (to identify front-end technology)

3. **Addition to Tool Recommendations section:**
   - When browser automation is needed, recommend MCP tool type for the Browserless.io-backed Playwright script
   - Tool description: "Executes verified Playwright script on Browserless.io to interact with [target-system]"

4. **Addition to Guardrail Suggestions:**
   - Browser automation-specific guardrails: credential handling (never log credentials), session timeout handling, screenshot capture for audit trail

**Effort estimate:** Medium -- new conditional section, additional search patterns, tool/guardrail additions

---

### 2. spec-generator.md -- Priority: HIGH

**Current role:** Generates individual Orq.ai agent specifications from architect blueprint and research brief. Fills agent-spec template with all fields including production-ready system prompts, tool schemas, and self-validates completeness.

**Browser automation relevance:** When generating a spec for an agent that needs browser automation (identified by workflow-discovery, designed into the swarm by the architect), the spec must include: (1) the MCP tool configuration for the Playwright script, (2) instructions for how the agent should invoke the browser automation tool, (3) awareness that the tool interacts with a web UI (latency expectations, error patterns, retry needs).

**What changes are needed:**

1. **New conditional `<browser_automation>` section in generated Instructions:**
   - Only included when the architect blueprint (informed by workflow-discovery) flags `browser_automation: required`
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
   - The actual tool_id is filled during/after the workflow-builder + script-generator pipeline stage

3. **Modification to Runtime Constraints:**
   - Browser automation agents need higher `max_execution_time` (300-600s vs 120-300s for standard agents)
   - Higher `max_iterations` to accommodate retry-after-browser-failure patterns

4. **Addition to `<constraints>` section generation:**
   - Add credential safety constraint: "Never expose, log, or include target system credentials in responses"
   - Add session awareness: "Browser automation actions may fail due to session timeouts -- indicate when re-authentication may be needed"

**Effort estimate:** Medium -- conditional section generation, tool placeholder, constraint additions

---

### 3. deployer.md -- Priority: HIGH

**Current role:** Deploys all tools, sub-agents, and orchestrator from a swarm output to Orq.ai in correct dependency order with idempotent create-or-update logic, MCP-first/REST-fallback per operation, read-back verification, and YAML frontmatter annotation.

**Browser automation relevance:** After the workflow-builder and script-generator produce verified Playwright scripts, those scripts must be deployed as MCP tools and attached to the target agents. The deployer must handle this new resource type.

**What changes are needed:**

1. **New Phase 1.7: Deploy Browser Automation MCP Tools**
   - After standard tool deployment (Phase 1) and KB provisioning (Phase 1.5)
   - For each browser automation tool in the manifest:
     - Create MCP tool entry on Orq.ai pointing to the script execution server
     - The tool's `server_url` points to the endpoint hosting the Playwright script
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

### 4. architect.md -- Priority: MEDIUM

**Current role:** Analyzes use case descriptions and designs agent swarm topology. Determines agent count, roles, orchestration pattern, and agent-as-tool assignments. Defaults to single-agent design with complexity gate.

**Browser automation relevance (revised):** In the new model, the architect **no longer detects** no-API systems itself. That responsibility has moved to workflow-discovery, which sits before the architect in the pipeline. The architect now **receives** workflow-discovery output as input and uses it to make informed swarm design decisions.

**What this means in practice:**
- The architect knows which systems need browser automation before it starts designing
- The architect can factor browser automation into its complexity gate (does an agent needing both API tools and browser automation justify separation?)
- The architect adds `browser_automation` metadata to its blueprint output for downstream agents

**What changes are needed:**

1. **New input field: `workflow_discovery_output`**
   - Structured object per system: `{ system_name, integration_method, workflows_identified, confidence, user_confirmed }`
   - The architect reads this to understand which systems need browser automation

2. **New blueprint output field: `browser_automation`**
   - Per-agent field: `browser_automation: [none | required: {target_system_name}]`
   - Based on workflow-discovery output, not the architect's own detection logic

3. **Modification to `<decision_framework>` / complexity gate:**
   - Browser automation does NOT by itself justify an additional agent (the script runs as an MCP tool on the existing agent)
   - But if an agent needs BOTH API tools AND browser automation for different systems, that COULD justify separation (different tool sets -- justification c)

4. **NO `<browser_automation_detection>` section needed** -- that logic lives in workflow-discovery

**Effort estimate:** Small -- input consumption, output field addition, complexity gate note. Much simpler than the original HIGH assessment because detection logic is elsewhere.

---

### 5. tool-resolver.md -- Priority: MEDIUM

**Current role:** Resolves tool needs for each agent in a swarm by consulting a curated catalog and web search, producing a TOOLS.md with verified, copy-paste-ready Orq.ai tool configurations.

**Browser automation relevance (revised):** The tool resolver receives information about browser automation needs from the architect blueprint (which in turn got it from workflow-discovery). It must recognize browser automation requirements and produce placeholder MCP tool configurations. The actual tool verification happens later during the workflow-builder + script-generator stage.

**What changes are needed:**

1. **New entry in resolution priority chain for browser automation tools:**
   - When architect blueprint flags `browser_automation: required`, the tool resolver should:
     - Recognize this as a "pending MCP tool" -- the Playwright script hasn't been generated yet
     - Generate a placeholder MCP tool config with `{{PLACEHOLDER}}` values
     - Document that the tool will be created by the workflow-builder + script-generator stage

2. **Addition to curated tool catalog (references/tool-catalog.md):**
   - New category: "Browser Automation Tools"
   - Entry for Browserless.io MCP tool pattern

3. **New section in TOOLS.md output: "Browser Automation Tools (Pending)"**
   - Lists tools that will be created by the browser automation pipeline stage
   - Includes target system, expected capabilities, and placeholder configurations

4. **Modification to per-agent tool limit:**
   - Browser automation MCP tools count toward the 3-5 tool limit per agent

**Effort estimate:** Small -- catalog entry, placeholder pattern, TOOLS.md section

---

### 6. orchestration-generator.md -- Priority: MEDIUM

**Current role:** Generates ORCHESTRATION.md documents for multi-agent swarms. Produces agent-as-tool assignments, data flow diagrams, error handling tables, and HITL decision points.

**Browser automation relevance:** When a swarm includes agents with browser automation, the orchestration document must reflect the additional data flow and potential failure modes. The workflow-builder stage introduces a checkpoint between spec generation and deployment.

**What changes are needed:**

1. **Modification to Data Flow section:**
   - When browser automation is present, add a "Browser Automation Stage" node in the data flow diagram
   - Show the workflow-builder input step (user describes workflow conversationally, optionally uploads screenshots or SOP)
   - Indicate that this is a HITL checkpoint (user provides workflow description and confirms AI interpretation)

2. **Modification to Error Handling table:**
   - Add error handling rows for browser automation scenarios:
     - "Browser automation tool timeout" -- retry with fresh session, then escalate
     - "Target system authentication failure" -- credential rotation needed, HITL escalation
     - "UI element not found" -- script may need update, flag for workflow-builder re-run

3. **Addition to HITL Decision Points:**
   - "Workflow description confirmation" -- user verifies the pipeline's understanding of the workflow
   - "Script test verification" -- user watches Session Replay and confirms correct behavior

4. **Addition to Setup Steps:**
   - For agents with browser automation: "Configure Browserless.io credentials", "Verify MCP tool connectivity"

**Effort estimate:** Small -- additions to existing sections, no structural changes

---

### 7. dataset-generator.md -- Priority: MEDIUM

**Current role:** Generates per-agent test datasets with clean evaluation pairs and adversarial edge cases. Produces dual datasets with multi-model comparison matrices and OWASP adversarial coverage.

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

**Current role:** Transforms V1.0 datasets to Orq.ai format, auto-selects evaluators, runs experiments, and produces structured test results.

**Browser automation relevance:** When testing agents that have browser automation tools, the tester must account for: (1) longer execution times (browser automation adds 10-30s per invocation), (2) the possibility that Browserless.io is unavailable during testing, (3) different evaluator expectations for browser automation responses.

**What changes are needed:**

1. **Modification to Phase 7 (Execute Experiments):**
   - When an agent has browser automation tools, increase polling timeout from 5 minutes to 10 minutes
   - Add "browser automation tool not available" as a known error pattern

2. **Addition to role inference (Phase 6):**
   - Detect browser automation signals in agent specs (presence of Browserless.io MCP tool)
   - Browser automation agents default to `hybrid` role

3. **Addition to terminal summary:**
   - Flag agents with browser automation tools so testers know execution will be slower

**Effort estimate:** Small -- timeout adjustment, detection heuristic, summary flag

---

## Korte Notities: LOW Priority Agents

### 9. readme-generator.md -- Priority: LOW

Current role: Generates per-swarm README files with plain-language overview and setup instructions. When a swarm includes agents with browser automation, the README must document: Browserless.io setup, credential configuration, workflow-builder process, and how to verify browser automation tools are working. Conditional "Browser Automation Setup" section needed. No structural changes.

### 10. dataset-preparer.md -- Priority: LOW

Current role: Parses V1.0 markdown datasets, augments to 30+, splits stratified, uploads to Orq.ai. Minor impact: augmentation should be aware of browser-automation test case category when generating variations. No structural changes needed.

### 11. kb-generator.md -- Priority: LOW

Current role: Generates KB-ready documents from pipeline context or domain templates. Minor impact: could generate workflow-derived documents for browser automation agents' knowledge bases (e.g., "how to use NXT" FAQ derived from the workflow definition). No structural changes needed; this is a potential enhancement.

### 12. iterator.md -- Priority: LOW

Current role: Orchestrates analyze-propose-approve-retest cycle for prompt iteration. Minor impact: when iterating on agents with browser automation, the iterator should recognize that tool-related failures (browser automation script errors) are not prompt issues and should be flagged for the workflow-builder/script-generator instead of prompt editing. No structural changes needed; add a note about tool-vs-prompt failure distinction.

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

### Proposed New Subagent 1: `orq-workflow-discovery` (NEW -- HIGH PRIORITY)

**Purpose:** Conversationally identifies which systems and workflows a use case requires. Sits early in the pipeline -- after the discussion agent surfaces gray areas, workflow-discovery reasons about integration methods for every system mentioned. It presents its findings to the user for confirmation or correction before the architect designs the swarm.

**Why this agent exists (the fundamental insight):**

A user describing a "Klanten Service agent" that needs NXT access won't say "I need browser automation for NXT." They'll say "the agent needs to look up customer details in NXT." The pipeline must reason: "NXT has no API, so looking up customer details requires browser automation." This reasoning is inherently conversational -- it requires asking clarifying questions ("Which systems does this agent interact with?", "Does NXT have an API you can use?") and cross-referencing known system capabilities.

This reasoning does NOT belong in the architect because:
- The architect's job is swarm topology design, not system integration discovery
- Integration discovery benefits from back-and-forth with the user (conversational)
- The architect should receive clean, confirmed discovery output, not perform discovery itself

**Pipeline position:** After discussion, BEFORE architect.

**Flow:**
```
discussion output (use case description, gray areas resolved)
  -> workflow-discovery reasons about systems and integration methods
    -> presents findings to user: "I identified these systems: NXT (browser automation),
       iController (browser automation), FAQ KB (standard tool). Does this match?"
      -> user confirms/corrects
        -> structured output consumed by architect
```

**Example interaction:**
```
User: "I need a Klanten Service agent that can answer customer questions. The agent needs
to look up customer details in NXT and check order status in iController."

Workflow-discovery reasons:
- NXT: Internal system, known to have no API -> integration_method: browser-automation
  Workflows identified: "look up customer details" -> { name: "customer-lookup",
  system: "NXT", steps: TBD by workflow-builder }
- iController: Internal system, known to have no API -> integration_method: browser-automation
  Workflows identified: "check order status" -> { name: "order-status-check",
  system: "iController", steps: TBD by workflow-builder }
- FAQ knowledge base: Standard retrieval -> integration_method: standard-tool

Presents to user:
"To build this agent, I've identified these system integrations:
1. NXT (customer details) -- no API available, will need browser automation
2. iController (order status) -- no API available, will need browser automation
3. FAQ knowledge base -- standard knowledge base tool

Does this match your expectations? Are there other systems this agent needs to access?"
```

**Input contract:**
- Use case description (from discussion output)
- Optional: `systems.json` lookup (maps known system names to integration methods)
- Conversation context for follow-up questions

**Output contract:**
- Per-system structured discovery result:
  ```json
  {
    "system_name": "NXT",
    "integration_method": "browser-automation",
    "workflows_identified": [
      { "name": "customer-lookup", "description": "Look up customer details by name or ID" }
    ],
    "confidence": "HIGH",
    "user_confirmed": true
  }
  ```

**Tools needed:** Read (for systems.json lookup), conversation context

**Estimated instruction file size:** Medium (~400 lines) -- conversational reasoning, system detection heuristics, user confirmation flow, output formatting

---

### Proposed New Subagent 2: `orq-workflow-builder` (NEW -- replaces SOP-dependent approach)

**Purpose:** Builds structured workflow definitions from multiple input sources. This agent does NOT assume an SOP document exists. The most common path is conversational: the user describes the workflow step by step, and the workflow-builder constructs a structured definition from that conversation.

**Why this replaces the SOP-dependent approach:**

The original model assumed SOPs are always available. In practice:
- **Most common input (70%+):** User describes the workflow conversationally ("First you log in, then you click Customers, then you search by name...")
- **Sometimes available (20%):** User uploads screenshots of the target system
- **Rarely available (10%):** User has a formal SOP document

The workflow-builder must handle ALL of these input sources, with conversational input as the primary path.

**Pipeline position:** After spec-generation, before script-generator. It sits in the browser automation pipeline stage that runs after V1.0 output is complete.

**Input sources (in order of likelihood):**
1. **Conversational input (MOST COMMON):** User describes the workflow step by step. The workflow-builder asks clarifying questions ("What do you click after logging in?", "Is there a search field or a menu?", "What does the result page look like?")
2. **Screenshots of the target system:** User uploads screenshots. The workflow-builder uses AI vision to identify UI elements, navigation patterns, and form fields.
3. **SOP documents (when available -- NOT assumed to exist):** User uploads a Word or PDF document. The workflow-builder parses it and extracts step-by-step instructions.
4. **Any combination:** User provides partial screenshots plus conversational description. The workflow-builder integrates all available sources.

**Input contract:**
- Workflow-discovery output (system name, integration method, identified workflows)
- User conversation about the workflow (most common path)
- Optional: uploaded screenshots (PNG/JPEG)
- Optional: SOP document (PDF/Word)
- Researcher's browser automation context (UI framework, auth method, session needs)

**Output contract:**
- Structured workflow definition (same output format regardless of input source):
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
    ],
    "input_sources_used": ["conversation", "screenshots"]
  }
  ```

**Tools needed:** Read, Write, Vision API (via Orq.ai for screenshot analysis), conversation context

**Estimated instruction file size:** Large (~600+ lines) -- multi-source input handling, conversational workflow extraction, AI vision analysis, multi-step user confirmation flow, SOP parsing (when available)

---

### Proposed New Subagent 3: `orq-script-generator`

**Purpose:** Generates Playwright scripts from structured workflow definitions (produced by workflow-builder), executes them on Browserless.io for testing, iterates on failures using DOM accessibility tree analysis, and produces verified scripts ready for MCP tool deployment.

**Pipeline position:** After workflow-builder. Consumes workflow definition, produces verified Playwright script.

**Input contract:**
- Structured workflow definition (from workflow-builder)
- Browserless.io API credentials
- Target system credentials (from credential vault)

**Output contract:**
- Verified Playwright script (JavaScript/TypeScript file)
- Test results: success/failure, Session Replay URL, execution time
- MCP tool definition: ready for deployment
  ```json
  {
    "key": "browser-automation-nxt-customer-lookup",
    "type": "mcp",
    "description": "Looks up customer details in NXT by searching the customer database",
    "script_path": "scripts/nxt-customer-lookup.js",
    "status": "verified",
    "test_runs": 3,
    "avg_execution_time": "15s"
  }
  ```

**Tools needed:** Read, Write, Bash (for script execution), WebFetch (for Browserless.io API calls -- `/function`, `/screenshot`, `/content`)

**Estimated instruction file size:** Large (~600+ lines) -- script generation, iterative testing, DOM analysis, MCP tool configuration

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

### Enhanced Pipeline Flow with Browser Automation (Revised Model)

```
User Input
  -> discussion (surfaces gray areas)
    -> workflow-discovery (NEW -- identifies systems + integration methods conversationally)
      -> [USER] confirms/corrects discovered systems and workflows
        -> architect (designs swarm WITH workflow knowledge from discovery)
          -> researcher (domain research + browser automation context per system)
            -> tool-resolver (resolves tools + browser automation placeholders)
            -> spec-generator (generates specs + browser automation sections)
              -> orchestration-generator (documents flow + browser automation stage)
              -> dataset-generator (generates data + browser automation test cases)
                -> readme-generator (documents setup + browser automation instructions)
                  -> [V1.0 output complete]

                    *** BROWSER AUTOMATION STAGE (if any agent needs it) ***
                    -> workflow-builder (NEW) -- builds workflow definitions from:
                       [USER] describes workflow conversationally (MOST COMMON)
                       OR [USER] uploads screenshots
                       OR [USER] provides SOP document
                       OR any combination
                    -> [USER] confirms/corrects AI interpretation of workflow
                    -> script-generator (generates Playwright scripts)
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

1. **Workflow discovery (NEW):** Workflow-discovery conversationally identifies which systems need browser automation and feeds structured output to the architect
2. **Architect consumption (REVISED):** Architect receives and uses workflow-discovery output -- it does NOT detect no-API systems itself
3. **Research enrichment:** Researcher adds browser automation context to research briefs for agents that interact with browser-automated systems
4. **Spec preparation:** Spec generator includes MCP tool placeholders and instruction sections for browser automation
5. **Pipeline branching:** After V1.0 output, if any agent needs browser automation, the pipeline branches to the browser automation stage (workflow-builder + script-generator) before deployment
6. **Workflow building (NEW):** Workflow-builder constructs structured workflow definitions from whatever input the user provides (conversation, screenshots, SOP, or combination)
7. **Deployment integration:** Deployer handles browser automation MCP tools alongside standard tools
8. **Testing awareness:** Tester adjusts timeouts and evaluation for browser automation agents

### Contract Between Existing and New Agents

| Existing Agent | New Agent | Contract |
|----------------|-----------|----------|
| discussion | workflow-discovery | Discussion provides use case description; workflow-discovery receives it as input |
| workflow-discovery | architect | Discovery provides per-system integration method and workflows; architect uses it for swarm design |
| architect | workflow-builder | Architect provides `browser_automation: required` flag per agent with `target_system` name |
| researcher | workflow-builder | Researcher provides UI framework hints, auth method, session needs |
| spec-generator | script-generator | Spec generator provides MCP tool placeholder ID that script generator fills |
| tool-resolver | script-generator | Tool resolver provides placeholder tool config; script generator provides verified config |
| deployer | script-generator | Script generator provides verified MCP tool definition; deployer deploys it |
| tester | script-generator | Tester tests the agent with the browser automation tool attached |

---

## Samenvatting en Aanbevelingen

1. **The integration model is conversation-first, not SOP-first.** The revised model acknowledges that most business processes live in people's heads. Workflow-discovery uses conversation to identify systems and integration methods. Workflow-builder constructs workflow definitions from whatever input is available -- conversation being the most common source.

2. **Detection belongs early and conversationally, not in the architect.** Workflow-discovery sits after discussion and before the architect, enabling the architect to design swarms with full knowledge of browser automation needs. The architect's priority drops from HIGH to MEDIUM because it consumes discovery output rather than performing detection itself.

3. **Focus investment on 3 HIGH-priority existing agents.** The researcher, spec-generator, and deployer need the most attention. These handle research for browser automation context, specification with browser automation awareness, and deployment of generated MCP tools.

4. **3 new subagents are essential.** Workflow-discovery (early pipeline), workflow-builder (mid pipeline), and script-generator represent the browser automation capability. Workflow-discovery is the new entry point; workflow-builder is the core builder; script-generator is the output producer.

5. **The pipeline branching point is natural.** The browser automation stage (workflow-builder + script-generator) slots between V1.0 output generation and deployment. This preserves the existing pipeline flow and adds a conditional branch only when needed.

6. **Consider a `systems.json` config file** in the pipeline that maps known system names to their integration method (API, browser automation, manual). This gives workflow-discovery a lookup table to supplement its conversational reasoning. But the config is optional -- workflow-discovery can work purely conversationally when no config exists.
