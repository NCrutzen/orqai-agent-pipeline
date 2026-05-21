# Phase 64: Stage 0 input safety + per-run budgets — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 64-stage-0-input-safety-per-run-budgets
**Areas discussed:** Detection layering, allowed_for_intents shape, Bulk Review surface, Budget breach handoff

---

## Detection layering

### Q1: Stage 0 detection layering — when does the LLM verdict run?

| Option | Description | Selected |
|--------|-------------|----------|
| Regex first, LLM only on inconclusive (Recommended) | Cheap regex catches obvious hits; LLM only on inconclusive bucket. Matches RFC. | |
| LLM on every email | Skip the regex-first gate; every inbound gets a model verdict. | ✓ |
| Regex only, no LLM | Defer LLM to a later phase. SAFE-03 explicitly requires layered approach. | |

**Notes:** User picked the non-recommended option. Confirmed in follow-up — accepted the trade-off (uniform cost signal for axis-4 outlier, ~€0.0003/email cost), and accepted that Phase 64 plan must update `docs/agentic-pipeline/stage-0-safety.md` so the RFC and the implementation do not drift.

### Q2: Confirm: LLM runs on every email regardless of regex?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, LLM on every email — update RFC | Lock; Phase 64 also patches the RFC paragraph. | ✓ |
| Actually, regex-first / LLM only on inconclusive | Switch back to RFC behavior. | |
| Hybrid: every email during ramp, then drop later | Ship "every email", promote via Phase 71. | |

### Q3: Which Orq.ai model for the LLM verdict step?

| Option | Description | Selected |
|--------|-------------|----------|
| claude-haiku-4-5 (Recommended) | Cheapest fast Claude. ~€0.0003/call. | ✓ |
| gemini-2.5-flash | Lowest latency, mixes Google into Claude-primary stack. | |
| claude-sonnet-4-6 | Same primary model. Overkill for binary classification. | |

### Q4: Seed regex pattern set source?

| Option | Description | Selected |
|--------|-------------|----------|
| Anthropic published patterns + small custom Dutch/English list (Recommended) | Start from Anthropic's prompt-injection-defenses guidance, add ~5–10 patterns specific to debtor-email noise. Iterate via graduated-automation. | ✓ |
| Adopt OSS list (promptmap, lakera/garak) | Broader coverage, heavier dependency. | |
| Fully custom from sample inbox | Tightest fit, weakest coverage. | |

---

## allowed_for_intents shape

### Q5: Schema shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Array column on existing zapier_tools table (Recommended) | text[] column, simplest migration. | ✓ |
| Separate junction table zapier_tool_intents | More flexible, heavier read path. | |

### Q6: Default behavior when allowed_for_intents is NULL/empty?

| Option | Description | Selected |
|--------|-------------|----------|
| Default-deny (Recommended) | NULL/empty ⇒ no intent can invoke. Aligns with BUDG-02. | ✓ |
| Default-allow | NULL/empty ⇒ any intent can invoke. Defeats BUDG-02. | |

### Q7: Where does the canonical intent list live?

| Option | Description | Selected |
|--------|-------------|----------|
| swarm_categories.key as intent identifier (Recommended) | Reuse existing registry. One source of truth. | ✓ |
| New swarm_intents table | Allows many-to-many later. Adds parallel registry. | |

---

## Bulk Review surface for injection_suspected

### Q8: Where do injection_suspected emails land?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated tab/lane (Recommended) | New "Safety review" tab. Different mental model from draft review. | ✓ |
| Filter on existing Bulk Review | Same UI, toggle. Mixes safety review with draft review. | |

### Q9: What trigger info to surface per flagged email? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Regex pattern that matched | Literal regex rule that fired. | ✓ |
| LLM verdict + reasoning | Model classification + 1-2 sentence reason. | ✓ |
| Raw email body with highlight | Full body, matched span highlighted in-line. | ✓ |
| Per-email token cost | Cost in cents, also feeds axis 4 outliers. | ✓ |

### Q10: Operator actions on a flagged email? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Mark safe → reprocess through Stage 1 | Re-enter pipeline with safety_overridden audit flag. | ✓ |
| Dismiss / archive | Confirmed injection or junk. Logged. | ✓ |
| Reply manually — human draft only | Operator writes reply outside pipeline. | |
| Escalate to colleague | Original escalate-to-supervisor option. | |

**Notes:** User typed free-text: "Escalate to the Human Review lane on the Kanban Board" — replacing the generic "escalate to colleague" option with reuse of the existing Kanban Human Review lane. Reply-manually was explicitly dropped: if a reply is needed, the path is mark-safe → reprocess (pipeline drafts) or escalate to Kanban (where manual draft tooling already lives).

---

## Budget breach → human queue handoff

### Q11: How does a budget breach halt and reach the human queue?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit step emits 'pipeline.budget_breached' event → human queue (Recommended) | First-class signal; no Inngest auto-retry. Separate consumer Inngest function creates Kanban item. | ✓ |
| Throw inside step.run — catch in finalizer | Need non-retryable error. Mixes business + error flow. | |
| Inngest function returns failure status | Loose coupling; needs separate watcher. | |

### Q12: Budget ceiling — tokens, cost, or both?

| Option | Description | Selected |
|--------|-------------|----------|
| Both, tracked side-by-side (Recommended) | Breach when EITHER exceeds. Tokens catch runaway, cost catches expensive-model. | ✓ |
| Cost only | Simpler. Token-runaway on cheap models slips through. | |
| Tokens only | Mismatch with operator-visible cost. | |

### Q13: What does "per-run" mean for the budget counter?

| Option | Description | Selected |
|--------|-------------|----------|
| One Inngest function invocation = one run (Recommended) | Counter per invocation; retries share budget. | ✓ |
| One email-thread = one run | Persists across invocations; needs thread state. | |
| One email = one run | Simplest, but multiple Inngest functions per email. | |

---

## Claude's Discretion

- Exact regex pattern list (D-04 seeds source).
- Exact ceiling values for tokens + cost (D-16).
- Median window for axis-4 outlier (D-17 — per-day vs per-week vs absolute).
- Inngest event names and payload shapes.
- Bulk Review UI implementation details.
- Migration ordering between `allowed_for_intents` column and backfill of existing tools.

## Deferred Ideas

- "Reply manually" as a Stage 0 action — out of scope.
- Many-to-many categories ↔ intents — out of scope unless future phase requires it.
- Promotion-ladder thresholds for tightening Stage 0 regex — Phase 71.
