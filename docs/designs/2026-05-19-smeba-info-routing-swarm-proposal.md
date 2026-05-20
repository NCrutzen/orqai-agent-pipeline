# info@smeba.nl info-routing swarm — proposal (post-spike)

> **Status:** Pre-Phase-88 proposal. **NOT a plan, NOT a spec.** Synthesises Spikes 001-004 (`.planning/spikes/00{1,2,3,4}-*`) into a single Phase 88 input. Plan-time and execute-time decisions defer to `/gsd-discuss-phase 88` after v8.1 closes.
>
> **Author:** Spike series, 2026-05-19.
>
> **Owners on read:** anyone touching the info@smeba.nl mailbox or Phase 88 scoping.

## TL;DR

`info@smeba.nl` is a high-volume (61 emails/day inbound, 90 days = 5,316 rows), receive-only, broadcast (96.1% single-msg threads) Smeba info mailbox. It is **its own swarm** (`swarm_type='info-routing'`), distinct from `debtor-email` and `sales-email` — but 56% of debtor-email's Stage 1 regex transfers cleanly. The router agent's actual workload after Stage 1 noise filtering is ~14 emails/day, of which only ~7/day is real business email and ~3/day is finance-shaped (often misrouted from `crediteuren@`/`debiteuren@`).

**The proposal is small:** five shared `swarm_noise_categories` rows + one new noise rule + a `swarms.tenant_domains` entry that piggybacks on Phase 84's column. No new Stage 1 code, no new entity resolver, and an explicitly placeholder Stage 3 router that defers vocabulary to Phase 86's discovery surface.

## Dependencies (hard)

This proposal cannot land until **all four** v8.1 phases are live:

| v8.1 phase | What it ships | Why Phase 88 needs it |
|---|---|---|
| 78 | Build-time codegen for `swarm_intents` + `swarm_noise_categories` literal-union types | Without this, "registry inserts only" is a lie — we'd silently hand-edit TS consts and Orq prompts |
| 84 | `swarms.tenant_domains` column + own-domain loopback rule + codegen | 17.9% of Smeba inbound is own-domain workflow CC; without 84's column there's no honest way to handle it |
| 85 | Stage 3 prompt v3 + V3 schema (`intent_proposal` field) | Phase 88's router agent inherits this scaffolding; building a parallel one would be duplicate work |
| 86 | `intent_proposals_v1` view + Bulk Review cluster tab (cross-swarm by default) | The router's department vocabulary emerges through this surface, not through hand-curation |

**Estimated earliest start: V8.2 cycle, after v8.1 closes via `/gsd-audit-milestone v8.1`.**

## Corpus snapshot (Spike 001)

| Metric | Value |
|---|---:|
| 90-day inbound | 5,316 |
| 90-day sent | 188 |
| Inbox all-time | 24,134 |
| Sent all-time | 188 (yes, 188 — receive-only) |
| Daily inbound rate | 61.2/day |
| Single-message threads | 96.1% (5,056 / 5,261) |
| Max thread length | 8 |
| Cross-tenant access | ✓ via `zapier@moyneroberts.com` connection `56014785` (verified) |

**Reading:** `info@smeba.nl` is a broadcast inbox. No "Stage 4 draft a reply" handler is in scope. The future router agent is exactly a **forward router**: classify → Outlook forward to the correct department mailbox.

## Stage 1 noise rules — proposed `swarm_noise_categories` rows

All rows below would be inserted with `swarm_type='info-routing'`. **No new code path** in `web/lib/debtor-email/classify.ts` or `classifier-screen-worker.ts` should be needed — these are registry inserts powered by the existing two-pass (regex + LLM 2nd-pass) Stage 1 architecture.

| `category_key` | Source | Regex / predicate (sketch) | Volume in 90d | Action |
|---|---|---|---:|---|
| `spam` | **shared verbatim with debtor-email/sales-email** (already keyed `('debtor-email','spam')` + `('sales-email','spam')`) | `^\s*\[SPAM\]` on subject (the `subject_spam_prefix` rule in `classify.ts`) | 2,899 (54.5%) | `categorize_archive` to "Spam" |
| `payment_admittance` | **shared verbatim with debtor-email** | `SUBJECT_PAYMENT` / `SUBJECT_PAID_MARKER` / `BODY_PAYMENT_CONFIRMATION` etc. from `classify.ts` | 62 (1.2%) | `categorize_archive` to "Payment Admittance" |
| `auto_reply` | **shared verbatim with debtor-email** | `SUBJECT_AUTO_REPLY` + `SUBJECT_ACKNOWLEDGEMENT` | 5 (0.1%) | `categorize_archive` to "Auto-Reply" |
| `ooo_temporary` | **shared verbatim with debtor-email** | `BODY_OOO_TEMPORARY` + human-sender shape | 8 (0.2%) | `categorize_archive` to "OoO — Temporary" |
| `ooo_permanent` | **shared verbatim with debtor-email** | `BODY_OOO_PERMANENT` + human-sender shape | 1 (0.0%) | `categorize_archive` to "OoO — Permanent" |
| `own_domain_loopback` | **inherits Phase 84** | `domain(sender_email) ∈ swarms.tenant_domains` | 950 (17.9%) | per Phase 84 design |
| **`generic_noreply_notification`** | **NEW for info-routing** *(or promote cross-swarm — see below)* | sender local-part `^(noreply|no-reply|donotreply|do-not-reply|dontreply|notifications?|notify|alerts?|automated|mailer|postmaster|tracking|trackingupdates|do_not_reply)` | 214+ (≥4.0%) | `categorize_archive` to "Auto-Reply" or new "System Notifications" label — decide at plan-time |
| `unknown` | shared semantics | fall-through | ~1,220 (23.0%) | `swarm_dispatch` → `debtor-email/label-resolve.requested`-equivalent for info-routing |

**Total expected noise coverage: ~77%** — same as Spike 002, achieved with 6 shared rows + 1 new + 1 inherited (Phase 84).

### Decision needed at plan-time: scope of `generic_noreply_notification`

The new rule fires 214× on Smeba info but is **not yet a debtor-email noise key**. Two options:

1. **Info-routing-only.** Ship as `('info-routing','generic_noreply_notification', ...)`. Low risk, low surface area.
2. **Promote cross-swarm.** Ship as `('debtor-email','generic_noreply_notification', ...)` AND `('info-routing','generic_noreply_notification', ...)` AND audit whether debtor mailboxes have similar volume. If they do, this is a Phase-84-adjacent generalisation.

**Recommendation: (1) for Phase 88, (2) as a Phase 999.x backlog item** — don't conflate Phase 88's narrow scope with a cross-swarm rule-set audit.

### Dead-on-arrival rules (do NOT ship)

Discarded after Spike 002 hand-pass:

- ~~`m365_spam_tag`~~ — duplicate of existing `spam` key
- ~~`meta_facebook_notification`~~ — 1 hit in 90d, was a phishing impersonation
- ~~`marketing_newsletter`~~ — 13 hits in 90d (0.2%); upstream `[SPAM]` filter is doing the work
- ~~`delivery_failure`~~ — caught by `[SPAM]` upstream

## Stage 2 entity resolution — not in scope

Phase 88 ships **no Stage 2 entity resolver** for info-routing initially. The mailbox is not customer-bound; entity enrichment doesn't add signal. The `swarms.stage2_entity_resolver` registry column would be `null` for `info-routing`, and Stage 2 short-circuits with an empty `PipelineStageContext`. The Stage 3 router agent operates on raw sender + subject + body.

If Spike 004's hand-pass turns out to be predictive — i.e. 20% of router workload is finance-shaped customer email — a future phase could add an iController-customer lookup at Stage 2. Out of scope here.

## Stage 3 router agent — placeholder only

The router agent ships in **shadow mode** with a deliberately-tiny intent set:

| `swarm_intents.intent_key` | `handler_event` | Stage 4 |
|---|---|---|
| `triage_required` | (none — Kanban placeholder) | none — surfaces in Bulk Review for operator decision |

The V3 schema from Phase 85 carries the LLM's `intent_proposal` + `proposal_reason` for every email — Phase 86's discovery surface clusters these proposals over 2-4 weeks. Real department-routing intents (`to_sales`, `to_finance`, `to_hr`, etc.) get promoted to `swarm_intents` rows only after they cluster ≥10× in 7 days per Phase 86's threshold (and once V9.0's promotion side ships, this becomes a one-click action; before that, it's a manual registry INSERT).

**This is not a feature gap. This IS the principle.** Per the locked 2026-05-19 line: "Intent vocabulary emerges from the LLM's proposals + operator promotion during dry-run, never from hand-curation." Spike 004's capacity preview confirms the volume is manageable for a placeholder router — ~14 emails/day reaching it, ~7/day real, easily reviewable.

## Stage 4 handler — deferred

No Stage 4 handler ships in Phase 88. The terminal action for every classified intent is "surface in Bulk Review for operator decision; operator forwards manually through Outlook." Once an intent has clustered, been promoted to `swarm_intents`, and shown stable shape for 2 cycles, **a future phase** wires a forward-handler against `zapier_tools` (single tool, Outlook forward). The first forward-handler candidate per Spike 004 is `to_finance` — ~3 emails/day, often misrouted invoice-copy / refund / payment-advice content — but again, defer to evidence.

## Stage 0 — defer to Phase 64

Phase 64 (Stage 0 input safety, `SAFE-01..04` + `BUDG-01`) is not yet shipped. Spike 004 flagged ~7% phishing leakage in Smeba info — non-zero risk but not blocking. Phase 88 ships **without Stage 0** (same as debtor-email runs today) and inherits Stage 0 when Phase 64 lands cross-swarm.

## Brand registry entry

Smeba's `entity_brand` is already in production for the debtor-email swarm (`smeba` is one of the 6 brands flowing through `walkerfire.icontroller.eu`). Phase 88 adds:

- `swarms` row: `(swarm_type='info-routing', entity_brand='smeba', ...)`
- `swarms.tenant_domains` (Phase 84 column) for the new swarm row: `['smeba.nl', 'smeba-fire.be', 'moyneroberts.com', 'fire-control.nl', 'berki.nl', 'sicli-noord.be', 'sicli-sud.be']` — the same 7 own-domains used in Spikes 002-004.

## Backfill + ongoing ingest

- **Backfill:** Spike 001 already wrote 90 days of `info@smeba.nl` into `email_pipeline.emails` (5,505 rows, idempotent on `source_id`). Re-running widens the window cheaply.
- **Ongoing ingest:** the existing Outlook ingest cron (`web/lib/inngest/functions/*` — `fetch-emails`-equivalent that runs on the business-hours window) needs `info@smeba.nl` added to its mailbox list, plus the brand mapping in `debtor.labeling_settings` (or its Phase 68 successor) keyed to `swarm_type='info-routing'`. **This is the single largest concrete code change Phase 88 needs**, and even that is one-line — the rest is registry.

## Open questions for `/gsd-discuss-phase 88`

1. Does `generic_noreply_notification` ship info-routing-only or cross-swarm? (See "Decision needed at plan-time" above.)
2. Is the Outlook label vocabulary the same as debtor-email's (`Spam`, `Auto-Reply`, `OoO — Temporary`, etc.) or info-routing-specific labels? Operator-readability concern.
3. Should `payment_admittance` archive to **finance team's own inbox** rather than just labelling-and-archiving? In debtor-email these are signal-for-finance and they're already labelled; in info-routing the misroute story might justify a forward instead of an archive. Plan-time decision.
4. How long does the shadow-mode placeholder router stay shadow before flipping live? Spike 004 says ~14/day arriving — 2 weeks gives ~200 router-decisions for the discovery surface to cluster against. Likely sufficient.
5. Phishing leakage — ship Phase 88 without Stage 0, or block on Phase 64? Spike 004 suggests "without is fine, ~1/day risk surface." Operator concern, not architectural.

## Cross-references

- **Spike 001:** `.planning/spikes/001-smeba-info-backfill/README.md` — corpus + volume baseline
- **Spike 002:** `.planning/spikes/002-smeba-info-noise-patterns/README.md` — info-flavor noise rule trial
- **Spike 003:** `.planning/spikes/003-smeba-vs-debtor-noise-overlap/README.md` — cross-swarm rule transferability (the architectural question)
- **Spike 004:** `.planning/spikes/004-smeba-non-noise-shape/README.md` — router workload preview
- **v8.1 phases 78/84/85/86:** `.planning/ROADMAP.md` lines 586-590 — the hard prerequisites
- **Locked principle (2026-05-19):** `.planning/ROADMAP.md` line 571 + memory `feedback_intent_vocab_emerges_from_data` — "Intent vocabulary emerges from data, not Claude"
- **Architecture canon:** `docs/agentic-pipeline/README.md` + `docs/agentic-pipeline/stage-1-regex.md`

## What this proposal explicitly does NOT do

- Does not propose `swarm_intents` vocabulary for the router agent
- Does not propose Stage 4 forward-handlers
- Does not propose Stage 2 entity enrichment
- Does not start Phase 88; that's `/gsd-discuss-phase 88` after v8.1 closes
- Does not ship parallel to v8.1; the dependencies are hard
