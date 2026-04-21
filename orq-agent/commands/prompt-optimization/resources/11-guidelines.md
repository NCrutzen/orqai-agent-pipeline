# 11-Guideline Rubric for Prompt Optimization

This reference is consumed **only** by `/orq-agent:prompt-optimization` Step 3 (analysis). It is the authoritative rubric the skill uses to produce up to 5 targeted suggestions (POPT-02).

Do **not** reference this file from any other skill — it is single-consumer by design and lives under `commands/prompt-optimization/resources/` so lint auto-excludes it.

Each of the 11 categories has the same shape:

- **What it is** — one- or two-sentence definition.
- **Pass criteria** — falsifiable bullets; if any criterion fails, the category counts as "gap."
- **Common failures** — recurring anti-patterns.
- **Improvement levers** — what a suggestion targeting this category should actually change.

The category slugs below (`role`, `task`, …, `recap`) are the lint anchors emitted by the skill's `Guideline anchor:` field. They are lowercase, kebab-case, and MUST match verbatim — no synonyms.

---

## role

**What it is.** A single declarative statement that fixes WHO the model is speaking as: persona, domain expertise, and tone posture. The role sets the voice and the implicit priors for every downstream instruction.

**Pass criteria.**
- Exactly one role statement, placed in the first 1–3 lines of the system prompt.
- Names a persona (e.g., "senior refund-policy auditor") rather than a vague adjective ("helpful assistant").
- Consistent with the task — a "playful comedian" role paired with a compliance task is a fail.
- No conflicting secondary personas later in the prompt.

**Common failures.**
- Missing entirely ("You are an AI…" or no role at all).
- Generic ("You are a helpful AI assistant") — adds no prior.
- Role drift — role says "legal reviewer," examples show casual chat.
- Role stacked with task in one run-on sentence ("You are a tutor who will…") — splits badly when edited.

**Improvement levers.**
- Add a crisp persona with domain seniority.
- Separate role from task into its own line/section.
- Align role tone with the output register the user actually wants.

---

## task

**What it is.** An imperative statement of the single primary objective the model must achieve on every invocation. Task is the *what*; guidelines are the *how*.

**Pass criteria.**
- Stated as a direct imperative in the first third of the prompt.
- Exactly one primary task; secondary objectives are explicitly subordinated.
- References the relevant `{{variables}}` the task consumes.
- Success condition is implicit or explicit (e.g., "produce a refund decision").

**Common failures.**
- Buried inside a wall of context.
- Multiple co-equal tasks ("summarize AND classify AND translate").
- Phrased as description, not instruction ("This prompt helps users with refunds" — the model is not a user).
- Task assumes variables that are never supplied.

**Improvement levers.**
- Lift task to an explicit `## Task` section or opening imperative.
- Collapse co-equal tasks by picking the primary and demoting the rest to guidelines.
- Reference the variables the task operates on.

---

## stress

**What it is.** Emphasis applied to the subset of rules that, if violated, make the output unacceptable — even if everything else is correct. Stress is rationed: if everything is stressed, nothing is.

**Pass criteria.**
- At most 2–3 items marked as critical (IMPORTANT, MUST, NEVER).
- Each stressed item corresponds to a genuine hard constraint (safety, compliance, refusal trigger, format requirement).
- Stress is typographically consistent (all caps OR bold OR sigil — not all three stacked).

**Common failures.**
- IMPORTANT stacked on every bullet — the signal degrades to noise.
- No stress at all despite a real hard constraint (e.g., PII redaction) — model treats it as a soft preference.
- Stress placed on stylistic preferences ("IMPORTANT: be friendly") — wastes the emphasis budget.
- Contradictory stress ("NEVER mention prices" appearing next to "always quote the price").

**Improvement levers.**
- Reduce to the 1–3 truly non-negotiable rules.
- Move stress markers to hard constraints only; demote stylistic items to plain prose.
- Normalize typography to one stress convention.

---

## guidelines

**What it is.** The enumerated rules, heuristics, and preferences that steer HOW the task is performed. This is the bulk of prompt content.

**Pass criteria.**
- Presented as a numbered or bulleted list (not run-on prose).
- Each guideline is atomic (one idea per bullet).
- Guidelines are positively phrased when possible ("respond in JSON" over "don't respond in prose").
- No duplication, no contradiction, no dead bullets left over from prior edits.

**Common failures.**
- Paragraph form — model weights the first sentence and drops the rest.
- Compound bullets ("Respond briefly, politely, in JSON, with citations, never mentioning prices").
- Contradictions between bullets ("Be terse" + "Provide exhaustive detail").
- Stale bullets referencing features that no longer exist.

**Improvement levers.**
- Split compound bullets.
- Dedupe and resolve contradictions explicitly.
- Reorder so the most load-bearing guideline is first.
- Convert prose sections to bullets.

---

## output-format

**What it is.** The explicit schema, structure, or shape the response must take — JSON keys, markdown headings, XML tags, table columns, length bounds.

**Pass criteria.**
- Output shape is named and described (JSON schema, example block, or XML tag list).
- For structured output, an example is shown, not just described.
- Length or field bounds are explicit when they matter.
- Format is consistent with the tool-calling / reasoning conventions in use.

**Common failures.**
- "Respond in JSON" with no schema → model invents keys.
- Example block shows prose but instructions demand JSON — example wins.
- Length cap stated as "brief" or "short" — not falsifiable.
- Multiple formats named ambiguously ("respond in JSON or markdown, whichever fits").

**Improvement levers.**
- Add a fenced example of the exact output shape.
- Name the keys/fields; make optional fields explicit.
- Replace fuzzy length words ("brief") with concrete bounds ("≤ 3 sentences").
- Pick one format and remove the alternate.

---

## tool-calling

**What it is.** Instructions governing whether, when, and how the model should call tools (functions, APIs, retrievers). Includes tool-selection heuristics and handling of tool errors.

**Pass criteria.**
- Tools are listed or referenced by name that matches the tool registry.
- When-to-call criteria are stated ("call `lookup_order` only when the user provides an order ID").
- Error-path behavior is specified (retry? fall back to asking? refuse?).
- No tool invocation required by the prompt but absent from the registered tools.

**Common failures.**
- Prompt references a tool that isn't actually exposed to the model.
- "Use tools when appropriate" — no heuristic, model under- or over-calls.
- No instruction for handling tool errors — cascading failures on timeout.
- Tool-call loop permitted but no termination condition.

**Improvement levers.**
- Add explicit when-to-call and when-NOT-to-call conditions per tool.
- Define error handling: retry budget, fallback phrasing, refusal template.
- Name tools exactly as registered.
- Bound any loop with a max-iteration rule.

---

## reasoning

**What it is.** Instructions about how the model should think before answering: chain-of-thought, scratchpad, self-check, or explicit "think step by step" scaffolds.

**Pass criteria.**
- Reasoning posture is explicit (do reasoning / don't reasoning / reasoning tokens only).
- If scratchpad is used, its location and visibility (hidden vs exposed) are specified.
- Reasoning instructions do not leak into the final output when a clean output is required.
- Reasoning depth is proportional to task difficulty (no CoT for trivial classification; CoT for multi-step decisions).

**Common failures.**
- "Think step by step" added reflexively even to simple tasks — bloats latency.
- Reasoning scratchpad mixed into output the user sees, breaking downstream parsing.
- Conflict between "respond only in JSON" and "first explain your reasoning."
- No self-check for tasks where verification cheaply catches errors.

**Improvement levers.**
- Add a hidden scratchpad (e.g., `<thinking>…</thinking>`) separate from the user-facing block.
- Remove CoT from trivial tasks.
- Add a final self-check instruction for high-stakes tasks.
- Resolve conflicts between reasoning and output-format.

---

## examples

**What it is.** Few-shot demonstrations of input/output pairs that anchor the model's behavior in ambiguous cases.

**Pass criteria.**
- Examples are concrete input/output pairs, not paraphrases of the instructions.
- Examples cover the edge cases most likely to trip the model (boundary, refusal, ambiguous input).
- Example count is proportional to complexity — 2–5 for most tasks.
- Examples match the declared output-format exactly.

**Common failures.**
- No examples despite an unusual output shape.
- Examples that restate the rules instead of showing behavior.
- Examples inconsistent with each other or with the declared format — model picks whichever is most recent.
- Only positive examples; no refusal or boundary case.

**Improvement levers.**
- Add 1 refusal example and 1 boundary example alongside the happy path.
- Align examples exactly with the output-format block.
- Dedupe redundant happy-path examples.

---

## unnecessary-content

**What it is.** Filler, dead context, pleasantries, or duplicated instructions that dilute signal without changing behavior.

**Pass criteria.**
- No pleasantries addressed to the model ("please," "thank you," apologetic framing).
- No duplicate instructions restated in different words.
- No orphaned context (paragraphs about features no longer in scope).
- No meta-commentary ("This prompt was updated on 2024-03-01 by Sarah").

**Common failures.**
- "Please remember to…" — redundant politeness.
- Same rule stated twice with different phrasing.
- Versioning notes left inline in the prompt body.
- Long historical context that never gets referenced by the task.

**Improvement levers.**
- Delete pleasantries.
- Merge duplicate instructions into one canonical bullet.
- Move versioning notes to prompt metadata, not the body.
- Cut orphaned context paragraphs.

---

## variable-usage

**What it is.** Correct declaration, placement, and substitution of `{{variable}}` placeholders. Variables are the contract between the prompt and the caller.

**Pass criteria.**
- Every `{{variable}}` referenced in the prompt is declared (or at minimum expected) by the caller.
- Every variable the caller passes is actually referenced in the prompt (no dead variables).
- Variables are embedded in context, not dropped as bare tokens ("User message: {{user_input}}" not just "{{user_input}}").
- No nested or malformed braces (`{{{x}}}`, `{{ x }}` mixed with `{{x}}`).
- `{{variable}}` placeholders are preserved **literally** across any rewrite — the skill never interpolates them.

**Common failures.**
- Variable referenced in prompt but never supplied — renders as literal `{{user_input}}`.
- Variable supplied but never used — wasted round-trip.
- Naked variable with no framing — model treats it as noise.
- Malformed braces that break the orq.ai templating engine.

**Improvement levers.**
- Frame every variable with a label ("Customer message: {{msg}}").
- Remove dead variables on both sides (prompt and caller).
- Normalize brace syntax.
- Never rewrite a variable's spelling without coordinated caller change — flag it as a separate decision.

---

## recap

**What it is.** A terminal restatement, immediately before the model responds, of the 1–2 most critical rules or the required output shape. Anchors attention at the hand-off boundary.

**Pass criteria.**
- Present as a final paragraph or block (e.g., "Remember: …" or "Output format: …").
- Restates only the load-bearing constraints, not the full prompt.
- Consistent with the rest of the prompt — no new rules introduced in the recap.
- Placed after examples and before the final user/assistant turn.

**Common failures.**
- Recap absent → long prompts lose the task at the far end of context.
- Recap contradicts earlier rules — model trusts the recap and violates body.
- Recap is a full re-paste of the prompt — defeats the purpose.
- Recap introduces a brand-new rule not stated elsewhere.

**Improvement levers.**
- Add a terminal "Remember:" block with the 1–2 critical rules.
- Trim bloated recaps to the minimum necessary.
- Reconcile any contradictions between recap and body in favor of the intended behavior.

---

## Using this rubric

The skill's Step 3 analysis pipeline:

1. Walk the prompt once, tagging every passage with its category.
2. For each category, run the **Pass criteria** bullets — any failed bullet becomes a candidate suggestion.
3. Rank candidates by expected impact × reversibility; keep the top 5 (POPT-02 cap).
4. For each surviving suggestion, the **Improvement levers** list supplies the concrete intervention.

Suggestions surface in the skill output with `Guideline anchor:` set to the category slug above. Downstream automation (and the `/orq-agent:analytics` reporting in Phase 36) keys on these slugs, so they MUST match verbatim.
