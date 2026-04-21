---
description: Optimize a prompt against the 11-guideline framework; produce up to 5 suggestions; rewrite on approval; create new version on orq.ai preserving the original
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, Task, AskUserQuestion
argument-hint: "[--prompt-key <key>] [--prompt <inline-text>] [--max-suggestions <N<=5>]"
---

# Prompt Optimization

You are running the `/orq-agent:prompt-optimization` command. This command analyzes a single target prompt against the 11-guideline prompt-engineering framework, emits up to 5 actionable suggestions mapped to named anchors, presents a side-by-side diff of the proposed rewrite, gates the rewrite behind explicit user approval, and — on approval — publishes the result as a **new version** on orq.ai while preserving the original for rollback.

**Tier:** deploy+ (requires MCP + REST against a live orq.ai workspace). Core-tier users see: "Prompt optimization requires orq.ai access — run the installer with `--reconfigure` and select deploy+."

## Constraints

- **NEVER** mutate the original prompt in place — **ALWAYS** publish rewrites as a new orq.ai version preserving the original for rollback (POPT-04).
- **NEVER** rewrite `{{variable}}` placeholders — **ALWAYS** preserve them literally; scan for them before any rewrite begins (POPT-01).
- **NEVER** emit more than 5 suggestions per run — cap at 5 even if more guideline gaps exist (POPT-02).
- **NEVER** apply a rewrite without explicit user approval via `AskUserQuestion` after diff presentation (POPT-03).
- **NEVER** fabricate an orq.ai API response when MCP + REST both fail — STOP and surface the raw error (matches Phase 36 discipline).
- **ALWAYS** map every suggestion to exactly one of the 11 guideline anchors: `role`, `task`, `stress`, `guidelines`, `output-format`, `tool-calling`, `reasoning`, `examples`, `unnecessary-content`, `variable-usage`, `recap` (POPT-02).
- **ALWAYS** call MCP `create_prompt_version` first; fall back to REST `POST /v2/prompts/{key}/versions` with `$ORQ_API_KEY` on MCP failure.
- **ALWAYS** recommend `/orq-agent:test` after a new version is published so the rewrite gets A/B validation against the original.

**Why these constraints:** Publishing as a new version (rather than overwriting) preserves the prior prompt for rollback — orq.ai's versioning model is the single source of truth for experimental integrity; in-place mutation destroys the comparison baseline for every future A/B test. Preserving `{{variable}}` placeholders literally matters because those tokens are substituted at invocation time from the orq.ai prompt runtime — rewriting them silently breaks every downstream deployment that depends on the placeholder contract. The 5-suggestion cap is a cognitive-load ceiling: users who receive 8+ suggestions apply none; capping at 5 forces prioritization and re-runs deliver the next batch after the first wave lands. The `AskUserQuestion` approval gate treats a new prompt version as a destructive action (even though rollback-safe) because it materializes a new artifact in the workspace and can mislead collaborators if they don't know about it. Mapping every suggestion to one of the 11 anchors prevents ad-hoc "other" taxonomy drift — the 11 categories are the canonical prompt-engineering grammar this project uses, and they match the rubric in `orq-agent/commands/prompt-optimization/resources/11-guidelines.md`.

## When to use

- User wants to improve a single prompt against canonical prompting discipline before running a comparison / experiment (`/orq-agent:test`, `/orq-agent:compare-frameworks`).
- A `/orq-agent:trace-failure-analysis` run classified failures as `specification` (prompt-fix) and the user is reaching for the prompt-engineering surface.
- Post-deployment tightening — the prompt works, but the user wants to harden it against one of the 11 guideline anchors (clearer `output-format`, explicit `tool-calling` rules, better `examples`, etc.).
- Pre-launch polish on a prompt authored externally where the user wants a guideline-grounded second pass.

## When NOT to use

- User needs automatic guideline compliance scoring — defer to Phase 42 evaluator framework; this skill is advisory, not scoring.
- User needs automatic framework / agent detection — defer to `/orq-agent:observability` (Phase 37); this skill assumes the target prompt is already identified.
- User wants cross-framework benchmarking of the improved prompt — after this skill publishes the new version, hand off to `/orq-agent:compare-frameworks`.
- User wants A/B experimental validation on the rewrite — after this skill publishes the new version, hand off to `/orq-agent:test`.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:test` — after a new version is created, this is the recommended A/B validation surface against the prior version.
- → `/orq-agent:compare-frameworks` — after rewrite, benchmark the improved prompt across orq.ai / LangGraph / CrewAI / OpenAI Agents SDK / Vercel AI SDK.
- ← `/orq-agent:trace-failure-analysis` — when the grounded-theory taxonomy classifies failures as `specification`, the recommended handoff is a prompt-engineering fix via this skill.
- ← `/orq-agent:traces` — user inspects a problematic trace, decides the root cause is prompt wording, and reaches for this skill.

## Done When

- [ ] Banner `ORQ ► PROMPT OPTIMIZATION` printed with the target prompt key (or `<inline>`) on the sub-line.
- [ ] Target prompt fetched; `{{variable}}` placeholders inventoried and preserved literally in a **Variables Preserved** block.
- [ ] Each of the 11 guideline anchors (`role`, `task`, `stress`, `guidelines`, `output-format`, `tool-calling`, `reasoning`, `examples`, `unnecessary-content`, `variable-usage`, `recap`) scored Present / Partial / Missing.
- [ ] Up to 5 suggestions produced (hard cap), each mapped to exactly one of the 11 anchors, in the canonical Suggestion block format.
- [ ] Side-by-side markdown diff rendered in a ```diff fenced block with every `{{variable}}` preserved literally.
- [ ] `AskUserQuestion` approval gate fired; rewrite only applied on explicit `yes`.
- [ ] New version published on orq.ai via MCP `create_prompt_version` (or REST `POST /v2/prompts/{key}/versions` fallback); original preserved for rollback.
- [ ] `/orq-agent:test --prompt-key <key> --version <new_id>` recommended on-screen for A/B validation.

## Destructive Actions

- **Create new prompt version on orq.ai** — requires `AskUserQuestion` confirm after diff review. The original version is preserved (rollback-safe via orq.ai's versioning model), but a new artifact materializes in the workspace, so this is gated.

## Step 1: Fetch Target Prompt

Emit the banner as the first line of runtime output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► PROMPT OPTIMIZATION                  ${TARGET}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

`${TARGET}` is either the `--prompt-key <key>` value or the literal string `<inline>` when `--prompt <inline-text>` was supplied.

Parse `$ARGUMENTS` for the following long-form flags (no short flags — Phase 34 convention). Unknown flags STOP with a usage hint.

| Flag | Required | Default | Purpose |
|------|----------|---------|---------|
| `--prompt-key <key>` | one of | none | Fetch the prompt from orq.ai by key. |
| `--prompt <inline-text>` | one of | none | Pass the prompt inline (no orq.ai fetch). |
| `--max-suggestions <N>` | optional | `5` | Cap on suggestions; hard ceiling is 5 (values > 5 are clamped to 5). |

Exactly ONE of `--prompt-key` or `--prompt` MUST be present; otherwise STOP with `Provide --prompt-key <key> OR --prompt <text> (got neither).`

**Fetch path (prompt-key):** call MCP `get_prompt(key=$PROMPT_KEY)`. REST fallback (surface raw error inline, do NOT swallow):

```bash
curl -sS -H "Authorization: Bearer $ORQ_API_KEY" \
  "https://api.orq.ai/v2/prompts/${PROMPT_KEY}"
```

Store the fetched text as `ORIGINAL_PROMPT` and capture the current version id as `ORIGINAL_VERSION_ID` (needed for the new-version parent link in Step 7). If both MCP and REST fail, STOP — never fabricate prompt content.

**Inline path:** store the `--prompt` argument verbatim as `ORIGINAL_PROMPT`; `ORIGINAL_VERSION_ID` is `null` (the Step 7 new-version path is skipped in favor of emitting the rewritten prompt to stdout for the user to paste).

## Step 2: Variable Scan (POPT-01)

The `variable-usage` anchor is load-bearing for this step — orq.ai's prompt runtime substitutes `{{variable}}` placeholders at invocation time, so preserving them literally is a correctness requirement, not a stylistic choice.

Run the regex `\{\{[^}]+\}\}` over `ORIGINAL_PROMPT`. Capture every distinct match into `VARIABLES[]` (dedupe).

If any placeholders appear, emit a **Variables Preserved** block listing each one:

```
Variables Preserved (variable-usage):
  {{customer_name}}
  {{ticket_id}}
  {{refund_amount}}
```

These exact tokens MUST appear unchanged in the Step 5 rewrite draft. If the rewrite diff introduces, removes, or renames any of them, the skill-LLM MUST self-correct before emitting the diff — the `variable-usage` contract is inviolable.

If `ORIGINAL_PROMPT` contains zero placeholders, emit `No {{variable}} placeholders detected — variable-usage anchor is trivially satisfied.`

## Step 3: Analyze Against 11 Guidelines (POPT-02)

For each of the 11 guideline anchors, rate coverage as **Present** / **Partial** / **Missing**. Reference `orq-agent/commands/prompt-optimization/resources/11-guidelines.md` for the per-category rubric (what counts as Present vs Partial vs Missing for each anchor).

Render the analysis as a table:

```
| Anchor               | Coverage | Evidence (1 sentence)                                             |
|----------------------|----------|-------------------------------------------------------------------|
| role                 | Present  | "You are a senior refund triage agent..." establishes the role.   |
| task                 | Partial  | Task described but success criteria implicit.                     |
| stress               | Missing  | No stakes / urgency / failure-cost framing.                       |
| guidelines           | Present  | 4 numbered rules for tone + scope.                                |
| output-format        | Missing  | No JSON schema or structural contract on the output.              |
| tool-calling         | Partial  | Tools listed but no when-to-call-which decision rules.            |
| reasoning            | Missing  | No "think step by step" or structured-reasoning scaffold.         |
| examples             | Partial  | One positive example; no negative / edge-case example.            |
| unnecessary-content  | Present  | Prompt is tight; no filler.                                       |
| variable-usage       | Present  | {{customer_name}}, {{ticket_id}} used correctly.                  |
| recap                | Missing  | No closing recap of the must-do / must-not-do list.               |
```

The 11 anchors MUST all appear in the table, in this exact order, with verbatim anchor names — the lint anchor phrases `role`, `task`, `stress`, `guidelines`, `output-format`, `tool-calling`, `reasoning`, `examples`, `unnecessary-content`, `variable-usage`, `recap` are required for the VALIDATION grep to pass.

## Step 4: Produce Up To 5 Suggestions (POPT-02)

Prioritize the **highest-leverage gaps** from Step 3 — prefer `Missing` over `Partial`, prefer anchors that unblock downstream evaluation (`output-format`, `task`, `reasoning`) over cosmetic anchors, break ties by pick-order in the 11-list.

Emit up to `min($MAX_SUGGESTIONS, 5)` suggestions in **this exact format** per suggestion:

```
### Suggestion N: [guideline-category]
**Problem:** <one sentence describing the gap found in Step 3>
**Proposed change:** <one paragraph describing the edit — concrete, pasteable-quality prose>
**Guideline anchor:** role | task | stress | guidelines | output-format | tool-calling | reasoning | examples | unnecessary-content | variable-usage | recap
```

**Hard cap 5.** If more gaps exist after the top 5, append exactly this line at the end of the suggestions block:

```
Additional gaps truncated; re-run /orq-agent:prompt-optimization after applying the top 5.
```

Every `**Guideline anchor:**` value MUST be exactly one of the 11 verbatim anchor names — if a proposed suggestion doesn't cleanly map to one, **DROP the suggestion** rather than inventing an "other" category (Anti-Patterns row 5).

## Step 5: Rewrite Draft + Diff (POPT-03)

Compose the rewritten prompt that applies every suggestion from Step 4. Reference `orq-agent/commands/prompt-optimization/resources/rewrite-examples.md` for canonical before/after patterns per anchor (how a missing `output-format` becomes a JSON schema block, how a missing `recap` becomes a closing must-do list, etc.).

**Variable-usage invariant:** every token in `VARIABLES[]` from Step 2 MUST appear unchanged in the rewritten prompt. Run the `\{\{[^}]+\}\}` regex over the rewrite; compare against `VARIABLES[]`; if the sets differ, re-draft before emitting.

Emit the diff in a ```diff fenced block, side-by-side line-oriented (standard unified-diff style is acceptable when line changes are dense):

````
```diff
- You are a refund agent.
- Help the customer at {{ticket_id}}.
+ You are a senior refund triage agent with authority up to $500.
+
+ ## Task
+ Resolve the customer's refund request at {{ticket_id}} for {{customer_name}}.
+ Success = customer leaves satisfied AND refund policy is honored.
+
+ ## Output format
+ Respond with JSON matching this schema:
+ { "decision": "approve" | "deny" | "escalate", "rationale": string, "amount_usd": number }
+
+ ## Recap
+ - Always check refund policy before approving.
+ - Never approve > $500 without escalation.
+ - Preserve {{customer_name}} tone throughout.
```
````

After the diff, emit a one-line summary: `Applied N suggestions mapped to anchors: <anchor1>, <anchor2>, ...`

## Step 6: Approval Gate (POPT-03)

Fire exactly one `AskUserQuestion` call with the question **"Apply rewrite and publish as a new version on orq.ai? (original preserved for rollback)"** and these three choices:

- `yes` — proceed to Step 7 and publish the new version.
- `no` — STOP. Emit `Rewrite not applied. Original prompt unchanged. Re-run /orq-agent:prompt-optimization with a revised --prompt-key or --prompt to iterate.` and exit.
- `edit-first` — STOP, emit the rewritten prompt to stdout (unfenced) and tell the user: `Paste the rewrite back via --prompt '<edited-text>' to publish as a new version.` Exit without creating a version.

Only on explicit `yes` does the skill proceed to Step 7. Any other response — including silence, ambiguous free-text, or a fourth option — is treated as `no`.

## Step 7: Publish New Version (POPT-04)

**Inline path guard:** if `ORIGINAL_VERSION_ID` is `null` (inline `--prompt` mode), skip the publish and emit the rewritten prompt to stdout with: `Inline mode — no orq.ai prompt key to version against. Paste the rewrite into your orq.ai workspace manually, then run /orq-agent:test once it's deployed.` Exit successfully.

**Prompt-key path:** call MCP `create_prompt_version` first:

```
mcp__orqai-mcp__create_prompt_version(
  key=$PROMPT_KEY,
  parent_version_id=$ORIGINAL_VERSION_ID,
  content=<rewritten prompt>,
  change_note="Optimized against 11-guideline framework via /orq-agent:prompt-optimization — suggestions applied: <anchor list>"
)
```

REST fallback if MCP errors (surface the raw error inline, do NOT swallow):

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- \
  "https://api.orq.ai/v2/prompts/${PROMPT_KEY}/versions" <<JSON
{
  "parent_version_id": "${ORIGINAL_VERSION_ID}",
  "content": "<rewritten prompt, JSON-escaped>",
  "change_note": "Optimized via /orq-agent:prompt-optimization — anchors: <list>"
}
JSON
```

Capture the returned version id as `NEW_VERSION_ID`. If **both** MCP and REST fail, STOP with the raw error — NEVER synthesize a success response. A fabricated version id silently poisons the downstream `/orq-agent:test` A/B run because the test will resolve to the wrong artifact.

Emit:

```
✔ New version published: ${NEW_VERSION_ID}
  Parent: ${ORIGINAL_VERSION_ID}
  Key:    ${PROMPT_KEY}
  Rollback: the original version remains active until you switch default in orq.ai.
```

## Step 8: Recommend A/B Validation

Emit exactly this line (with variables substituted):

```
Run /orq-agent:test --prompt-key ${PROMPT_KEY} --version ${NEW_VERSION_ID} to A/B validate against the previous version.
```

Then emit the "Open in orq.ai" section (see below) with the prompt URL deep-linked to the new version id where supported.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Overwriting the original prompt in place | Publish as a new version; orq.ai keeps the prior one for rollback (POPT-04). In-place mutation destroys the A/B baseline for every future experiment. |
| Rewriting `{{variable}}` placeholders "to make them clearer" | Preserve them literally — they are substituted at invocation time from the prompt runtime; renaming silently breaks every downstream deployment (POPT-01). |
| Emitting 8 suggestions to be thorough | Cap at 5 — cognitive load beats coverage (POPT-02). Users who receive 8+ suggestions apply zero; re-run the skill after the first 5 land. |
| Applying the rewrite without the `AskUserQuestion` gate | The diff must be reviewed; approval is mandatory (POPT-03). A new version is a workspace-visible artifact even when rollback-safe. |
| Mapping a suggestion to "other" because the anchor taxonomy feels constraining | Every suggestion MUST map to one of the 11 anchors; if it doesn't, DROP the suggestion. The 11-anchor grammar is the project's canonical prompt-engineering vocabulary. |
| Fabricating a `NEW_VERSION_ID` when both MCP and REST fail | STOP with the raw error — never invent version ids. A synthetic id poisons downstream `/orq-agent:test` because the A/B run resolves to the wrong artifact. |

## Open in orq.ai

- **Prompts:** https://my.orq.ai/prompts
- **Experiments:** https://my.orq.ai/experiments (post-rewrite A/B validation via `/orq-agent:test`)
- **Agent Studio:** https://my.orq.ai/agents

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`get_prompt`, `create_prompt_version`, `search_entities`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
