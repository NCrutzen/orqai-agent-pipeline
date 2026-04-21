# 4-Component Judge Prompt Template (EVLD-03)

Every LLM judge authored by the evaluator-validator subagent follows the **4-component** structure: role, task, criterion, examples. Plus a mandatory output contract with `reasoning` and `verdict` fields. The components map 1:1 to the XML tags in the template below — downstream tooling (TPR/TNR measurement, re-calibration, few-shot swaps) identifies sections by tag name, so the structure is not optional.

The 4-component form is load-bearing precisely because it separates *what is being judged* (task + criterion) from *how to judge* (role + examples). Changing the criterion does not invalidate the few-shot examples; changing the few-shot pool does not require rewriting the criterion. This separation is what makes judges evolvable without burning the test split.

---

## Template

```
<role>You are a grader for {criterion}. You output JSON only — no prose outside the JSON body.</role>

<task>Score the following output against the criterion defined below. Apply the criterion literally — do not introduce additional considerations.</task>

<criterion>
  Pass if: {explicit pass definition — observable, single clause}
  Fail if: {explicit fail definition — observable, single clause}
</criterion>

<examples>
  Pass example: {exemplar drawn from train split — input + output + one-line why-pass}
  Fail example: {exemplar drawn from train split — input + output + one-line why-fail}
</examples>

<output>
  JSON: {"reasoning": "…", "verdict": "pass" | "fail"}
</output>
```

The `<output>` contract is strict: one JSON object, `reasoning` string first, `verdict` enum second.

---

## Chain-of-Thought-BEFORE-Answer Rule

The `reasoning` field MUST be populated before the `verdict` field in the emitted JSON. LLM decoders are autoregressive — by forcing `reasoning` to be written first, the judge locks in its step-by-step analysis before committing to pass/fail. Verdict-first JSON reduces accuracy measurably because the model picks a verdict and then rationalizes it.

Implementation: the template literally lists `reasoning` before `verdict` in the `<output>` contract. A response that emits `{"verdict": "pass", "reasoning": "..."}` is treated as malformed and retried.

---

## Examples Come ONLY From Train Split

Few-shot exemplars in `<examples>` are drawn exclusively from the **train** split of the human-labeled dataset (EVLD-05). This is non-negotiable:

- Train split → few-shot exemplars in judge prompt.
- Dev split → criterion wording tuning (observe failures, revise `Pass if` / `Fail if`).
- Test split → TPR/TNR measurement only; never touches the prompt.

Leaking a dev or test item into `<examples>` pollutes the judge and invalidates downstream TPR/TNR numbers. The evaluator-validator subagent enforces this by tagging every human-labeled item with its split and refusing to emit a judge prompt whose `<examples>` draws from anything other than train.

---

## Worked Example: `helpfulness` Criterion

```
<role>You are a grader for helpfulness. You output JSON only — no prose outside the JSON body.</role>

<task>Score the following assistant response against the criterion defined below. Apply the criterion literally — do not introduce additional considerations.</task>

<criterion>
  Pass if: the response directly addresses the user's question with a concrete, actionable answer.
  Fail if: the response hedges, redirects, refuses without a safety reason, or answers a different question than asked.
</criterion>

<examples>
  Pass example:
    user: "How do I set the timeout on fetch in Node 20?"
    assistant: "Use AbortSignal.timeout(ms): `fetch(url, { signal: AbortSignal.timeout(5000) })`."
    why-pass: concrete API, directly addresses the question, working snippet.

  Fail example:
    user: "How do I set the timeout on fetch in Node 20?"
    assistant: "Timeouts depend on your use case. You might want to look into various approaches."
    why-fail: no concrete API, hedges, redirects to further research.
</examples>

<output>
  JSON: {"reasoning": "…", "verdict": "pass" | "fail"}
</output>
```

Both exemplars above are taken from the train split. They are stable across criterion-wording revisions — only the `<criterion>` block changes when the judge is re-calibrated on dev.
