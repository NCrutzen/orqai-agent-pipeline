# Spike Manifest

## Idea

`info@smeba.nl` is a general info inbox at Smeba (different concern than the existing debtor-collection mailbox `debiteuren@smeba.nl`). v8.1 phases 78/84/85/86 are wiring up cross-swarm architecture against debtor-email + sales-email; once those land, `info@smeba.nl` can onboard as its own swarm (Phase 88, deferred). This spike series is the **recon work** that defers safely until then: backfill the corpus, discover what noise looks like in an info inbox, validate whether the noise vocabulary is genuinely different from debtor-email's (the architectural question), and preview the non-noise residue for future router-agent capacity planning. Deliverable: a written noise-category proposal document in `docs/designs/`.

## Requirements

Design decisions that emerged during this spike session. Non-negotiable for the future Phase 88 build.

- Pure recon: no runtime code paths touched, no `swarm_*` registry rows, no Stage 1/Stage 3 wiring. Corpus and analysis only.
- Backfill is bounded (last 90 days) to keep Supabase storage + Graph fetch time reasonable. Full history can be pulled later if Phase 88 needs it.
- Intent vocabulary for the future router agent is **previewed only**, never hand-curated. Per the locked 2026-05-19 principle: the real vocabulary emerges through Phase 86's discovery surface.
- Reuse the existing `web/debtor-email-analyzer/` tooling (Zapier SDK, Supabase client, `email_pipeline.emails` table). No parallel setup.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | smeba-info-backfill | standard | Backfill `info@smeba.nl` 90d corpus into `email_pipeline.emails`; produce volume baseline (count, date range, daily rate, inbox/sent split, top senders/domains) | ✓ VALIDATED — 5,504 rows, 90d, 61.2/day inbound, 188 sent total. `[SPAM]` is 54.5% of inbound; 96% single-msg threads; own-domain loopback present | recon, corpus |
| 002 | smeba-info-noise-patterns | standard | Cluster the corpus by sender-domain + subject-pattern + body markers; identify dominant noise categories with sample counts | ✓ VALIDATED — 6 rules classify 76.9% of inbound. Big surprise: own_domain_loopback (17.9%) isn't noise — it's internal workflow CC. Drops marketing/newsletter (0.2%) as DOA — M365 catches it upstream | recon, noise |
| 003 | smeba-vs-debtor-noise-overlap | standard | Classify the Smeba corpus through debtor-email's existing 4 noise regex rules; measure overlap % and identify info-only categories. Answers "is this really a different swarm vocabulary or a brand variant?" | ✓ VALIDATED — distinct swarm. 56% of debtor-email regex transfers cleanly (spam + payment_admittance + auto_reply + ooo_*); +1 new rule (noreply_notification, 4%); own_domain_loopback inherits Phase 84 | recon, architecture, cross-swarm |
| 004 | smeba-non-noise-shape | standard | Eyeball-sample ~30 non-noise emails; preview department-routing distribution (sales/finance/support/HR/other) for Phase 88 capacity planning. Preview only — NOT hand-curation | ✓ VALIDATED — router workload ~14/day arriving, ~7/day real business. Finance is biggest real bucket (20%); cold outreach is 33% of post-noise residue. No vocabulary proposed — Phase 86 discovery surface owns that | recon, preview |

## Out of scope

- Any code change in `web/lib/inngest/functions/*` or `web/lib/debtor-email/classify.ts`
- Any insert into `swarms`, `swarm_noise_categories`, `swarm_intents`
- Outlook label/archive automation for `info@smeba.nl`
- Writing the actual Phase 88 plan (that's `/gsd-plan-phase 88` after v8.1 closes)
