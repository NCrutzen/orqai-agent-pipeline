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

### D-04 — Conversation-aware thread fetch via `conversationId` (LOCKED via discussion)

**Policy:** **Always** fetch the **last 2 prior messages** in the same conversation when `conversationId` is non-null, regardless of body length. Reasons:
- "Only when body short" misses the case where the sender added 200 chars of new text but the originating debtor message is still below.
- The whole point of v8.1 is to give the classifier what humans see; cheaping out on thread fetch reintroduces the same uncertainty Phase 83 exists to remove.
- Bounded Graph cost (≤ 2 extra calls per email; ~3× current call volume — acceptable at current Stage 3 traffic).

**Source of truth:** Graph `/users/{mailbox}/messages?$filter=conversationId eq '{cid}'&$orderby=receivedDateTime desc&$top=3` (returns current + 2 prior in one call; filter out the current `id` client-side).

**Storage (LOCKED):** new table `email_pipeline.conversation_context` — separate from `emails`. Schema:
```
(email_id uuid REFERENCES emails(id),
 position smallint NOT NULL,           -- 1 = most recent prior, 2 = next, ...
 source_message_id text NOT NULL,      -- Graph message id of the prior message
 sender_email text,
 subject text,
 received_at timestamptz,
 body_text text,                       -- plain text rendering of prior message body
 fetched_at timestamptz DEFAULT now(),
 PRIMARY KEY (email_id, position))
```

**Why separate table, not JSONB on `emails`:** Phase 87 retro-classification reads from Supabase, not Graph (D-01 of Phase 87). A separate table makes "load email + load its 2 prior messages" a clean JOIN, lets future analytics query "how many emails reference message X," and avoids JSONB-array maintenance overhead.

**Stage 3 input adapter:** when feeding the classifier, emit a wrapped input:
```
<inbound_message>
  <subject>...</subject>
  <body>...</body>      ← body_full_text from emails
</inbound_message>
<quoted_thread>
  <prior position="1" from="..." received="...">body_text</prior>
  <prior position="2" from="..." received="...">body_text</prior>
</quoted_thread>
```

Explicit boundaries let the Phase 85 prompt v3 (and any future prompt) anchor on the inbound message while still seeing the thread.

### D-05 — Backfill 30 days, both swarms, one-shot script (LOCKED via discussion)

**Window: 30 days.** Sufficient corpus for Phase 87's retro-classification verification (the 42 catch-all rows from 2026-05-05..2026-05-19 fall inside); avoids deep historical Graph calls; cheaper to run.

**Swarms: both debtor-email and sales-email.** Fix lands in `outlook/client.ts`, benefits both. Single backfill pass writes `body_full_text` / `body_unique_text` / `body_html` / `raw_json` / `conversation_context` for all mailboxes referenced in `swarms` (`debiteuren@*`, `administratie@*`, `verkoop@*`). Gives V10.0 sales-email work a head start.

**Mechanics: one-shot script at `web/scripts/backfill-bodies.ts`** (not Inngest). Reasons:
- Lower stakes than a durable function for a one-time op.
- Easier to run locally, observe via stdout, restart on Graph rate-limit.
- Idempotent by design (re-fetch only writes rows where `body_full_text IS NULL` OR `conversation_context IS NULL`).
- Throttle to ≤ 4 req/s; explicit progress logging every 100 rows.

**Estimated touch:** ~3-5k rows per swarm; ~30-60 min run time per swarm at the throttle.

### D-06 — Update the Stage 3 input adapter to read the full thread

The coordinator agent in Orq.ai prompt currently expects `subject + body`. Update the input adapter (`web/lib/automations/debtor-email/coordinator/*` — exact file located during planning) to send the wrapped `<inbound_message>` + `<quoted_thread>` structure described in D-04, sourced from `body_full_text` + `conversation_context`. No prompt change in Phase 83 itself (Phase 85 owns the prompt; this just gives Phase 85 something to anchor on).

### D-08 — Truncation policy: oldest debtor message + newest reply, drop middle (LOCKED via discussion)

When the assembled input exceeds the budget cap (D-09), preserve **the oldest inbound message from a non-tenant-domain sender** (i.e. the originating debtor email — the thing we built Phase 83 to recover) and **the newest reply** (the current message), then drop intermediate forwards. Insert `[truncated: N messages dropped from middle of thread]` marker at the cut.

**Why not chronological newest-first truncation:** the debtor's original message is usually deepest in the chain. Naive truncation would drop exactly what we're trying to recover.

**Tenant-domain detection:** reuse the `swarms.tenant_domains` map from Phase 84 D-03. If Phase 84 hasn't shipped tenant_domains yet by Phase 83 plan time, ship a minimal version here (static list in code) and rationalise in Phase 84.

**Fallback when no inbound from non-tenant-domain is identifiable:** keep newest-first chronological truncation. Marker: `[truncated: thread too long, kept most recent {N} chars]`.

### D-09 — Token-budget cap: 8k chars (LOCKED via discussion)

Hard cap at **8000 characters** of assembled input (subject + inbound body + quoted thread). Roughly 2k tokens on Sonnet 4.5. Reasons:
- Fits 95% of forward chains observed in May 2026 corpus without truncation firing.
- Predictable cost — `agent_runs.token_usage` per Stage 3 call stays under 3k input tokens including system prompt.
- Truncation (D-08) only kicks in on pathological threads (long Heijmans escalations, multi-week dispute chains).

Telemetry: log `input_chars` and a `truncated: bool` flag on every Stage 3 input adapter call → `coordinator_runs.decision_details.input_size`.

### D-10 — `body_text` deprecation: dual-write one release, then drop (LOCKED via discussion)

**Phase 83 keeps writing `body_text`** (= stripped `uniqueBody`, unchanged behavior) alongside new `body_full_text` + `body_unique_text`. The classifier and audit panels switch to `body_full_text` (with `coalesce(body_full_text, body_text)` fallback during the transition for not-yet-backfilled rows). Reasons:
- Multiple consumers (Bulk Review summary chip, audit-pane preview, classifier, retro-replay tests) currently read `body_text`; a hard cutover risks UI regressions only visible in production.
- One-release dual-write gives operator UAT a chance to confirm nothing visible broke.

**Follow-up drop:** v8.2 (or Phase 87 closure if stable) opens a migration to DROP COLUMN `body_text`. Not in Phase 83 scope. Add a one-line backlog item to ROADMAP at Phase 83 closure.

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

- **R-01 — Token bloat at Stage 3.** Full threads can run to 10s of KBs. Mitigation: D-09 hard cap at 8k chars; D-08 preserves the oldest debtor message even when truncation fires; monitor `agent_runs.token_usage` post-deploy.
- **R-02 — Graph rate limits during backfill.** Mitigation: D-05 throttle to ≤ 4 req/s, idempotent, can resume.
- **R-03 — PII surface expands.** The quoted thread will contain more PII (sender addresses, prior staff signatures, internal pricing). Existing redaction at Stage 0 is unchanged; verify Stage 0's safety classifier doesn't false-positive on the wider input. Spot-check first 100 post-deploy rows for false `injection_suspected` flags.
- **R-04 — Stage 3 reasoning quotes more from the quoted history than the new message.** The agent's `reasoning` field is capped at 200 chars but could anchor on the wrong sender. Mitigation: D-06 input adapter wraps the message with an explicit `<inbound_message>` / `<quoted_thread>` boundary so the prompt can be amended in V9.0 if needed (out of scope here).

</risks>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture (locked)
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel canonical architecture. Stage 2→3 context-shape contract that this phase's input adapter must respect.
- `docs/agentic-pipeline/stage-3-coordinator.md` — Ranked-intent classifier contract. `swarm_intents` registry dispatch rules; what the Stage 3 input expects.
- `docs/debtor-email-pipeline-architecture.md` — debtor-email implementation map (Outlook ingest, classifier, handlers). Read before editing anything in `web/lib/automations/debtor-email/` or `web/app/api/automations/debtor*/`.

### Adjacent v8.1 phases
- `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-CONTEXT.md` — Phase 84 introduces `swarms.tenant_domains` jsonb; Phase 83 D-08 truncation reuses the same map. If Phase 84 lands later, Phase 83 ships a minimal static list and reconciles.
- `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-CONTEXT.md` — Phase 85 owns the prompt change. Phase 83's D-06 wrapped `<inbound_message>`/`<quoted_thread>` input shape is what Phase 85's prompt v3 anchors on.
- `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-CONTEXT.md` — Phase 87 D-01 requires Phase 83's backfill to be complete so retro-classification can read from Supabase, not Graph.

### CLAUDE.md patterns
- `CLAUDE.md` §Inngest — `step.run()` replay-safety, `inngest.send` this-binding (relevant to script-vs-Inngest decision in D-05; we chose script).
- `CLAUDE.md` §Supabase — service-role writes pattern; JSONB double-encoding gotcha.
- `CLAUDE.md` §Orq.ai — strict json_schema, anyOf-nullable (only relevant if Phase 83 needs to interact with the agent; it shouldn't — Phase 85 owns the agent change).

### Microsoft Graph
- Graph `body` field documentation — full body content with quoted history (the thing we now prefer).
- Graph `uniqueBody` field documentation — explicitly "the part unique to the current message, with replies and forwards removed." This is what today's code prefers, and what we are flipping.
- Graph `conversationId` field — used for D-04 thread lookup.

### Code anchors (verified 2026-05-19)
- `web/lib/outlook/client.ts:192-214` — `fetchMessageBody()`. The D-01 flip.
- `web/lib/outlook/client.ts:216-229` — `stripHtml()`. Likely needs adjustment to preserve quoted-thread markers if HTML stripping moves to a single consumer-side stage per D-02.
- `web/lib/automations/debtor-email/coordinator/` — Stage 3 input adapter target for D-06.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets
- `web/lib/outlook/client.ts` — `graphFetch`, `getMessageMeta`, `listInboxMessages` already implement Graph pagination, auth, error mapping. New `fetchConversationMessages` helper follows the same pattern.
- `web/scripts/` directory pattern — existing scripts use service-role Supabase client + dotenv loading. Backfill script follows the same shape.
- `swarms.tenant_domains` (Phase 84) — codegen pattern for static literal-unions; if Phase 84 ships first, reuse; otherwise stub here.

### Established Patterns
- Phase 65 replay-safety rule (CLAUDE.md): non-deterministic IDs MUST be generated inside `step.run()`. Not directly relevant to Phase 83 (no Inngest), but downstream replay logic touching `conversation_context` writes must respect it.
- HTML stripping in `outlook/client.ts:216-229` is a single function — easy to relocate to a consumer-side adapter without forking strategies.

### Integration Points
- `fetchMessageBody()` → ingest writer (location TBD by planner; grep for the consumer) → `email_pipeline.emails` row write.
- Stage 3 input adapter (`web/lib/automations/debtor-email/coordinator/*`) → Orq.ai agent invoke.
- Phase 87 retro-classification reads `body_full_text` + `conversation_context` directly from Supabase — no Graph in that path.

</code_context>

<specifics>

## Specific Ideas

- The user's framing on internal forwards (saved as memory `feedback-internal-forwards-are-context`): internal forwards from own-tenant domains are NOT noise; they wrap real debtor context. D-04's always-fetch-2-prior is calibrated against this principle.
- Verification target carried from prior session: re-classify the 42 catch-all events (general_inquiry + other) from 2026-05-05..2026-05-19 with full-thread input; ≥50% should land on a different ranked-top intent. (Belongs to Phase 87 acceptance but originated in Phase 83 D-07.)

</specifics>

<deferred>

## Deferred Ideas

- **Drop `body_text` column** — follow-up migration after one stable release. Belongs to v8.2 or Phase 87 closure, not Phase 83.
- **Per-intent prompt definitions in Stage 3 agent** — Phase 85 territory.
- **Promote-to-`swarm_intents` button on Bulk Review proposals tab** — V9.0 Learning Inbox.
- **Sender-side incident-notice noise category** (RSK phishing notice, FarmPlus bank change) — already captured in Phase 84.

</deferred>

---

*Phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies*
*Context gathered: 2026-05-19*
*Updated via /gsd-discuss-phase: 2026-05-19 (4 gray areas, 7 sub-decisions locked)*
