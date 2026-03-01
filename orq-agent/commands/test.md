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

  curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
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
  curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
```

Note: The `[YOU]` marker appears next to the user's current tier. If "core", move it to core row.

**If tier is "test" or "full":** Gate passes. Proceed to Step 2.

## Step 2: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -q "orqai" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Display the following warning and fall back to V1.0 output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST (V1.0 Fallback)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP server not available. Falling back to V1.0 copy-paste output.

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

Re-enable autonomous testing by ensuring the Orq.ai MCP server is registered:
  claude mcp add orqai
```

STOP after displaying fallback instructions.

**If MCP_AVAILABLE:** Proceed to Step 3.

## Step 3: Test (Stub)

Phase 7 will implement testing logic here. For now, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test command ready. Implementation coming in Phase 7.
```
