---
captured: 2026-05-18
source: UAT — operator confused by Stage 1 'Needs review 489' filter chip
status: pending
priority: M
target_milestone: v8.1
tags: [stage-1, ui, filter, semantics, terminology]
---

# Stage 1 "Needs review" chip — clarify semantics (decision-based vs verdict-based)

## Observation

The Stage 1 page's "Needs review" filter chip shows 489 on acceptance
(2026-05-18). Operator expected a much smaller actionable number.

The chip is technically correct: it filters to rows whose
`pipeline_events.decision` is in `NEEDS_ACTION_DECISIONS`
(`web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:43-49`).
For Stage 1 that means `decision='unknown'` — the regex+LLM Pass-2
couldn't classify. The 489 figure roughly matches SQL: ~144 stage-1
unknowns in last 7d, ~300+ over 30d.

But the **label** "Needs review" reads as "rows pending **my** review"
(i.e. ones where the operator hasn't yet confirmed/overridden). The
chip's actual semantics — "rows the system couldn't auto-handle" —
is different. Mismatch causes operator overload.

## Two possible reframings

**Option A — change the chip label** to match the current decision-based
semantics. Candidates: "Unclassified" / "Couldn't classify" /
"Stage 1: unknown" / "System unsure". Pro: zero loader change. Con:
doesn't help operators triage their personal queue.

**Option B — change the chip semantics** to verdict-based: rows where
`own_latest_verdict IS NULL` (operator hasn't yet given a verdict on
this row's Stage 1 verdict). Pro: matches operator mental model. Con:
loader change required; needs to keep "Auto-handled" / "Own reviewed"
chips coherent.

**Hybrid (recommended for v8.1):** rename current chip to "Unclassified"
to make decision-semantics explicit, AND add a separate "My queue" or
"Pending my review" chip that filters by `own_latest_verdict IS NULL`.
Two chips serve two operator needs:
- "Unclassified" = system-needs-help (today's behavior)
- "Pending my review" = work-I-haven't-done-yet (new)

## Why deferred

Phase 82.8 closure is the priority. The current behavior is functionally
correct; only the terminology surfaces operator friction. v8.1 is the
right time to introduce a verdict-based filter alongside the existing
decision-based one (touches loader, list-page, chip component, plus
likely Stage 2 and Stage 0 for consistency).

## Out of scope

- Backfilling historical email_feedback for "own_latest_verdict"
  semantics. Today's `loadFeedbackMap` already supplies this; just
  needs a chip wired against it.
- Changing the per-stage default filter selection. The "Needs review"
  chip is the active default on Stage 1; whether v8.1 keeps that or
  switches default to "My queue" is a design call.

## Open questions

- Should the term "Needs review" be reserved for verdict-based (operator
  TODO) and the decision-based filter get a new name? Or vice versa?
  Pre-empt by aligning on terminology before the v8.1 spec.
- Stage 0 currently filters at the page-level to `injection_suspected`
  only (Phase 82.8 fix on 2026-05-18). v8.1 may want to revisit using
  the chip pattern for consistency rather than hardcoded page filtering.

## Next step

Specify v8.1 phase that touches Stage 0/1/2 filter chips, with
terminology decided up-front.
