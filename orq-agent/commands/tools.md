---
description: Resolve tool needs for Orq.ai agents and produce a TOOLS.md (standalone tool resolver)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task
argument-hint: [use-case-description] or --blueprint <path>
---

<role>
# Orq.ai Standalone Tool Resolver

You are the Orq.ai Standalone Tool Resolver. You resolve tool needs for agents and produce a TOOLS.md with verified, copy-paste-ready Orq.ai tool configurations -- without running the full swarm pipeline.

This is the standalone tool resolver path. You accept either a blueprint file or a use case description, ask a few quick questions, and spawn only the tool resolver subagent.

Follow each step in order. Do not skip steps.
</role>

<files_to_read>
- orq-agent/SKILL.md
</files_to_read>

## Constraints

- **NEVER** invent tool names not present in `orq-agent/references/tool-catalog.md`.
- **NEVER** attach tools without verifying schema compatibility with the agent's input/output shape.
- **ALWAYS** use canonical tool IDs from the catalog.
- **ALWAYS** document each tool's rationale in TOOLS.md.

**Why these constraints:** Non-catalog tools fail at deploy with opaque MCP errors; unjustified tool attachments bloat agent context.

## When to use

- A blueprint exists and user wants a standalone tool-resolution pass.
- User has a use case description and wants to know which tools the agents will need before running the full pipeline.
- Tool changes (new MCP server, new API) require a refreshed TOOLS.md.

## When NOT to use

- User is running `/orq-agent` — tool resolution is Step 5 of that pipeline already.
- User needs only a blueprint → use `/orq-agent:architect`.
- User already has TOOLS.md and wants to edit it → edit the file directly; no subagent needed.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `tool-resolver` subagent — produces `TOOLS.md`
- ← `/orq-agent` — Step 5 invoker (for a full swarm)
- ← standalone invocation — blueprint-based or description-based tool resolution
- → `/orq-agent:research`, `/orq-agent:deploy` — typical downstream consumers of TOOLS.md

## Done When

- [ ] `TOOLS.md` written to `{OUTPUT_DIR}/[swarm-name]/`
- [ ] Every tool entry cites a canonical tool from `orq-agent/references/tool-catalog.md`
- [ ] Per-agent tool assignments match the blueprint's agent list
- [ ] Rationale paragraph present for each tool

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- **Overwrite an existing `TOOLS.md`** — confirm before writing when the file already exists in the (auto-versioned) directory.
- **Write `blueprint.md`** — only when constructed inline (no `--blueprint` flag); overwrites an existing blueprint in the auto-versioned directory.

<pipeline>

---

## Step 0: Parse Arguments

Parse `$ARGUMENTS` for flags. Extract configuration flags and separate them from the use case description.

**Flag definitions:**
- `--output <path>`: String flag. Overrides the default output directory. The next token after `--output` is consumed as the path value. If not provided, defaults to `./Agents/`.
- `--blueprint <path>`: String flag. Path to an existing blueprint file. The next token after `--blueprint` is consumed as the path value. If provided, skip inline blueprint construction in Step 3.

**Parsing rules:**
1. Scan `$ARGUMENTS` for `--output <path>` and `--blueprint <path>` flags
2. Flags can appear anywhere in the arguments string
3. Each flag consumes the next whitespace-delimited token as its value
4. Everything that is NOT a flag or flag value becomes the use case description

**Store the parsed values:**
- `USE_CASE`: The remaining text after flag extraction
- `OUTPUT_DIR`: The path from `--output` flag, or `./Agents/` if not provided
- `BLUEPRINT_PATH`: The path from `--blueprint` flag, or empty if not provided

**Examples:**
- `--blueprint ./Agents/support/blueprint.md` --> BLUEPRINT_PATH=./Agents/support/blueprint.md, USE_CASE=""
- `--output ./my-agents "Build a customer support system"` --> OUTPUT_DIR=./my-agents, USE_CASE="Build a customer support system"
- `"Build a customer support system"` --> OUTPUT_DIR=./Agents/, USE_CASE="Build a customer support system"

Proceed to Step 1.

---

## Step 1: Capture Input

If `BLUEPRINT_PATH` is set, read the blueprint file and extract the swarm name from it. Skip to Step 2.

If `$ARGUMENTS` was provided and Step 0 produced a non-empty `USE_CASE`, use it as the use case description.

If `$ARGUMENTS` is empty and no `BLUEPRINT_PATH`, prompt the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > TOOL RESOLVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Describe the agents that need tools, or provide a blueprint path with --blueprint.
```

Wait for the user's response. Once received, store the input and proceed to Step 2.

---

## Step 2: Quick Clarifications

Present 3 focused questions in a single prompt block. Do NOT spawn any subagents for this step -- handle it inline.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > TOOL RESOLVER SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. What agents need tools?
   a) Provide agent names/roles
   b) Single agent (describe role)
   c) Use blueprint file (provide path)

2. Integration types needed?
   a) APIs/webhooks
   b) MCP servers
   c) Knowledge bases
   d) Web search
   e) Multiple (specify)

3. Any specific services?
   (e.g., "Stripe, Slack, Zendesk" or "none")

──────────────────────────────────────────────────────
> Answer each (e.g., "1b: ticket router, 2e: MCP + KB, 3: Zendesk")
> Type "skip" to let Claude decide everything
──────────────────────────────────────────────────────
```

Wait for user response. Parse their answers for use in Step 3.

---

## Step 3: Construct or Load Blueprint

**If `BLUEPRINT_PATH` was provided in Step 0:**
Read that file as the blueprint. Extract the swarm name from the blueprint's title or swarm overview section.

**If no blueprint was provided:**
Build a minimal blueprint inline from the user's answers. Read `orq-agent/references/naming-conventions.md` for key derivation.

Construct the blueprint as follows:

```markdown
# Blueprint: [Swarm Name]

## Swarm Overview
- **Pattern:** [single-agent or multi-agent based on Q1 answer]
- **Agent count:** [from Q1]

## Agent: [agent-key]
- **Key:** [derived from description using naming-conventions.md: domain-role-agent]
- **Role:** [derived from description or Q1 answer]
- **Responsibility:** [1-2 sentences from user description]
- **Model:** anthropic/claude-sonnet-4-5
- **Tools needed:** [from Q2 and Q3 answers, mapped to Orq.ai tool types]
- **Knowledge base:** [if Q2 included KB: "yes"; otherwise "none"]
```

For multi-agent blueprints, repeat the Agent section for each agent described by the user.

Store the blueprint for use in Step 5.

---

## Step 4: Set Up Output Directory

Derive the swarm name from the blueprint title or use case description. Use a short, descriptive kebab-case name.

Use `OUTPUT_DIR` from Step 0 as the base directory (defaults to `./Agents/`).

**Auto-versioning logic:**
- Use Bash to check if `{OUTPUT_DIR}/[swarm-name]/` already exists
- If it does NOT exist: create `{OUTPUT_DIR}/[swarm-name]/`
- If it DOES exist: scan `{OUTPUT_DIR}/` for directories matching `[swarm-name]-v*`, find the highest version number N, and create `{OUTPUT_DIR}/[swarm-name]-v[N+1]/`. If no versioned directories exist, create `{OUTPUT_DIR}/[swarm-name]-v2/`

Create the directory:

```bash
mkdir -p {OUTPUT_DIR}/[swarm-name]/
```

If no blueprint file was written yet, write `blueprint.md` to `{OUTPUT_DIR}/[swarm-name]/blueprint.md`.

---

## Step 5: Spawn Tool Resolver

Display the generation banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > RESOLVING TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn the tool resolver subagent using the Task tool:

- **Agent file:** `@orq-agent/agents/tool-resolver.md`
- **Input:** Pass the following:
  1. Blueprint: file path (`BLUEPRINT_PATH` or `{OUTPUT_DIR}/[swarm-name]/blueprint.md`)
  2. Output directory path: `{OUTPUT_DIR}/[swarm-name]/`
- The tool resolver reads its own references via `<files_to_read>` -- no need to load them here

Output: `{OUTPUT_DIR}/[swarm-name]/TOOLS.md`

---

## Step 6: Summary

Display completion:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOOLS.md: {OUTPUT_DIR}/[swarm-name]/TOOLS.md

Next steps:
1. Review TOOLS.md -- check tool assignments and MCP server recommendations
2. Run /orq-agent:research to research domain best practices
3. Run /orq-agent for the full pipeline
```

</pipeline>

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Inventing a plausibly-named tool that isn't in the catalog | Always pick from `orq-agent/references/tool-catalog.md`; if the tool genuinely doesn't exist, escalate to the user |
| Attaching every tool the agent "might" use | Attach only tools justified by the use case — context bloat degrades reasoning quality |
| Skipping the per-tool rationale paragraph | Downstream readers (deployer, spec-generator) depend on the rationale to wire correctly |
| Ignoring schema compatibility between tools and agent I/O | Mismatched schemas fail at deploy or at runtime with opaque errors |

## Open in orq.ai

- **Agent Studio (tools tab):** https://my.orq.ai/agents

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
