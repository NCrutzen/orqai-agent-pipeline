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
  - Or re-run installer: curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure
```

STOP after displaying fallback instructions.

**If MCP_AVAILABLE:** Set `mcp_available = true`. Proceed to Step 3.

## Step 3: Locate Swarm Output

Parse the command argument and locate the swarm output directory.

**Command format:** `/orq-agent:test [--agent agent-key] [--all]`

- If `--agent agent-key` is provided: filter testing to that single agent
- If `--all` is provided: explicitly test all agents in the swarm (full swarm validation)
- If no flags: test all agents (default behavior, same as `--all`)

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

## Step 4: Clean Stale Pipeline Output

Before invoking any subagent, remove previous pipeline output files to prevent stale results from a prior run:

```bash
rm -f {swarm_dir}/dataset-prep.json {swarm_dir}/experiment-raw.json {swarm_dir}/test-results.json {swarm_dir}/test-results.md
```

Display: "Cleaning previous pipeline outputs..."

Proceed to Step 5.

## Step 5: Three-Phase Test Pipeline

### Step 5.1: Invoke Dataset Preparer

Display: `Phase 1/3: Preparing datasets...`

Read the subagent instructions from `orq-agent/agents/dataset-preparer.md`. Invoke the dataset-preparer subagent with the following context:

- **swarm_dir:** The swarm output directory path (from Step 3)
- **agent_key_filter:** The agent key to filter to, if `--agent` was specified (from Step 3)
- **mcp_available:** Whether MCP is available (from Step 2)
- **ORQ_API_KEY:** The API key (from Step 1.5)

The dataset-preparer will parse datasets, augment, split, upload, and write `dataset-prep.json` to the swarm directory.

### Step 5.2: Validate dataset-prep.json

After dataset-preparer completes, validate its output before proceeding:

1. **Check file exists:** Verify `{swarm_dir}/dataset-prep.json` exists on disk
2. **Check valid JSON:** Run `jq . {swarm_dir}/dataset-prep.json > /dev/null 2>&1`
3. **Check at least 1 ready agent:** Run `jq '[.agents | to_entries[] | select(.value.status == "ready")] | length' {swarm_dir}/dataset-prep.json` and verify the result is >= 1

**If any check fails:** Display ABORT message and STOP:

```
ABORT: Dataset preparation failed.

Expected: {swarm_dir}/dataset-prep.json
{Specific reason: "File not found" | "Invalid JSON" | "No agents with status ready"}

The test pipeline stopped before experiment execution.
Fix the upstream issue and re-run /orq-agent:test.
```

**If all checks pass:** Proceed to Step 5.3.

### Step 5.3: Invoke Experiment Runner

Display: `Phase 2/3: Running experiments...`

Read the subagent instructions from `orq-agent/agents/experiment-runner.md`. Invoke the experiment-runner subagent with the following context:

- **swarm_dir:** The swarm output directory path (from Step 3)
- **agent_key_filter:** The agent key to filter to, if `--agent` was specified (from Step 3)
- **ORQ_API_KEY:** The API key (from Step 1.5)

NOTE: Do NOT pass `mcp_available` to experiment-runner. It is REST-only for all experiment operations (LOCKED P27 decision).

The experiment-runner will create experiments, execute triple runs, and write `experiment-raw.json` to the swarm directory.

### Step 5.4: Validate experiment-raw.json

After experiment-runner completes, validate its output before proceeding:

1. **Check file exists:** Verify `{swarm_dir}/experiment-raw.json` exists on disk
2. **Check valid JSON:** Run `jq . {swarm_dir}/experiment-raw.json > /dev/null 2>&1`
3. **Check at least 1 complete/partial agent:** Run `jq '[.agents | to_entries[] | select(.value.status == "complete" or .value.status == "partial")] | length' {swarm_dir}/experiment-raw.json` and verify the result is >= 1

**If any check fails:** Display ABORT message and STOP:

```
ABORT: Experiment execution failed.

Expected: {swarm_dir}/experiment-raw.json
{Specific reason: "File not found" | "Invalid JSON" | "No agents with status complete or partial"}

The test pipeline stopped before results analysis.
Fix the upstream issue and re-run /orq-agent:test.
```

**If all checks pass:** Proceed to Step 5.5.

### Step 5.5: Invoke Results Analyzer

Display: `Phase 3/3: Analyzing results...`

Read the subagent instructions from `orq-agent/agents/results-analyzer.md`. Invoke the results-analyzer subagent with the following context:

- **swarm_dir:** The swarm output directory path (from Step 3)

NOTE: No agent-key filter is needed -- results-analyzer processes all agents present in experiment-raw.json (pre-filtered by upstream steps). Do NOT pass `mcp_available` -- results-analyzer makes no API calls.

The results-analyzer will compute statistical aggregation, determine pass/fail, and write `test-results.json` and `test-results.md` to the swarm directory.

### Step 5.6: Validate test-results.json

After results-analyzer completes, validate its output before proceeding:

1. **Check file exists:** Verify `{swarm_dir}/test-results.json` exists on disk
2. **Check valid JSON:** Run `jq . {swarm_dir}/test-results.json > /dev/null 2>&1`
3. **Check results.overall_pass exists:** Run `jq '.results.overall_pass' {swarm_dir}/test-results.json` and verify the result is not `null`

**If any check fails:** Display ABORT message and STOP:

```
ABORT: Results analysis failed.

Expected: {swarm_dir}/test-results.json
{Specific reason: "File not found" | "Invalid JSON" | "Missing results.overall_pass field"}

The test pipeline stopped before results display.
Fix the upstream issue and re-run /orq-agent:test.
```

**If all checks pass:** Proceed to Step 6.

## Step 6: Display Results

Read `test-results.json` produced by the results-analyzer in the swarm output directory.

Display the terminal summary table:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
