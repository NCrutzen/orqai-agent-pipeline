# Phase 4: Distribution - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Package the Orq Agent Designer as an installable Claude Code plugin (`/orq-agent`) that non-technical colleagues can set up and update from a GitHub repo. Covers install, update, help command, GSD integration, and skill packaging. Does not cover new generation capabilities or Orq.ai API integration.

</domain>

<decisions>
## Implementation Decisions

### Install experience
- curl one-liner install: `curl https://...install.sh | bash`
- Installs to `~/.claude/skills/orq-agent/` (multi-file skill directory, confirmed over original ~/.claude/commands/ after research)
- Script checks prerequisites (Node.js, Claude Code) and shows clear error messages if missing
- Post-install shows quick-start guide with 2-3 example commands the user can try immediately

### Update mechanism
- `/orq-agent:update` re-runs the install script (re-downloads and overwrites from GitHub)
- Checks local vs remote version before downloading — skips if already up to date
- Shows changelog of what changed since user's last version
- Auto-rollback on failure: backs up current files before update, restores on error

### Skill structure
- Multi-file modular layout (commands/, subagents/, references/, templates/) under `~/.claude/`
- Clean install every time — always overwrite, no preservation of user customizations

### GSD integration
- Explicit `--gsd` flag to enable GSD integration (no auto-detection)
- Standalone output defaults to `./Agents/` with `--output` flag to override
- Built-in `/orq-agent:help` command showing available commands, usage examples, and current version

### Claude's Discretion
- Whether to bundle GSD subagent types or only orq-agent specific ones
- Character budget strategy (lazy loading vs consolidation) based on actual Claude Code limits and file sizes
- Output location when `--gsd` flag is active (project directory vs phase directory)

</decisions>

<specifics>
## Specific Ideas

- Non-technical users are the primary audience — every friction point matters
- Install should feel like installing a Homebrew package: one command, done
- The update experience should build trust — show what changed, don't surprise people
- Rollback safety net is important because non-technical users can't debug a broken install

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-distribution*
*Context gathered: 2026-02-24*
