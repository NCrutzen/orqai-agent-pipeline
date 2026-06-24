---
created: 2026-06-23T12:43:20.024Z
title: Routing labels need a distinct Outlook category color (not grey)
area: automation
files:
  - web/lib/outlook/routing-category.ts
  - web/lib/outlook/intent-category.ts
  - web/lib/outlook/client.ts
---

## Problem

Operator requirement (2026-06-23): the **routing** categories stamped back to
Outlook for the info-routing swarm (Phase 132 stamp-back) must render with a
distinct **colour**, so operators can tell routing labels apart at a glance from
the existing grey **`AI:` intent** labels.

Today both `routing-category.ts` and `intent-category.ts` only write the category
**name** (the `AI:`-prefixed string) onto the message. They never set a colour, so
Outlook shows every auto-created category as the default (no colour / grey). The
category colour is a **master-category** property in the mailbox, not something set
at message-stamp time.

## Solution

Register the routing categories in each mailbox's Outlook **master category list**
with an explicit `presetColor` via Microsoft Graph
(`POST/PATCH /users/{mailbox}/outlook/masterCategories`, e.g. `preset0..preset24`)
before/at stamp time — idempotent ensure-exists. Keep the `AI:` intent categories
grey (or a clearly different colour) so the two streams stay visually distinct.

Open points to decide when planning:
- One colour for all routing labels, or per-destination-bucket colours?
- Where to ensure the master category exists (a one-time provisioning step per
  mailbox vs ensure-on-write in `client.ts`).
- Does this ride along in Phase 132 follow-up or fold into Phase 133 / go-live.
</content>
