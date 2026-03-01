# Phase 5: References, Install, and Capability Infrastructure - Research

**Researched:** 2026-03-01
**Domain:** Reference content authoring, shell scripting (install), capability-gated CLI architecture
**Confidence:** HIGH

## Summary

Phase 5 establishes two parallel workstreams: (1) creating and updating reference files that later phases consume, and (2) extending the existing install script with capability tier selection, API key onboarding, MCP server registration, and model profiles.

The reference workstream is content authoring -- researching current patterns from Anthropic, OpenAI, Google A2A, and Orq.ai docs, then writing structured markdown files that fit the project's existing `references/` convention (under 1000 words per file, loaded by subagents at runtime). The Orq.ai API has a well-documented REST surface covering agents, tools, datasets, evaluators, and experiments. The evaluator library provides 41 built-in evaluators across 3 categories (19 function, 10 LLM, 12 RAGAS). V2.0 output templates (deploy-log, test-results, iteration-log) should use JSON format per user decision, since humans monitor activity via the Orq.ai UI.

The install workstream extends the existing `install.sh` (currently 180 lines of bash) with tier selection, API key validation via `GET /v2/models`, shell profile injection for `ORQ_API_KEY`, MCP server registration via `claude mcp add --transport http`, and a config file at `.orq-agent/config.json` for tier + model profile storage. The `claude mcp add` command supports `--scope user` for cross-project availability, HTTP transport for remote servers, and environment variable passing via `--env`.

**Primary recommendation:** Split work into two parallel tracks -- reference content (REF-01 through REF-05) and install infrastructure (INST-01 through INST-05). Reference files are independent of each other and can be authored in parallel. Install infrastructure is sequential: tier selection -> API key -> MCP registration -> config file -> capability gating -> fallback behavior.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Explicit tier selection during install (core/deploy/test/full) -- user picks, not auto-unlocked
- Re-running the install script handles upgrades (no separate upgrade command)
- Automatic cascading -- selecting "deploy" includes core setup, "test" includes deploy+core, etc.
- Show a tier comparison table during install so users see what each tier unlocks before choosing
- Store API key in shell profile (~/.zshrc or ~/.bashrc) as `export ORQ_API_KEY=...`
- Validate key during install by calling the list models endpoint (GET /v2/models) -- lightweight, read-only
- When key is missing or invalid mid-pipeline: prompt for key inline, validate, then continue (don't force re-install)
- Auto-register Orq.ai MCP server via `claude mcp add` during install when deploy+ tier is selected (no extra confirmation)
- Tier stored in config file (e.g., `.orq-agent/config.json`) -- checked at command start
- When user runs a command above their tier: show upgrade message with tier comparison table explaining what they need
- When MCP is unavailable but user has deploy+ tier: warn then fall back to V1.0 copy-paste output
- Base `/orq-agent` generation output is identical at all tiers -- deploy/test/iterate are separate commands that act on V1.0 output
- External framework patterns (Anthropic evaluator-optimizer, OpenAI agent-as-tool, Google A2A): actionable patterns only, skip theory and history
- Orq.ai API reference: single file with sections per domain (agents, tools, datasets, evaluators, experiments) -- not split into separate files
- V1.0 subagent prompts NOT modified in this phase -- references created/updated only, subagents consume them naturally or get updated in Phase 6+
- V2.0 output templates (deploy-log, test-results, iteration-log): structured data format (JSON/YAML), not markdown -- humans can see pipeline activity in Orq.ai UI directly
- Three named profiles like GSD: quality, balanced, budget
- Quality: best models everywhere (Opus)
- Balanced: Opus for architect+spec-gen, Sonnet for rest
- Budget: Sonnet everywhere, Haiku for dataset-gen
- Separate `/orq-agent:set-profile` command (not part of install flow)
- Default profile: quality (best output out-of-the-box, user opts into cheaper profiles)
- Profile stored in same config file as tier (`.orq-agent/config.json`)

### Claude's Discretion
- Exact config file structure and location
- How model profile maps to specific subagent `model` parameters
- Reference file internal organization and section ordering
- MCP server registration command details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REF-01 | Reference files updated with latest Anthropic evaluator-optimizer pattern, context engineering guidelines, and agent composability patterns | Anthropic's 5 composable patterns documented (prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer). Context engineering blog from Sep 2025 provides actionable patterns: system prompt calibration, tool design for efficiency, strategic example selection, just-in-time context retrieval, long-horizon task management. |
| REF-02 | Reference files updated with OpenAI agent-as-tool patterns and Google A2A Protocol v0.3 task lifecycle states | OpenAI Agents SDK `.as_tool()` pattern documented. A2A v0.3 has 7 states: submitted, working, input-required, auth-required, completed, failed, canceled, rejected. |
| REF-03 | New Orq.ai API endpoints reference covering agents, tools, datasets, evaluators, and experiments endpoints | Full endpoint inventory fetched from docs.orq.ai/llms.txt -- 5 CRUD sets (agents, tools, datasets, evaluators, deployments) plus execution/streaming endpoints. Base URL: `https://api.orq.ai/v2/`. Auth: `Bearer $ORQ_API_KEY`. |
| REF-04 | New Orq.ai evaluator types reference covering 19 built-in function evaluators and 4 custom evaluator categories | Complete evaluator library documented: 19 function evaluators, 10 LLM evaluators, 12 RAGAS evaluators = 41 total across 3 categories (requirement says 4 custom categories; actual custom types are LLM, Python, HTTP, RAGAS = 4 custom evaluator categories plus function as the 5th built-in category). |
| REF-05 | New V2.0 output templates for deploy-log, test-results, and iteration-log following existing template patterns | User decided JSON/YAML format, not markdown. Templates go in `orq-agent/templates/` alongside existing templates. Should contain JSON schemas with placeholder fields matching pipeline-run.json patterns. |
| INST-01 | Install script presents capability tier selection (core/deploy/test/full) with hierarchical enforcement | Extend existing install.sh (180 lines bash). Tier comparison table shown during install. Cascading: full > test > deploy > core. Store selection in `.orq-agent/config.json`. |
| INST-02 | Install script prompts for Orq.ai API key, validates with lightweight API call, and stores via environment variable only | Validate via `GET /v2/models` (confirmed endpoint exists at docs.orq.ai). Store as `export ORQ_API_KEY=...` in `~/.zshrc` or `~/.bashrc`. Never write key to generated files. |
| INST-03 | Install script auto-registers Orq.ai MCP server via `claude mcp add` when deploy or higher tier is selected | Command: `claude mcp add --transport http --scope user orqai-mcp-server <server-url> --env ORQ_API_KEY="$ORQ_API_KEY"`. Scope `user` makes it available across all projects. |
| INST-04 | Commands are capability-gated -- `/orq-agent:deploy` only available when deploy tier installed | Check `.orq-agent/config.json` at command start. If tier insufficient, show upgrade message with tier comparison table. Implemented as a gate function called at the top of each V2.0 command. |
| INST-05 | Pipeline gracefully falls back to V1.0 copy-paste behavior when MCP is unavailable or only core tier is installed | Base `/orq-agent` works identically at all tiers. V2.0 commands (deploy/test/iterate) check MCP availability; if unavailable, warn and produce V1.0 output instead. |
</phase_requirements>

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Bash (install.sh) | 4+ | Install script, tier selection, API validation | Already used in V1.0 install; extending is lower risk than rewriting |
| JSON (config) | N/A | Config file format for `.orq-agent/config.json` | Machine-readable, parseable with `jq` or `node -e`, matches `pipeline-run.json` pattern |
| Markdown (references) | N/A | Reference file format | Project convention -- all references are `.md` under 1000 words |
| `claude mcp add` | Claude Code CLI | MCP server registration | Official Claude Code CLI command for adding MCP servers |
| `curl` | System | API key validation during install | Already used in install.sh for downloading; no new dependency |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `jq` | JSON parsing in bash | Config file reading in capability gate checks; optional (fallback to `node -e`) |
| `node -e` | Inline JSON operations | When `jq` is not available; Node.js is already a prerequisite |
| `grep`/`sed` | Shell profile manipulation | Writing `export ORQ_API_KEY=...` to `~/.zshrc` or `~/.bashrc` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bash install script | Node.js install script | Node is a prerequisite anyway, but bash is simpler for shell operations (profile editing, env vars). Keep bash for install, use Node for JSON-heavy operations if needed. |
| JSON config file | YAML config file | User decided JSON. YAML would need a parser dependency. |
| Shell profile for API key | `.env` file or keychain | User decided shell profile. Shell profile is universal, persists across sessions, and is the standard pattern for CLI tools. |

## Architecture Patterns

### Recommended Project Structure (additions to existing)
```
orq-agent/
  references/
    orqai-agent-fields.md          # EXISTING -- update with new patterns
    orqai-model-catalog.md         # EXISTING -- no changes this phase
    orchestration-patterns.md      # EXISTING -- update with A2A + OpenAI patterns
    naming-conventions.md          # EXISTING -- no changes this phase
    tool-catalog.md                # EXISTING -- no changes this phase
    agentic-patterns.md            # NEW -- Anthropic composable patterns + context engineering
    orqai-api-endpoints.md         # NEW -- REST API reference (REF-03)
    orqai-evaluator-types.md       # NEW -- Evaluator taxonomy (REF-04)
  templates/
    agent-spec.md                  # EXISTING -- no changes this phase
    orchestration.md               # EXISTING -- no changes this phase
    dataset.md                     # EXISTING -- no changes this phase
    readme.md                      # EXISTING -- no changes this phase
    tools.md                       # EXISTING -- no changes this phase
    deploy-log.json                # NEW -- V2.0 deployment audit template (REF-05)
    test-results.json              # NEW -- V2.0 test results template (REF-05)
    iteration-log.json             # NEW -- V2.0 iteration audit template (REF-05)
  commands/
    deploy.md                      # NEW -- Phase 6 command (stub with gate)
    test.md                        # NEW -- Phase 7 command (stub with gate)
    iterate.md                     # NEW -- Phase 8 command (stub with gate)
    set-profile.md                 # NEW -- Model profile management
.orq-agent/
  config.json                      # NEW -- tier + profile config
install.sh                         # EXISTING -- extend with tiers, API key, MCP
```

### Pattern 1: Capability Gate Function
**What:** A reusable gate check at the start of every V2.0 command
**When to use:** Every V2.0 command (deploy, test, iterate)
**Example:**
```bash
# In each V2.0 command file, check tier before proceeding
# Read .orq-agent/config.json, extract tier, compare to required tier
# If insufficient: display tier comparison table and exit with upgrade message
```

```markdown
<!-- In deploy.md command -->
<gate>
Read `.orq-agent/config.json` and verify `tier` is "deploy" or higher.
If tier is insufficient, display:

  This command requires the DEPLOY tier or higher.
  Your current tier: CORE

  | Tier | Commands Available |
  |------|-------------------|
  | core | /orq-agent (generation only) |
  | deploy | + /orq-agent:deploy |
  | test | + /orq-agent:test |
  | full | + /orq-agent:iterate |

  Upgrade: Re-run the install script and select a higher tier.

Then STOP. Do not proceed.
</gate>
```

### Pattern 2: Config File Structure
**What:** Central config for tier and profile state
**When to use:** Read at command start, written during install and profile changes
**Example:**
```json
{
  "tier": "deploy",
  "model_profile": "quality",
  "model_overrides": {},
  "installed_at": "2026-03-01T10:00:00Z",
  "orqai_mcp_registered": true
}
```

### Pattern 3: Model Profile Resolution (following GSD pattern)
**What:** Map profile name to per-subagent model selection
**When to use:** At orchestrator start, before spawning any subagent
**Example:**
```markdown
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| architect | opus | opus | sonnet |
| spec-generator | opus | opus | sonnet |
| researcher | opus | sonnet | haiku |
| tool-resolver | opus | sonnet | sonnet |
| orchestration-generator | opus | sonnet | sonnet |
| dataset-generator | opus | sonnet | haiku |
| readme-generator | sonnet | sonnet | haiku |
| deployer (Phase 6) | opus | sonnet | sonnet |
| tester (Phase 7) | opus | sonnet | sonnet |
| iterator (Phase 8) | opus | opus | sonnet |
```

### Pattern 4: MCP Fallback
**What:** Check MCP availability before V2.0 operations; fall back to V1.0 output
**When to use:** At the start of deploy/test/iterate commands
**Example:**
```markdown
1. Check tier in config.json -- gate if insufficient
2. Attempt MCP operation (e.g., list agents via MCP)
3. If MCP unavailable: warn user, produce V1.0 copy-paste output instead
4. If MCP available: proceed with autonomous operation
```

### Anti-Patterns to Avoid
- **Hardcoding API keys in files:** Never write `ORQ_API_KEY` into config.json, generated specs, or any committed file. Shell profile only.
- **Splitting Orq.ai API reference into multiple files:** User decided single file with sections per domain. Keep it consolidated.
- **Modifying V1.0 subagent prompts:** This phase creates/updates references only. Subagent prompt modifications happen in Phase 6+.
- **Auto-unlocking tiers:** User explicitly picks their tier. The install script does not auto-detect and unlock.
- **Coupling model profiles to install flow:** Profile is set separately via `/orq-agent:set-profile`, not during install. Default is "quality".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing in bash | Custom awk/sed JSON parser | `node -e "console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).tier)"` or `jq .tier config.json` | JSON parsing in bash is fragile; Node.js is already a prerequisite |
| Shell detection | Custom shell sniffing | Check `$SHELL` variable, fall back to `~/.bashrc` if `~/.zshrc` doesn't exist | Edge cases with login vs interactive shells |
| API key validation | Custom HTTP response parsing | `curl -sf -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $KEY" https://api.orq.ai/v2/models` | Just check HTTP status code, don't parse response body |
| MCP server registration | Manual config file editing | `claude mcp add --transport http --scope user orqai <url>` | Official CLI command handles all config file management |
| Idempotent shell profile writes | Blind append | Check if `export ORQ_API_KEY` already exists in profile before writing; update if present, append if not | Prevents duplicate exports on re-install |

**Key insight:** The install script handles sensitive operations (API keys, shell profiles, MCP registration). Use battle-tested patterns (curl status checks, grep-before-append) rather than clever solutions.

## Common Pitfalls

### Pitfall 1: Shell Profile Not Sourced After Write
**What goes wrong:** Install writes `export ORQ_API_KEY=...` to `~/.zshrc` but the current shell session doesn't have it.
**Why it happens:** Changes to shell profiles only take effect in new terminal sessions.
**How to avoid:** After writing to profile, also `export` the variable in the current script context AND tell the user to restart their terminal or `source ~/.zshrc`.
**Warning signs:** "API key not found" errors immediately after install.

### Pitfall 2: MCP Server URL Hardcoded or Wrong
**What goes wrong:** Install registers MCP server with a hardcoded URL that changes or is environment-specific.
**Why it happens:** Orq.ai MCP server URL may not be publicly documented yet.
**How to avoid:** Make the MCP server URL configurable during install or store it in config. Validate the URL responds before registering.
**Warning signs:** MCP commands fail silently with connection errors.

### Pitfall 3: Config File Race Between Install and Commands
**What goes wrong:** Config file doesn't exist when a command runs because install hasn't been run yet, or user deleted it.
**Why it happens:** Commands assume config exists.
**How to avoid:** Every command that reads config should handle missing config gracefully -- default to "core" tier, prompt for install if V2.0 features requested.
**Warning signs:** JSON parse errors or undefined tier values.

### Pitfall 4: Reference Files Exceed Context Budget
**What goes wrong:** New reference files are too long, consuming subagent context window for reasoning.
**Why it happens:** Trying to be comprehensive instead of actionable.
**How to avoid:** Enforce the existing project convention: reference files under 1000 words. For Orq.ai API endpoints reference, list endpoints with method/path/description only -- no request/response bodies. Subagents can fetch full docs when needed.
**Warning signs:** Subagent outputs become shorter or lower quality as reference files grow.

### Pitfall 5: Tier Comparison Table Inconsistency
**What goes wrong:** Tier table during install shows different information than upgrade message in commands.
**Why it happens:** Tier table is duplicated in multiple places.
**How to avoid:** Define the tier table once in a reference file or template. Both install script and command gate functions reference the same source.
**Warning signs:** Users confused about what each tier provides.

### Pitfall 6: API Key Leaks Into Git
**What goes wrong:** API key accidentally committed to the repo via config files or generated output.
**Why it happens:** Config file or template includes the key value.
**How to avoid:** Config file stores tier and profile only, never the API key. Add `.orq-agent/` to `.gitignore`. API key lives exclusively in shell profile env var.
**Warning signs:** `git diff` shows API key strings.

## Code Examples

### Install Script: Tier Selection
```bash
# Tier comparison table
echo ""
echo "Select your capability tier:"
echo ""
echo "  ┌──────────┬─────────────────────────────────────────┐"
echo "  │ Tier     │ What You Get                            │"
echo "  ├──────────┼─────────────────────────────────────────┤"
echo "  │ core     │ /orq-agent (spec generation only)       │"
echo "  │ deploy   │ + /orq-agent:deploy (push to Orq.ai)    │"
echo "  │ test     │ + /orq-agent:test (automated testing)   │"
echo "  │ full     │ + /orq-agent:iterate (prompt iteration)  │"
echo "  └──────────┴─────────────────────────────────────────┘"
echo ""
echo "  Each tier includes all capabilities of lower tiers."
echo ""
read -p "  Select tier [core/deploy/test/full]: " SELECTED_TIER

# Validate and normalize
case "$SELECTED_TIER" in
  core|deploy|test|full) ;;
  *) echo "Invalid tier. Defaulting to core."; SELECTED_TIER="core" ;;
esac
```

### Install Script: API Key Validation
```bash
# Only prompt for API key if deploy+ tier selected
if [ "$SELECTED_TIER" != "core" ]; then
  read -sp "  Enter your Orq.ai API key: " ORQ_API_KEY
  echo ""

  # Validate against list models endpoint
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $ORQ_API_KEY" \
    "https://api.orq.ai/v2/models" 2>/dev/null)

  if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}API key validation failed (HTTP $HTTP_CODE).${NC}"
    echo "  Check your key and try again."
    exit 1
  fi
  echo -e "${GREEN}API key validated successfully.${NC}"

  # Write to shell profile (idempotent)
  SHELL_PROFILE="$HOME/.zshrc"
  [ ! -f "$SHELL_PROFILE" ] && SHELL_PROFILE="$HOME/.bashrc"

  if grep -q "export ORQ_API_KEY=" "$SHELL_PROFILE" 2>/dev/null; then
    # Update existing
    sed -i.bak "s|export ORQ_API_KEY=.*|export ORQ_API_KEY=\"$ORQ_API_KEY\"|" "$SHELL_PROFILE"
    rm -f "${SHELL_PROFILE}.bak"
  else
    # Append new
    echo "" >> "$SHELL_PROFILE"
    echo "# Orq.ai API Key (added by orq-agent installer)" >> "$SHELL_PROFILE"
    echo "export ORQ_API_KEY=\"$ORQ_API_KEY\"" >> "$SHELL_PROFILE"
  fi

  # Export for current session
  export ORQ_API_KEY
fi
```

### Install Script: MCP Registration
```bash
# Register Orq.ai MCP server for deploy+ tiers
if [ "$SELECTED_TIER" != "core" ]; then
  echo "Registering Orq.ai MCP server..."
  claude mcp add --transport http --scope user orqai-mcp \
    "https://mcp.orq.ai" \
    --env ORQ_API_KEY="$ORQ_API_KEY" 2>/dev/null

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Orq.ai MCP server registered.${NC}"
    MCP_REGISTERED=true
  else
    echo -e "${YELLOW}WARNING: MCP registration failed. Deploy commands will use API fallback.${NC}"
    MCP_REGISTERED=false
  fi
fi
```

### Config File Write
```bash
# Write config file
CONFIG_DIR="$INSTALL_DIR/.orq-agent"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.json" << EOF
{
  "tier": "$SELECTED_TIER",
  "model_profile": "quality",
  "model_overrides": {},
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "orqai_mcp_registered": $MCP_REGISTERED
}
EOF
```

### Capability Gate (in command markdown)
```markdown
<gate>
Before proceeding, check capability tier:

1. Read `~/.claude/skills/orq-agent/.orq-agent/config.json`
2. If file missing: "Install required. Run the install script first."
3. Extract `tier` value
4. This command requires: deploy (or test/full depending on command)
5. Tier hierarchy: full > test > deploy > core
6. If current tier < required tier: show upgrade table and STOP
</gate>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single monolithic agent | Composable agent patterns (Anthropic) | 2024-2025 | Use evaluator-optimizer for iterative refinement, orchestrator-workers for complex tasks |
| Agent handoffs (conversation transfer) | Agent-as-tool (OpenAI SDK) | 2025 | Sub-agents callable without conversation transfer; main agent retains control |
| Point-to-point agent integration | A2A Protocol (Google) | 2025-2026 (v0.3) | Standardized task lifecycle with auth-required and rejected states added |
| Generic prompt engineering | Context engineering (Anthropic) | Sep 2025 | "Intelligence is not the bottleneck, context is" -- focus on minimal high-signal tokens |
| Framework-heavy agent builders | Minimal composable patterns | 2025-2026 | Anthropic recommends simple patterns over complex frameworks |

**Deprecated/outdated:**
- OpenAI Assistants API: Scheduled for sunset mid-2026; replaced by Agents SDK with MCP integration
- Generic "prompt engineering" terminology: Replaced by "context engineering" in Anthropic's latest guidance

## Open Questions

1. **Orq.ai MCP Server URL**
   - What we know: Orq.ai supports MCP tools within agents (documented in their tool catalog). The `claude mcp add --transport http` command is the registration mechanism.
   - What's unclear: The exact URL for the Orq.ai MCP server that would be registered with Claude Code. This may be a per-workspace URL or may not be publicly available yet.
   - Recommendation: Make the URL configurable during install. If the Orq.ai team hasn't published a public MCP server endpoint for Claude Code, the REST API is the fallback path (which is confirmed working at `https://api.orq.ai/v2/`). This aligns with the STATE.md note: "REST API is primary path; MCP CRUD capabilities not fully verified."

2. **Config File Location**
   - What we know: User decided `.orq-agent/config.json`. GSD uses `.planning/config.json`.
   - What's unclear: Should this be relative to the install directory (`~/.claude/skills/orq-agent/.orq-agent/config.json`) or relative to the user's project directory? Install-relative makes sense for global settings (tier, profile). Project-relative would make sense for per-project overrides.
   - Recommendation: Store at install location (`~/.claude/skills/orq-agent/.orq-agent/config.json`) for tier and profile (global settings). Per-project overrides can be added later if needed.

3. **Orq.ai Evaluator Custom Categories Count**
   - What we know: REF-04 requirement says "4 custom evaluator categories." The actual docs show 6 evaluator types total: Function, LLM, Python, HTTP, JSON, RAGAS. Of these, 4 are "custom" in the sense that users define their own logic: LLM (custom judge prompts), Python (custom code), HTTP (external endpoints), JSON (custom schema).
   - What's unclear: Whether the requirement's "4 custom evaluator categories" maps exactly to LLM/Python/HTTP/JSON or includes RAGAS.
   - Recommendation: Document all 6 evaluator types. Group them as: built-in function evaluators (19 pre-built) and custom evaluator types (LLM, Python, HTTP, JSON) with RAGAS as a specialized category (12 pre-built metrics). This satisfies the requirement's "4 custom evaluator categories" while being accurate.

4. **`sed -i` Portability**
   - What we know: `sed -i` behaves differently on macOS (`sed -i ''`) vs Linux (`sed -i`).
   - What's unclear: Whether the install script needs to support Linux.
   - Recommendation: Use `sed -i.bak` (works on both macOS and Linux) and clean up the `.bak` file after. The existing install.sh already targets macOS (Darwin-based, per env context), but being portable costs nothing.

## Sources

### Primary (HIGH confidence)
- [Orq.ai API docs](https://docs.orq.ai/reference/agents/create-agent) - Agent creation endpoint, API structure
- [Orq.ai docs index](https://docs.orq.ai/llms.txt) - Full endpoint inventory (agents, tools, datasets, evaluators, experiments)
- [Orq.ai evaluator library](https://docs.orq.ai/docs/evaluators/library) - 41 evaluators across 3 categories (19 function, 10 LLM, 12 RAGAS)
- [Orq.ai function evaluator](https://docs.orq.ai/docs/function-evaluator) - 19 built-in function evaluators with descriptions
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) - `claude mcp add` command syntax, scope options, transport types
- [Anthropic building effective agents](https://www.anthropic.com/research/building-effective-agents) - 5 composable patterns including evaluator-optimizer
- [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) - Context engineering patterns (Sep 2025)
- [A2A Protocol specification](https://a2a-protocol.org/latest/specification/) - Task lifecycle states (v0.3)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/agents/) - Agent-as-tool pattern via `.as_tool()`

### Secondary (MEDIUM confidence)
- Existing project codebase (install.sh, SKILL.md, references/, templates/) - Current V1.0 structure and conventions
- [GSD model profiles](~/.claude/get-shit-done/references/model-profiles.md) - Profile pattern to follow for orq-agent profiles

### Tertiary (LOW confidence)
- Orq.ai MCP server URL -- not publicly documented; may need direct communication with Orq.ai team or runtime discovery

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Extending existing bash install script with well-documented CLI commands
- Architecture: HIGH - Following established project patterns (references under 1000 words, JSON config, GSD model profiles)
- Reference content: HIGH - Source documentation verified at docs.orq.ai, anthropic.com, a2a-protocol.org
- Pitfalls: MEDIUM - Based on bash scripting experience and cross-platform shell considerations
- MCP registration: MEDIUM - `claude mcp add` syntax confirmed, but Orq.ai MCP server URL unverified

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (stable domain -- reference content and bash patterns change slowly)
