---
description: Set up guardrails and quality gates (requires full tier)
allowed-tools: Read, Bash
---

# Guardrails and Quality Gates

You are running the `/orq-agent:harden` command. This command promotes test evaluators to production guardrails, attaches them to deployed agents via Orq.ai, and generates quality gate reports.

Follow these steps in order. Stop at any step that indicates a terminal condition.

## Step 1: Capability Gate

Read the config file to check the user's capability tier:

```bash
cat "$HOME/.claude/skills/orq-agent/.orq-agent/config.json" 2>/dev/null || echo "CONFIG_NOT_FOUND"
```

**If CONFIG_NOT_FOUND:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install required. Run the orq-agent install script first.

  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If config exists:** Extract the `tier` value. Check against the tier hierarchy:

```
Tier hierarchy: full > test > deploy > core
Required tier:  full
```

**If current tier is NOT "full":** Display the following upgrade message and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN -- Upgrade Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The harden command requires the "full" tier.

  | Tier   | Capabilities                                  |
  |--------|-----------------------------------------------|
  | core   | Spec generation (/orq-agent)                   |
  | deploy | + Deployment (/orq-agent:deploy)               |
  | test   | + Automated testing (/orq-agent:test)          |
  | full   | + Iteration & hardening (/orq-agent:iterate, /orq-agent:harden) [YOU] |

To upgrade, re-run the install script and select a higher tier:
  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

Note: The `[YOU]` marker appears next to the user's current tier. Adjust its position based on the actual current tier.

**If tier is "full":** Gate passes. Proceed to Step 2.

## Step 2: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -q "orqai" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Check if the REST API is reachable (the hardener uses REST for API calls when MCP is unavailable):

```bash
[ -n "$ORQ_API_KEY" ] && curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  https://api.orq.ai/v2/models
```

**If MCP unavailable AND ORQ_API_KEY is set AND API returns 200:** Set `mcp_available = false`. Display a note and continue to Step 3:

```
MCP server not available -- hardening via REST API.
```

**If MCP unavailable AND (ORQ_API_KEY is empty OR API returns non-200):** Display V1.0 fallback and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN (V1.0 Fallback)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP server not available and no API key configured.

To set up guardrails manually:
1. Open Orq.ai Studio (https://studio.orq.ai)
2. Navigate to each deployed agent
3. Go to Settings -> Guardrails
4. Add evaluators as guardrails from your test results
5. Configure sample rates and execute_on settings
6. Review test scores to set quality thresholds

To enable autonomous hardening, either:
  - Register the MCP server: claude mcp add orqai
  - Or set your API key: export ORQ_API_KEY="your-api-key-here"
```

STOP after displaying fallback instructions.

**If MCP_AVAILABLE:** Set `mcp_available = true`. Proceed to Step 3.

## Step 3: Locate Swarm Output

Parse the command argument and locate the swarm output directory.

**Command format:** `/orq-agent:harden [--agent agent-key] [--all]`

- If `--agent agent-key` is provided: filter hardening to that single agent
- If `--all` is provided: explicitly harden all agents in the swarm
- If no flags: harden all agents in the swarm (default behavior, same as `--all`)

Find the most recent swarm output directory (same logic as deploy, test, and iterate commands):

```bash
find Agents/ -name "ORCHESTRATION.md" -type f 2>/dev/null
```

**If no ORCHESTRATION.md found:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN -- No Swarm Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No swarm output found. Run /orq-agent first to generate agent specifications.

Expected: Agents/<swarm-name>/ORCHESTRATION.md
```

**If multiple ORCHESTRATION.md files found:** List available swarms and ask the user to specify which one:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN -- Multiple Swarms Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Multiple swarm outputs found:

  1. Agents/{swarm-name-1}/
  2. Agents/{swarm-name-2}/

Which swarm would you like to harden? [1/2]
```

**If single ORCHESTRATION.md found:** Use that swarm directory. Read ORCHESTRATION.md to get the agent list.

If `--agent agent-key` was provided, verify the agent exists in the swarm:
- If found: filter to that single agent
- If not found: display error listing available agents and STOP

Display the swarm summary header:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Swarm: [swarm-name]
Agents: [N] ([list agent keys])
Channel: [MCP + REST | REST only]
```

Proceed to Step 4.

## Step 4: Pre-check Test Results

Look for `test-results.json` in the swarm directory. This is a hard prerequisite -- hardening requires test data (LOCKED decision: data-driven, not guesswork).

**If NOT found:** Display error and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN -- Test Results Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No test results found in {swarm-directory}.

Run /orq-agent:test first to generate test results:
  /orq-agent:test
```

STOP after displaying message.

**If found:** Read `test-results.json` and display a summary of available test data:

```
Pre-check: Test results found ({N} agents tested, {date}).
```

Verify all target agents have `orqai_id` in their spec file frontmatter (must be deployed):
- If any agent lacks `orqai_id`: display error suggesting `/orq-agent:deploy` first, STOP
- If all agents have `orqai_id`: proceed

Proceed to Step 5.

## Step 5: Invoke Hardener Subagent

Read the hardener subagent instructions from `orq-agent/agents/hardener.md`. Invoke the hardener with:

- **Swarm directory path** (from Step 3)
- **Agent filter** (if single agent-key specified in the command)
- **MCP availability flag** (from Step 2)

The hardener handles the entire 6-phase pipeline:
1. Read test results and validate prerequisites (Phase 1)
2. Suggest guardrails based on test data (Phase 2)
3. Collect per-agent user approval -- interactive (Phase 3)
4. Write guardrail config to agent spec files (Phase 4)
5. Attach guardrails to agents via Orq.ai API (Phase 5)
6. Quality gate check and report generation (Phase 6)

Display progress during execution:

```
Analyzing test results...
Suggesting guardrails...
[hardener presents suggestions and collects approval per agent]
Attaching guardrails to Orq.ai agents...
Running quality gate checks...
```

Wait for the hardener to complete and return results. Proceed to Step 6.

## Step 6: Display Results

After the hardener completes, display the terminal summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ >>> HARDEN -- Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agent              | Guardrails | Quality Gate | Status
-------------------|------------|--------------|------------------
{agent-key}        | 3 attached | PASS         | Production-ready
{agent-key}        | 2 attached | FAIL (advisory) | Warning: instruction_following below threshold

Details: quality-report.md
```

**If any agents had guardrail attachment failures:**

```
Warnings:
- {agent-key}: Failed to attach guardrails ({error reason})
```

## Step 7: Next Steps Guidance

Based on the quality gate results, display appropriate guidance:

**If all agents pass quality gate:**
```
All agents production-ready. Your swarm is hardened.
```

**If some agents fail with advisory severity only:**
```
Some agents have advisory warnings. Run /orq-agent:iterate to improve scores, or proceed with current state.
```

**If some agents fail with strict (high) severity:**
```
Some agents are not production-ready. Run /orq-agent:iterate to improve scores before deploying to production.
```

**If all agents were skipped:**
```
No guardrails were attached. Run /orq-agent:harden again to configure guardrails.
```

**If hardening single agent:**
```
Single agent hardened. Run /orq-agent:harden without arguments to harden all agents.
```
