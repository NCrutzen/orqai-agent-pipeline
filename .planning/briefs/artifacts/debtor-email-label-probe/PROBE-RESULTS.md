# Probe Iteration 1 — Findings

**Run:** 2026-04-29 06:38 CEST
**Env:** production iController (`walkerfire.icontroller.eu`)
**Mailbox:** Smeba (`mailbox_id=4`)
**Target URL:** `/messages/index/mailbox/4`

## Critical insight

**iController uses "Accounts" terminology, not "labels".** The customer-account assignment surface is the **Accounts column** on each message row, NOT a "label" picker. Phase 56 CONTEXT/RESEARCH described it as "labeling" because that's how the operator referred to it — but the iController DOM uses `Accounts`.

This means:
- Probe keyword pattern `/label|assign|toewijz|debtor|customer|account|klant/i` partially worked (matched `account`/`Accounts` UI), but the candidates returned were mostly **label-administration** UI on the left side of the inbox (mailbox category tags like `smebabrandbeveiliging`, `apexfire`, etc.) — those are filter views, not row-assignments.
- The captured screenshot `02-label-picker-open.png` is the **Dashboard** because the probe clicked the highest-scoring keyword candidate, which turned out to be the "Accounts" top-nav link → redirected to Dashboard.

## Observed UI flow (from screenshot 01)

```
Inbox view (https://walkerfire.icontroller.eu/messages/index/mailbox/4)
┌──────────────────────────────────────────────────────────┐
│ [Top nav: Invoicing | Payments | Cash App | Collections] │
│ [Sub nav: Dashboard | Reports | Worksheet | Accounts |   │
│           Messages (1WMK ← unread badge)]                │
├──────────────────────────────────────────────────────────┤
│ Sidebar: list of mailbox/category labels                 │
│   - Inbox                                                │
│   - A and A                                              │
│   - Apexfire                                             │
│   - Berki Brandbeveiliging                               │
│   - smebabrandbeveiliging  ← currently selected (Smeba) │
│   ...                                                    │
├──────────────────────────────────────────────────────────┤
│ Main panel: messages table                               │
│   [New message] [Mark Done] 🏷️ 🗑️                       │
│   ┌──────────────────────────────────────────────────┐  │
│   │ ☐ │ From            │ Subject │ Accounts │ Date │  │
│   ├──────────────────────────────────────────────────┤  │
│   │ ☐ │ service@grasgr… │ ...     │ (empty)  │ 04-01│  │
│   │ ☐ │ ISS             │ ...     │ (empty)  │ 04-14│  │
│   └──────────────────────────────────────────────────┘  │
│   Each row's "Accounts" cell appears to be EMPTY by      │
│   default (no auto-labeling applied yet) — this is       │
│   exactly the surface Phase 56 will fill.                │
└──────────────────────────────────────────────────────────┘
```

## What we learned

1. **The list view DOES have an "Accounts" column** ready to receive a customer-account assignment.
2. **Empty by default** — Phase 56's job is to populate it via Browserless once the resolver returns a customer_id.
3. **Label icon (🏷️) in the toolbar** likely opens a bulk-label picker — but Phase 56 needs per-row, not bulk.
4. **The probe's `tr` click did NOT open a detail view** — the page stayed on the list. This is the iController UX: click checkbox to select, then use toolbar action OR click the row's specific "edit accounts" cell.
5. **No row-detail view captured.** Need iteration 2 with refined click logic.

## Next iteration plan (probe v2)

Update `web/lib/automations/debtor-email/probe-label-ui.ts`:

1. **New keyword pattern:** `/account/i` (singular focus on the "Accounts" column)
2. **New click target:** the Accounts cell within a specific message row (likely a `<td class="accounts">` or `<td data-column="accounts">` — need to inspect)
3. **Alternative click flow:**
   - Approach A: click the row checkbox → find a "Set Accounts" action in the toolbar
   - Approach B: hover row → an inline edit icon may appear in the Accounts cell
   - Approach C: click directly inside the Accounts cell → opens an inline picker
4. **Capture the picker DOM** with full attribute dump (id, classes, data-*, ARIA) so the Browserless module can find selectors.
5. **Capture network requests** during the picker interaction — POSTs to `/messages/<id>/account` or similar would tell us if there's a backend API we can use directly (faster than DOM clicking).

## What to NOT do in v2

- **Do NOT click "Mark Done"** — that's destructive (closes the message).
- **Do NOT click 🗑️** — destructive.
- **Do NOT click "Save"/"Apply" in any picker** — read-only probe, never commit changes.
- **Do NOT iterate >5 times in one run** — keep each probe pass cheap.

## Findings → CONTEXT.md updates needed

- [ ] D-15 / D-17: rename "label-DOM" to "account-assignment-DOM" in any narrative — terminology drift.
- [ ] D-18 (Browserless module): the module's input contract `pre-resolved iController message-URL` may not be the right shape. The actual flow is **list view + row-action**, not detail-view URL. The signature should be `assignAccount({ icontroller_mailbox_id, graph_message_id, customer_account_id })` — and the module finds the specific row by `graph_message_id` (or fallback to subject+from).
- [ ] D-22 dashboard: continue calling it "labeling dashboard" if that's still the user-facing term, but internally column may be `customer_account_id` (already in migration) and method `account_assigned` instead of `labeled`.

## Operator confirmation needed

When you're back, please confirm:

1. Is the **Accounts column** indeed the customer-account assignment? (Walking through one message manually would settle this.)
2. How do you currently assign an account to an unlabeled message? (Click in the Accounts cell? Use toolbar? Detail view?)
3. Is there an iController API (REST/JSON) for account assignment — would save us Browserless work entirely?

## Artifacts

- `00-mailbox-list.png` — Smeba inbox list (showing the Accounts column)
- `01-message-detail.png` — same view (probe didn't navigate to detail; named misleadingly)
- `02-label-picker-open.png` — Dashboard (probe clicked wrong candidate; not a picker)
- `candidates.json` — 60 DOM elements matching label/assign keywords (mostly label-admin UI, not row actions)

## Status

**Iteration 1 complete; ITERATION 2 NEEDED to capture actual account-assignment DOM.** Wave 2 / Wave 3 (route refactor, Browserless module, dashboard) can still proceed with placeholder selectors that get filled in after iter 2.
