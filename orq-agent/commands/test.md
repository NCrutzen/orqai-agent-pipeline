---
description: Run automated testing against deployed agents (requires test+ tier)
allowed-tools: Read, Bash
---

# Automated Testing

You are running the `/orq-agent:test` command. This command runs automated tests against deployed Orq.ai agents.

Follow these steps in order. Stop at any step that indicates a terminal condition.

## Step 1: Capability Gate

Read the config file to check the user's capability tier:

```bash
cat "$HOME/.claude/skills/orq-agent/.orq-agent/config.json" 2>/dev/null || echo "CONFIG_NOT_FOUND"
```

**If CONFIG_NOT_FOUND:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install required. Run the orq-agent install script first.

  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If config exists:** Extract the `tier` value. Check against the tier hierarchy:

```
Tier hierarchy: full > test > deploy > core
Required tier:  test
```

**If current tier is "core" or "deploy":** Display the following upgrade message and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST — Upgrade Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The test command requires the "test" tier or higher.

  | Tier   | Capabilities                                  |
  |--------|-----------------------------------------------|
  | core   | Spec generation (/orq-agent)                   |
  | deploy | + Deployment (/orq-agent:deploy)         [YOU] |
  | test   | + Automated testing (/orq-agent:test)          |
  | full   | + Prompt iteration (/orq-agent:iterate)        |

To upgrade, re-run the install script and select a higher tier:
  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

Note: The `[YOU]` marker appears next to the user's current tier. If "core", move it to core row.

**If tier is "test" or "full":** Gate passes. Proceed to Step 2.

## Step 2: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -q "orqai" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Check if the REST API is reachable (the tester uses REST for datasets and evaluatorq manages its own API calls):

```bash
[ -n "$ORQ_API_KEY" ] && curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  https://api.orq.ai/v2/models
```

**If MCP unavailable AND ORQ_API_KEY is set AND API returns 200:** Set `mcp_available = false`. Display a note and continue to Step 3:

```
MCP server not available -- testing via REST API.
```

**If MCP unavailable AND (ORQ_API_KEY is empty OR API returns non-200):** Display V1.0 fallback and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST (V1.0 Fallback)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP server not available and no API key configured.

To test your agents manually:

1. Open Orq.ai Studio (https://studio.orq.ai)
2. Navigate to your deployed agent
3. For each test case in your datasets/:
   a. Copy the input from the dataset file
   b. Run the input against the agent in Studio playground
   c. Compare output against expected behavior
4. For evaluator-based testing:
   a. Create a dataset in Orq.ai from your dataset files
   b. Select evaluators matching your agent's domain
   c. Run batch evaluation and review results
5. Record pass/fail results for each test case

To enable autonomous testing, either:
  - Register the MCP server: claude mcp add orqai
  - Or set your API key: export ORQ_API_KEY="your-api-key-here"
```

STOP after displaying fallback instructions.

**If MCP_AVAILABLE:** Set `mcp_available = true`. Proceed to Step 3.

## Step 3: Locate Swarm Output

Parse the command argument and locate the swarm output directory.

**Command format:** `/orq-agent:test [--agent agent-key] [--all]`

- If `--agent agent-key` is provided: filter testing to that single agent
- If positional `agent-key` is provided (backward compatible): same as `--agent agent-key`
- If `--all` is provided: explicitly test all agents in the swarm (full swarm validation)
- If no flags and no positional argument: test all agents (default behavior, same as `--all`)

> **Note:** Per-agent test/iterate by default with `--agent`, `--all` flag for explicit full swarm validation. Both forms (positional and `--agent` flag) are supported for backward compatibility.

Find the most recent swarm output directory (same logic as deploy command):

```bash
find Agents/ -name "ORCHESTRATION.md" -type f 2>/dev/null
```

**If no ORCHESTRATION.md found:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST — No Swarm Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No swarm output found. Run /orq-agent first to generate agent specifications.

Expected: Agents/<swarm-name>/ORCHESTRATION.md
```

**If ORCHESTRATION.md found:** Use the most recently modified swarm directory. Read ORCHESTRATION.md to get the full agent list.

If `agent-key` was provided, verify the agent exists in the swarm:
- If found: filter to that single agent
- If not found: display error listing available agents and STOP

Display the test target summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Swarm: [swarm-name]
Testing: [N] agents ([list agent keys])
Channel: [MCP + REST | REST only]
```

Proceed to Step 4.

## Step 4: Pre-check Deployment

For each agent to test, verify that `orqai_id` exists in the agent spec file's YAML frontmatter (set by the deployer during Phase 6).

**If any target agent lacks `orqai_id`:** Display a clear error listing undeployed agents and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST — Agents Not Deployed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following agents are not deployed to Orq.ai:

  - {agent-key-1}
  - {agent-key-2}

Run /orq-agent:deploy first to deploy all agents before testing.
```

**If all agents have `orqai_id`:** Display pre-check success and proceed:

```
Pre-check: All {N} agents verified as deployed.
```

Proceed to Step 5.

## Step 5: Invoke Tester Subagent

Read the tester subagent instructions from `orq-agent/agents/tester.md`. Invoke the tester with:

- **Swarm directory path** (from Step 3)
- **Agent filter** (if single agent-key specified in the command)
- **MCP availability flag** (from Step 2)

The tester handles the entire 8-phase pipeline:
1. Pre-check deployment (Phase 1)
2. Parse V1.0 datasets (Phase 2)
3. Augment to minimum 30 examples (Phase 3)
4. Merge and split 60/20/20 (Phase 4)
5. Upload datasets to Orq.ai (Phase 5)
6. Infer roles and select evaluators (Phase 6)
7. Execute experiments 3x per agent (Phase 7)
8. Aggregate results and produce output (Phase 8)

Display summary progress during execution (LOCKED: summary progress, not per-run verbose):

```
Testing {N} agents... [####----] {completed}/{total} complete
```

Update the progress bar as each agent completes its 3 experiment runs.

Wait for the tester to complete and return results. Proceed to Step 6.

## Step 6: Display Results

Read `test-results.json` produced by the tester in the swarm output directory.

Display the terminal summary table (from the tester's Phase 8 output):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agent              | Role    | Score  | Status
-------------------|---------|--------|-------
{agent-key}        | struct  | 0.85   | PASS
{agent-key}        | conv    | 0.72   | FAIL

Overall: {passing}/{total} agents passing
Details: test-results.md | JSON: test-results.json
```

**If any agents failed:** Also display the worst-performing case summary:

```
Worst performer: {agent-key} -- {lowest-evaluator} scored {score} (threshold: {threshold})
```

## Step 7: Next Steps Guidance

Based on the test results, display appropriate guidance:

**If all agents pass:**
```
All agents passing. Ready for production or run /orq-agent:iterate for further optimization.
```

**If some agents fail:**
```
Failing agents detected. Run /orq-agent:iterate to analyze failures and improve prompts.
```

**If testing single agent:**
```
Single agent tested. Run /orq-agent:test without arguments to test all agents.
```
