# TPR / TNR Measurement Methodology (EVLD-06)

Every LLM judge must be validated against human labels before it gatekeeps iteration or drives production guardrails. TPR (True Positive Rate) and TNR (True Negative Rate) are the two numbers that summarize judge calibration. This file is the authoritative methodology the evaluator-validator subagent applies when producing those numbers.

A judge that has not cleared the TPR ≥ 0.90 AND TNR ≥ 0.90 gate is treated as unvalidated — its pass/fail verdicts cannot be trusted to drive P0 iterator tickets or production sample_rate decisions.

---

## Confusion Matrix

The confusion matrix compares judge verdicts to ground-truth human labels on a held-out test split. Four cells, using verbatim tokens `TP`, `FN`, `TN`, `FP`:

```
                | Human = Pass | Human = Fail
Judge = Pass    |     TP       |     FP
Judge = Fail    |     FN       |     TN
```

- **TP** (True Positive) — judge said pass, human agreed pass.
- **FN** (False Negative) — judge said fail, human said pass. Judge missed a pass.
- **FP** (False Positive) — judge said pass, human said fail. Judge blessed a failure.
- **TN** (True Negative) — judge said fail, human agreed fail.

---

## Formulas

```
TPR = TP / (TP + FN)
TNR = TN / (TN + FP)
```

- **TPR** (sensitivity, recall) — of all truly-pass items, what fraction did the judge correctly mark pass? Low TPR means the judge misses good work.
- **TNR** (specificity) — of all truly-fail items, what fraction did the judge correctly mark fail? Low TNR means the judge rubber-stamps bad work.

Both are fractions in [0, 1]. Neither alone is sufficient: a judge that marks everything pass has TPR = 1.0 and TNR = 0.0 and is useless.

---

## Minimum Sample

- **≥30 Pass labels AND ≥30 Fail labels in the held-out test set.** Below this, the ratios are dominated by sampling noise and confidence intervals span >10 points.
- If the queue returns a skewed draw (e.g., only 8 Fail examples), keep collecting labels. Do not compute TPR/TNR on an under-sized cell.
- 30/30 is the floor for *any* TPR/TNR claim; 100+ per class is the target for a numbers-you-would-bet-on estimate.

---

## Workflow

1. Freeze the held-out test split (disjoint from train + dev per EVLD-05).
2. Run the judge (4-component template) on every item in the test split.
3. Pair each judge verdict with its human label from the Annotation Queue.
4. Populate the confusion matrix — every item lands in exactly one of TP/FN/FP/TN.
5. Compute TPR and TNR from the formulas above.
6. If TPR ≥ 0.90 AND TNR ≥ 0.90 → mark judge **validated**. Otherwise → feed failing examples back into judge re-calibration (criterion wording, few-shot pool from train split) and re-measure on the same frozen test split.

---

## Validation Gate

A judge is cleared for production and iterator use if and only if:

```
TPR ≥ 0.90  AND  TNR ≥ 0.90
```

Both conditions. A 0.95/0.80 judge does not pass — it fails the TNR gate and will rubber-stamp 20% of genuinely failing outputs. Hardener and iterator both read this gate; neither consumes a judge that has not cleared it.

---

## Anti-Pattern: Computing TPR/TNR on Train or Dev Split

The test split exists specifically so the judge has not seen its items during criterion tuning or few-shot selection. Measuring TPR/TNR on train or dev is **leakage** — the numbers will look good on that data and collapse in production.

Rules:

- Few-shot exemplars used in the 4-component judge prompt are drawn **only** from train.
- Criterion wording is tuned using dev (observe failures, revise criterion, re-measure on dev).
- TPR/TNR is measured **only** on test, once per validated build. If you re-use test to re-tune, the split is burned and a fresh test split must be drawn.

Leaked TPR/TNR numbers are the single most common failure mode in LLM-judge evaluation — treat the split boundary as non-negotiable.
