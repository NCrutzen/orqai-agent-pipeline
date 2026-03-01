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

  curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
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
  curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
```

**If tier is "deploy", "test", or "full":** Gate passes. Proceed to Step 2.

## Step 2: MCP Availability Check

Attempt a lightweight MCP operation to verify MCP server availability:

```bash
claude mcp list 2>/dev/null | grep -q "orqai" && echo "MCP_AVAILABLE" || echo "MCP_UNAVAILABLE"
```

**If MCP_UNAVAILABLE:** Display the following warning and fall back to V1.0 output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY (V1.0 Fallback)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP server not available. Falling back to V1.0 copy-paste output.

To deploy your agents manually:

1. Open Orq.ai Studio (https://studio.orq.ai)
2. Navigate to Agents > Create Agent
3. For each agent spec in your output directory:
   a. Copy the agent key, model, and system prompt
   b. Configure tools as specified in TOOLS.md
   c. Set up knowledge bases if referenced
4. For multi-agent swarms:
   a. Configure agent-as-tool assignments per ORCHESTRATION.md
   b. Verify data flow between agents
5. Test with sample inputs from your datasets/

Re-enable autonomous deploy by ensuring the Orq.ai MCP server is registered:
  claude mcp add orqai
```

STOP after displaying fallback instructions.

**If MCP_AVAILABLE:** Proceed to Step 3.

## Step 3: Deploy (Stub)

Phase 6 will implement deployment logic here. For now, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► DEPLOY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Deploy command ready. Implementation coming in Phase 6.
```
