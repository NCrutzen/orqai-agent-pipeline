# Phase 83 — Discussion Log

**Date:** 2026-05-19
**Mode:** default (single-question turns)
**Areas selected by user:** all four offered (thread-context policy, backfill scope, truncation policy, body_text deprecation timing)

---

## Area 1: Thread-context policy

### Q1 — When to fetch prior messages via conversationId?
**Options presented:**
- Always (Recommended)
- Only when body short
- Only on FW: or Re: subjects

**User selection:** Always
**Rationale captured:** consistent input shape; never miss thread context; aligns with v8.1 thesis of giving the classifier what humans see.

### Q2 — How deep into the conversation?
**Options presented:**
- Last 2 prior messages (Recommended)
- Last 5 prior messages
- Full conversation

**User selection:** Last 2 prior messages
**Rationale captured:** bounded Graph cost; covers most FW: + Re: cases.

### Q3 — Where to store fetched prior messages?
**Options presented:**
- Separate table `conversation_context` (Recommended)
- JSONB column on `emails.context_messages`
- Pass-through only, no persistence

**User selection:** Separate table `conversation_context`
**Rationale captured:** clean schema; supports Phase 87 retro-classification reading from Supabase; queryable cross-message.

---

## Area 2: Backfill scope

### Q1 — How far back?
**Options presented:**
- 90 days (Recommended)
- 30 days
- Forward-only, no backfill

**User selection:** 30 days
**Rationale captured:** lighter scope; sufficient for Phase 87 retro-classification corpus (the May 5-19 catch-all rows fall inside); cheaper to run; the user explicitly chose the lighter option over my recommendation.

### Q2 — Which swarms?
**Options presented:**
- Both debtor-email and sales-email (Recommended)
- Debtor-email only

**User selection:** Both
**Rationale captured:** single backfill pass benefits V10.0 sales-email work.

### Q3 — Backfill mechanics?
**Options presented:**
- Inngest function (Recommended)
- One-shot `scripts/backfill-bodies.ts`

**User selection:** One-shot script
**Rationale captured:** lower stakes for a one-time op; simpler to write, run, and observe; the user explicitly chose the simpler option over my recommendation.

---

## Area 3: Truncation policy

### Q1 — Which part of an oversized thread to preserve?
**Options presented:**
- Oldest debtor message + newest reply, drop middle (Recommended)
- Newest-first, drop oldest quoted history
- No truncation; classifier handles

**User selection:** Oldest debtor + newest reply, drop middle
**Rationale captured:** the original debtor message is the thing Phase 83 is built to recover; naive chronological truncation would drop exactly that.

### Q2 — Token-budget cap?
**Options presented:**
- 8k chars (~2k tokens) (Recommended)
- 16k chars (~4k tokens)
- No cap

**User selection:** 8k chars
**Rationale captured:** predictable cost; fits 95% of forward chains without truncation.

---

## Area 4: body_text deprecation timing

### Q — How to handle legacy column relative to new full/unique columns?
**Options presented:**
- Dual-write one release, then drop (Recommended)
- Hard cutover now
- Keep `body_text` indefinitely as legacy alias

**User selection:** Dual-write one release, then drop
**Rationale captured:** safest path; existing consumers (Bulk Review summary chip, audit-pane preview, classifier, retro-replay tests) read `body_text` today; gives operator UAT a chance to confirm nothing breaks.

---

## Claude's Discretion

- Schema of `conversation_context` table (column types, primary key) — followed standard Supabase service-role patterns.
- Stage 3 input adapter wrapping format (`<inbound_message>` / `<quoted_thread>`) — chosen to give Phase 85's prompt v3 a clean anchor point.
- Throttle rate during backfill (≤ 4 req/s) — Graph rate-limit headroom is generous; conservative default.
- Tenant-domain detection for D-08 truncation — defer to Phase 84's `swarms.tenant_domains` map if it ships first; ship minimal static list otherwise.

## Deferred Ideas

- Drop `body_text` column in follow-up migration (V8.2 or Phase 87 closure).
- Per-intent prompt definitions (Phase 85 territory).
- Promote-to-`swarm_intents` button on proposals tab (V9.0 Learning Inbox).

## Scope creep redirected

None during this discussion — questions stayed strictly inside the ingestion-fix domain.
