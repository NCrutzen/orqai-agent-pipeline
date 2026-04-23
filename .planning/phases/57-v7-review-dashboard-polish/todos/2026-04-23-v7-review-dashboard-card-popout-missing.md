---
created: 2026-04-23T09:00:00.000Z
title: v7 email review dashboard — job-card click drawer / pop-out (new feature)
area: ui
files:
  - web/components/v7/kanban/kanban-job-card.tsx
  - web/components/v7/kanban/kanban-column.tsx
  - web/components/v7/kanban/kanban-board.tsx
  - web/components/v7/drawer/agent-detail-drawer.tsx (existing agent drawer — likely not the right fit)
---

## Problem

The v7 kanban dashboard (under the `(dashboard)/projects/[id]` swarm view) renders job cards in the "Needs review / Processing / Done" columns. Each card shows title, log-entry count, tag chips, time. Clicking a card should open a pop-out / drawer with the full details of that card (timeline of log entries, which sub-agents touched it, linked automation_runs with screenshots, ability to drill into the message thread).

**This feature was never built.** `kanban-job-card.tsx` has `role="button"` + `tabIndex={0}` for a11y but NO card-level `onClick`. The only inline `onClick` is a `stopPropagation` on the "Open review" link inside some cards. There is a `DrawerProvider` + `agent-detail-drawer.tsx` for subagent-fleet cards (different surface — keyed by agent name), but nothing for job cards.

## Scope when we pick this up

Build a **job-detail drawer** reachable from a card click. Minimum content:

1. **Header:** job title, mailbox, received-at, current stage, sla risk indicator.
2. **Timeline:** the log entries referenced by "3 log entries" (come from `SwarmJob.description` JSON shape with `{ timeline: [...], latest_error, entity_id }` — already parsed in the card render to show the summary). Full timeline renders as a vertical list of step → status → when → agent.
3. **Linked automation_runs:** joined by `entity_id` (or `message_id`) — surface the `result` payload including screenshots (pull URL from `result.screenshots.before|after.url` — note: this is the actual shape stored today, not `result.screenshots.{before|after}: string` that the existing `agent-run-drawer.tsx`'s `extractScreenshots` expects).
4. **Actions:** none for phase 1 (read-only drawer). Later: override category, archive, replay.

## Open architectural questions

- Is the drawer per-job (keyed by `job.id` / `entity_id`) or re-use agent drawer's DrawerContext pattern (keyed by agent name)? Job is the natural unit here — new `JobDrawerContext` is cleaner.
- Where does the drawer mount? Sibling of `<SwarmRealtimeProvider>` like the agent drawer, per `swarm-layout-shell.tsx`.
- `SwarmJob` data shape — `lib/v7/types.ts` — does it already have every field we need for the drawer or do we enrich in a server action?

## Related UI fix needed

`extractScreenshots` in `web/lib/automations/types.ts` expects `result.screenshots.before = string` but actual data is `result.screenshots.before = { url, path }`. Fix both: accept the object shape (prefer `.url`, fall back to `.path` with server-action signed URL). Otherwise any existing drawer that renders screenshots renders nothing. Referenced in sibling todo `2026-04-23-v7-review-screenshots-not-rendering.md`.

## Sequencing

Not blocking the copy-document swarm design or intent-agent work. Pick this up after those ship, when the swarm actually produces job rows for the debtor team to review.
