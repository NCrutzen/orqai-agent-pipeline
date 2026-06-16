# Phase 120: D-06 multi-signal corroboration engine (generic, cross-swarm) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
**Areas discussed:** Engine model (collect-vs-short-circuit), Confidence math + independence, Disagreement / false-positive catch, Rollout scope + STAGE2-01 re-finalize

---

## Engine model — collect-vs-short-circuit reconciliation (CORR-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Collect-then-decide (gated) | When corroboration configured: run all steps, collect, decide; when not: byte-identical short-circuit. Precedence stays tiebreaker, voting is overlay. | ✓ |
| Short-circuit + confirm pass | First-hit picks primary, second pass checks agreement (boost/demote). Smaller diff but can't overrule a precedence loser. | |
| Always collect | Engine always collects regardless of config. Breaks no-engine-diff for everyone, risks STAGE2-01. | |

**User's choice:** Collect-then-decide (gated)
**Notes:** Cleanest fit to the todo's "scoring layer across collected candidates."

### Below-threshold winner (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to precedence order | Highest-precedence candidate wins at native confidence; corroboration only adds. | |
| Precedence winner + flag low-corroboration | Same winner, annotate lone-signal for downstream caution. | |
| Let disagreement rules decide | Below-threshold handled entirely by Area-3 disagreement/lone-signal logic. | ✓ |

**User's choice:** Let disagreement rules decide
**Notes:** Unifies no-conflict and conflict winner-selection into Area 3 (D-06/D-07).

---

## Confidence math + independence (CORR-01/02)

### What `boost` does

| Option | Description | Selected |
|--------|-------------|----------|
| Promote to high (set, not add) | ≥N agree → confidence = high deterministically. boost = target tier (default high). | ✓ |
| Tier bump (+1 step) | Agreement bumps one tier; needs a third signal for AUTO. | |
| Configurable target tier | boost is explicit target tier per swarm. | |

**User's choice:** Promote to high (set, not add)

### What counts as an independent signal

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct identifier_kind | Each agreeing signal a different identifier_kind. Strongest independence. | ✓ |
| Distinct precedence step | Each from a different step. Coarser. | |
| Distinct step OR kind | Most permissive, weaker independence. | |

**User's choice:** Distinct identifier_kind

### Default min_signals

| Option | Description | Selected |
|--------|-------------|----------|
| 2 (recommended) | Two distinct kinds agreeing → high. Matches most catchable eval errors. Per-swarm tunable. | ✓ |
| 3 | Stricter; fires far less often. | |
| Decide per swarm at seed time | No engine default; config must set it. | |

**User's choice:** 2 (recommended)

---

## Disagreement / false-positive catch + lone-signal (CORR-02)

### Conflict between independent signals

| Option | Description | Selected |
|--------|-------------|----------|
| Demote to suggestie (no AUTO) | Conflicting independent signals → cap below AUTO, no LLM. Deterministic falsification. | ✓ |
| Escalate to LLM tiebreaker | Hand conflicting set to LLM (only when enabled). | |
| Demote, LLM only if enabled | Hybrid: default demote, LLM adjudicates if swarm has it on. | |

**User's choice:** Demote to suggestie (no AUTO)
**Notes:** Catches the 4 confident-wrong AUTO eval rows; the disagreement itself is the signal.

### Lone-signal handling (eval bucket-B sender guard)

| Option | Description | Selected |
|--------|-------------|----------|
| Native confidence, but sender needs corroboration | Lone strong signal keeps high; lone sender capped unless corroborated. auto-safe-alone config-driven. | ✓ |
| Sender never auto when scope >1 candidate | Narrower: sender keeps high only if is_unique_in_scope. | |
| All lone signals keep native confidence | No special-casing; leaves the 21%-accuracy AUTO risk. | |

**User's choice:** Native confidence, but sender needs corroboration
**Notes:** Reuse/extend auto_safe_kinds for the auto-safe-alone set.

---

## Rollout scope + STAGE2-01 re-finalize (CORR-03/05)

### Which swarms opt in

| Option | Description | Selected |
|--------|-------------|----------|
| Debtor opts in; sales config-ready only | Debtor opts in now; sales config documented/disabled pending REST→SQL. | |
| Both debtor and sales opt in | Re-seed both now (pulls sales transport migration into scope). | ✓ |
| Debtor only, sales untouched | Re-seed debtor; leave sales config as-is. | |

**User's choice:** Both debtor and sales opt in

### Sales transport dependency (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Pull REST→SQL migration into Phase 120 | Migrate sales offerte/order/postcode lookups onto resolve_candidates so corroboration genuinely fires. | ✓ |
| Opt-in config now, fires when migration lands | Config enabled now, inert until separate migration. | |
| Migrate only what corroboration needs | Middle path; risks half-migrated sales resolver. | |

**User's choice:** Pull REST→SQL migration into Phase 120
**Notes:** Scope expansion — planner must size it. Only the three auto-resolution lookups switch transport; NXT REST infra stays (load-bearing). Fail-closed `_match.ts` guard stays harmless.

### STAGE2-01 re-finalize

| Option | Description | Selected |
|--------|-------------|----------|
| Re-baseline donor to post-120 commit | Re-point no-engine-diff donor to Phase 120 commit, re-run → FINAL STAGE2-01. | ✓ |
| Keep donor, allowlist corroboration diff | Extend the allowlist; grows fragile. | |
| Reframe STAGE2-01 as no-per-swarm-diff | Redefine to forbid only per-swarm branches. | |

**User's choice:** Re-baseline donor to post-120 commit

---

## Claude's Discretion

- Exact `corroboration` field sub-shape beyond `{ min_signals, boost }`.
- Candidate de-duplication strategy across steps (must satisfy distinct-identifier_kind independence).
- Correctness-gate harness mechanics for the frozen 100-email re-run.
- How sales candidates flow through the collect path given the sales adapter's own loop (SWARM-02 constraint).

## Deferred Ideas

- Attachment-borne identifier extraction → Phase 121 (corroboration input).
- Cross-brand-scope resolution → Phase 122.
- Full sales NXT REST search-contract recovery (unresolved-recall half of the sales todo).
- LLM-tiebreak on disagreement (rejected in favor of deterministic demote).
