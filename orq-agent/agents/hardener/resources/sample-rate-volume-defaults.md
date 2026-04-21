# Sample-Rate Volume Defaults (ITRX-08)

Hardener sets `sample_rate` on production guardrails based on deployment request volume. The defaults below are the starting point — they balance statistical signal against LLM-judge cost. Safety-critical guardrails override the defaults and always run at 100%.

---

## Volume-Based Defaults

| Volume (requests/day) | sample_rate | Rationale                                                              |
| --------------------- | ----------- | ---------------------------------------------------------------------- |
| < 1K                  | 100%        | Low volume — full LLM-judge coverage affordable                        |
| 1K – 100K             | 30%         | Mid volume — 30% gives statistical signal without runaway cost         |
| ≥ 100K                | 10%         | High volume — minimum for trend detection                              |

Tokens are load-bearing: `100%`, `30%`, `10%`, `<1K`, `1K-100K`, `≥100K` appear verbatim so downstream tooling (iterator, analytics) can parse the tier without string normalization.

---

## Safety Override — Always 100%

The following guardrail classes ignore volume-based defaults and run at 100% sample_rate regardless of request volume:

- `toxicity` — user-visible toxicity must be caught on every request
- `harmfulness` — harmful-content classifier is safety-critical
- `orq_pii_detection` — PII leakage has compliance implications; partial coverage is not acceptable

These classes are enumerated in hardener's safety list. Adding a new safety-class guardrail means adding it here.

---

## Worked Example

Deployment `chat-assistant-prod` averages 4,200 requests/day (pulled from analytics, last 7-day window).

- Volume tier: 4,200 falls in `1K – 100K` → sample_rate = **30%**.
- Projected LLM-judge calls/day: 4,200 × 0.30 ≈ **1,260 judge calls/day**.
- Non-safety guardrails attached: `helpfulness`, `factuality`, `tone`. All three inherit 30%.
- Safety guardrails attached: `toxicity`, `orq_pii_detection`. Both override to 100% → +4,200 × 2 = 8,400 calls/day.
- Total judge calls/day: 1,260 × 3 + 8,400 = **12,180 calls/day**.

---

## Cost Projection Stub

```
daily_cost = sample_rate × cost_per_judge_call × daily_volume
```

Per guardrail. Sum across all guardrails attached to the deployment. `cost_per_judge_call` depends on judge model + average token count per input/output; surfaced by `/orq-agent:analytics`.

For the worked example above with `cost_per_judge_call = $0.002`:

- Non-safety: 1,260 × 3 × $0.002 = **$7.56/day**.
- Safety override: 4,200 × 2 × $0.002 = **$16.80/day**.
- Total: **$24.36/day** ≈ $730/month.

---

## Volume Lookup

Pull deployment volume before setting sample_rate. Two interchangeable paths:

- **Command:** `/orq-agent:analytics --last 7d --group-by deployment`
- **MCP:** `analytics-get` with `group_by=deployment`, window `7d`

The 7-day window smooths weekly seasonality. Daily snapshots are noisy and will produce unstable tier assignments.

---

## Overrides and Exceptions

Users may override the default for a specific guardrail via explicit argument. Hardener logs the override with rationale in the generated guardrail config so audit trails survive a later review.
