# Debtor Email Pipeline — Definitive Architecture

> **Status:** as-of 2026-04-29. Phase 56-02 wave 3 is in design (workers below marked "planned").
>
> **Supersedes:** `docs/email-agent-swarm-architecture.md` (early agent-first vision, predates the regex classifier + `swarm_categories` registry).

This document is the canonical map of how an inbound debtor email becomes (a) classified, (b) routed, (c) actioned. Everything else (routes, workers, Orq.ai agents, registry rows, tables) implements one of the boxes here.

---

## End-to-end flow

```
inbound email (Outlook shared mailbox)
        ↓  (Graph polling / push)
email_pipeline.emails (canonical row, source-of-truth for body+sender+conv)
        ↓
classifier (Stage 1: regex)             lib/debtor-email/classify.ts
   - auto_reply
   - ooo_temporary
   - ooo_permanent
   - payment_admittance
   - unknown                            ← falls through to Stage 2
        ↓
classifier-verdict-worker               lib/inngest/functions/classifier-verdict-worker.ts
   loads swarm_categories(swarm_type='debtor-email', category_key=<x>)
   switches on category.action:
        ├─ categorize_archive: auto_reply, ooo_*, payment_admittance, payment
        │     → outlook.categorize(label) + outlook.archive
        │     → queue iController-delete (deferred automation_run)
        │
        └─ swarm_dispatch: emit Inngest event named in category.swarm_dispatch
              ↓
              ┌────────────────────────────────────────────────────────────┐
              │ Specialized worker per category_key (registry-driven, see  │
              │ "Stage 2 handlers" below)                                  │
              └────────────────────────────────────────────────────────────┘
```

---

## Stage 1 — Regex classifier

**Module:** `web/lib/debtor-email/classify.ts`

Pure deterministic regex rules ordered by specificity. First match wins. Returns `{category, confidence, matchedRule}`. No LLM, no I/O.

**Rationale:** closed-taxonomy noise filtering (out-of-office, auto-replies, payment confirmations) is well-suited to regex. Auditable via `matchedRule`, fast, precision-first, free.

**Categories produced today:**
- `auto_reply` — system-sender + automated subject patterns
- `ooo_temporary` — temporary OoO indicators
- `ooo_permanent` — permanent OoO indicators
- `payment_admittance` — bank/AP system payment confirmations
- `unknown` — no rule matched

**Override category** (set by operator from review UI, NOT classifier):
- `invoice_copy_request` — operator marks email as "customer asks for invoice copy"
- `payment` — variant of payment_admittance

---

## Stage 2 — Per-category handlers

The `swarm_categories` registry (`public.swarm_categories`) holds one row per `(swarm_type, category_key)` with the action to take. Adding a category = INSERT row + add Inngest worker (if `swarm_dispatch`); zero edits to the verdict-worker.

### Current registry rows (debtor-email)

| category_key | action | swarm_dispatch | What happens |
|---|---|---|---|
| auto_reply | categorize_archive | — | Outlook label + archive + iController delete |
| ooo_temporary | categorize_archive | — | same |
| ooo_permanent | categorize_archive | — | same |
| payment | categorize_archive | — | same |
| payment_admittance | categorize_archive | — | same |
| invoice_copy_request | categorize_archive | — | **WRONG, see Wave 3 below** |
| unknown | reject | — | **WRONG, see Wave 3 below** |

### Wave 3 (planned 2026-04-29) — flips the two wrong rows

**`unknown` → debtor-email/label-resolve.requested**

```
classifier-label-resolver  (planned Inngest function)
        ↓
load email_pipeline.emails by message_id
load debtor.labeling_settings by source_mailbox (nxt_database, brand_id, dry_run)
        ↓
Optional: Orq.ai Intent Agent (planned)
        - LLM classifies the actual intent (copy_document_request,
          payment_dispute, address_change, etc.)
        - If confident match → re-emit appropriate swarm_dispatch event
        - If still unknown → continue with deterministic resolver
        ↓
resolveDebtor (4-layer pipeline)            web/lib/automations/debtor-email/resolve-debtor.ts
        - thread_inheritance
        - sender_match (NXT-Zap nxt.contact_lookup)
        - identifier_match (NXT-Zap nxt.identifier_lookup, multi-row + dedup)
        - llm_tiebreaker (Orq.ai LABEL_TIEBREAKER_AGENT_SLUG, gated by D-12 candidate-details pre-fetch)
        - unresolved
        ↓
insert debtor.email_labels (audit row)
        - method, confidence, customer_account_id, debtor_name, status
        - status: dry_run | pending | skipped (for unresolved)
        ↓
[Phase 56.8] iController DOM step: tag the email under the matched account
```

**`invoice_copy_request` → debtor-email/invoice-copy.requested**

```
classifier-invoice-copy-handler  (planned Inngest function)
        ↓
load email + labeling_settings
        ↓
extractInvoiceCandidates (subject + body regex)
        + resolveDebtor (for customer context)
        ↓
For each invoice candidate:
    POST /api/automations/debtor/fetch-document
        - async-callback Zap (nxt.invoice_fetch)
        - returns hydrated PDF (base64) + filename + S3 metadata
        ↓
Orq.ai Draft Agent (composes body)
        - Inputs: language, brand context, invoice metadata, customer name
        - Output: HTML body for the reply
        ↓
POST /api/automations/debtor/create-draft
        - mode: 'reply', messageId from Outlook
        - PDF attachment + composed body
        - Browserless flow saves draft in iController (NO send)
        ↓
insert debtor.email_labels
        - method='invoice_copy_drafted'
        - link to draft_id from iController if exposed
        ↓
DO NOT archive the Outlook message
        - operator reviews + sends draft from iController as today
```

---

## Component map (where things live)

### Tables
| Schema.Table | Purpose |
|---|---|
| `email_pipeline.emails` | Source-of-truth email rows from Outlook |
| `debtor.labeling_settings` | Per-mailbox config: nxt_database, brand_id, dry_run, entity, icontroller_company |
| `debtor.email_labels` | Audit row per resolution attempt (one per email) |
| `debtor.fetch_requests` | Async-callback state for invoice-fetch Zap |
| `debtor.nxt_lookup_requests` | Async-callback state for the 3 NXT lookup tools |
| `public.swarms` | Registry: one row per swarm_type with display + side-effects |
| `public.swarm_categories` | Registry: action per (swarm_type, category_key) |
| `public.zapier_tools` | Registry: target_url + auth + pattern per Zapier-bound tool |
| `public.automation_runs` | Generic queue for deferred actions (iController-delete, etc.) |

### Vercel routes
| Route | Purpose |
|---|---|
| `/api/automations/debtor-email/ingest` | Email ingest from Outlook → email_pipeline.emails |
| `/api/automations/debtor/label-email` | (Legacy synchronous trigger) — same resolver pipeline as the planned worker |
| `/api/automations/debtor/fetch-document` | Async-callback wrapper for nxt.invoice_fetch Zap |
| `/api/automations/debtor/fetch-document/callback` | Zap → Vercel callback |
| `/api/automations/debtor/nxt-lookup/callback` | Zap → Vercel callback for the 3 lookup tools |
| `/api/automations/debtor/create-draft` | Browserless DOM flow: save draft in iController |

### Inngest functions
| Function | Trigger | Purpose |
|---|---|---|
| `classifier-verdict-worker` | `classifier/verdict.recorded` | Registry-driven dispatch on action |
| `classifier-spotcheck-sampler` | cron | Sample emails for human verdict review |
| `classifier-promotion-cron` | cron | Promote rules from shadow → live |
| `classifier-backfill` | event | Backfill classifier on historical emails |
| `classifier-corpus-backfill` | event | Build labeled corpus for rule tuning |
| `labeling-flip-cron` | cron | Flip dry_run per mailbox at scheduled times |
| `classifier-label-resolver` *(planned)* | `debtor-email/label-resolve.requested` | Wave 3 — unknown handler |
| `classifier-invoice-copy-handler` *(planned)* | `debtor-email/invoice-copy.requested` | Wave 3 — invoice copy handler |

### NXT-Zap integration (registry-driven)
| tool_id | pattern | callback_route | Purpose |
|---|---|---|---|
| `nxt.invoice_fetch` | async_callback | /api/automations/debtor/fetch-document/callback | Fetch PDF from S3 by invoice_number |
| `nxt.contact_lookup` | async_callback | /api/automations/debtor/nxt-lookup/callback | sender_email → top_level_customer_id |
| `nxt.identifier_lookup` | async_callback | /api/automations/debtor/nxt-lookup/callback | invoice_numbers → paying_customer_id |
| `nxt.candidate_details` | async_callback | /api/automations/debtor/nxt-lookup/callback | customer_ids → details for LLM tiebreaker |

All 4 share auth secret `DEBTOR_FETCH_WEBHOOK_SECRET` (body field `auth` on the lookup tools, `secret` on invoice-fetch).

### Orq.ai agents
| Slug env var | Role |
|---|---|
| `LABEL_TIEBREAKER_AGENT_SLUG` | Multi-candidate disambiguation for resolveDebtor |
| *Intent Agent (planned)* | Stage 2 LLM classifier on `unknown` bucket |
| *Draft Agent (planned, exists in Orq.ai)* | Compose invoice-copy reply body |

---

## Trigger architecture decisions

### Why `unknown` is the trigger for the resolver pipeline

The earlier proposal of polling iController's "Onbekend" bucket via Browserless was rejected: the regex classifier already produces `unknown` for the same set of emails. Plugging the resolver into the existing classifier pipeline (via `swarm_categories.action='swarm_dispatch'`) is push-driven, deterministic, and reuses the existing automation_runs queue + UI.

Other categories (auto_reply, ooo, payment_*) explicitly **do not** need NXT-Zap calls — they're noise that gets categorize_archived without customer resolution.

### Why no full-LLM classifier replaces the regex stage

Per the 2026-04-22 design decision (todo `2026-04-22-automate-copy-document-responder`):
- Regex stage handles deterministic noise filtering — fast, free, auditable
- LLM stage (intent agent) sits ON TOP of the `unknown` fall-through, NOT instead of it
- This keeps cost predictable: only ~30-40% of inbound mail hits an LLM call

### Why drafts live in iController, not Outlook

iController is where the operator reviews and sends from today. Creating drafts there preserves the human-in-the-loop boundary at the existing tool. Outlook is read-only from our automation's perspective (categorize + archive only); we don't compose or send.

### Why customer resolution and brand_id filtering matter

NXT databases store invoice_number ranges PER brand (Smeba, Fire Control, Sicli North, Sicli South, Berki, Smeba Fire BE, plus Walker Fire UK ×14 and Apex Fire/etc IE). The same invoice_number can exist for multiple brands. Without `brand_id` filtering, identifier-lookup returns N matches forcing an unnecessary LLM tiebreaker. `brand_id` is configured per-mailbox in `debtor.labeling_settings.brand_id` (2-letter NXT brand code, e.g. `SB` for Smeba).

---

## What stays, what moves, what goes

| Component | Status | Note |
|---|---|---|
| Regex classifier | KEEP | Stage 1 noise filter |
| swarm_categories registry | KEEP | Add 2 rows for Wave 3 |
| classifier-verdict-worker | KEEP | Already supports `swarm_dispatch` action |
| /label-email route | KEEP for now | Can deprecate after worker is live + Zaps repointed |
| Polling iController | NOT BUILT | Replaced by `unknown` swarm_dispatch trigger |
| Outlook category=unknown filter | NOT BUILT | Same reason |

---

## Human Review surfaces

Two distinct surfaces, two distinct purposes. Confusion between them is the #1 source of "where does this email show up" misunderstandings.

### 1. Bulk Review (`/automations/debtor-email/review`)

**Purpose:** Audit + feedback on classifier rule applications. Where the operator goes to:
- Verify which rule fired on each email (and whether it was correct)
- Provide feedback (approve / reject) so rules can self-tune (`agent_runs.human_verdict`)
- Spot patterns that should become new rules or new automation steps
- Browse historical decisions filtered by rule, mailbox, category, date

**Data source:** `debtor.email_labels` rows joined with `email_pipeline.emails` and `automation_runs`. **All categories show up here** — even fully automated ones — because this surface is the audit log.

**Operator action surface:** correction (override category) + feedback (👍 / 👎) + free-form note.

URL pattern includes filter args, e.g.:
`/automations/debtor-email/review?rule=subject_ticket_ref&selected={email_labels.id}`

### 2. Kanban (`/swarm/{projectId}` — debtor-email project = `60c730a3-be04-4b59-87e8-d9698b468fc9`)

**Purpose:** Active work queue — emails where a human MUST verify or approve before something happens (or has happened in dry_run).

**Stages** (from `lib/v7/kanban/stages.ts`):
- `backlog` — captured but not yet routed
- `review` — **HUMAN VERIFICATION required**
- `ready` — queued for a worker (after operator approval)
- `progress` — worker is running
- `done` — terminal state

**Per-category mapping (Wave 3):**

| category_key | Goes to Kanban? | Initial stage | Notes |
|---|---|---|---|
| auto_reply | ❌ | — | done-only via terminal feed below |
| ooo_temporary / ooo_permanent | ❌ | — | done-only via terminal feed |
| payment / payment_admittance | ❌ | — | done-only via terminal feed |
| invoice_copy_request | ✅ | `review` | Operator opens iController, reviews draft, hits Send |
| unknown → matched (dry_run) | ✅ | `review` | Operator validates label assignment, approves/rejects → CI score |
| unknown → matched (live) | ✅ | `review` | Same as dry_run — label was applied; operator confirms it was right |
| unknown → unresolved | ✅ | `review` | Operator manually assigns customer or marks unfixable |

**Why dry_run shows up in Kanban:** during the Pre-Live phase the HITL needs visibility into matches to (a) approve/reject decisions, (b) feed back so we can compute Confidence Index (CI) per rule/path.

**Terminal feed on the kanban page** (per-card detail view + page footer):
- All `done` automation_runs appear in the live event feed (auto_reply etc. flowing through here for transparency)
- Card detail view shows: full email, classifier verdict, resolver path, lookup matches, draft preview if applicable

**Filters:**
- All mailboxes together by default
- Filter dropdown per mailbox
- User-saved fixed filter (e.g. operator A only sees Smeba; operator B sees Sicli)

**Card actions per type:**

| Card type | Operator action | Effect |
|---|---|---|
| `invoice_copy_request` | "Send" (in iController, then mark done in our UI) | card → done, email_labels.status=labeled |
| `unknown_matched` (dry_run) | Approve / Reject | approved → emit live label event; rejected → 👎 feedback + manual category |
| `unknown_matched` (live) | Confirm correct (same actions for CI) | feedback only, no extra side-effect |
| `unknown_unresolved` | Manual customer pick OR "skip permanently" | manual pick triggers iController label step; skip closes card |

### Data model (proposal — to be confirmed in Wave 3 implementation)

The kanban reads from `swarm_jobs` (Phase 52 v7 foundation). Today the bridge `lib/automations/swarm-bridge/sync.ts` mirrors `automation_runs` → `swarm_jobs`. Wave 3 extends this so per-email handler runs surface as cards.

| Concept | Backing storage |
|---|---|
| Kanban card | `swarm_jobs` row (synced from `automation_runs`) |
| Stage | `swarm_jobs.stage` (driven by `automation_runs.status` + a status→stage map) |
| Card-to-email link | `automation_runs.result.email_id` → `email_pipeline.emails.id` (and onward to `email_labels`) |
| Audit (Bulk Review) | `email_labels` joined with `automation_runs` |
| Stage transitions | Inngest workers UPDATE `automation_runs.status`; bridge sync updates `swarm_jobs.stage` |

Status → stage mapping (proposed):

| `automation_runs.status` | `swarm_jobs.stage` |
|---|---|
| `predicted` (regex inferred, no human seen yet) | `review` for kanban-eligible categories |
| `feedback` (operator approved/rejected) | `done` (or `ready` if downstream side-effect pending) |
| `deferred` (queued for downstream worker) | `ready` |
| `completed` | `done` |
| `failed` | `done` (with error chip) |

Categories that are NOT kanban-eligible (auto_reply etc.) skip stages and write directly with `done` so they appear in the terminal feed without occupying a `review` slot.



- Phase 56-02 — async-callback pivot, brand_id filter, callback route, resolver wired (DONE)
- Phase 56-02 wave 3 — flip `unknown` + `invoice_copy_request` to `swarm_dispatch` + 2 new workers (THIS)
- Phase 56.7 — swarm_registry generalization (in design, see `.planning/phases/56.7-swarm-registry/`)
- Phase 56.8 — iController DOM step for matched-customer labeling
