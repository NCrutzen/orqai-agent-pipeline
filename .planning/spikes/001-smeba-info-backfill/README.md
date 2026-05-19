---
spike: 001
name: smeba-info-backfill
type: standard
validates: "Given Zapier connection 56014785, when we backfill info@smeba.nl 90d inbox+sent to email_pipeline.emails, then we have a queryable corpus with volume baseline, sender distribution, subject markers, and thread density"
verdict: VALIDATED
related: []
tags: [recon, corpus, smeba, info-inbox]
---

# Spike 001: smeba-info-backfill

## What This Validates

**Given** the Zapier Microsoft Outlook connection `56014785` (`zapier@moyneroberts.com`) — confirmed earlier this session to have Graph mailbox.Read access to `info@smeba.nl` cross-tenant — **when** we backfill 90 days of inbox + sentitems into `email_pipeline.emails` via the same upsert path `fetch-emails.ts` uses, **then** we have a queryable corpus and a baseline of volume, sender distribution, subject markers, and thread shape that feeds Spikes 002-004.

## How to Run

```bash
cd web/debtor-email-analyzer
npx tsx src/spike-001-probe.ts      # count-only, no writes
npx tsx src/spike-001-backfill.ts   # upserts 90d into email_pipeline.emails (idempotent)
npx tsx src/spike-001-stats.ts      # reads back, prints baseline
```

## What to Expect

5,500ish rows persisted under `mailbox='info@smeba.nl'`. Probe and stats are read-only; backfill is idempotent on `source_id`.

## Investigation Trail

1. **Probe first.** Counted `$count` against Graph `mailFolders/{inbox,sentitems}/messages` over 7/30/90/365d windows + all-time. Result: ~60 inbound emails/day, 24,134 inbox all-time, **188 sent all-time** — the same 188 across every time window. That's not a query bug; this is genuinely a receive-only info inbox. Picked the 90d window per MANIFEST requirement (bounded recon, not full history).
2. **Backfill.** 55 inbox pages × 100 msgs + 2 sent pages, completed in ~2 min. Zero errors, zero retries. Used same `select fields` + `isDraft eq false` filter as `fetch-emails.ts`.
3. **Stats.** Wrote a paginated query (default Supabase limit is 1000 rows; 5,504 rows needed 6 pages). Tallied direction, attachments, read-state, top sender domains/addresses, subject prefix patterns, and conversation density.

## Results

**Verdict: VALIDATED** — corpus is in place and the baseline already surfaces architectural signals.

### Volume

| Metric | Value |
|---|---|
| Total rows persisted | **5,504** |
| Inbound | 5,316 |
| Outbound (sent) | 188 |
| Date range | 2026-02-18 → 2026-05-19 (90 days) |
| Avg daily volume | 61.2/day inbound, 2.1/day sent |
| Inbox all-time | 24,134 |
| Sent all-time | 188 |

### Surprises (these drive the rest of the spike series)

1. **`[SPAM]` is 54.5% of inbound** (2,899/5,316). Microsoft 365's upstream spam filter has already tagged a majority of the corpus — the regex rule `^\[SPAM\]` alone would be the single highest-volume noise rule in any swarm at Moyne Roberts.
2. **`info@smeba.nl` is broadcast, not conversational.** 96.1% of all threads are single-message; max thread length is 8. Sent volume is 188 over 90 days — staff almost never reply from this inbox. **Architectural implication:** the future router agent is exactly that — a forward router. There's no Stage 4 "draft a reply" handler in scope here.
3. **`is_read=true` on 100% of inbound.** Outlook auto-marks everything; the signal is useless for downstream prioritization.
4. **Internal traffic from `smeba.nl` itself is 12.4% of inbound.** Real Smeba staff (pabo, lehu, paco, jada, …) email info@smeba.nl. Plus `info@smeba.nl` sends to itself 63 times — likely forwards or system confirmations. Own-domain loopback needs explicit treatment.
5. **Cross-tenant own-domain at 3.6% from `moyneroberts.com`.** Internal Moyne Roberts traffic into a Smeba mailbox. Phase 84 (debtor-email) is wiring up exactly this loopback handling — the `swarms.tenant_domains` column it ships will need a Smeba entry day-1 when Phase 88 onboards this swarm.
6. **Auto-reply / OoO subject markers are <0.3%** (12 + 6 + 3 over 90 days). The `auto_reply` / `ooo_*` categories that dominate debtor-email noise are minor here.
7. **Noreply / newsletter dominance in named senders.** Top single sender is `noreply@securitas.nl` at 1.5%; many of the top-20 are obvious noreply / marketing / newsletter / business-notification addresses (`noreply@business.facebook.com`, `newsletter@*`, `marketing@*`, `dontreply@*`, `news@*`).

### Implications for Spike 002 (noise patterns)

The noise-category vocabulary at info-inbox flavour is going to look **very different** from debtor-email's `(auto_reply, ooo_temporary, ooo_permanent, payment_admittance)`:

- `m365_spam_tag` — `^\[SPAM\]` prefix. **By far the highest-volume rule.**
- `marketing_newsletter` — sender contains `newsletter|marketing|news@|nieuwsbrief`
- `noreply_notification` — sender starts with `noreply|no-reply|dontreply|notifications`
- `meta_facebook_notification` — `business.facebook.com`, `[META *]`
- `own_domain_loopback` — sender domain in `swarms.tenant_domains` (Smeba's own domains + `moyneroberts.com`)
- `auto_reply` / `ooo_*` — same as debtor-email, but tiny volume
- `unknown` → falls through to the router agent

This list is **provisional** — Spike 002 will harden it with actual cluster counts and Spike 003 will check overlap against debtor-email's existing regex rules.

### Implications for Phase 88 (deferred, not in this spike)

- Stage 1's `categorize_archive` handler is the right terminal for noise. The Outlook archive call already exists.
- The future router agent (Stage 3) operates on ~45% of inbound after Stage 1 strips the M365 `[SPAM]` tag — call it ~25 emails/day. That's well within budget.
- The 188-emails-sent figure means there's no "track our outbound" use case for info@smeba.nl — Phase 88 can scope to inbound-only without losing signal.

## Files

- `web/debtor-email-analyzer/src/spike-001-probe.ts` — pre-backfill volume count
- `web/debtor-email-analyzer/src/spike-001-backfill.ts` — bounded 90d upsert
- `web/debtor-email-analyzer/src/spike-001-stats.ts` — read-back baseline
- `.planning/spikes/001-smeba-info-backfill/stats-output.txt` — captured run output
