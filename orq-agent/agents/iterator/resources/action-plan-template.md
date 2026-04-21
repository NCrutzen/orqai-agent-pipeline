# Iterator Action Plan Template (ITRX-02, ITRX-07)

Every `/orq-agent:iterate` cycle emits `{swarm_dir}/iteration-{N}-action-plan.md` using this template. The action plan is the single inspectable artifact that justifies the iteration: which datapoints drove the diagnosis, which changes will be applied, and what threshold qualifies as "done."

The template has three required H2 sections: Summary, Priority Improvements, Re-run Criteria. Each Priority Improvements row requires `Evidence` and `Success Criteria` fields — these phrases are load-bearing and must appear verbatim so downstream audits can locate them.

---

## Summary

One to two sentences naming the bottleneck capability and its current score vs. target. Reference the failure-diagnoser category (specification / generalization / dataset / evaluator) that dominates.

Example:

> Iteration 3 diagnosed a **specification** bottleneck: the `tool_calling` capability scored 0.62 (target 0.80). Root cause is ambiguous system prompt on JSON schema coercion, observed in 18/42 failing datapoints.

---

## Priority Improvements

Five-column table. Each row MUST populate `Evidence` and `Success Criteria` with verifiable content, not placeholders.

| Priority | Section         | Change                                                                 | Evidence                                                                                  | Success Criteria                                                      |
| -------- | --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P0       | System prompt   | Add explicit JSON schema block + "emit only valid JSON" instruction    | eval_ids `[e_41, e_53, e_67, e_71, e_88]`; tool_calling score 0.62; run_id `run_2j9aq`    | `tool_calling` ≥ 0.80 on held-out test split; max 2 iterations        |
| P1       | Few-shot pool   | Replace 1 stale exemplar with a tool_calling success pulled from train | eval_ids `[e_12]` — exemplar contradicts updated schema; dev-split confusion 3/10 off     | Few-shot exemplars all verdict=pass on current judge; no regressions  |
| P2       | Model tier      | Consider upgrade from `gpt-4o-mini` to `gpt-4o` if P0 + P1 insufficient | Blocked until P0/P1 exhausted                                                            | Deferred — requires decision tree "upgrade model" pass                |

Column rules:

- **Priority**: exactly one of `P0`, `P1`, `P2`. P0 is the single change most likely to move the bottleneck score. P1 is a complementary change that does not block P0. P2 is parked (cost/architectural implication) and only fires if P0+P1 exhaust.
- **Section**: the named region of the prompt/deployment being edited. Must map to a stable anchor (e.g., "System prompt", "Tool schema", "Few-shot pool", "Evaluator criterion text", "Model tier", "Sampler temperature").
- **Change**: the concrete edit. No aspirational phrasing.
- **Evidence**: datapoints affected (list of `eval_id`s), current scores on failing capability, run ID that produced the scores. This is what makes the ticket auditable.
- **Success Criteria**: target re-run score (numeric) + max iterations. A human reading this must be able to decide "did the iteration succeed" without re-running diagnosis.

---

## Re-run Criteria

Bullet list — each bullet is a pre-condition for promoting the iteration or stopping the loop.

- **Target bottleneck score:** `tool_calling` ≥ 0.80 on held-out **test** split (never dev or train).
- **Required split:** all scoring for acceptance runs against the holdout split locked in the evaluator-validator phase.
- **Stop conditions:** (a) target met → promote; (b) no improvement > 0.02 across two consecutive iterations → escalate to P2 model upgrade decision tree; (c) regression on any previously passing capability → revert + reopen diagnosis.
- **Iteration cap:** 5 iterations per action plan. Beyond that, the bottleneck is re-classified and a fresh action plan is opened.

---

## P0 / P1 / P2 Definitions

- **P0** — highest-leverage change. Must be applied this iteration. At most one P0 per action plan.
- **P1** — complementary change that reduces noise but is not the critical path. 0–2 allowed.
- **P2** — parked/conditional (e.g., model upgrade, architectural refactor). Cannot execute until P0 is exhausted AND the bottleneck persists.

The priorities are load-bearing tokens. Downstream tooling (ESCI-06 decision trees) reads them verbatim.
