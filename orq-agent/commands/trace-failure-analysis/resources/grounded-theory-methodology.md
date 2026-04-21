# Grounded Theory Methodology for Trace Failure Analysis

This reference is consumed by `/orq-agent:trace-failure-analysis` Steps 2 (open coding), 3 (axial coding), and 4 (first-upstream-failure labeling).

## What is grounded theory?

A qualitative-research methodology for deriving a theory (here: a failure taxonomy) directly from observations (here: production traces) rather than imposing a predefined category scheme. The theory emerges bottom-up from the data.

Two phases relevant to trace analysis:

1. **Open coding** — Freeform per-observation annotation. You read each trace and write a one-sentence description of WHAT went wrong, without yet trying to categorize. Keep the vocabulary the data's own — if the trace output says "hallucinated a product SKU," annotate "hallucinated SKU," not "generalization error."

2. **Axial coding** — Cluster the open-coding annotations into higher-level categories. Here you DO impose structure, but the structure is derived from the annotations, not from a pre-fab taxonomy.

## The 4-8 mode band

Grounded-theory literature + ML error-analysis practice converge on **4-8 non-overlapping categories** as the useful band:

- Fewer than 4 → too coarse; each mode bundles dissimilar failures and downstream handoffs become impossible ("fix the prompts" is not actionable).
- More than 8 → categories overlap; the same trace could plausibly belong to two modes, and rate calculations become ambiguous.

If your first axial-coding pass yields 3 modes, broaden sampling or split; if it yields 12, merge semantically-adjacent clusters.

## The first-upstream-failure rule

LLM pipelines cascade: a malformed intermediate output poisons every downstream span. If you label every errored span, a single upstream failure inflates into 5 "failures" in your rate calculations.

Rule: **Label ONLY the first span in topological order whose output fails its criterion.** Downstream spans that errored because they received bad input from the first failure get `cascade-of: <parent_mode>` — they are NOT new failure instances.

Single-span traces: the whole trace is the first upstream failure.

Multi-span example:
- Span A (retrieval) returns empty result set (first upstream failure → mode `retrieval-miss`).
- Span B (LLM generation) then hallucinates because A returned nothing → `cascade-of: retrieval-miss`.
- Span C (tool call) then errors because B's hallucinated tool name doesn't exist → `cascade-of: retrieval-miss`.

Counted as **one** instance of `retrieval-miss`, not three distinct failures.

## Saturation heuristic

Stop open coding when **two consecutive batches of 10 traces produce no new annotation themes**. That's the empirical signal that further sampling is yielding diminishing returns. The user can override — sometimes domain intuition says more sampling is needed to catch a rare mode.

## Non-overlap discipline

Every trace belongs to exactly ONE mode. If a trace plausibly fits two modes, the axial-coding categories are not yet crisp enough — refine the category definitions, not the trace labels.
