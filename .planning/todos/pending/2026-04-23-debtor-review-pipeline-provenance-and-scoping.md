---
created: 2026-04-23T10:30:00.000Z
updated: 2026-04-23T10:50:00.000Z
title: Debtor-email review pipeline — provenance, scope separation, and intra-company forward whitelisting
area: ui+pipeline
files:
  - web/lib/automations/swarm-bridge/sync.ts
  - web/lib/automations/swarm-bridge/configs.ts
  - web/app/(dashboard)/automations/debtor-email-review/page.tsx
  - web/components/v7/kanban/kanban-job-card.tsx
  - web/lib/debtor-email/classify.ts
  - (zapier) debtor-email-ingest Zap — sender-whitelist step
---

## Problem

The v7 kanban's "Human review" lane and the bulk review page (`/automations/debtor-email-review`) serve overlapping UX but are fed by different data and different review flows. Today three bugs surfaced while triaging a single unclassified card.

### Concrete case: "RE: FW: WKA verklaring SC&S"

Trace:

- **Mailbox** (receiver): `debiteuren@smeba.nl` — correct debtor inbox.
- **Sender**: `crediteuren@smeba.nl` — the internal Smeba credit team, not the external customer. They forwarded the mail from Miriam Kamerbeek `<miriam@sc-s.nl>` (the real customer) after it arrived in their inbox.
- **Content (forwarded body)**: the customer's actual WKA verklaring — a legitimate deliverable for chain-liability. Genuine debtor-team work.
- **Zapier ingest**: wrote `automation_run` with `status: "feedback"`, `result: {action: "skipped_not_whitelisted", predicted: {rule: "no_match", category: "unknown", confidence: 0}, stage: "zapier_ingest_classify"}`.
- **swarm-bridge**: read the `feedback` status → `deriveEntityStage` → `stage: "review"` → swarm_jobs row with `tags: ["unknown", "needs-review"]`.

**Diagnosis**: the Zapier ingest whitelist treats the sender as "internal, skip" without looking at the forwarded body. But intra-company forwards from `crediteuren@smeba.nl → debiteuren@smeba.nl` carry real customer content that belongs in the review queue. The skip is wrong at the policy layer.

Secondary finding: the `automation_runs.result.subject` was `"RE: FW: WKA verklaring SC&S"` but the matching row in `email_pipeline.emails` has `"FW: WKA verklaring SC&S"`. Two different records in the same thread — Zapier ingest and our `fetch-emails.ts` fill separate tables and are not fully in sync. Not actionable today; flagging for awareness.

## Bugs identified

1. **Whitelist policy gap**: intra-company forwards are silently dropped. The Smeba credit team forwarding a customer mail to debiteuren is an intended escalation path; the whitelist only looks at the outer sender, not the forwarded-from. Any `@smeba.nl` / `@sicli-sud.be` / `@berki.nl` / `@sicli-noord.be` / `@smeba-fire.be` sender addressing one of the 5 debiteuren/facturations mailboxes is a legitimate forward.
2. **`skipped_not_whitelisted` lands as `feedback`, not `skipped`**: swarm-bridge's `deriveEntityStage` then classifies as review-needed. Defense-in-depth: even when the whitelist is correct, a truly-skipped item should be `status: "skipped"` so it never reaches the review lane.
3. **No provenance on the card**: chips `unknown` + `needs-review` don't reveal WHY the item is in human review (regex couldn't match vs whitelist skip vs LLM low-confidence vs draft-pending). Reviewer can't tell whether to train the regex, iterate the LLM prompt, or flag the whitelist.

## Broader context (why this matters beyond one mail)

The debtor-email pipeline will soon have THREE distinct review flows that currently share one lane:

- **A. Regex rule training** — regex classifier returned `unknown`, human labels, feedback → regex-rule refinement. Current bulk review page targets this (but only for smeba debiteuren).
- **B. LLM intent-agent review** — the future intent-agent (parallel /orq-agent session) returns low confidence or an intent we can't auto-handle. Human fills the gap → LLM prompt tuning signal.
- **C. Draft approval** — the copy-document sub-agent has placed a draft in iController. Approval already happens in iController; probably no dashboard surface needed, but decide explicitly.

Conflating all three under `needs-review` means the reviewer can't prioritise and we can't build targeted feedback loops.

## Fix plan

### Part 1 — Expand the Zapier whitelist to cover intra-company forwards (chosen — user decision 2026-04-23)

In the Zapier ingest Zap for the debtor-email pipeline, extend the sender-whitelist step to admit **any sender whose domain is one of the 5 Smeba-group entities**:

- `*@smeba.nl`
- `*@sicli-noord.be`
- `*@sicli-sud.be`
- `*@berki.nl`
- `*@smeba-fire.be`

These are the same domains our own outbound uses; any address from them arriving at a `debiteuren@*` / `facturations@*` mailbox is an internal forward worth classifying (not worth skipping). Whitelisted items flow through the normal regex classifier.

Also extend the Zapier condition: if the body contains a `Van: <external>@...` / `From: <external>@...` header block (classic Outlook forward marker), treat the original sender as the real sender for classification purposes. Can be done with a Zapier Formatter step that extracts the first `From:` line from the body.

Implementation note: the specific Zap to edit is the one that writes `automation_runs` rows with `triggered_by: "zapier:ingest"` and `result.stage: "zapier_ingest_classify"`. Find it in Zapier by that automation_run shape.

### Part 2 — Status hygiene and provenance metadata

**Status hygiene** (quick, defensive):

- When the Zapier step genuinely decides to skip (content not classifiable AND not a known forward), write `status: "skipped"` — not `"feedback"`. swarm-bridge already treats `skipped` / `skipped_idempotent` as done, not review.

**Provenance** (structural):

- Extend the debtor-email `deriveTags` in `web/lib/automations/swarm-bridge/configs.ts` to emit a review-reason chip derived from `automation_run.result`:
  - `regex:unknown` — `predicted.rule === "no_match"`
  - `regex:low-conf` — matched a rule but `predicted.confidence < 0.8`
  - `llm:low-conf` — future intent-agent run with `result.confidence < threshold`
  - `llm:no-intent` — future intent-agent `result.intent === "other"` or unactionable
  - `ingest:skipped_not_whitelisted` — the leak case (defence while Part 1 lands)
  - `forward:intra-company` — caught by new whitelist rule (informational, not blocking)
  - `draft:pending` — copy-document sub-agent has created an iController draft
- Render the chip in `kanban-job-card.tsx` visually distinct (dim bg, smaller font) so reviewers see it as metadata.
- Persist `review_reason` on `automation_run.result` at write-time so queries can filter without re-deriving.

### Part 3 — Scope the bulk review page by type

Today's `/automations/debtor-email-review` is hardcoded to ONE mailbox (`debiteuren@smeba.nl`) and does live Outlook fetch — other mailboxes are invisible. Rework:

- Accept a `?type=regex-training` (default, existing flow) — iterate ALL 5 debtor/facturations mailboxes, group by `{regex-category, confidence-band}`, feedback action writes regex-rule suggestions.
- Add `?type=intent-approval` (future) — source: `automation_runs` where latest is `intent-agent` with `result.confidence < threshold`, group by intent type, feedback writes intent-correction events.
- `Open review` button on a card uses the card's `review_reason` (from Part 2) to pick the right URL. Cards tagged `ingest:*` (if any still slip through after Part 1) render with "Not for review — investigate upstream" state, no link.

## Acceptance

1. The WKA card either disappears from the review lane (Part 1 + status fix — it becomes classifiable and flows through) OR, if it still needs human review, carries a `forward:intra-company` chip so the reviewer knows the provenance.
2. Every card in the Human review lane has at least one review-reason chip.
3. Bulk review page pulls from all 5 debtor/facturations mailboxes, not just smeba.
4. Clicking "Open review" never lands on a page where the card isn't present.

## Sequencing

- **Part 1** (whitelist expansion + status=skipped hygiene): ship this week. Zap config change + one-line swarm-bridge defensive check. Low risk.
- **Parts 2 & 3**: ship before intent-agent and copy-document sub-agent go live, so the lane doesn't accumulate ambiguity when they add their own review reasons.

## Related

- `2026-04-22-intent-agent-for-unknown-bucket-debtor-mails.md` — will produce `llm:*` review reasons consumed by Part 2.
- `2026-04-22-automate-copy-document-responder-for-debtor-and-sales-inboxes.md` — will produce `draft:*` review reasons.
- `2026-04-23-v7-review-dashboard-card-popout-missing.md` — shipped today; card-click modal is the right surface to render the full provenance trace (not just a chip).
