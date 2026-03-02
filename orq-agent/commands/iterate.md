---
description: Iterate on agent prompts based on test results (requires full tier)
allowed-tools: Read, Bash
---

# Prompt Iteration

You are running the `/orq-agent:iterate` command. This command iterates on agent prompts using test results and evaluator feedback.

Follow these steps in order. Stop at any step that indicates a terminal condition.

## Step 1: Capability Gate

Read the config file to check the user's capability tier:

```bash
cat "$HOME/.claude/skills/orq-agent/.orq-agent/config.json" 2>/dev/null || echo "CONFIG_NOT_FOUND"
```

**If CONFIG_NOT_FOUND:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE
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
 ORQ ► ITERATE — Upgrade Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The iterate command requires the "full" tier.

  | Tier   | Capabilities                                  |
  |--------|-----------------------------------------------|
  | core   | Spec generation (/orq-agent)                   |
  | deploy | + Deployment (/orq-agent:deploy)               |
  | test   | + Automated testing (/orq-agent:test)    [YOU] |
  | full   | + Prompt iteration (/orq-agent:iterate)        |

To upgrade, re-run the install script and select a higher tier:
  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

Note: The `[YOU]` marker appears next to the user's current tier.

**If tier is "full":** Gate passes. Proceed to Step 2.

## Step 2: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -q "orqai" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Check if the REST API is reachable (the iterator delegates to deployer and tester which both support REST-only mode):

```bash
[ -n "$ORQ_API_KEY" ] && curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  https://api.orq.ai/v2/models
```

**If MCP unavailable AND ORQ_API_KEY is set AND API returns 200:** Set `mcp_available = false`. Display a note and continue to Step 3:

```
MCP server not available -- iterating via REST API.
```

**If MCP unavailable AND (ORQ_API_KEY is empty OR API returns non-200):** Display V1.0 fallback and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE (V1.0 Fallback)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP server not available and no API key configured.

To iterate on your agent prompts manually:

1. Review test results from your last /orq-agent:test run
2. Identify failing test cases and low-scoring evaluators
3. For each underperforming agent:
   a. Analyze failure patterns (missing context, wrong tone, hallucination)
   b. Update the system prompt in the agent spec
   c. Add or refine guardrails for identified failure modes
   d. Re-run affected test cases in Orq.ai Studio playground
4. Update your local spec files with the improved prompts
5. Re-deploy with /orq-agent:deploy (or manually via Studio)
6. Re-test to verify improvements

To enable autonomous iteration, either:
  - Register the MCP server: claude mcp add orqai
  - Or set your API key: export ORQ_API_KEY="your-api-key-here"
```

STOP after displaying fallback instructions.

**If MCP_AVAILABLE:** Set `mcp_available = true`. Proceed to Step 3.

## Step 3: Locate Swarm Output

Parse the command argument and locate the swarm output directory.

**Command format:** `/orq-agent:iterate [--agent agent-key] [--all]`

- If `--agent agent-key` is provided: filter iteration to that single agent
- If `--all` is provided: explicitly iterate on all failing agents in the swarm (full swarm validation)
- If no flags: iterate on all failing agents (default behavior, same as `--all`)

Find the most recent swarm output directory (same logic as deploy and test commands):

```bash
find Agents/ -name "ORCHESTRATION.md" -type f 2>/dev/null
```

**If no ORCHESTRATION.md found:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE — No Swarm Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No swarm output found. Run /orq-agent first to generate agent specifications.

Expected: Agents/<swarm-name>/ORCHESTRATION.md
```

**If multiple ORCHESTRATION.md files found:** List available swarms and ask the user to specify which one:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE — Multiple Swarms Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Multiple swarm outputs found:

  1. Agents/{swarm-name-1}/
  2. Agents/{swarm-name-2}/

Which swarm would you like to iterate on? [1/2]
```

**If single ORCHESTRATION.md found:** Use that swarm directory. Read ORCHESTRATION.md to get the agent list.

If `agent-key` was provided, verify the agent exists in the swarm:
- If found: filter to that single agent
- If not found: display error listing available agents and STOP

Proceed to Step 4.

## Step 4: Pre-check Test Results

Look for `test-results.json` in the swarm directory.

**If NOT found:** Display error and suggest running `/orq-agent:test` first:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE — Test Results Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No test results found in {swarm-directory}.

Run /orq-agent:test first to generate test results:
  /orq-agent:test
```

STOP after displaying message.

**If found:** Read `test-results.json` and check `results.overall_pass`:

**If `true` (all agents passing):** Display success message and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE — All Agents Passing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All {N} agents are passing their evaluators. No iteration needed.

Agents: {agent-key-1} ({score}), {agent-key-2} ({score}), ...

Ready for production or run /orq-agent:test to re-validate.
```

**If `false`:** Proceed to Step 5. Display the iteration target summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Swarm: {swarm-name}
Failing: {N} of {M} agents
Channel: [MCP + REST | REST only]
```

## Step 5: Invoke Iterator Subagent

Read the iterator subagent instructions from `orq-agent/agents/iterator.md`. Invoke the iterator with:

- **Swarm directory path** (from Step 3)
- **Path to test-results.json** (from Step 4)
- **Agent filter** (if single agent-key specified in the command)
- **MCP availability flag** (from Step 2)

The iterator handles the entire 9-phase pipeline:
1. Read test results and identify failing agents (Phase 1)
2. Diagnose failure patterns (Phase 2)
3. Propose section-level prompt changes (Phase 3)
4. Collect per-agent approval -- interactive (Phase 4)
5. Apply approved changes to local spec files (Phase 5)
6. Re-deploy changed agents via deployer subagent (Phase 6)
7. Re-test changed agents on holdout split via tester subagent (Phase 7)
8. Iteration loop control with stop conditions (Phase 8)
9. Logging and audit trail (Phase 9)

Display progress at each phase:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE — Iteration {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analyzing {N} failing agents...
[iterator presents diagnosis and proposals per agent]
[user approves/rejects per agent]
Applying changes...
Re-deploying {N} agents...
Re-testing on holdout split...
```

Wait for the iterator to complete (or stop on any condition). Proceed to Step 6.

## Step 6: Display Iteration Results

After the iterator completes, display a summary of all iterations:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE — Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iterations: {N}
Stopped: {reason}

Agent              | Before | After  | Delta   | Status
-------------------|--------|--------|---------|--------
{agent-key}        | 0.60   | 0.78   | +30.0%  | improved
{agent-key}        | 0.45   | 0.48   | +6.7%   | improved

Files: iteration-log.md | audit-trail.md
```

**Stopping reason display (plain language):**
- `all_pass`: "All agents now passing evaluators."
- `max_iterations`: "Maximum iterations (3) reached."
- `min_improvement`: "Improvement below 5% threshold."
- `user_declined`: "User declined proposed changes."
- `timeout`: "10-minute timeout reached."

**Before/After columns:** Show the bottleneck score (lowest evaluator median) for each agent. Before is from the initial `test-results.json`, After is from the final re-test on holdout split.

**Delta column:** Percentage change in bottleneck score: `((after - before) / before) * 100`.

**Status column:** `improved` if delta > 0, `unchanged` if delta == 0, `regressed` if delta < 0.

## Step 7: Next Steps Guidance

Based on the iteration outcome, display appropriate guidance:

**If all agents now pass:**
```
All agents passing. Ready for production deployment or run /orq-agent:test to re-validate with full test split.
```

**If some agents still fail:**
```
Some agents still failing. You can:
  1. Run /orq-agent:iterate again for another round of improvements
  2. Manually edit agent specs in the swarm directory
  3. Proceed with current state

Review iteration-log.md for detailed diagnosis and change history.
```

**If user declined all changes:**
```
No changes applied. Review the diagnosis in iteration-log.md for manual improvement ideas.
```

**If stopped by max iterations or timeout:**
```
Iteration limit reached. Review iteration-log.md for progress so far.
Run /orq-agent:iterate again to continue improving from current state.
```
