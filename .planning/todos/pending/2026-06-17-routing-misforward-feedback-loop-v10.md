---
created: 2026-06-17T00:00:00.000Z
title: Routing mis-forward feedback loop — learn from recipient corrections (V10)
area: automation
priority: future-milestone
target_milestone: V10
files:
  - web/lib/automations/info-routing/
  - public.routing_destinations
---

## Context

Raised by the operator during Phase 131 execution (destination-taxonomy + Stage-3 router) at the
131-01 checkpoint. Phase 131 builds the router that classifies an actionable email onto a destination
bucket×brand and (in Phase 132) forwards it to the resolved target mailbox.

## The idea

When the router forwards an email to a destination mailbox and **the human recipient at that mailbox
sees it was forwarded incorrectly** (wrong bucket → wrong mailbox), there is currently no path for that
correction to flow back and teach the system. The recipient is the cheapest, highest-signal labeler we
have — they know immediately when something landed in the wrong inbox.

Worth designing a feedback mechanism for V10:
- How does a recipient signal "this was mis-routed" (Outlook category move? reply-to-sender? a
  lightweight correction surface)?
- How does that correction become a labeled training/eval pair for the `info-routing-coordinator`?
- Tie-in with the ROUTE-08 shadow-precision harness (Plan 131-05): recipient corrections are exactly
  the human-actual destination signal the shadow harness needs, which today is absent (0/8000 categories
  on info@). A recipient-correction channel could become that ground-truth source.

## Why deferred

Not in scope for V9.x (router is observe/held-mode; nothing forwards until Phase 132). Capturing now so
the feedback-loop design is on the V10 radar rather than rediscovered later.
