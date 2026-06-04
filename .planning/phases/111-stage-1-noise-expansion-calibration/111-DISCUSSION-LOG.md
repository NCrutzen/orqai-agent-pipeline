# Phase 111: Stage 1 Noise Expansion + Calibration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 111-stage-1-noise-expansion-calibration
**Areas discussed:** Calibration evidence & bar, Shadow→promote gate mechanism, New-rule discovery method, Inherited AP-rules + loopback

---

## Calibration evidence & bar

| Option | Description | Selected |
|--------|-------------|----------|
| Retro-run on live + historic | Run Stage 1 over both the 827+ live verkoop Outlook corpus and the 34k historic Smeba corpus | ✓ |
| Live sales corpus only | Calibrate on verkoop@smeba.nl Outlook traffic only | |
| Historic Smeba corpus only | Use the 34k historic emails only | |

**User's choice:** Retro-run on live + historic.

| Option | Description | Selected |
|--------|-------------|----------|
| Wilson CI lower-bound ≥0.92 | Reuse debtor's statistical gate (n≥30 ∧ ci_lo≥0.92) | ✓ |
| Operator eyeball of N samples | Manual sample review per category | |
| Both — stat gate + operator sign-off | Wilson CI AND operator approval | |

**User's choice:** Wilson CI lower-bound ≥0.92.

---

## Shadow→promote gate mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Wilson-CI lifecycle (swarm-scoped) | Extend classifier_rules candidate→promoted→demoted to sales via llm:{category}:{confidence} namespace | ✓ |
| One-time shadow window then migration | Fixed shadow period, compute bar once, single flip migration, no ongoing cron | |

**User's choice:** Reuse Wilson-CI lifecycle (swarm-scoped).

| Option | Description | Selected |
|--------|-------------|----------|
| High-only, organic accumulation | Seed llm:*:high candidates, require organic telemetry to cross the gate | ✓ |
| High-only, pre-promote from retro | Seed high + pre-promote categories already clearing the bar on the retro-run | |
| High + medium candidates | Also seed medium-confidence candidates | |

**User's choice:** High-only, organic accumulation.

---

## New-rule discovery method

| Option | Description | Selected |
|--------|-------------|----------|
| A — Cluster-mining script + operator approval | Batch-cluster the retro-run's unknown bucket, rank by size, operator approves which become rules (reuse spike 002) | ✓ (A now) |
| B — LLM-proposes via discovery surface | Adapt Phase 86 discovery surface to collect Stage-1 noise proposals organically | (deferred) |
| A now, leave B as a deferred idea | Cluster-mining for 111; note organic surface as deferred | ✓ |

**User's choice:** First answered "Not quite sure what you propose" → Claude grounded both options concretely (cluster-mining script vs adapting the Phase 86 intent surface). On re-ask: "A now, leave B as a deferred idea."
**Notes:** Rule form (regex vs LLM-category row) for each discovered candidate explicitly delegated to the planner ("You decide per-candidate during planning").

---

## Inherited AP-rules + loopback

| Option | Description | Selected |
|--------|-------------|----------|
| Re-validate each on the retro-run | Keep only AP rules that hold on sales | |
| Keep all 8 as-is (inherited trust) | Trust debtor calibration, leave at categorize_archive | ✓ |
| Disable all 8, re-add only if discovered | Start sales with zero inherited AP rules | |

**User's choice:** Keep all as-is (inherited trust) — applied as "keep the 7 non-loopback rules as-is" given the loopback exception below.

| Option | Description | Selected |
|--------|-------------|----------|
| Default-disable unless it holds | own_outbound_invoice_loopback off by default, enable only if it holds on sales | |
| Test-first, decide from the data | Run loopback against sales corpus in shadow, decide from measured false-archive | ✓ |

**User's choice:** Test-first, decide from the data.

---

## Claude's Discretion

- Rule form (regex rule vs LLM-category row) per discovered noise candidate — delegated to planner.
- Audit-trail content/shape, retro-run scoping/sampling, dashboard surfacing of `llm:*` rows.

## Deferred Ideas

- Organic LLM noise-proposal discovery surface (adapt Phase 86 intent surface for Stage 1 noise) — later ops phase.
