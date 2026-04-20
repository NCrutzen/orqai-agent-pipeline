---
description: View or change the model profile (quality/balanced/budget)
allowed-tools: Read, Bash
argument-hint: [quality|balanced|budget]
---

# Model Profile Management

You are running the `/orq-agent:set-profile` command. This command views or changes the active model profile.

Follow these steps in order.

## Constraints

- **NEVER** overwrite `.orq-agent/config.json` without `AskUserQuestion` confirmation.
- **NEVER** accept a profile that doesn't exist in the documented set (`quality`, `balanced`, `budget`).
- **ALWAYS** confirm the target profile before writing.
- **ALWAYS** print the resulting profile contents after write.

**Why these constraints:** Profile changes gate which commands are available; silent changes confuse users who invoke a command expecting an older profile's tooling.

## When to use

- User wants to view the current model profile and the per-agent model table.
- User wants to switch to a different cost/quality tradeoff profile.
- User is preparing a batch run and wants to lower cost ahead of time.

## When NOT to use

- User wants to change the install tier (core / deploy / test / full) → re-run the installer with `--reconfigure`.
- User wants to change a per-agent model for a specific spec → edit the agent spec file directly.
- User wants to change the API key → re-run the installer.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- No subagent — this command edits `.orq-agent/config.json` directly.
- ← read by every command via `orq-agent/SKILL.md` context (profile dictates which models each subagent uses)
- ← user invocation — local-only config edit

## Done When

- [ ] No-arg: current profile displayed + comparison table shown
- [ ] Argument mode: `config.json` updated in place with the new `model_profile` value
- [ ] Terminal shows `OLD_PROFILE --> NEW_PROFILE`
- [ ] Invalid profile: clear error + valid profile list printed; config unchanged

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- **Overwrite `.orq-agent/config.json`** — destructive to any uncommitted local edits in the config; confirm before writing the new `model_profile` field.

## Step 1: Read Current Config

Read the config file:

```bash
cat "$HOME/.claude/skills/orq-agent/.orq-agent/config.json" 2>/dev/null || echo "CONFIG_NOT_FOUND"
```

**If CONFIG_NOT_FOUND:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SET-PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install required. Run the orq-agent install script first.

  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If config exists:** Extract the current `model_profile` value. Proceed to Step 2.

## Step 2: Parse Arguments

Check if `$ARGUMENTS` contains a profile name: `quality`, `balanced`, or `budget`.

**If no argument (or empty):** Display the current profile and comparison table, then STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► MODEL PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current profile: [current_profile]

Model Profiles:

  | Agent              | quality | balanced | budget |
  |--------------------|---------|----------|--------|
  | architect          | opus    | opus     | sonnet |
  | spec-generator     | opus    | opus     | sonnet |
  | researcher         | opus    | sonnet   | haiku  |
  | tool-resolver      | opus    | sonnet   | sonnet |
  | orch-generator     | opus    | sonnet   | sonnet |
  | dataset-generator  | opus    | sonnet   | haiku  |
  | readme-generator   | sonnet  | sonnet   | haiku  |
  | deployer (Phase 6) | opus    | sonnet   | sonnet |
  | tester (Phase 7)   | opus    | sonnet   | sonnet |
  | iterator (Phase 8) | opus    | opus     | sonnet |

Usage:
  /orq-agent:set-profile quality     Best output (default)
  /orq-agent:set-profile balanced    Good output, lower cost
  /orq-agent:set-profile budget      Fastest, lowest cost
```

**If argument is "quality", "balanced", or "budget":** Proceed to Step 3.

**If argument is anything else:** Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SET-PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unknown profile: "[argument]"

Valid profiles: quality, balanced, budget
```

STOP.

## Step 3: Update Profile

Update the `model_profile` field in the config file:

```bash
node -e "
const fs = require('fs');
const configPath = process.env.HOME + '/.claude/skills/orq-agent/.orq-agent/config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.model_profile = '[NEW_PROFILE]';
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('UPDATED');
"
```

Replace `[NEW_PROFILE]` with the argument value.

**If UPDATED:** Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SET-PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Profile updated: [OLD_PROFILE] --> [NEW_PROFILE]
```

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Switching profile mid-swarm generation | Finish the current run; profile change takes effect on next invocation |
| Editing `config.json` by hand | Use this command — JSON edits bypass validation and confirmation |
| Picking `budget` for a production-bound swarm | Budget is tuned for exploration; production swarms should stay on `quality` or `balanced` |
| Assuming profile affects already-deployed agents | Profile only changes which models downstream generator subagents pick; already-deployed agents are unchanged |

## Open in orq.ai

- **N/A** — this skill manages local configuration only (no Orq.ai entities involved)

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
