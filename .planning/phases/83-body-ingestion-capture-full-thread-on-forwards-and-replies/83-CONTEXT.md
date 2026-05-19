# Phase 83: Body ingestion — capture full thread on forwards and replies - Context

**Gathered:** 2026-05-19
**Updated:** 2026-05-19 (via /gsd-discuss-phase — 4 gray areas resolved: thread-context policy, backfill scope, truncation policy, body_text deprecation timing)
**Status:** Ready for planning
**Source:** Stage 3 intent-distribution analysis session 2026-05-19 (`general_inquiry` + `other` deep-dive surfaced the root cause)
**Milestone:** v8.1 "Validation + Visibility" — observe → understand → THEN automate. This phase closes a critical *understanding* gap before any handler work in v8.2.

<domain>

## Phase Boundary

**Problem:** Stage 3 is misclassifying forwards (`FW:`) and reply chains (`Re: Re: …`) because the pipeline only ingests the **new** part of the message and drops the **quoted original**. The classifier behaves correctly given thin input — it just doesn't have the debtor's words.

**Root cause (verified 2026-05-19):** `web/lib/outlook/client.ts:207` prefers Microsoft Graph's **`uniqueBody`** field over `body`:

```ts
// Prefer uniqueBody (the part the sender wrote, quoted replies stripped).
const b = data.uniqueBody?.content ? data.uniqueBody : data.body;
```

Microsoft Graph defines `uniqueBody` as "the part of the body unique to the current message, with replies and forwards removed." So on every forward / reply, the debtor's original message is discarded at the fetch boundary.

**Evidence (Supabase `email_pipeline.emails` rows pulled 2026-05-19):**

- `38d10c00-…` ("FW: Nieuwe opmerking over Factuur voor CBRE", `gwenda@smeba.nl → debiteuren@smeba-fire.be`): `body_text=∅`, `body_html=∅`, `raw_json=[]`. We stored **nothing** of the body.
- Two `elger@smeba-fire.be` replies on factuur 33050611 (2026-05-11, 2026-05-12): only Elger's new text (166 chars, 1082 chars) is present. The original debtor email about factuur 33050611 — which would explain *why* Elger is replying — is absent.

**Stage 3 fall-out (last ~2 weeks):** ~18 of 21 `general_inquiry` events and ~10 of 21 `other` events look "internal" or "empty" because we're showing the classifier the wrapper, not the wrapped message. Once parsed correctly, most are debtor disputes/inquiries with full context, not noise.

**Scope:** ingestion + persistence layer only. No classifier changes, no Stage 3 prompt edits, no new intents. The point of this phase is to **fix the input** so that the *next* phase (any handler work, intent re-tuning, learning loop) sees what humans see.

</domain>

<decisions>

## Implementation Decisions

### D-01 — Stop preferring `uniqueBody`; fetch and persist the full `body`

`fetchMessageBody()` already selects both `body` and `uniqueBody` from Graph. Today's preference inverts the priority. Flip it:

- **Classifier path** uses `data.body.content` (full thread, quoted history included).
- **`uniqueBody` is kept** in the response and persisted separately — useful for UI ("show only the new part") and for telemetry (length-delta = how much was quoted).
- HTML stays HTML through the fetch boundary; stripping happens in a single place at the consumer (Stage 1 / Stage 3 input adapter), not at fetch time.

**File:** `web/lib/outlook/client.ts:192-214` (`fetchMessageBody`).

### D-02 — Persist `body_html` and `raw_json` for every ingested email

Today both fields are typically empty / null on the rows that hurt us most (forwards). The `body_text` stripper runs at fetch time and the HTML is dropped. Without HTML we cannot retro-parse quoted history (the blockquote / `OutlookMessageHeader` markers are gone).

- Always write `body_html` to `email_pipeline.emails`. Same column already exists; we just stop blanking it.
- Always write `raw_json` = the full Graph message response (or a structured subset: `body`, `uniqueBody`, `internetMessageId`, `conversationId`, `from`, `toRecipients`, `ccRecipients`). This is our recovery path for retro-extraction.
- Storage cost is negligible (KBs per email × low-thousands of emails/month).

### D-03 — Add a `body_full_text` column derived from `body` (not `uniqueBody`)

To avoid a destructive migration on `body_text` (consumers across Bulk Review, classifier, audit panel may have implicit expectations), add a new column:

- `body_full_text TEXT NULL` — plain-text rendering of `body.content` (the full thread).
- `body_unique_text TEXT NULL` — plain-text rendering of `uniqueBody.content` (the new bit).
- Leave `body_text` populated as today for backward-compat during one release; classifier reads `body_full_text` (with `coalesce(body_full_text, body_text)` fallback for not-yet-backfilled rows).
- Migration path documented in plan; cutover phased.

**Why two columns, not one:** the UI legitimately wants "show only Elger's reply, not the 40-line quoted history" — that's `body_unique_text`. The classifier legitimately wants the full thread — that's `body_full_text`. They are different needs; one column would force a worse compromise.

### D-04 — Conversation-aware fallback via `conversationId`

When `body.content` is *still* short (e.g. the sender deliberately top-posted with no quote) but `conversationId` references prior messages, fetch the most recent N=2 prior messages in the same conversation and include their `body_text` as **context_messages** in the classifier input.

- **Source of truth:** Graph's `/users/{mailbox}/messages?$filter=conversationId eq '…'`.
- **Lookup cache:** in-memory per-Inngest-step; never block on more than 3 sequential Graph calls.
- **Storage:** `pipeline_events.decision_details.context_messages` (already JSONB) — for traceability of *why* Stage 3 saw what it saw.

**Why this is part of D-01..D-03's phase and not a follow-up:** without it, top-posted internal forwards (the colleague writes nothing, just clicks Forward) still arrive at Stage 3 with an empty input. The conversation lookup is the only way to recover them.

### D-05 — Backfill the last 90 days

One-time script that walks `email_pipeline.emails` where `body_full_text IS NULL` and re-fetches via Graph (using stored `source_id`). Idempotent. Run after deploy, audited via row-count delta.

**Estimated touch:** ~3-5k rows. Graph rate limit headroom is fine if we stay ≤ 4 req/s.

### D-06 — Update the Stage 3 input adapter to read the full thread

The coordinator agent in Orq.ai prompt currently expects `subject + body`. Update the input adapter (`web/lib/automations/debtor-email/coordinator/*` — exact file located during planning) to send `body_full_text` instead of `body_text`. No prompt change; just a wider input. The agent's confidence rubric ("Read subject first, then 2-3 sentences of body") still works — it just has more body to read.

**Token-budget check:** Sonnet 4.5 input cap is fine for typical forward chains; explicit truncation at 8k chars with a `[truncated: N more chars from quoted thread]` marker for safety.

### D-07 — Telemetry: did the fix change anything?

Add a one-shot retro-classification script (read-only) that re-runs the Stage 3 agent on the 42 `general_inquiry` + `other` rows from the last 2 weeks **with the full-thread input**, compares the new ranked intent vs. the original, and dumps a CSV. This is the verification surface for the phase — not just "code lands" but "classification distribution moves."

**Acceptance threshold:** ≥ 50% of the previously-mislabelled internal-forward rows reclassify to a non-`other`/non-`general_inquiry` intent when the quoted thread is included. (If the threshold isn't met, the phase isn't done — there's another layer of the problem we haven't found yet.)

</decisions>

<scope>

## Out of scope

- Stage 3 prompt editing (no per-intent description additions, no new few-shot examples). That belongs to V9.0 (Learning Inbox synthesis) once we have a clean signal.
- New Stage 4 handlers. Phase 83 is *upstream* of handler work — fixing input quality.
- Sales-email swarm parity. The same `fetchMessageBody` is called from both swarms, so the fix benefits sales-email transparently, but no new Stage 2/3 design for sales-email here.
- Removing `body_text` (deferred to v8.2 cleanup after one release of dual-write proves stable).

## In scope

- Code change to `outlook/client.ts` (D-01).
- Schema migration: add `body_full_text`, `body_unique_text` columns (D-03).
- Ingest writer updates (wherever `email_pipeline.emails` inserts/updates happen) to populate the new columns + `body_html` + `raw_json` consistently (D-02, D-03).
- Conversation-thread fetcher utility (D-04).
- Backfill script + run (D-05).
- Stage 3 input adapter swap (D-06).
- Retro-classification telemetry script + report (D-07).

</scope>

<verification>

## Success criteria (goal-backward)

1. **No more empty-body forwards on inbound.** Spot-check 20 fresh forwards across both swarms: `body_full_text` length > 0 in 20/20.
2. **Quoted history is preserved.** For the Elger `Re: Re: Re: ... factuur: 33050611` chain (or equivalent fresh sample), `body_full_text` contains the originating debtor message, not just Elger's reply.
3. **Stage 3 sees the wider input.** A coordinator_run row written after deploy includes a `decision_details.input_chars` value materially larger than pre-deploy median for forward/reply traffic.
4. **D-07 threshold:** ≥ 50% of the 42 retro-classified internal-forward / out-of-context rows from 2026-05-05..2026-05-19 land on a different ranked-top intent when re-run with full thread.
5. **No regression on direct-debtor emails.** Spot-check 10 direct (non-FW) emails: top-1 intent identical pre/post (excluding random LLM noise within stated confidence band).

</verification>

<dependencies>

## Depends on

- Phase 82.x v8.0 closure (no hard dependency, but easier to land on a stable v8.0 baseline).
- No new infra. Uses existing Outlook OAuth, existing Supabase tables, existing Orq.ai agent.

## Enables

- **V9.0 Learning Inbox:** synthesis quality is bounded by input quality. Without this fix, prose feedback like "this should have been `payment_dispute` not `other`" is noise — the operator and the classifier weren't looking at the same email.
- **V10.0 Sales-email canonical pipeline:** sales-email shares the same `fetchMessageBody`. Fix lands once, benefits both swarms.
- **V11.0 Intent-Prioritised Handlers:** intent volume rankings only make sense if the classifier sees the actual email. Today `payment_dispute` is overcounted and `general_inquiry`/`other` are mostly artifacts — V11.0's prioritisation would optimise for the wrong thing.

</dependencies>

<risks>

## Risks

- **R-01 — Token bloat at Stage 3.** Full threads can run to 10s of KBs. Mitigation: D-06 hard truncation at 8k chars with explicit marker; monitor `agent_runs.token_usage` post-deploy.
- **R-02 — Graph rate limits during backfill.** Mitigation: D-05 throttle to ≤ 4 req/s, idempotent, can resume.
- **R-03 — PII surface expands.** The quoted thread will contain more PII (sender addresses, prior staff signatures, internal pricing). Existing redaction at Stage 0 is unchanged; verify Stage 0's safety classifier doesn't false-positive on the wider input. Spot-check first 100 post-deploy rows for false `injection_suspected` flags.
- **R-04 — Stage 3 reasoning quotes more from the quoted history than the new message.** The agent's `reasoning` field is capped at 200 chars but could anchor on the wrong sender. Mitigation: D-06 input adapter wraps the message with an explicit `<inbound_message>` / `<quoted_thread>` boundary so the prompt can be amended in V9.0 if needed (out of scope here).

</risks>
