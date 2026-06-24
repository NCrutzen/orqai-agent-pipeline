# PLAN — Debtor inbox label coverage: audit + bounded re-fire

**Workspace:** `~/gsd-workspaces/debtor-label-coverage/agent-workforce` · branch `workspace/debtor-label-coverage` (base `origin/main` @ #127)
**Goal:** every *actionable* debtor inbox mail ends up with its `AI: <intent>` Outlook label. Close the gap #127 surfaced, without re-firing noise or historical corpus into the live pipeline (and into customer Outlook).

---

## Ground truth (already established, 2026-06-22)

- AI label = Outlook **category** `"AI: <intent>"` on the message. Truth lives in Outlook, not the DB (a row can be Stage-3-classified in DB yet have `categories: []` in Outlook — label-write didn't land).
- Graph is reachable with **zero new creds** via the Zapier SDK: `npx zapier-sdk curl "<graph-url>" --connection 0299d86c-13e5-8091-804c-2e66aeb4b0e6`. The `zapier service` account has delegated read on all 4 shared mailboxes.
- Recent (≤30d) **unlabeled** inbox counts (Graph `$filter=not categories/any()`): smeba 561 · fire-control 269 · berki 199 · smeba-fire (pending). ≈ **1029** upper bound — includes legit noise.
- #127 deferred the auto-re-fire. No existing tool re-processes a dropped mail through Stage 0→3→4. `stage-0-backfill` only back-writes visibility rows, it does **not** relabel.

## Mailboxes
`debiteuren@smeba.nl` · `administratie@fire-control.nl` · `debiteuren@berki.nl` · `debiteuren@smeba-fire.be`

---

## Task 1 — Coverage audit (READ-ONLY, no mutation)

Build a one-shot audit script that, per mailbox, pulls recent (≤30d, configurable) **inbox** messages via Graph (`id, internetMessageId, conversationId, subject, sender, receivedDateTime, categories`), filters to those with **no `AI:` category**, and classifies each into exactly one bucket by joining to `email_pipeline.emails` + `pipeline_events`:

| Bucket | Rule | Action downstream |
|---|---|---|
| **(c) label-write failed** | DB has a Stage-3 event with an intent for this email | **relabel only** (write the Outlook category; no pipeline re-run) |
| **(b) legit noise** | DB has a Stage-1 noise decision (or Stage-0 reject) | **leave** — correctly no intent label |
| **(a) genuine miss** | no terminal classification in DB, OR email absent from DB entirely | **re-fire** from Stage 0 |

**Output:** `audit-<mailbox>-<date>.json` with per-bucket lists (email_id / internetMessageId / subject / received) + a summary table. **Deliverable = the real numbers per bucket**, so we size (a) and (c) before building anything.

**Verification:** spot-check 10 rows per bucket by hand against Outlook (open the thread, confirm bucket call).

**Join key note:** `emails.internet_message_id` is NULL for many rows → fall back to `conversation_id` (verbatim, base64url) and subject+received_at+sender. Document match-rate; unmatched recent inbox mail = bucket (a) (never ingested).

---

## Task 2 — Relabel path for bucket (c)  *(lower risk — writes a category, no pipeline run)*

For each (c) email: re-write the `AI: <intent>` Outlook category via Graph PATCH on the message (`categories` array), intent taken from the existing DB Stage-3 decision. Idempotent (skip if already present).

**Production protocol (CLAUDE.md):** dry-run list (mailbox, subject, intent-to-write) → **Nick confirms** → execute → re-query Graph to verify the category now present. Screenshots/before-after counts in the run log.

---

## Task 3 — Bounded re-fire for bucket (a)  *(higher risk — drives live pipeline → writes to customer Outlook)*

The #127-deferred follow-up. Re-emit the Stage-0 ingest event for each (a) `email_id` so it flows Stage 0→1→2→3→4 and gets labeled. Reuse the existing ingest event shape (`web/app/api/automations/debtor-email/ingest/route.ts`); for never-ingested mail, ingest from the Graph message first.

**Hard guards:**
- Bounded batch (start with one mailbox, cap N, configurable).
- Idempotency: skip any email that already has a run/label by the time it fires.
- Noise re-confirmation: a re-fired mail that Stage 1 marks noise simply gets no AI label (expected) — that's fine, but log it so the (a) count reconciles.

**Production protocol:** dry-run target list → **Nick confirms** → fire one small batch → verify in Outlook + Bulk Review → then the rest.

---

## Explicitly OUT of scope (deferred, per Nick 2026-06-22)
- **Live send-tracing** (ingest the 4 mailboxes' Sent Items) — design captured for the future, not built now.
- **Auto-reply / reply-handling / kanban auto-resolve** — parked. Reply-detection design (needs a "did anyone at MR reply" signal across personal mailboxes) noted in memory.
- **Historical backlog** (>30d, ≈4000 unlabeled) — mostly pre-pipeline / corpus import; left alone.

## Open design decisions to settle during Task 1
1. Time window: 30d confirmed? (smeba-fire still uncounted — include once disk allows.)
2. Bucket (b) precision: is "Stage-1 noise in DB" sufficient, or do we also need a rule for noise that never reached Stage 1?
3. Bucket (c): are there intents we should NOT auto-relabel (e.g. low-confidence)?

## Risks
- Production writes to customer Outlook → both mutating tasks gated on explicit confirmation + Outlook verification.
- Graph/Zapier proxy quirks: `$filter` must be inline-encoded in the URL (the `-G` proxy drops it); conversationId is base64url verbatim.
- Disk on Nick's Mac was ~100% full — keep npx CLI cached / freed.
