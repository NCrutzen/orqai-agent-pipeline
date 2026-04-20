# Phase 36: Lifecycle Slash Commands - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Create 6 new thin MCP-backed slash commands under `orq-agent/commands/` that let users inspect their Orq.ai workspace from Claude Code without opening the Studio dashboard:
- `workspace.md` (LCMD-01)
- `traces.md` (LCMD-02)
- `analytics.md` (LCMD-03)
- `models.md` (LCMD-04)
- `quickstart.md` (LCMD-05 + LCMD-07 consolidated — 12-step onboarding)
- `automations.md` (LCMD-06)

Every new command must:
- Pass Phase 34 SKST lint (9 sections + `allowed-tools:` frontmatter).
- Respect Phase 35 snapshot-pinning rule where example model IDs are shown.
- Not touch `<pipeline>` blocks of the 3 protected entry points (hash check exits 0).
- Delegate all data access to the Orq.ai MCP server (MCP-first per PROJECT.md Key Decision).

Also update `orq-agent/SKILL.md` to index the 6 new commands and `orq-agent/commands/help.md` to mention them.

</domain>

<decisions>
## Implementation Decisions

### Output format
- Plain-text console output with a leading `ORQ ► {COMMAND}` banner matching the existing `orq-agent` house style (see `orq-agent/commands/help.md`).
- Structured data: pipe-separated Markdown tables render fine in Claude Code's terminal and are scannable.
- Each command ends with a one-line "Open in orq.ai" deep link block (already required by SKST-10).

### Argument conventions
- `[positional]` for the primary filter (e.g., `section`, `search-term`).
- `--flag value` (long form only, no short flags) for ancillary filters — matches the Phase 34 lint rule and existing V2.0 conventions (`--agent <key>`, `--profile <name>`).
- `--last <duration>` accepts `5m|1h|24h|7d|30d`; default `24h`.
- `--limit <N>` default 20 where applicable.

### MCP backing
- All data fetches go through the Orq.ai MCP server. If a needed MCP tool is missing for a given slice of data, the command documents it as a limitation and falls back to the REST endpoint via `curl` with `$ORQ_API_KEY`.
- Each command prints a "MCP tools used:" footer listing the tools it invoked (for transparency and debugging).

### quickstart (LCMD-05 + LCMD-07)
- 12 sequential steps (MCP connect → enable models → create project → build agent → invoke → analyze traces → build evaluator → build dataset → run experiment → human review → annotation analysis → promote evaluator).
- Each step has an immediately-copy-pasteable prompt the user runs next.
- Implementation: the `/orq-agent:quickstart` command emits the full 12-step list with copy-paste prompts; users advance manually. No state file.

### automations (LCMD-06)
- Two modes: `/orq-agent:automations` (list) and `/orq-agent:automations --create` (interactive create via AskUserQuestion).
- `--create` collects: name, trace-filter criteria, target dataset, experiment to auto-kick-off — then calls the Orq.ai Trace Automations API via MCP/REST.

### Byte-identical protected entry points
- Phase 36 only CREATES new command files; it does NOT modify `orq-agent.md`, `prompt.md`, or `architect.md`. Protected-pipeline check exits 0 trivially.

### Claude's Discretion
- Exact column ordering in each command's output table.
- Whether `workspace` outputs one table per section or a consolidated summary (leaning: one section per H2 subheading, collapsible).
- Default `--last` value per command (current proposal: 24h for traces/analytics, none for workspace/models).
- Whether `quickstart` writes a `.orq-agent-quickstart-progress` sidecar (current decision: NO — keep stateless).
- Exact MCP tool names — must align with the Orq.ai MCP server's published tool catalog at invocation time; commands should try `mcp__orqai-mcp__*` tool names first and fall back to REST.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/commands/help.md` — clean template for a simple read-only command (has all 9 SKST sections; shows the "ORQ ►" banner and pipeline-order discipline).
- `orq-agent/commands/systems.md` — template for a command that both lists and mutates (systems registry). Model for `automations` list/create split.
- `orq-agent/commands/tools.md` — template for a command with subagent delegation. `workspace`/`traces` may NOT need a subagent (pure MCP calls); simpler pattern from `help.md` suffices.
- Existing MCP tool catalog (per .mcp.json + orqai-mcp): `list_traces`, `list_spans`, `list_models`, `search_entities`, `search_directories`, `get_analytics_overview`, `query_analytics`, `list_registry_keys`, `list_registry_values`, `list_datapoints`, `list_experiment_runs` — mostly sufficient for Phase 36 commands.
- `orq-agent/scripts/lint-skills.sh` — every new command must pass. Any example model IDs must be dated snapshots (Phase 35 rule).

### Established Patterns
- Banner format: `ORQ ► {VERB} {OBJECT}` in uppercase.
- Commands start with `## Constraints` (NEVER/ALWAYS + Why), then a Step sequence, then Anti-Patterns + Open in orq.ai + Documentation & Resolution.
- Frontmatter: `description` (required), `allowed-tools` (Phase 34 required), `argument-hint` (optional, helpful for UX).

### Integration Points
- `orq-agent/SKILL.md` — Commands directory listing (add 6 new rows).
- `orq-agent/commands/help.md` — add the 6 new commands to the pipeline-order help index.
- `orq-agent/commands/update.md` — no changes needed; the updater pulls all skill files.

</code_context>

<specifics>
## Specific Ideas

### "Open in orq.ai" deep links per command
- `workspace` → `https://my.orq.ai/<workspace>/agents` (with fallback to top-level)
- `traces` → `https://my.orq.ai/<workspace>/traces`
- `analytics` → `https://my.orq.ai/<workspace>/analytics`
- `models` → `https://my.orq.ai/<workspace>/model-garden`
- `quickstart` → `https://docs.orq.ai/docs/get-started` (stable documentation URL)
- `automations` → `https://my.orq.ai/<workspace>/trace-automations` (inferred — tag with `TODO(LCMD-06)` if unverified)

### quickstart 12-step sequence
Seed copy (Claude adapts for clarity):
1. Connect MCP → `/orq-agent:workspace` to verify connection
2. Enable models → `/orq-agent:models <search>` + Studio
3. Create project → Studio
4. Build agent → `/orq-agent "<use-case>"`
5. Invoke agent → Studio Chat
6. Analyze traces → `/orq-agent:traces`
7. Build evaluator → `/orq-agent:harden --evaluators`
8. Build dataset → `/orq-agent:datasets`
9. Run experiment → `/orq-agent:test`
10. Human review → Orq.ai Annotation Queues
11. Annotation analysis → Studio
12. Promote evaluator → `/orq-agent:harden --promote`

</specifics>

<deferred>
## Deferred Ideas

- Per-tenant identity filtering on `/orq-agent:traces` (OBSV-07 capability) — belongs in Phase 37 (Observability Setup) which defines how `identity` attributes are attached. Phase 36 adds a `--identity <id>` flag stub that today is a no-op with a TODO.
- Rich HTML rendering of analytics charts — out of scope; terminal plain text only.
- Auto-generated CSV export flag — not in ROADMAP success criteria; deferred.
- `quickstart` progress tracking — deferred per Claude's Discretion note above.

</deferred>
