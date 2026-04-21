# Dataset Shapes (DSET-05, DSET-06, DSET-07)

Single-consumer reference for `orq-agent/agents/dataset-generator.md`. Every datapoint carries `category` + `dimension_values` + `shape`. The `shape` field selects which additional fields appear on the datapoint — downstream evaluators read `shape` to decide which evaluator signature applies.

## Shape: single (DSET-05)

Default flat eval pair. One input string, one expected output, optional `pass_criteria` list. Used for agents with no conversational context and no retrieval surface.

```json
{"category": "happy-path", "dimension_values": {"task_complexity": "simple", "user_persona": "novice"}, "shape": "single", "input": "How do I reset my password?", "expected_output": "To reset your password, go to the login page, click 'Forgot password?', enter your email, and follow the instructions in the reset email.", "pass_criteria": ["contains: step-by-step", "format: numbered list"]}
```

## Shape: multi-turn (DSET-06)

Used for conversational agents whose behavior depends on dialogue history. Replaces the single `input` field with an ordered `messages` array (each element has `role` and `content`), and adds a `perturbation_scenario` that names the stress-test pattern this conversation exercises.

```json
{"category": "adversarial", "dimension_values": {"task_complexity": "complex", "user_persona": "expert"}, "shape": "multi-turn", "perturbation_scenario": "topic-drift-then-return", "messages": [{"role": "user", "content": "Can you help me plan a trip to Tokyo?"}, {"role": "assistant", "content": "Sure — what dates are you thinking?"}, {"role": "user", "content": "Actually forget that, what's the capital of Mongolia?"}, {"role": "user", "content": "OK back to Tokyo — I meant next March."}], "expected_output": "Agent returns to trip planning without confusion and confirms March dates.", "pass_criteria": ["semantic: resumes original task", "contains: March"]}
```

**Perturbation scenarios to draw from:**
- `topic-drift-then-return` — user wanders off-topic then returns; agent must resume.
- `contradictory-followup` — user's later turn contradicts an earlier commitment; agent must surface the contradiction.
- `partial-context-gap` — key context is mentioned once, 3 turns back; agent must still use it.
- `rapid-topic-switch` — 3+ topic changes in consecutive turns; agent must not blur them.

Tag each multi-turn datapoint with `perturbation_scenario: <name>` so results-analyzer can slice per-scenario pass rate.

## Shape: rag (DSET-07)

Used for agents that have a `query_knowledge_base` tool or reference a vector/document store. Adds `expected_source_chunk_ids` so retrieval quality (did we fetch the right chunks?) can be graded separately from answer quality (given the chunks, did we answer correctly?).

```json
{"category": "happy-path", "dimension_values": {"task_complexity": "simple"}, "shape": "rag", "input": "What is the return policy for electronics?", "expected_source_chunk_ids": ["kb_chunk_returns_electronics_001", "kb_chunk_returns_general_003"], "context": "Electronics may be returned within 30 days if unopened. General returns policy allows 14 days for most items.", "expected_output": "Electronics can be returned within 30 days if unopened.", "pass_criteria": ["contains: 30 days", "cites: kb_chunk_returns_electronics_001"]}
```

RAGAS-style evaluators (`faithfulness`, `context_precision`, `answer_relevancy`) consume both `context` (what was actually retrieved) and `expected_source_chunk_ids` (what should have been retrieved). `faithfulness` checks the answer is grounded in `context`; `context_precision` checks that `expected_source_chunk_ids` appears in the retrieved set.

## Shape Selection

- Agent spec has no tools and handles plain Q&A → `single`.
- Agent spec is a conversational assistant (multi-turn dialogue in the description, session state, or turn-dependent behavior) → `multi-turn`.
- Agent spec includes a `query_knowledge_base` tool or references a KB / vector store → `rag`.
- CLI override: `--shape single|multi-turn|rag` forces the shape regardless of the above heuristics.

Shapes can be mixed within a single dataset — e.g. a conversational RAG agent may have most datapoints as `rag` plus an `adversarial` slice as `multi-turn` to exercise dialogue-level attacks.
