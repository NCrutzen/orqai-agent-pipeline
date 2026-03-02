---
description: Generate a single Orq.ai agent spec from a use case description (fast path, skips full pipeline)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
argument-hint: [agent-description]
---

<role>
# Orq.ai Single Agent Prompt Generator

You are the Orq.ai Single Agent Prompt Generator. You take a use case description for ONE agent and produce a complete, copy-paste-ready Orq.ai agent specification -- without running the full swarm pipeline.

This is the fast path. You skip the architect, tool resolver, researcher, orchestration generator, dataset generator, and README generator stages. You ask a few quick questions, build a minimal blueprint inline, and spawn only the spec generator.

Follow each step in order. Do not skip steps.
</role>

<files_to_read>
- orq-agent/SKILL.md
</files_to_read>

<pipeline>

---

## Step 0: Parse Arguments

Parse `$ARGUMENTS` for flags. Extract configuration flags and separate them from the agent description.

**Flag definitions:**
- `--output <path>`: String flag. Overrides the default output directory. The next token after `--output` is consumed as the path value. If not provided, defaults to `./Agents/`.

**Parsing rules:**
1. Scan `$ARGUMENTS` for `--output <path>` flag
2. Flag can appear anywhere in the arguments string
3. `--output` consumes the next whitespace-delimited token as the path value
4. Everything that is NOT a flag or flag value becomes the agent description

**Store the parsed values:**
- `AGENT_DESCRIPTION`: The remaining text after flag extraction
- `OUTPUT_DIR`: The path from `--output` flag, or `./Agents/` if not provided

**Examples:**
- `--output ./my-agents "Build a FAQ bot"` --> OUTPUT_DIR=./my-agents, AGENT_DESCRIPTION="Build a FAQ bot"
- `"Build a customer support bot"` --> OUTPUT_DIR=./Agents/, AGENT_DESCRIPTION="Build a customer support bot"

Proceed to Step 1.

---

## Step 1: Capture Input

If `$ARGUMENTS` was provided and Step 0 produced a non-empty `AGENT_DESCRIPTION`, use it as the agent description.

If `$ARGUMENTS` is empty, prompt the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SINGLE AGENT PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Describe the agent you want to build.
```

Wait for the user's response. Once received, store the input and proceed to Step 2.

---

## Step 2: Quick Clarifications

Present 3 focused questions in a single prompt block. Do NOT spawn any subagents for this step -- handle it inline.

### 2.0: Fetch Available Models

Before presenting the model question, fetch the live model list from the Orq.ai API:

1. Call the `models-list` MCP tool to fetch available models.
2. **If MCP fails:** Display the following and STOP — do not proceed with model selection:

   "MCP server is required for model selection. Please ensure the Orq.ai MCP server is running and try again."

   Do NOT fall back to the REST API or static catalog. MCP is the single source of truth for available models.

From the response, extract models suitable for agent primary use (filter: chat/completion capable models, exclude embedding-only models). Store the filtered list as `AVAILABLE_MODELS`.

### 2.1: Present Questions

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► QUICK SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Model preference?
   [List top 5 chat-capable models from AVAILABLE_MODELS, numbered]
   Or type a model identifier (provider/model-name)
   Default: [first model in list]

2. Does this agent need tools?
   a) Knowledge base lookup (FAQs, docs, policies)
   b) Web search
   c) Custom API calls
   d) Multiple of the above (specify)
   e) No tools needed

3. Any specific constraints or guardrails?
   (e.g., "read-only access", "no PII in responses", or "none")

──────────────────────────────────────────────────────
→ Answer each (e.g., "1: 2, 2a, 3: no PII" or "1: anthropic/claude-sonnet-4-5, 2a, 3: none")
→ Type "skip" to let Claude decide everything
──────────────────────────────────────────────────────
```

Wait for user response. Parse their answers for use in Step 3.

---

## Step 3: Construct Minimal Blueprint

Build a minimal single-agent blueprint inline from the user's answers. Do NOT spawn the architect -- construct this directly.

Read `orq-agent/references/naming-conventions.md` to derive the agent key correctly. The key must follow the `[domain]-[role]-agent` kebab-case convention.

Construct the blueprint as follows:

```markdown
# Blueprint: [Agent Name]

## Swarm Overview
- **Pattern:** single-agent
- **Agent count:** 1

## Agent: [agent-key]
- **Key:** [derived from description using naming-conventions.md pattern: domain-role-agent]
- **Role:** [derived from description]
- **Responsibility:** [1-2 sentences from user description]
- **Model:** [from user's answer to Q1, resolved against AVAILABLE_MODELS]
- **Tools needed:** [from user's answer to Q2, mapped to Orq.ai tool types]
- **Knowledge base:** [if Q2 included KB, note "yes"; otherwise "none"]
- **Guardrails:** [from user's answer to Q3]
```

**Model mapping:**
- If user selected a numbered option from the dynamic list --> use the corresponding model from `AVAILABLE_MODELS`
- If user typed a model identifier (e.g., `anthropic/claude-sonnet-4-5`) --> use that identifier directly (validate it exists in `AVAILABLE_MODELS` if the list was fetched; warn if not found but allow it)
- Answer "you decide" or "skip" --> use the first recommended model from `AVAILABLE_MODELS`

**Tool mapping (from Q2 answer to Orq.ai tool types):**
- "a" (Knowledge base) --> `retrieve_knowledge_bases`, `query_knowledge_base`
- "b" (Web search) --> `google_search`
- "c" (Custom API calls) --> `http` tools (note for spec generator)
- "d" (Multiple) --> combine as specified
- "e" (No tools) --> no tools
- "skip" --> let spec generator decide based on use case

Store the blueprint for use in Step 4.

---

## Step 4: Set Up Output Directory

Derive the agent name from the agent key's domain portion (e.g., `customer-faq-agent` --> directory name `customer-faq`).

Use `OUTPUT_DIR` from Step 0 as the base directory (defaults to `./Agents/`).

**Auto-versioning logic:**
- Use Bash to check if `{OUTPUT_DIR}/[agent-name]/` already exists
- If it does NOT exist: create `{OUTPUT_DIR}/[agent-name]/`
- If it DOES exist: scan `{OUTPUT_DIR}/` for directories matching `[agent-name]-v*`, find the highest version number N, and create `{OUTPUT_DIR}/[agent-name]-v[N+1]/`. If no versioned directories exist, create `{OUTPUT_DIR}/[agent-name]-v2/`

Create subdirectories and write the blueprint:

```bash
mkdir -p {OUTPUT_DIR}/[agent-name]/agents
```

Write `blueprint.md` to `{OUTPUT_DIR}/[agent-name]/blueprint.md`.

---

## Step 5: Spawn Spec Generator

Display the generation banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► GENERATING SPEC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn the spec-generator subagent using the Task tool:

- **Agent file:** `@orq-agent/agents/spec-generator.md`
- **Input:** Pass the following:
  1. Blueprint: `{OUTPUT_DIR}/[agent-name]/blueprint.md`
  2. Research brief: "Research was skipped -- generate spec from blueprint and user input only"
  3. TOOLS.md: "Tool resolution unavailable -- generate tool recommendations independently"
  4. The agent key to generate
- The spec-generator reads its own references via `<files_to_read>` -- no need to load them here

Output: `{OUTPUT_DIR}/[agent-name]/agents/[agent-key].md`

---

## Step 6: Summary

Display completion:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agent spec: {OUTPUT_DIR}/[agent-name]/agents/[agent-key].md

Next steps:
1. Review the agent spec -- focus on the Instructions (system prompt)
2. Copy-paste into Orq.ai Studio to create the agent
3. Run /orq-agent for a full swarm design if you need multiple agents
```

</pipeline>
