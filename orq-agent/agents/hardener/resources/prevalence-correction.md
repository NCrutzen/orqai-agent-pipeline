# Prevalence Correction for Imperfect Judges (EVLD-07)

When judge has TPR < 1.0 or TNR < 1.0, observed pass rate overstates (or understates) true success rate. Prevalence correction recovers an unbiased estimate of the true pass rate from the observed rate plus the judge's measured TPR and TNR.

Without this correction, a dashboard showing "92% pass rate" from an 85%-TPR judge is misleading: the displayed number is a blend of true performance and judge miscalibration. The formula below separates them.

---

## Formula

```
theta_hat = (p_observed + TNR − 1) / (TPR + TNR − 1)
```

Where:

- `p_observed` — observed pass rate (fraction of traces the judge marked pass).
- `TPR` — true positive rate of the judge, measured against human labels on the held-out test split (EVLD-06).
- `TNR` — true negative rate of the judge, measured on the same split.
- `theta_hat` — bias-corrected estimate of the **true** pass rate.

---

## Derivation (Confusion-Matrix Logic)

By definition of TPR/TNR on the judge:

- P(judge=pass | true=pass) = TPR
- P(judge=pass | true=fail) = 1 − TNR

Let θ = true pass rate. Then observed pass rate is:

```
p_observed = θ · TPR + (1 − θ) · (1 − TNR)
```

Solving for θ yields `theta_hat = (p_observed + TNR − 1) / (TPR + TNR − 1)`. The denominator is the *Youden index* `J = TPR + TNR − 1`; it must be positive for the correction to be defined.

---

## Worked Example

Observed dashboard metrics over a 24-hour window:

- `p_observed = 0.80` (judge passed 80% of sampled traces)
- `TPR = 0.95`, `TNR = 0.92` (from evaluator-validator held-out test split)

Apply the formula:

```
theta_hat = (0.80 + 0.92 − 1) / (0.95 + 0.92 − 1)
          = 0.72 / 0.87
          ≈ 0.828
```

So the bias-corrected **true pass rate ≈ 83%**, not the raw 80%. The correction matters when p_observed and judge calibration fall on opposite sides of "balanced" — here a slightly fail-biased judge was underreporting true performance.

---

## Edge Case: Judge Worse Than Random

If `TPR + TNR ≤ 1` the Youden index is ≤ 0 and the judge carries no usable signal — applying the formula produces garbage (division by zero or negative denominator). When this condition holds:

- **Do NOT apply prevalence correction.**
- Emit a warning: `judge TPR+TNR ≤ 1 — judge is worse than random; re-calibrate before trusting pass rates`.
- Block dashboard rendering of "corrected" numbers; show only `p_observed` with a prominent caveat.

This case must be caught before display; silently producing a negative or >1 corrected rate hides a broken evaluator.

---

## Clamping

Even for well-calibrated judges (Youden > 0), `theta_hat` can land slightly outside [0, 1] due to sampling noise near the endpoints. Clamp:

```
theta_hat = max(0.0, min(1.0, theta_hat))
```

Log the raw pre-clamp value when clamping fires; repeated clamping events indicate `p_observed` is near a regime where correction is unstable and the test split needs more data.

---

## Rendering in quality-report.md

Hardener's `quality-report.md` adds a `Corrected (θ̂)` column next to the observed pass-rate column. Header row:

| Guardrail      | Observed | TPR  | TNR  | Corrected (θ̂) |
| -------------- | -------- | ---- | ---- | -------------- |
| helpfulness    | 0.80     | 0.95 | 0.92 | 0.83           |
| factuality     | 0.91     | 0.88 | 0.96 | 0.89           |

If the judge is in the "worse than random" regime, the `Corrected (θ̂)` cell renders as `N/A — re-calibrate` with a link to the evaluator-validator run that produced the failing TPR/TNR.
