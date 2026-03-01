---
description: View or change the model profile (quality/balanced/budget)
allowed-tools: Read, Bash
argument-hint: [quality|balanced|budget]
---

# Model Profile Management

You are running the `/orq-agent:set-profile` command. This command views or changes the active model profile.

Follow these steps in order.

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

  curl -sfL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
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
