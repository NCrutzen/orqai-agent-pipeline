---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - orq-agent/commands/architect.md
  - orq-agent/commands/tools.md
  - orq-agent/commands/research.md
  - orq-agent/commands/datasets.md
  - orq-agent/SKILL.md
autonomous: true
requirements: [QUICK-2]
must_haves:
  truths:
    - "User can run /orq-agent:architect with a use case and get a blueprint.md"
    - "User can run /orq-agent:tools with a use case and get a TOOLS.md"
    - "User can run /orq-agent:research with an agent description and get a research-brief.md"
    - "User can run /orq-agent:datasets with a spec file or description and get dual datasets"
    - "SKILL.md lists all 4 new commands with correct descriptions"
  artifacts:
    - path: "orq-agent/commands/architect.md"
      provides: "Standalone architect command"
    - path: "orq-agent/commands/tools.md"
      provides: "Standalone tool resolver command"
    - path: "orq-agent/commands/research.md"
      provides: "Standalone researcher command"
    - path: "orq-agent/commands/datasets.md"
      provides: "Standalone dataset generator command"
    - path: "orq-agent/SKILL.md"
      provides: "Updated command listing"
  key_links:
    - from: "orq-agent/commands/architect.md"
      to: "orq-agent/agents/architect.md"
      via: "Task tool spawn"
    - from: "orq-agent/commands/tools.md"
      to: "orq-agent/agents/tool-resolver.md"
      via: "Task tool spawn"
    - from: "orq-agent/commands/research.md"
      to: "orq-agent/agents/researcher.md"
      via: "Task tool spawn"
    - from: "orq-agent/commands/datasets.md"
      to: "orq-agent/agents/dataset-generator.md"
      via: "Task tool spawn"
---

<objective>
Create 4 standalone slash commands (/orq-agent:architect, /orq-agent:tools, /orq-agent:research, /orq-agent:datasets) that each wrap a single subagent, following the same pattern as /orq-agent:prompt. Update SKILL.md to list them all.

Purpose: Let users invoke individual pipeline stages directly without running the full swarm pipeline.
Output: 4 new command files + updated SKILL.md
</objective>

<execution_context>
@/Users/nickcrutzen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nickcrutzen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@orq-agent/commands/prompt.md (pattern to follow -- same 6-step structure)
@orq-agent/SKILL.md (to update with new commands)
@orq-agent/agents/architect.md (target subagent -- read first 25 lines for input contract)
@orq-agent/agents/tool-resolver.md (target subagent -- read first 30 lines for input contract)
@orq-agent/agents/researcher.md (target subagent -- read first 30 lines for input contract)
@orq-agent/agents/dataset-generator.md (target subagent -- read first 30 lines for input contract)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create 4 standalone command files</name>
  <files>
    orq-agent/commands/architect.md
    orq-agent/commands/tools.md
    orq-agent/commands/research.md
    orq-agent/commands/datasets.md
  </files>
  <action>
Create all 4 command files following the exact same structure as `orq-agent/commands/prompt.md`. Each command has the same 6-step pipeline pattern (Step 0: Parse Arguments, Step 1: Capture Input, Step 2: Quick Clarifications, Step 3: Construct Minimal Context, Step 4: Set Up Output Directory, Step 5: Spawn Subagent, Step 6: Summary). Each should be 100-200 lines.

**For each command, apply these specifics:**

### architect.md (`/orq-agent:architect`)
- Frontmatter: `description: Design an Orq.ai agent swarm blueprint from a use case description (standalone architect)`, `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task`, `argument-hint: [use-case-description]`
- Role section: "Orq.ai Standalone Architect" -- takes a use case description and produces a swarm blueprint without running any downstream stages
- files_to_read: `orq-agent/SKILL.md`
- Step 1 banner: `ORQ > ARCHITECT`
- Step 2 clarifications (present as single prompt block, 3 questions):
  1. Agent count preference? a) Single agent (default) b) Multi-agent if justified c) You decide
  2. Domain/industry? (e.g., "customer support", "e-commerce", "healthcare", or "general")
  3. Any specific tools or integrations needed? (e.g., "Slack, Jira" or "none")
- Step 3: No inline blueprint needed -- the architect IS the blueprint producer. Instead, construct a structured input summary from user answers (use case + preferences) to pass to the architect subagent
- Step 4: Output directory setup with auto-versioning (same as prompt.md). Create `{OUTPUT_DIR}/[swarm-name]/` directory. Derive swarm-name from use case description
- Step 5: Spawn `orq-agent/agents/architect.md` via Task tool. Pass: use case description, user preferences from Step 2. The architect reads its own references via files_to_read. Output: `{OUTPUT_DIR}/[swarm-name]/blueprint.md`
- Step 6: Summary showing blueprint path, suggest next steps: "Run /orq-agent:tools to resolve tools" or "Run /orq-agent for full pipeline"

### tools.md (`/orq-agent:tools`)
- Frontmatter: `description: Resolve tool needs for Orq.ai agents and produce a TOOLS.md (standalone tool resolver)`, `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task`, `argument-hint: [use-case-description] or --blueprint <path>`
- Role section: "Orq.ai Standalone Tool Resolver" -- resolves tools for agents and produces TOOLS.md
- files_to_read: `orq-agent/SKILL.md`
- Step 0: Parse args for `--output <path>` AND `--blueprint <path>` flags. If `--blueprint` provided, that file IS the blueprint (skip inline construction in Step 3). Otherwise, remaining text is the use case description
- Step 1 banner: `ORQ > TOOL RESOLVER`
- Step 2 clarifications (3 questions):
  1. What agents need tools? a) Provide agent names/roles b) Single agent (describe role) c) Use blueprint file (provide path)
  2. Integration types needed? a) APIs/webhooks b) MCP servers c) Knowledge bases d) Web search e) Multiple (specify)
  3. Any specific services? (e.g., "Stripe, Slack, Zendesk" or "none")
- Step 3: If `--blueprint` was provided, read that file. Otherwise, construct a minimal blueprint inline with agent list and roles from user answers (similar to how prompt.md constructs a single-agent blueprint, but allow multiple agents). Use naming-conventions.md for key derivation
- Step 4: Output directory setup. Create `{OUTPUT_DIR}/[swarm-name]/`
- Step 5: Spawn `orq-agent/agents/tool-resolver.md` via Task tool. Pass: blueprint (file path or inline), output directory path. Output: `{OUTPUT_DIR}/[swarm-name]/TOOLS.md`
- Step 6: Summary showing TOOLS.md path

### research.md (`/orq-agent:research`)
- Frontmatter: `description: Research domain best practices for an Orq.ai agent role (standalone researcher)`, `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task`, `argument-hint: [agent-role-description]`
- Role section: "Orq.ai Standalone Researcher" -- investigates domain best practices for an agent role
- files_to_read: `orq-agent/SKILL.md`
- Step 1 banner: `ORQ > RESEARCHER`
- Step 2 clarifications (3 questions):
  1. Focus areas? a) Model selection b) Prompt strategy c) Guardrails d) Tool recommendations e) All of the above
  2. Agent's primary domain? (e.g., "customer support", "data analysis", "content generation")
  3. Any constraints? (e.g., "must use GPT-4o", "no web search tools", or "none")
- Step 3: Construct a minimal single-agent blueprint inline from user answers. Read `orq-agent/references/naming-conventions.md` for key derivation. Blueprint format: single agent with key, role, responsibility, model (default anthropic/claude-sonnet-4-5), tools (from user hints)
- Step 4: Output directory setup. Create `{OUTPUT_DIR}/[agent-name]/`
- Step 5: Spawn `orq-agent/agents/researcher.md` via Task tool. Pass: blueprint (inline), TOOLS.md: "Tool resolution unavailable -- generate tool recommendations independently". Output: `{OUTPUT_DIR}/[agent-name]/research-brief.md`
- Step 6: Summary showing research brief path, suggest "Run /orq-agent:prompt to generate a full spec"

### datasets.md (`/orq-agent:datasets`)
- Frontmatter: `description: Generate test datasets for an Orq.ai agent (standalone dataset generator)`, `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task`, `argument-hint: [agent-spec-path] or [agent-description]`
- Role section: "Orq.ai Standalone Dataset Generator" -- produces dual test datasets (clean + edge case)
- files_to_read: `orq-agent/SKILL.md`
- Step 0: Parse args for `--output <path>` flag AND detect if remaining arg is a file path (ends in .md, contains `/`) vs. a description
- Step 1 banner: `ORQ > DATASET GENERATOR`
- Step 2 clarifications (3 questions):
  1. Dataset size? a) Small (15 cases) b) Standard (25 cases) c) Large (40+ cases)
  2. Adversarial focus? a) OWASP LLM Top 10 coverage b) Domain-specific edge cases c) Prompt injection focus d) All categories
  3. Any specific scenarios to include? (e.g., "test multilingual inputs", "test rate limit handling", or "none")
- Step 3: If input is a file path, read it as the agent spec. Construct a minimal blueprint from the spec's metadata (agent key, role, model). If input is a description, construct both a minimal blueprint AND a minimal spec context inline (agent key, role, responsibility, basic instructions)
- Step 4: Output directory setup. Create `{OUTPUT_DIR}/[agent-name]/datasets/`
- Step 5: Spawn `orq-agent/agents/dataset-generator.md` via Task tool. Pass: blueprint, research brief ("Research unavailable -- generate datasets from spec only"), agent spec (file path or inline context), user preferences from Step 2. Output: `{OUTPUT_DIR}/[agent-name]/datasets/[agent-key]-dataset.md` and `{OUTPUT_DIR}/[agent-name]/datasets/[agent-key]-edge-dataset.md`
- Step 6: Summary showing both dataset file paths, note the adversarial case percentage

**Patterns consistent across ALL 4 commands (copy from prompt.md):**
- Same frontmatter structure (description, allowed-tools, argument-hint)
- Same `<files_to_read>` block referencing SKILL.md
- Same `<role>` section format
- Same `<pipeline>` wrapper with `---` separators between steps
- Same Step 0 flag parsing logic (always support `--output <path>`, default `./Agents/`)
- Same Step 1 input capture pattern (use $ARGUMENTS if provided, else prompt user)
- Same Step 4 auto-versioning logic for output directories
- Same banner style with `ORQ >` prefix
- Same "skip" option in Step 2 to let Claude decide everything
- Same completion banner format in Step 6
  </action>
  <verify>
    <automated>cd /Users/nickcrutzen/Developer/claude-code-prompt-agent && for f in orq-agent/commands/architect.md orq-agent/commands/tools.md orq-agent/commands/research.md orq-agent/commands/datasets.md; do echo "--- $f ---"; test -f "$f" && echo "EXISTS ($(wc -l < "$f") lines)" || echo "MISSING"; done</automated>
    <manual>Spot-check that each file has frontmatter, role section, 6 pipeline steps, and spawns the correct subagent</manual>
  </verify>
  <done>All 4 command files exist at 100-200 lines each, follow the prompt.md pattern with 6-step pipeline, spawn the correct subagent, and have command-specific clarification questions</done>
</task>

<task type="auto">
  <name>Task 2: Update SKILL.md with new commands</name>
  <files>orq-agent/SKILL.md</files>
  <action>
Update the Commands section in `orq-agent/SKILL.md`:

1. Add 4 new rows to the command table (after the /orq-agent:prompt row):

| `/orq-agent:architect` | `commands/architect.md` | Standalone architect -- designs swarm blueprint from use case description |
| `/orq-agent:tools` | `commands/tools.md` | Standalone tool resolver -- resolves tool needs and produces TOOLS.md |
| `/orq-agent:research` | `commands/research.md` | Standalone researcher -- investigates domain best practices for agent roles |
| `/orq-agent:datasets` | `commands/datasets.md` | Standalone dataset generator -- produces dual test datasets (clean + edge) |

2. Add new invocation mode examples to the "Invocation modes" list:

- Architect only: `/orq-agent:architect "Build a customer support triage system"` (blueprint only)
- Tool resolution: `/orq-agent:tools --blueprint ./Agents/support/blueprint.md` (resolve tools from existing blueprint)
- Research: `/orq-agent:research "Customer support triage agent that routes tickets"` (research brief only)
- Datasets: `/orq-agent:datasets ./Agents/support/agents/support-triage-agent.md` (generate test datasets from spec)

3. Update the Directory Structure tree to include the 4 new command files under `commands/`.
  </action>
  <verify>
    <automated>cd /Users/nickcrutzen/Developer/claude-code-prompt-agent && grep -c "orq-agent:architect\|orq-agent:tools\|orq-agent:research\|orq-agent:datasets" orq-agent/SKILL.md</automated>
    <manual>Verify count is at least 8 (each command appears in table + invocation modes)</manual>
  </verify>
  <done>SKILL.md lists all 4 new commands in the commands table, invocation modes section, and directory structure</done>
</task>

</tasks>

<verification>
All 4 command files exist and follow the prompt.md pattern. SKILL.md updated with all new commands. Each command spawns the correct subagent via Task tool.
</verification>

<success_criteria>
- 4 new files in orq-agent/commands/ (architect.md, tools.md, research.md, datasets.md)
- Each file: 100-200 lines, frontmatter + role + 6-step pipeline
- Each file spawns correct subagent: architect.md -> agents/architect.md, tools.md -> agents/tool-resolver.md, research.md -> agents/researcher.md, datasets.md -> agents/dataset-generator.md
- SKILL.md commands table has 8 rows (4 existing + 4 new)
- SKILL.md invocation modes lists examples for all 4 new commands
</success_criteria>

<output>
After completion, create `.planning/quick/2-add-orq-agent-architect-standalone-comma/2-SUMMARY.md`
</output>
