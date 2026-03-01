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

  curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
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
  curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
```

Note: The `[YOU]` marker appears next to the user's current tier.

**If tier is "full":** Gate passes. Proceed to Step 2.

## Step 2: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -q "orqai" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Display the following warning and fall back to V1.0 output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE (V1.0 Fallback)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP server not available. Falling back to V1.0 copy-paste output.

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

Re-enable autonomous iteration by ensuring the Orq.ai MCP server is registered:
  claude mcp add orqai
```

STOP after displaying fallback instructions.

**If MCP_AVAILABLE:** Proceed to Step 3.

## Step 3: Iterate (Stub)

Phase 8 will implement iteration logic here. For now, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ITERATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iterate command ready. Implementation coming in Phase 8.
```
