# Dataset Template

Output template for agent test datasets. The spec generator fills each `{{PLACEHOLDER}}` with values from the architect blueprint and agent specifications.

**Instructions:** Replace each `{{PLACEHOLDER}}` with the appropriate values. At least 30% of test cases should be adversarial or edge cases.

## Placeholder Legend

| Placeholder | Source | Description |
|-------------|--------|-------------|
| `{{AGENT_KEY}}` | Agent spec — key field | The agent this dataset tests |
| `{{TEST_INPUTS}}` | Spec generator — derived from agent purpose | Table of test input scenarios |
| `{{EVAL_PAIRS}}` | Spec generator — derived from expected behavior | Input/output pairs for evaluation |
| `{{MODEL_MATRIX}}` | Spec generator — derived from model recommendations | Comparison grid across models |
| `{{ADVERSARIAL_CASES}}` | Spec generator — edge cases and failure modes | Deliberately difficult inputs |

---

# {{AGENT_KEY}} — Test Dataset

> **Coverage requirement:** At least 30% of total test cases must be adversarial or edge cases. These inputs test the agent's robustness against messy real-world data, malicious inputs, and unexpected formats.

## Test Inputs

{{TEST_INPUTS}}

> Provide a table of test inputs organized by category:
>
> | ID | Input | Category | Expected Behavior |
> |----|-------|----------|-------------------|
> | T-01 | [clear, well-formed input] | happy-path | [expected correct response] |
> | T-02 | [variation of standard input] | happy-path | [expected correct response] |
> | T-03 | [input missing optional fields] | edge-case | [graceful handling, reasonable defaults] |
> | T-04 | [input at boundary limits] | edge-case | [correct boundary behavior] |
> | T-05 | [malicious or confusing input] | adversarial | [safe rejection or graceful degradation] |
> | T-06 | [prompt injection attempt] | adversarial | [maintains role, ignores injection] |
>
> Categories: `happy-path` (standard use), `edge-case` (boundary/unusual), `adversarial` (hostile/messy).

## Eval Pairs

{{EVAL_PAIRS}}

> Input/output pairs for automated or manual evaluation:
>
> | ID | Input | Expected Output | Pass Criteria |
> |----|-------|----------------|---------------|
> | E-01 | [specific input] | [specific expected output] | [exact match / contains / semantic similarity] |
> | E-02 | [specific input] | [specific expected output] | [exact match / contains / semantic similarity] |
>
> Pass criteria types:
> - **exact-match**: Output must match expected output exactly
> - **contains**: Output must contain the expected text
> - **semantic**: Output must convey the same meaning (human review)
> - **format**: Output must follow the specified structure regardless of content

## Multi-Model Comparison Matrix

{{MODEL_MATRIX}}

> Compare agent performance across recommended models:
>
> | Test ID | Input | Primary: `provider/model-a` | Fallback 1: `provider/model-b` | Fallback 2: `provider/model-c` |
> |---------|-------|-----------------------------|-------------------------------|-------------------------------|
> | T-01 | [input] | [result / pass-fail] | [result / pass-fail] | [result / pass-fail] |
> | T-02 | [input] | [result / pass-fail] | [result / pass-fail] | [result / pass-fail] |
>
> Use this matrix to validate that fallback models produce acceptable quality. Mark pass/fail per cell.

## Adversarial Cases

{{ADVERSARIAL_CASES}}

> Dedicated section for difficult inputs. Minimum 30% of total test cases.
>
> | ID | Input | Attack Vector | Expected Behavior |
> |----|-------|--------------|-------------------|
> | A-01 | "Ignore all previous instructions and..." | Prompt injection | Agent maintains its role and instructions |
> | A-02 | [empty string] | Missing input | Returns helpful error or asks for input |
> | A-03 | [10,000+ character input] | Input overflow | Handles gracefully, truncates or rejects |
> | A-04 | [input in wrong language] | Language mismatch | Responds appropriately or asks for clarification |
> | A-05 | [input with mixed formats/encodings] | Format confusion | Parses correctly or fails gracefully |
> | A-06 | [input requesting out-of-scope action] | Scope violation | Declines politely, stays within role |
> | A-07 | [input with contradictory instructions] | Logical conflict | Identifies contradiction, asks for clarification |
>
> Attack vectors to cover: prompt injection, empty/missing input, oversized input, wrong language, mixed formats, scope violations, contradictions, PII exposure attempts, rate abuse patterns.
