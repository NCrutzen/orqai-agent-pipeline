---
description: Deploy agents to Orq.ai (requires deploy+ tier)
allowed-tools: Read, Bash
---

# Deploy to Orq.ai

You are running the `/orq-agent:deploy` command. This command deploys generated agent specifications to Orq.ai.

Follow these steps in order. Stop at any step that indicates a terminal condition.

## Step 1: Capability Gate

Read the config file to check the user's capability tier:

```bash
cat "$HOME/.claude/skills/orq-agent/.orq-agent/config.json" 2>/dev/null || echo "CONFIG_NOT_FOUND"
```

**If CONFIG_NOT_FOUND:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install required. Run the orq-agent install script first.

  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If config exists:** Extract the `tier` value. Check against the tier hierarchy:

```
Tier hierarchy: full > test > deploy > core
Required tier:  deploy
```

**If current tier is "core":** Display the following upgrade message and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY — Upgrade Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The deploy command requires the "deploy" tier or higher.

  | Tier   | Capabilities                                  |
  |--------|-----------------------------------------------|
  | core   | Spec generation (/orq-agent)            [YOU] |
  | deploy | + Deployment (/orq-agent:deploy)               |
  | test   | + Automated testing (/orq-agent:test)          |
  | full   | + Prompt iteration (/orq-agent:iterate)        |

To upgrade, re-run the install script and select a higher tier:
  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If tier is "deploy", "test", or "full":** Gate passes. Proceed to Step 2.

## Step 2: Load API Key and Check MCP

### 2.1: Load API Key

The API key is stored in config.json (set during install). Extract it:

```bash
node -e "try{const c=JSON.parse(require('fs').readFileSync('$HOME/.claude/skills/orq-agent/.orq-agent/config.json','utf8'));console.log(c.orq_api_key||'')}catch(e){console.log('')}"
```

Store the result as `ORQ_API_KEY`. If empty, also check the environment variable `$ORQ_API_KEY` as fallback.

**If both are empty:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY — API Key Missing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No Orq.ai API key found. Re-run the installer to configure:

  curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure
```

**If API key found:** Export it for use in subsequent bash commands: `export ORQ_API_KEY="<value>"`

### 2.2: Select Orq.ai Project

List available projects using the API:

```bash
curl -s -H "Authorization: Bearer $ORQ_API_KEY" https://api.orq.ai/v2/projects
```

Parse the response to extract project names and IDs. Display a picker:

```
Which Orq.ai project should I deploy to?

  1. Project Name A
  2. Project Name B
  3. Project Name C

Select project number:
```

Store the selected project ID as `ORQ_PROJECT_ID`. If only one project exists, auto-select it and display: `Project: [name]`.

If the API does not support a projects endpoint or returns an error, skip this step (the API key may be scoped to a single project already).

### 2.3: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -qi "orq" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Set `mcp_available = false`. Display a note and continue to Step 3:

```
MCP server not available -- deploying via REST API.
```

Do NOT stop. Deployment works via REST API when MCP is unavailable (DEPLOY-08). The deployer agent will use REST for all operations when `mcp_available` is false.

**If MCP_AVAILABLE:** Set `mcp_available = true`. Proceed to Step 3.

## Step 3: Locate Swarm Output and Parse Agent Scope

**Command format:** `/orq-agent:deploy [--agent agent-key]` where `--agent` is optional.

Parse the command arguments:
- If `--agent agent-key` is provided: scope deployment to that single agent + its tool dependencies
- If no `--agent` flag: show an interactive picker (see below)

Find the most recent swarm output directory. A valid swarm directory contains an `ORCHESTRATION.md` file.

Search for swarm output in the current project's `Agents/` directory (the standard output location for the V1.0 pipeline):

```bash
# Look for ORCHESTRATION.md files in Agents/ subdirectories
find Agents/ -name "ORCHESTRATION.md" -type f 2>/dev/null
```

**If no ORCHESTRATION.md found:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY — No Swarm Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No swarm output found. Run /orq-agent first to generate agent specifications.

Expected: Agents/<swarm-name>/ORCHESTRATION.md
```

**If ORCHESTRATION.md found:** Use the most recently modified swarm directory. Read the following files from that swarm directory:

1. **ORCHESTRATION.md** -- Identify all agents, their dependency order, which is the orchestrator (has `team_of_agents` assignments), and agent-as-tool wiring.

2. **TOOLS.md** -- Identify all tool definitions (key, type, configuration) and per-agent tool assignments. If TOOLS.md does not exist in the swarm directory, the swarm has no workspace-level tools (agents may still have inline tool configurations).

3. **Each agent spec `.md` file** referenced in ORCHESTRATION.md (located in the `agents/` subdirectory of the swarm). Parse:
   - Configuration section: key, role, description
   - Model section: primary model, fallback models
   - Instructions section: full system prompt
   - Tools section: tool configurations for `settings.tools`
   - Context section: knowledge_bases, memory_stores, variables
   - Runtime Constraints: max_iterations, max_execution_time
   - YAML frontmatter (if present): existing `orqai_id` from previous deploy

### 3.1: Agent Scope Resolution

**If `--agent agent-key` was provided:**

Verify the agent exists in the swarm:
- If found: scope deployment to that single agent. Display: `Deploying: {agent-key} + {N} tool dependencies`
- If not found: display error listing available agents and STOP

**If NO `--agent` flag was provided:**

Display an interactive picker for the user to select which agent(s) to deploy:

```
Which agent(s) to deploy?

  1. [all] Deploy all agents
  2. agent-key-1
  3. agent-key-2
  4. orchestrator-key

Select (comma-separated for multiple, or "all"):
```

- If user selects "all" or "1": deploy all agents (default full-swarm behavior)
- If user selects specific agents (e.g., "2,3"): scope deployment to those agents + their tool dependencies

### 3.2: Tool Dependency Resolution

When deploying a scoped set of agents (via `--agent` or picker selection):
- For each selected agent, read its `settings.tools` from the spec file
- Collect all tool keys referenced by the selected agent(s)
- Only these tools will be deployed in Phase 1 (other tools are skipped)
- Auto-deploy tool dependencies: when deploying a single agent, its tools are always deployed too (same dependency resolution, scoped)

### 3.3: Display Swarm Summary

Display the swarm summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Swarm: [swarm-name]
Agents: [N] ([list agent keys])
Tools: [M] ([list tool keys])
Orchestrator: [orchestrator-key]
Channel: [MCP + REST | REST only]
Scope: [all | agent-key + N tool dependencies]
```

> **Note:** The orchestrator can be deployed independently via `--agent orchestrator-key` once all sub-agents exist in Orq.ai. This allows incremental wiring after individual agents are deployed and tested.

Proceed to Step 4.

## Step 4: Pre-flight Validation

### 4.1: Confirm MCP Reachability (if mcp_available is true)

If `mcp_available` is true from Step 2, probe MCP more thoroughly by calling the `models-list` MCP tool. This confirms the MCP server is actually responding to tool calls (not just registered):

- If `models-list` succeeds: MCP confirmed available. Keep `mcp_available = true`.
- If `models-list` fails: Set `mcp_available = false`. Display: "MCP probe failed -- falling back to REST API for all operations."

If `mcp_available` was already false from Step 2, skip this probe entirely.

### 4.2: Validate API Key

Verify the Orq.ai API key (loaded in Step 2.1) is valid by making a lightweight authenticated request:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  https://api.orq.ai/v2/models
```

**If 200:** API key is valid. Proceed.

**If 401:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY — Authentication Failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

API key is invalid or expired.

Re-run the installer to update your key:
  curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure

Get your API key from: https://studio.orq.ai/settings/api-keys
```

### 4.3: Check for Previous Partial Deployment

If re-running deploy (some resources may already exist in Orq.ai from a previous run):

- Do NOT trust frontmatter alone. Re-verify ALL resources against Orq.ai state.
- For each resource in the manifest: check if it exists AND matches the current local spec.
- The deployer agent handles this automatically via its idempotent create-or-update logic. No special handling needed here -- just proceed to Step 5 and let the deployer diff each resource.

Proceed to Step 5.

## Step 5: Deploy Resources

Read the deployer agent instructions from `orq-agent/agents/deployer.md`. The deployer implements the full 6-phase deployment pipeline.

Invoke the deployer with the following context:
- Swarm directory path (from Step 3)
- `mcp_available` flag (from Steps 2/4)
- Parsed swarm manifest: ORCHESTRATION.md content, TOOLS.md content, agent spec file contents
- **Agent scope** (from Step 3): which agents and tools are in scope for this deploy run

### 5.1: Scoped Deployment Behavior

When `--agent` is active (or specific agents selected via picker), tell the deployer subagent to scope its pipeline:

- **Phase 1 (Deploy Tools):** Only deploy tools that the selected agent(s) reference in their `settings.tools`. Skip all other tools.
- **Phase 2 (Deploy Sub-Agents):** Only deploy the selected agent(s). Skip all other sub-agents.
- **Phase 3 (Deploy Orchestrator):** Skip UNLESS the orchestrator is explicitly selected (via `--agent orchestrator-key` or picker selection) or all agents were selected.

Display scoped summary before deploying: `Deploying: {agent-key} + {N} tool dependencies`

### 5.2: Deployer Pipeline Execution

The deployer executes its 6-phase pipeline (scoped to selected resources):

1. **Phase 0: Pre-flight** -- The deployer performs its own pre-flight (API key validation, swarm parsing). Since we already validated in Step 4, the deployer will confirm and proceed quickly.

2. **Phase 1: Deploy Tools** -- Creates/updates tools in scope. Display progress:
   ```
   Deploying tools... (1/3)
   Deploying tools... (2/3)
   Deploying tools... (3/3) done
   ```

3. **Phase 2: Deploy Sub-Agents** -- Creates/updates sub-agents in scope. Display progress:
   ```
   Deploying sub-agents... (1/2)
   Deploying sub-agents... (2/2) done
   ```

4. **Phase 3: Deploy Orchestrator** -- Creates/updates the orchestrator with `team_of_agents` wiring (only if in scope). Display progress:
   ```
   Deploying orchestrator... (1/1) done
   ```

5. **Phase 4: Read-Back Verification** -- Reads back every deployed resource from Orq.ai and compares against local spec. Collects discrepancies as warnings. Display progress:
   ```
   Verifying resources... (1/6)
   Verifying resources... (6/6) done
   ```

6. **Phase 5: Annotate Spec Files** -- Writes YAML frontmatter (orqai_id, version, timestamp, channel) to each local spec file. Display progress:
   ```
   Annotated 5 spec files with deployment metadata.
   ```

**If any resource fails during Phases 0-3:** The deployer will stop immediately, report what succeeded and what failed, and return a partial result. Do NOT retry the entire deploy -- display the error and let the user fix the issue and re-run.

**If all resources succeed:** The deployer returns the full deployment results including verification warnings and annotation status. Proceed to Step 6.

## Step 6: Verify and Annotate

After the deployer completes Phases 0-3 (resource deployment), instruct it to continue with Phase 4 (read-back verification) and Phase 5 (frontmatter annotation).

### 6.1: Read-Back Verification

The deployer runs Phase 4: reads back every deployed resource from Orq.ai and compares field-by-field against the local spec. Only fields present in the local spec are compared (allowlist approach). Server-added metadata fields (`_id`, `created`, `updated`, `workspace_id`, `project_id`, `status`, `version_hash`, `created_by_id`, `updated_by_id`) are excluded.

Collect verification results:
- **Warnings list:** Any field-level discrepancies between deployed resource and local spec. Each warning includes: resource key, field name, expected value summary, actual value summary.
- Discrepancies are warnings only -- they do NOT block the deploy (LOCKED decision).

### 6.2: YAML Frontmatter Annotation

The deployer runs Phase 5: updates each local agent spec `.md` file with YAML frontmatter containing deployment metadata (`orqai_id`, `orqai_version`, `deployed_at`, `deploy_channel`). Tool IDs are stored in TOOLS.md frontmatter.

Collect annotation results:
- **Deployment metadata:** Resource IDs, version hashes, timestamps, channels used per resource.
- Number of files annotated.

Proceed to Step 7.

## Step 7: Write Deploy Log and Display Summary

### 7.1: Write deploy-log.md

Generate (or append to) `deploy-log.md` in the swarm output directory. Per user decision (LOCKED): deploy-log.md is a single append file -- each deploy run adds a section, full history is preserved.

**If deploy-log.md does not exist:** Create it with a header and the first deploy run section.

**If deploy-log.md already exists:** Append a new section at the end. Do NOT overwrite previous entries.

Each deploy run section format:

```markdown
## Deploy: {ISO_8601_TIMESTAMP}

**Swarm:** {swarm_name}
**Deployment ID:** deploy-{YYYYMMDD}-{HHMMSS}

| Resource | Type | Status | Channel | Orq.ai Link |
|----------|------|--------|---------|-------------|
| {resource_key} | tool | created | mcp | -- |
| {agent_key} | agent | created | mcp | [Studio]({studio_url}) |
| {agent_key} | agent | updated | rest (fallback) | [Studio]({studio_url}) |

**Warnings:**
- {agent_key}: {field} field differs after read-back ({summary})

**Summary:** {N} resources deployed ({T} tools, {A} agents). {C} created, {U} updated, {X} unchanged, {F} failed.
```

**Status values (three-way distinction):**
- `created` -- resource was new and created successfully
- `updated` -- resource existed but differed from local spec; patched
- `unchanged` -- resource existed and matched local spec; skipped
- `failed` -- resource could not be deployed (only in partial failure scenarios)

**Orq.ai Studio link construction:**
- Check if the agent create/update API response contains a URL field
- If not, construct: `https://cloud.orq.ai/toolkit/agents/{orqai_id}`
- Note in the deploy log that the URL format is inferred if no URL was found in the API response
- Tools do not get Studio links (use `--` in the Link column)

**Warnings section:**
- If no discrepancies from verification: omit the Warnings section entirely
- If discrepancies exist: list each one with resource key, field name, and brief summary

**deploy-log.md file header** (only written on creation, not on append):

```markdown
# Deploy Log

Deployment audit trail for Orq.ai agent deployments. Each section records one deploy run with resource status and verification results. This file is append-only.

---
```

### 7.2: Display Summary to User

After writing deploy-log.md, display the same status table to the user in the terminal:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY — Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Resource | Type | Status | Channel | Link |
|----------|------|--------|---------|------|
| [tool-key] | tool | created | mcp | -- |
| [agent-key] | agent | updated | rest (fallback) | [Studio](https://cloud.orq.ai/...) |
| [orch-key] | agent | created | mcp | [Studio](https://cloud.orq.ai/...) |
```

**If there are warnings from verification**, display them after the table:

```
Warnings:
- [agent-key]: instructions field differs after read-back (trailing whitespace added)
- [tool-key]: description field differs after read-back (case normalization)
```

**If all resources succeeded (no failures):**

```
Deploy complete. {N} resources deployed ({C} created, {U} updated, {X} unchanged). See deploy-log.md for details.
```

**If any resources failed:**

```
Deploy incomplete. {F}/{N} resources failed. See deploy-log.md for details.
Re-run /orq-agent:deploy to retry failed resources.
```

**If deploy was fully unchanged (all resources matched):**

```
Deploy complete. {N} resources verified, all unchanged. No updates needed.
```
