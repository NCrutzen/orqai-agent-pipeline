---
description: Update Orq Agent Designer to the latest version from GitHub
allowed-tools: Bash, Read
---

# Update Orq Agent Designer

You are running the `/orq-agent:update` command. Check for updates and install the latest version from GitHub.

Follow these steps in order. Stop at any step that indicates a terminal condition.

## Step 1: Determine Install Location

Check if the install directory exists:

```bash
[ -d "$HOME/.claude/skills/orq-agent" ] && echo "FOUND: $HOME/.claude/skills/orq-agent" || echo "NOT_FOUND"
```

- If `FOUND`: set `INSTALL_DIR="$HOME/.claude/skills/orq-agent"` and proceed.
- If `NOT_FOUND`: display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Orq Agent Designer is not installed.

Install with:
  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

## Step 2: Read Local VERSION

Read the VERSION file from the install directory:

```bash
cat "$INSTALL_DIR/VERSION"
```

Store the result as `LOCAL_VERSION`. If the file does not exist, set `LOCAL_VERSION="unknown"`.

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

Fetch the remote CHANGELOG.md:

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

## Step 6: Run Install Script

Execute the install script which handles backup, download, and rollback on failure:

```bash
curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

## Step 7: Verify Update

Read the new VERSION file to confirm the update succeeded:

```bash
cat "$INSTALL_DIR/VERSION"
```

If the new version matches `REMOTE_VERSION`, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Updated to vREMOTE_VERSION
```

If the version did not change, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► UPDATE FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update may have failed -- version is still vLOCAL_VERSION.
The install script should have restored your previous installation.

Try again or reinstall manually:
  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```
