# Phase 74: Stage 1 LLM Category Classifier - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis
**Mode:** auto (single-pass, recommended-default selections)
**Areas discussed:** Event Contract, Regex Invocation Surface, LLM Agent Contract, Confidence Gate, Failure Handling, Worker Implementation, Sales-Email Registry Seed

---

## Event Contract (Stage 0 → Stage 1 seam)

| Option | Description | Selected |
|--------|-------------|----------|
| Extend payload with `swarm_type` | Stage 0 emits `swarm_type` in `classifier/screen.requested`; worker reads directly | ✓ |
| DB lookup via `automation_run_id` | Worker queries `automation_runs.swarm_type` per event | |
| Mailbox→swarm map | Static config maps `source_mailbox` → `swarm_type` | |

**Selected:** Extend payload (auto: recommended default)
**Notes:** Stage 0 already knows the swarm at emit time; payload extension avoids an extra DB round-trip per event.

---

## Regex Invocation Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Registry-driven via `swarms.stage1_regex_module` | Look up module path; dynamic import; null = skip regex | ✓ |
| Hardcoded import of `classify.ts`, gated by `swarm_type` | Direct import, branch on swarm_type | |
| Always-LLM (skip regex everywhere) | LLM is the only Stage 1 | |

**Selected:** Registry-driven (auto: recommended default)
**Notes:** Phase 68 already added `stage1_regex_module` column. Sales-email gets `null` → skip regex. Zero swarm_type literals in worker code.

---

## LLM Agent Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal schema: `{category_key, confidence, reasoning}` | Three fields, strict json_schema with `anyOf` for nullable reasoning | ✓ |
| Schema with alternates array | Include runner-up category + confidence | |
| Schema with feature extraction | Add sender_domain_pattern, subject_pattern fields for promotion telemetry | |

**Selected:** Minimal schema (auto: recommended default)
**Notes:** v1 ships the smallest schema that satisfies the routing decision. Promotion telemetry is Phase 72 territory.

**Sub-decision: Closed-category list templating**

| Option | Description | Selected |
|--------|-------------|----------|
| Build at call time from `swarm_categories` | Worker injects `<categories>` block per request | ✓ |
| Cache list in agent prompt template | Per-swarm agent variants | |
| Pass list as Orq tool resource | Use Orq tool registry for the category list | |

**Selected:** Build at call time (auto: recommended default)
**Notes:** Single agent definition; list varies per call. No per-swarm forks.

**Sub-decision: Agent creation flow**

| Option | Description | Selected |
|--------|-------------|----------|
| create → PATCH (full params) → get_agent verify | Per CLAUDE.md `cba7352b` learning | ✓ |
| Single create with all params | Risk: response_format silently dropped | |

**Selected:** create → PATCH → verify (auto: required by CLAUDE.md learning)

---

## Confidence Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded: `low` → `unknown`, else trust pick | Inside worker; no schema column | ✓ |
| Per-swarm `min_llm_confidence` column | Registry-driven per category | |
| Numeric 0-1 confidence with operator-tunable threshold | More flexible, more migration work | |

**Selected:** Hardcoded gate (auto: recommended default; matches SPEC.md req 4)

---

## Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Coerce to `unknown`, log to `agent_runs.error_message`, emit verdict | Worker continues; verdict-worker dispatches via `unknown` chain | ✓ |
| Throw → `automation_runs.status='failed'` for retry | Bulk Review retry button is recovery | |
| Mark for manual review explicitly | Skip the dispatch chain, surface in queue UI | |

**Selected:** Coerce to `unknown` (auto: recommended default)
**Notes:** Safer than failing the whole row; the `unknown` fall-through path already handles ambiguous mail.

---

## Worker Implementation

All sub-decisions auto-selected from CLAUDE.md hard rules:

| Sub-decision | Selected | Rationale |
|---|---|---|
| `retries: 0` | ✓ | CLAUDE.md Inngest pattern |
| All side effects in `step.run()` | ✓ | Replay safety |
| Non-deterministic ids inside `step.run()` | ✓ | Phase 65 replay-id learning |
| `inngest.send` not destructured | ✓ | Phase 65 `dae6276` learning |

---

## Sales-Email Registry Seed

| Option | Description | Selected |
|--------|-------------|----------|
| 5 keys mirroring debtor; `unknown` → `manual_review` | No coordinator/resolver chain exists for sales-email yet | ✓ |
| 5 keys mirroring debtor; `unknown` → stub `swarm_dispatch` to placeholder event | Forward-compat with future sales-email coordinator | |
| Minimal seed: `auto_reply, unknown` only | Maximum learning, minimum opinions | |

**Selected:** Mirror debtor with `unknown`→`manual_review` (auto: recommended default; matches SPEC.md req 6)
**Notes:** payment_admittance kept in sales-email seed per operator note (payment confirmations also land in sales mailbox).

**Sub-decision: Outlook label naming**

| Option | Description | Selected |
|--------|-------------|----------|
| Match debtor pattern (Auto-Reply, OOO Temporary, etc.) | Operator can rename in Outlook later | ✓ |
| Sales-specific naming from day one | Requires operator input on labels | |

**Selected:** Match debtor pattern (auto: recommended default)

---

## Claude's Discretion

- Exact prompt wording for agent's `<role>` and `<task>` blocks (planner/researcher drafts).
- `pipeline_events.payload` JSON shape for Stage-1 rows (follow Phase 70 convention).
- Specific sales-email mailbox for rollout (operator chooses during execute-phase).
- Sales-email `entity_brand` value (`[]` cross-brand vs starter list — operator confirms).

## Deferred Ideas

(See `74-CONTEXT.md` `<deferred>` section for the full list — sales-email regex from corpus, promotion hook, eval dataset, cost dashboards, etc.)
