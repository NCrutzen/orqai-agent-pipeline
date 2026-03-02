---
description: Update Orq Agent Designer to the latest version from GitHub
allowed-tools: Bash, Read
---

# Update Orq Agent Designer

You are running the `/orq-agent:update` command. Check for updates and install the latest version from GitHub.

Follow these steps **exactly** in order. Do NOT skip steps, improvise, or add extra logic. Stop at any step that indicates a terminal condition.

## Step 1: Determine Install Location

```bash
[ -d "$HOME/.claude/skills/orq-agent" ] && echo "FOUND" || echo "NOT_FOUND"
```

- If `FOUND`: set `INSTALL_DIR="$HOME/.claude/skills/orq-agent"` and proceed.
- If `NOT_FOUND`: display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Orq Agent Designer is not installed.

Install with:
  curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

## Step 2: Read Local VERSION

```bash
cat "$HOME/.claude/skills/orq-agent/VERSION" 2>/dev/null || echo "unknown"
```

Store the result as `LOCAL_VERSION`.

## Step 3: Fetch Remote VERSION

```bash
curl -sf https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/VERSION
```

Store the result as `REMOTE_VERSION`. If the fetch fails, display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Could not reach GitHub to check for updates.
Check your network connection and try again.

Current version: vLOCAL_VERSION
```

## Step 4: Compare Versions

If `LOCAL_VERSION` equals `REMOTE_VERSION`, display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Already up to date (vLOCAL_VERSION)

To change tier or reconfigure API key/MCP:
  curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure
```

If versions differ, proceed to Step 5.

## Step 5: Show Changelog

```bash
curl -sf https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/CHANGELOG.md
```

If the fetch succeeds, display the changelog entries between `LOCAL_VERSION` and `REMOTE_VERSION`. Parse the changelog for version headers (lines starting with `## ` followed by a version number) and show only entries newer than `LOCAL_VERSION`.

If the fetch fails, display: "Changelog unavailable -- proceeding with update."

Display in the following format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update available: vLOCAL_VERSION --> vREMOTE_VERSION

Changes:
[changelog entries here]

Updating...
```

## Step 6: Download and Install

**IMPORTANT:** Do NOT run the install.sh script. It requires interactive terminal input that does not work inside Claude Code. Instead, perform the update directly:

```bash
TEMP_DIR=$(mktemp -d) && \
curl -sL "https://github.com/NCrutzen/orqai-agent-pipeline/archive/main.tar.gz" | tar xz -C "$TEMP_DIR" && \
echo "DOWNLOAD_OK" || echo "DOWNLOAD_FAILED"
```

If `DOWNLOAD_FAILED`, display an error and STOP.

If `DOWNLOAD_OK`, copy the files (preserving existing config):

```bash
INSTALL_DIR="$HOME/.claude/skills/orq-agent"
TEMP_DIR=$(ls -d /tmp/tmp.* 2>/dev/null | tail -1)
EXTRACTED="$TEMP_DIR/orqai-agent-pipeline-main"

# Backup existing config
cp "$INSTALL_DIR/.orq-agent/config.json" /tmp/orq-agent-config-backup.json 2>/dev/null

# Copy skill files
cp -r "$EXTRACTED/orq-agent/"* "$INSTALL_DIR/"

# Copy version tracking
cp "$EXTRACTED/VERSION" "$INSTALL_DIR/VERSION"
cp "$EXTRACTED/CHANGELOG.md" "$INSTALL_DIR/CHANGELOG.md"

# Copy commands for slash command discovery
mkdir -p "$HOME/.claude/commands/orq-agent"
cp "$EXTRACTED/orq-agent/commands/"*.md "$HOME/.claude/commands/orq-agent/"

# Restore config (preserves tier, API key, model profile)
cp /tmp/orq-agent-config-backup.json "$INSTALL_DIR/.orq-agent/config.json" 2>/dev/null

# Cleanup
rm -rf "$TEMP_DIR" /tmp/orq-agent-config-backup.json

echo "INSTALL_OK"
```

## Step 7: Verify Update

```bash
cat "$HOME/.claude/skills/orq-agent/VERSION" 2>/dev/null
```

If the new version matches `REMOTE_VERSION`, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Updated to vREMOTE_VERSION

Restart Claude Code to activate the new version.
```

If the version did not change, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update may have failed -- version is still vLOCAL_VERSION.

Try updating manually from your terminal:
  curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```
