# Failure Mode Classification

This reference is consumed by `/orq-agent:trace-failure-analysis` Step 6. After the 4-8 failure modes are defined via axial coding, each mode is classified into exactly ONE of the 4 categories below.

## The 4 categories (mutually exclusive)

### 1. specification

The failure is caused by the prompt / instruction itself — ambiguous, conflicting, missing constraint, or asking the agent to do something it shouldn't.

**Decision rule:** If rewriting the system prompt (adding a constraint, clarifying an instruction, removing an ambiguity) would prevent the failure, classify as `specification`.

**Examples:**
- Agent replies in the wrong tone because "be friendly" conflicts with "be concise."
- Agent refuses because the prompt doesn't explicitly authorize the action.
- Agent outputs free text when JSON is expected, because the prompt mentions JSON only in one example.

**Fix path:** `/orq-agent:prompt` (prompt engineering).

### 2. generalization-code-checkable

The output is wrong in a way that can be verified by deterministic code — schema validation, regex, equality check, typed field match.

**Decision rule:** If you can write a function `is_wrong(trace) -> bool` that returns `True` on the failure and `False` on correct outputs, it's code-checkable.

**Examples:**
- JSON output fails schema validation.
- Agent called `search_products` when the user asked about `orders`.
- Returned timestamp is not ISO-8601.
- Tool argument `quantity` is negative.

**Fix path:** `/orq-agent:harden` — build an evaluator + promote to a runtime guardrail.

### 3. generalization-subjective

The output is wrong in a way that requires human judgement — tone, reasoning quality, completeness, misinterpreted intent.

**Decision rule:** If two reasonable humans could disagree on whether the output is "wrong," it's subjective. You will need LLM-as-judge evaluators + human labels to validate the judge.

**Examples:**
- Response is technically correct but condescending.
- Answer is incomplete — addresses 2 of the user's 3 questions.
- Agent misread the user's intent (answered the literal question when the user meant the meta-question).

**Fix path:** `/orq-agent:harden` (LLM-judge evaluator) + orq.ai Annotation Queue (human labels to validate the judge per Phase 42 EVLD).

### 4. trivial-bug

Plumbing / infra failure — not model-related.

**Decision rule:** If the failure would happen identically with any model (or with no model at all), it's plumbing. The trace shows an environment or integration bug, not an agent-design bug.

**Examples:**
- Auth error because `ORQ_API_KEY` is missing from the environment.
- Network timeout on an external tool call.
- Database connection dropped.
- The agent never got called because routing config is wrong.

**Fix path:** Developer patch. No AI-platform skill applies — file a bug ticket and move on.

## Mutual exclusivity

A mode is classified as exactly ONE category. If a mode plausibly fits two (e.g. both `specification` AND `generalization-code-checkable`), prefer `specification` — fixing the prompt eliminates the need for the evaluator. Always pick the upstream fix.
