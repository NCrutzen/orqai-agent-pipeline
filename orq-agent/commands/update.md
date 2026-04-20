---
description: Update Orq Agent Designer to the latest version from GitHub
allowed-tools: Bash, Read
---

# Update Orq Agent Designer

You are running the `/orq-agent:update` command. Check for updates and install the latest version from GitHub.

Follow these steps **exactly** in order. Do NOT skip steps, improvise, or add extra logic. Stop at any step that indicates a terminal condition.

## Constraints

- **NEVER** overwrite local skill edits without `AskUserQuestion` confirmation showing the diff.
- **NEVER** update when there are uncommitted changes in `orq-agent/`.
- **ALWAYS** show a summary of files to be overwritten before proceeding.
- **ALWAYS** print the GitHub commit/tag being pulled.

**Why these constraints:** Users often make local skill edits for their deployment — silent overwrite loses that work. Confirming keeps the safety rail.

## When to use

- User wants to check for a newer version of the skill pack.
- User wants to install the latest version when one is available.
- User has been prompted by another command that a new version exists.

## When NOT to use

- User only wants to reconfigure tier / API key → re-run the installer with `--reconfigure` flag (shown in the help output).
- User has uncommitted local skill edits they want to keep → commit or stash first; this command overwrites.
- User wants to pin to a specific version → this command always pulls `main`; use git directly for version pinning.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- No subagent — this command shells out to `curl` + `tar` directly.
- Meta-command — no pipeline linkage. Not invoked by any other command.
- ← user invocation — run periodically or after a changelog mention.

## Done When

- [ ] Up-to-date path: "Already up to date" message displayed; no files changed
- [ ] Update path: new VERSION on disk matches `REMOTE_VERSION` and message says "Updated to v…"
- [ ] Config preserved: `.orq-agent/config.json` still contains the pre-update tier, API key, and model_profile values
- [ ] Slash command files refreshed under `~/.claude/commands/orq-agent/`

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- **Overwrite local skill files with GitHub versions** — destructive to any uncommitted local edits under `orq-agent/`; confirm before proceeding with the download + copy step.
- **Overwrite slash command files under `~/.claude/commands/orq-agent/`** — refreshes command discovery files; confirm before overwriting.

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

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Updating without reading the changelog | Always surface the changelog entries between local and remote before proceeding |
| Running the interactive `install.sh` from inside Claude Code | Use this command's direct download path; install.sh requires a real TTY |
| Overwriting local skill edits without backup | Commit or stash local edits first; this command will not preserve them |
| Assuming config is auto-preserved after update | The command explicitly backs up + restores `.orq-agent/config.json`; verify after update |

## Open in orq.ai

- **N/A** — this skill manages local configuration only (no Orq.ai entities involved)

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
