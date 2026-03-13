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

## Step 1.5: Load API Key

The API key is stored in config.json (set during install). Extract it:

```bash
node -e "try{const c=JSON.parse(require('fs').readFileSync('$HOME/.claude/skills/orq-agent/.orq-agent/config.json','utf8'));console.log(c.orq_api_key||'')}catch(e){console.log('')}"
```

Store the result as `ORQ_API_KEY`. If empty, also check the environment variable `$ORQ_API_KEY` as fallback.

**If both are empty:** Display an error directing the user to run `curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure` and STOP.

**If API key found:** Export it for use in subsequent bash commands: `export ORQ_API_KEY="<value>"`

## Step 2: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -qi "orq" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Check if the REST API is reachable (the subagents delegate to deployer and tester which both support REST-only mode):

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
  - Or re-run installer: curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure
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

**If `false`:** Display the iteration target summary and proceed to Step 5:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Swarm: {swarm-name}
Failing: {N} of {M} agents
Channel: [MCP + REST | REST only]
```

### Step 4.1: Snapshot Initial Bottleneck Scores

Before any iteration begins, snapshot bottleneck scores from `test-results.json` for later comparison in Step 6.

For each agent in `results.per_agent[]`:
- Compute the bottleneck score: the **lowest evaluator median** across all evaluators for that agent (i.e., `Math.min(...agent.scores.map(s => s.median))`)
- Store as `initial_scores` map: `{agent_key: bottleneck_score}`

These are the "Before" values displayed in Step 6.

### Step 4.2: Clean Stale Artifacts

Remove stale handoff files from any previous iteration run:

```bash
rm -f {swarm_dir}/iteration-proposals.json
```

Do NOT clean `iteration-log.md` or `audit-trail.md` -- these are append-only cumulative files written by prompt-editor.

## Step 5: Iteration Loop

Initialize loop state:
- `iteration = 0`
- `start_time = current timestamp`
- `previous_scores = initial_scores` (from Step 4.1 snapshot)
- `stop_reason = null`

### Step 5.1: Loop Start

Increment iteration counter: `iteration += 1`

**Stop check -- max_iterations:** If `iteration > 3`, set `stop_reason = "max_iterations"` and exit loop to Step 6.

**Stop check -- timeout:** If elapsed time since `start_time` > 10 minutes, set `stop_reason = "timeout"` and exit loop to Step 6.

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > ITERATE -- Iteration {iteration} of 3 (max)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 5.2: Invoke Failure Diagnoser

Read subagent instructions from `orq-agent/agents/failure-diagnoser.md`. Invoke with:
- **swarm_dir** (from Step 3)
- **iteration_number** (current iteration count)
- **agent_key_filter** (if `--agent` was specified in Step 3)

Let the failure-diagnoser's terminal output flow through. It will write `{swarm_dir}/iteration-proposals.json` when complete.

### Step 5.3: Validate Iteration Proposals

Check `{swarm_dir}/iteration-proposals.json`:

1. **File exists:** Verify the file was created
2. **Valid JSON:** `jq . {swarm_dir}/iteration-proposals.json > /dev/null 2>&1`
3. **Has per_agent array:** `jq '.per_agent | length' {swarm_dir}/iteration-proposals.json`
4. **Count approved agents:** `jq '[.per_agent[] | select(.approval == "approved")] | length' {swarm_dir}/iteration-proposals.json`

**If any of checks 1-3 fail:** Display ABORT message and STOP (fatal error):
```
ABORT: Failure diagnosis failed.

Expected: {swarm_dir}/iteration-proposals.json
{Specific reason: "File not found" | "Invalid JSON" | "Missing per_agent array"}

The iteration pipeline stopped. Fix the upstream issue and re-run /orq-agent:iterate.
```

**If check 4 returns zero approved agents:** Set `stop_reason = "user_declined"` and exit loop to Step 6. This is NOT a fatal error -- the user chose to reject all proposals.

**Stop check -- timeout:** If elapsed time since `start_time` > 10 minutes, set `stop_reason = "timeout"` and exit loop to Step 6.

### Step 5.4: Invoke Prompt Editor

Snapshot current bottleneck scores from `{swarm_dir}/test-results.json` as `before_cycle_scores` (these will be compared against updated scores after this cycle for the min_improvement check).

Read subagent instructions from `orq-agent/agents/prompt-editor.md`. Invoke with:
- **swarm_dir** (from Step 3)
- **iteration_number** (current iteration count)

Let the prompt-editor's terminal output flow through. It will: apply approved changes to spec files, re-deploy via deployer, re-test on holdout split via experiment-runner, compute before/after comparison, update `test-results.json` with new scores, and append to `iteration-log.md` and `audit-trail.md`.

### Step 5.5: Evaluate Post-Cycle Stop Conditions

Read updated `{swarm_dir}/test-results.json`.

**Stop check -- all_pass:** If `results.overall_pass == true`, set `stop_reason = "all_pass"` and exit loop to Step 6.

**Stop check -- min_improvement:**
For each agent that was approved in this cycle's `iteration-proposals.json`:
  - Get new bottleneck score from updated `test-results.json`
  - Get previous bottleneck score from `before_cycle_scores`
  - Compute delta: `((new - previous) / previous) * 100`

Compute average delta across all changed agents.
If average delta < 5%: set `stop_reason = "min_improvement"` and exit loop to Step 6.

Update `previous_scores` with current scores from updated `test-results.json`.

### Step 5.6: Continue Loop

Clean stale proposals before next cycle:
```bash
rm -f {swarm_dir}/iteration-proposals.json
```

Go to Step 5.1.

## Step 6: Display Iteration Results

After the loop exits (any `stop_reason`), display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > ITERATE -- Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iterations: {iteration}
Stopped: {stop_reason_display}

Agent              | Before | After  | Delta   | Status
-------------------|--------|--------|---------|--------
{agent-key}        | {initial_bottleneck} | {final_bottleneck} | {total_delta}%  | improved/unchanged/regressed
```

**Before column:** From `initial_scores` (Step 4.1 snapshot -- the scores from BEFORE any iteration).

**After column:** From final `test-results.json` after last completed cycle.

**Delta column:** Total improvement across all iterations: `((after - before) / before) * 100`.

**Status column:** `improved` if delta > 0, `unchanged` if delta == 0, `regressed` if delta < 0.

**Stop reason display (plain language):**
- `all_pass`: "All agents now passing evaluators."
- `max_iterations`: "Maximum iterations (3) reached."
- `min_improvement`: "Improvement below 5% threshold."
- `user_declined`: "User declined proposed changes."
- `timeout`: "10-minute timeout reached."

Display log file paths:
```
Files: iteration-log.md | audit-trail.md
```

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
