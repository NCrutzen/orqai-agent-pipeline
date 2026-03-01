# Phase 4: Distribution - Research

**Researched:** 2026-02-24
**Domain:** Claude Code plugin packaging, distribution, and installation
**Confidence:** HIGH

## Summary

Phase 4 packages the existing `orq-agent/` skill directory as an installable Claude Code plugin that non-technical colleagues can install, update, and use from a GitHub repository. The Claude Code plugin system (as of early 2026) provides a native mechanism for exactly this: a `.claude-plugin/plugin.json` manifest combined with a marketplace definition enables one-command installation via `/plugin install`.

The user's decision to use a `curl` one-liner install script is achievable but represents a custom layer on top of the native plugin system. The recommended approach is to support both: a `curl` script for maximum simplicity (the user's locked decision) that internally sets up the plugin via the standard mechanism, plus native `/plugin install` as an alternative for users who already know Claude Code.

The total skill size is ~185KB across 16 files. The Claude Code skill description budget defaults to 15,000 characters (configurable via `SLASH_COMMAND_TOOL_CHAR_BUDGET`), but this only applies to the description/SKILL.md loaded into context -- supporting files (agents, templates, references) load on-demand when referenced. The current SKILL.md is ~5.4KB, well within budget.

**Primary recommendation:** Package `orq-agent/` as a Claude Code plugin with marketplace support, wrap in a `curl` install script for the non-technical install experience, and add an `/orq-agent:update` command that leverages the plugin system's built-in update mechanism.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Install experience:** curl one-liner install: `curl https://...install.sh | bash`
- Installs to `~/.claude/commands/` so `/orq-agent` is available as a native Claude Code slash command
- Script checks prerequisites (Node.js, Claude Code) and shows clear error messages if missing
- Post-install shows quick-start guide with 2-3 example commands the user can try immediately
- **Update mechanism:** `/orq-agent:update` re-runs the install script (re-downloads and overwrites from GitHub)
- Checks local vs remote version before downloading -- skips if already up to date
- Shows changelog of what changed since user's last version
- Auto-rollback on failure: backs up current files before update, restores on error
- **Skill structure:** Multi-file modular layout (commands/, subagents/, references/, templates/) under `~/.claude/`
- Clean install every time -- always overwrite, no preservation of user customizations
- **GSD integration:** Explicit `--gsd` flag to enable GSD integration (no auto-detection)
- Standalone output defaults to `./Agents/` with `--output` flag to override
- Built-in `/orq-agent:help` command showing available commands, usage examples, and current version

### Claude's Discretion
- Whether to bundle GSD subagent types or only orq-agent specific ones
- Character budget strategy (lazy loading vs consolidation) based on actual Claude Code limits and file sizes
- Output location when `--gsd` flag is active (project directory vs phase directory)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIST-01 | Installable as Claude Code slash command `/orq-agent` via GitHub repo | Plugin system supports this natively; curl script provides simplified install; plugin.json + marketplace.json enables `/plugin install` path |
| DIST-02 | Simple install process achievable by non-technical employees | curl one-liner downloads and places files; prerequisite checks for Node.js and Claude Code; clear error messages; post-install quick-start guide |
| DIST-03 | `/orq-agent:update` command pulls latest version from GitHub | Version file enables local/remote comparison; update command re-downloads from GitHub raw or uses plugin marketplace update; rollback via backup |
| DIST-04 | Integrates with GSD workflow -- callable standalone or from within a GSD phase | `--gsd` flag parsed from `$ARGUMENTS`; output path logic switches between `./Agents/` (standalone) and project directory (GSD); skill is invocable by both user and Claude |
</phase_requirements>

## Standard Stack

### Core

| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| Claude Code Plugin System | Native extension packaging format | Official Anthropic mechanism for distributing skills, agents, hooks; supports `/plugin install` |
| `.claude-plugin/plugin.json` | Plugin manifest | Required metadata file; defines name, version, description, author |
| `marketplace.json` | Plugin catalog | Enables discovery and installation via `/plugin marketplace add` |
| Bash install script | curl one-liner entry point | User's locked decision; universal on macOS/Linux; no runtime dependencies |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `VERSION` file | Track installed version | Local version comparison for update skip-if-current logic |
| `CHANGELOG.md` | Track changes between versions | Displayed during `/orq-agent:update` to show what changed |
| GitHub raw URLs | File download source | `curl` downloads from `raw.githubusercontent.com` for install script |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| curl install script | Native `/plugin install` only | Plugin system requires users to know Claude Code commands; curl is simpler for non-technical users |
| GitHub raw downloads | npm package | Would add npm as a dependency; curl + GitHub is zero-dependency |
| Custom update command | Plugin auto-update | Plugin auto-update is marketplace-level; custom command gives more control over UX (changelog display, rollback) |

## Architecture Patterns

### Recommended Plugin Structure

```
orq-agent-plugin/                    # GitHub repository root
├── .claude-plugin/
│   ├── plugin.json                  # Plugin manifest
│   └── marketplace.json             # Self-hosted marketplace catalog
├── skills/
│   └── orq-agent/
│       ├── SKILL.md                 # Main skill index (current orq-agent/SKILL.md)
│       ├── commands/
│       │   └── orq-agent.md         # Main orchestrator command
│       ├── agents/
│       │   ├── architect.md
│       │   ├── researcher.md
│       │   ├── spec-generator.md
│       │   ├── orchestration-generator.md
│       │   ├── dataset-generator.md
│       │   └── readme-generator.md
│       ├── references/
│       │   ├── orqai-agent-fields.md
│       │   ├── orqai-model-catalog.md
│       │   ├── orchestration-patterns.md
│       │   └── naming-conventions.md
│       └── templates/
│           ├── agent-spec.md
│           ├── dataset.md
│           ├── orchestration.md
│           └── readme.md
├── commands/                         # Plugin-level commands
│   ├── orq-agent.md                 # Alias/redirect to skill
│   ├── update.md                    # /orq-agent:update command
│   └── help.md                      # /orq-agent:help command
├── install.sh                       # curl one-liner entry point
├── VERSION                          # Semantic version string
├── CHANGELOG.md                     # Version history
└── README.md                        # GitHub repo documentation
```

**Key insight:** The plugin system supports two command mechanisms:
1. **`commands/` directory** at plugin root -- creates `/plugin-name:command-name` namespaced commands
2. **`skills/` directory** at plugin root -- creates `/plugin-name:skill-name` skills with supporting files

The main `/orq-agent` command should be a skill (not just a command) because it needs supporting files (agents, templates, references). The `update` and `help` commands can be simple command files.

### Pattern 1: Dual Install Path

**What:** Support both `curl` script and native `/plugin install`
**When to use:** When target audience includes non-technical users who may not know Claude Code plugin commands

The curl script:
1. Checks prerequisites (Node.js >= 18, Claude Code installed)
2. Downloads the plugin repository as a tarball or clones to temp directory
3. Copies to `~/.claude/plugins/` cache or uses `/plugin marketplace add` + `/plugin install`
4. Displays quick-start guide

```bash
# Source: design pattern for non-technical install
#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Installing Orq Agent Designer..."

# Check prerequisites
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is required but not installed.${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo -e "${RED}Error: Claude Code is required but not installed.${NC}"
    echo "Install with: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

# Version check
INSTALL_DIR="$HOME/.claude/plugins/orq-agent-plugin"
VERSION_URL="https://raw.githubusercontent.com/OWNER/REPO/main/VERSION"
REMOTE_VERSION=$(curl -sf "$VERSION_URL" || echo "unknown")

if [ -f "$INSTALL_DIR/VERSION" ]; then
    LOCAL_VERSION=$(cat "$INSTALL_DIR/VERSION")
    if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
        echo -e "${GREEN}Already up to date (v${LOCAL_VERSION})${NC}"
        exit 0
    fi
fi

# Backup existing installation for rollback
if [ -d "$INSTALL_DIR" ]; then
    BACKUP_DIR="$INSTALL_DIR.backup"
    cp -r "$INSTALL_DIR" "$BACKUP_DIR"
fi

# Download and install
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"; [ -d "${BACKUP_DIR:-}" ] && rm -rf "$BACKUP_DIR"' EXIT

curl -sL "https://github.com/OWNER/REPO/archive/main.tar.gz" | tar xz -C "$TEMP_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$TEMP_DIR"/REPO-main/* "$INSTALL_DIR/"

# Verify installation
if [ ! -f "$INSTALL_DIR/.claude-plugin/plugin.json" ]; then
    echo -e "${RED}Installation failed -- restoring backup${NC}"
    if [ -d "${BACKUP_DIR:-}" ]; then
        rm -rf "$INSTALL_DIR"
        mv "$BACKUP_DIR" "$INSTALL_DIR"
    fi
    exit 1
fi

# Clean up backup on success
rm -rf "${BACKUP_DIR:-}"

echo -e "${GREEN}Orq Agent Designer v${REMOTE_VERSION} installed successfully!${NC}"
echo ""
echo "Quick start:"
echo "  /orq-agent \"Build a customer support system\""
echo "  /orq-agent:help"
echo "  /orq-agent:update"
```

### Pattern 2: Version-Aware Update Command

**What:** `/orq-agent:update` checks remote version, shows changelog, backs up, and updates
**When to use:** Always -- this is the locked decision for update mechanism

```yaml
---
name: update
description: Update Orq Agent Designer to the latest version from GitHub
disable-model-invocation: true
allowed-tools: Bash, Read, Write
---

# Update Orq Agent Designer

Check for updates and install the latest version.

## Steps

1. Read the local VERSION file from the plugin directory
2. Fetch the remote VERSION from GitHub raw URL
3. Compare versions -- if identical, report "Already up to date" and stop
4. Fetch the remote CHANGELOG.md and display changes since local version
5. Run the install script to perform the update
6. Verify the update succeeded by checking the new VERSION file
7. If update failed, report the error (install script handles rollback automatically)
```

### Pattern 3: GSD Integration Flag

**What:** Parse `--gsd` flag from `$ARGUMENTS` to switch output behavior
**When to use:** When the skill is invoked from within a GSD phase

```markdown
# In the main orq-agent.md command, parse arguments:

## Argument Parsing

Parse `$ARGUMENTS` for flags:
- `--gsd`: Enable GSD integration mode
- `--output <path>`: Override default output directory

**Standalone mode** (default):
- Output to `./Agents/[swarm-name]/`

**GSD mode** (`--gsd`):
- Output to the current project directory (where Claude Code is running)
- Integrates with GSD phase workflow -- the invoking phase provides context

The use case description is everything in $ARGUMENTS that is not a flag.
```

### Anti-Patterns to Avoid

- **Symlink-based install:** Don't symlink to a git clone -- the plugin system copies to cache; symlinks break on update
- **Auto-update on launch:** Explicitly out of scope per user decision; surprises break trust for non-technical users
- **Preserving user customizations:** Locked decision is clean install every time; don't try to merge
- **Installing to `~/.claude/commands/` directly:** The user mentioned this, but the plugin system installs to `~/.claude/plugins/cache/`; commands in `commands/` at the plugin root are the correct mechanism. The curl script should use the plugin directory structure, not scatter files into `~/.claude/commands/`
- **Monolithic single-file command:** The current orchestrator is 24KB; don't consolidate everything into one file. Use the skill's supporting files pattern

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Plugin packaging | Custom zip/tar distribution | `.claude-plugin/plugin.json` manifest | Native plugin system handles caching, namespacing, version tracking |
| Version comparison | Custom semver parser in bash | Simple string comparison on VERSION file | We control both sides; exact match is sufficient for "skip if current" |
| Plugin discovery | Custom registry/API | `marketplace.json` in the GitHub repo | Self-hosted marketplace is a single JSON file; no infrastructure needed |
| File copying/install | Custom file-by-file copy logic | `tar xz` of GitHub archive | GitHub provides tarballs automatically; one command replaces N copy commands |

**Key insight:** The Claude Code plugin system handles the hard parts (caching, namespacing, version management, scope control). The curl script is a thin wrapper that downloads and places the plugin directory.

## Common Pitfalls

### Pitfall 1: Plugin Namespace Confusion
**What goes wrong:** Plugin commands are namespaced as `/plugin-name:command-name`, not just `/command-name`. If the plugin is named `orq-agent-plugin`, commands become `/orq-agent-plugin:orq-agent` instead of `/orq-agent`.
**Why it happens:** Plugin namespacing prevents conflicts between plugins.
**How to avoid:** Name the plugin `orq-agent` in plugin.json so commands are `/orq-agent:command-name`. The main skill invoked as `/orq-agent` requires the skill directory to be named `orq-agent` and the plugin name to match.
**Warning signs:** Commands showing double-prefix in `/help` output.

### Pitfall 2: Character Budget Exceeding
**What goes wrong:** If SKILL.md is too large, it may not load into Claude's context when there are many other skills active.
**Why it happens:** Skill descriptions share a 15,000-character budget (2% of context window). Full skill content only loads on invocation, but descriptions compete for budget space.
**How to avoid:** Keep SKILL.md description concise. The current SKILL.md (5.4KB) is within budget. Set `disable-model-invocation: true` to exclude from description budget entirely (user invokes manually with `/orq-agent`). Supporting files (agents, templates, references) load on-demand and do NOT count against the budget.
**Warning signs:** `/context` command shows warning about excluded skills.

### Pitfall 3: Install Script Permissions and Portability
**What goes wrong:** The curl script fails on systems without required tools or with restricted permissions.
**Why it happens:** Non-technical users may have restricted environments, missing `curl`, or `~/.claude/` owned by different user.
**How to avoid:** Check all prerequisites explicitly with clear error messages. Use `mkdir -p` to create directories. Test on fresh macOS installs. Don't assume `git` is available (use curl + tar instead).
**Warning signs:** Users report "permission denied" or "command not found" errors.

### Pitfall 4: Rollback Complexity
**What goes wrong:** Update fails midway, leaving a broken installation that the backup can't fully restore.
**Why it happens:** Partial file writes, network interruption during download.
**How to avoid:** Download to temp directory FIRST, then atomic swap: backup current, move new in, verify, clean backup on success. Never modify in-place.
**Warning signs:** Post-update version check fails.

### Pitfall 5: Plugin Cache vs Direct Install Conflict
**What goes wrong:** User installs via curl (to `~/.claude/plugins/`) AND via `/plugin install` (to plugin cache), creating duplicate commands.
**Why it happens:** Two install mechanisms target similar but not identical paths.
**How to avoid:** Pick ONE canonical install location. The curl script should install to the plugin cache directory (`~/.claude/plugins/cache/orq-agent/`) so it matches what `/plugin install` would do. Alternatively, install to `~/.claude/skills/orq-agent/` as a personal skill (simpler, no plugin overhead, but no marketplace features).
**Warning signs:** Duplicate `/orq-agent` entries in `/help`.

### Pitfall 6: GSD Integration Assumptions
**What goes wrong:** The `--gsd` flag assumes GSD is installed, but the skill should work standalone.
**Why it happens:** Tight coupling between orq-agent and GSD workflow.
**How to avoid:** `--gsd` only changes output directory behavior. Don't import/require GSD files. Don't fail if GSD is not installed. The flag is a hint, not a dependency.
**Warning signs:** Error messages referencing GSD paths when running standalone.

## Code Examples

### plugin.json Manifest
```json
// Source: https://code.claude.com/docs/en/plugins
{
  "name": "orq-agent",
  "description": "Generate complete, copy-paste-ready Orq.ai Agent specifications from use case descriptions",
  "version": "1.0.0",
  "author": {
    "name": "Moyne Roberts"
  },
  "homepage": "https://github.com/OWNER/REPO",
  "repository": "https://github.com/OWNER/REPO",
  "license": "MIT"
}
```

### marketplace.json (Self-Hosted)
```json
// Source: https://code.claude.com/docs/en/plugin-marketplaces
{
  "name": "orq-agent-marketplace",
  "owner": {
    "name": "Moyne Roberts"
  },
  "plugins": [
    {
      "name": "orq-agent",
      "source": ".",
      "description": "Generate complete Orq.ai Agent specifications from use case descriptions",
      "version": "1.0.0"
    }
  ]
}
```

### Skill SKILL.md with Frontmatter
```yaml
# Source: https://code.claude.com/docs/en/slash-commands
---
name: orq-agent
description: Generate complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic from use case descriptions. Use when designing agents, creating swarms, or building Orq.ai configurations.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task
argument-hint: [use-case-description]
---
```

### Help Command
```yaml
# Source: design pattern
---
name: help
description: Show available Orq Agent Designer commands, usage examples, and version
disable-model-invocation: true
allowed-tools: Read, Bash
---

# Orq Agent Designer Help

Read the VERSION file and SKILL.md from the plugin directory, then display:

1. Current version (from VERSION file)
2. Available commands:
   - `/orq-agent "description"` -- Generate agent specs from a use case
   - `/orq-agent:update` -- Check for and install updates
   - `/orq-agent:help` -- Show this help
3. Usage examples:
   - `/orq-agent "Build a customer support triage system"`
   - `/orq-agent "Multi-agent content pipeline with research, writing, and editing"`
4. Output location: `./Agents/[swarm-name]/`
5. GSD integration: `/orq-agent --gsd "description"`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.claude/commands/` only | Unified skills system (`.claude/skills/` + `.claude/commands/`) | Late 2025 | Skills add supporting files, frontmatter control, auto-invocation |
| Manual file copying for distribution | Plugin system with marketplace | Early 2026 | `/plugin install` provides one-command install with version management |
| Global context loading | On-demand skill loading | 2025 | Descriptions load into context; full content loads only on invocation |
| Single-file commands | Multi-file skill directories | 2025 | Skills can have agents, templates, references as supporting files |

**Deprecated/outdated:**
- Direct installation to `~/.claude/commands/`: Still works but skills at `~/.claude/skills/` are recommended. Plugin skills at `<plugin>/skills/` are the standard for distributed extensions.
- Custom update scripts without version tracking: Plugin system provides built-in auto-update via marketplace.

## Open Questions

1. **Plugin name vs skill name resolution**
   - What we know: Plugin name in `plugin.json` creates the namespace prefix. A skill named `orq-agent` in a plugin named `orq-agent` might create `/orq-agent:orq-agent` (double name).
   - What's unclear: Whether the plugin system has a "default skill" concept where `/orq-agent` maps to the plugin's primary skill without duplication.
   - Recommendation: Test locally with `--plugin-dir`. If double-naming occurs, use a command file at `commands/orq-agent.md` that redirects to the skill, or restructure so the main command IS the skill at the top level.

2. **Curl install target directory**
   - What we know: The plugin cache is at `~/.claude/plugins/cache/`. Direct skill install goes to `~/.claude/skills/`. The user's CONTEXT.md says "installs to `~/.claude/commands/`".
   - What's unclear: Whether installing directly to the plugin cache (bypassing `/plugin install`) is supported and stable across Claude Code updates.
   - Recommendation: Install to `~/.claude/skills/orq-agent/` for maximum simplicity. This creates `/orq-agent` as a personal skill without plugin namespacing overhead. The marketplace path can be added later as an alternative install method. This avoids the double-naming issue entirely.

3. **GSD output directory when `--gsd` active**
   - What we know: Standalone defaults to `./Agents/`. GSD phases have their own directory structure.
   - What's unclear: Whether GSD phases expect output in a specific location.
   - Recommendation: When `--gsd` is active, output to `./Agents/` in the current working directory (same as standalone). GSD integration means the skill is callable from a phase, not that it needs to write to phase directories.

## Discretion Recommendations

### Bundle GSD subagent types or only orq-agent specific ones?
**Recommendation:** Bundle only orq-agent specific subagents. The 6 subagents (architect, researcher, spec-generator, orchestration-generator, dataset-generator, readme-generator) are all orq-agent specific. GSD subagent types (researcher, planner, executor, verifier) are part of the GSD framework and should not be bundled -- they are already available when GSD is installed. The `--gsd` flag should only change output path behavior, not import GSD agents.

### Character budget strategy?
**Recommendation:** Use lazy loading (the default). The current SKILL.md is 5.4KB. Set `disable-model-invocation: true` on the main `/orq-agent` skill so its description does NOT consume the shared 15,000-char budget. Users invoke it explicitly with `/orq-agent`, so auto-detection is not needed. Supporting files (agents at 12-31KB each, references at 3-6KB each, templates at 4-5KB each) load on-demand when the skill is running. No consolidation needed -- the multi-file structure is the correct pattern.

### Output location when `--gsd` flag is active?
**Recommendation:** Output to `./Agents/` in the current working directory regardless of `--gsd` flag. The `--gsd` flag's primary purpose is to signal that the invocation is part of a GSD workflow, not to change where files go. If a GSD phase needs output elsewhere, the phase itself can specify `--output <path>`. Keep it simple.

## Sources

### Primary (HIGH confidence)
- [Claude Code Skills/Slash Commands documentation](https://code.claude.com/docs/en/slash-commands) -- full skill system reference, frontmatter fields, supporting files, character budget
- [Claude Code Plugins documentation](https://code.claude.com/docs/en/plugins) -- plugin structure, plugin.json manifest, skill integration
- [Claude Code Plugin Discovery](https://code.claude.com/docs/en/discover-plugins) -- `/plugin install` flow, marketplace add, update mechanism, auto-update
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) -- marketplace.json schema, GitHub hosting, distribution patterns

### Secondary (MEDIUM confidence)
- [Claude Code Skills vs Slash Commands 2026 guide](https://yingtu.ai/blog/claude-code-skills-vs-slash-commands) -- unified system confirmation, character budget details
- [wshobson/commands](https://github.com/wshobson/commands) -- community pattern for slash command distribution

### Tertiary (LOW confidence)
- Plugin cache directory location (`~/.claude/plugins/cache/`) -- observed from local filesystem, not officially documented for direct writes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- official Claude Code plugin documentation is comprehensive and current
- Architecture: HIGH -- plugin directory structure is well-documented; skill system is verified
- Pitfalls: HIGH -- based on official docs (namespacing, character budget) and direct filesystem observation
- Install script: MEDIUM -- curl + tar pattern is standard but specific rollback behavior needs testing
- GSD integration: MEDIUM -- `--gsd` flag is a custom feature; behavior is design decision, not technical constraint

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (plugin system is stable; 30-day validity)
