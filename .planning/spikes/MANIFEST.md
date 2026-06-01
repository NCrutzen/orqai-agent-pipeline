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

---

# Idea 2: Stage 2 Resolution Recall (2026-05-29)

## Idea

Stage 2 (entity resolution / "identify the customer") leaves **65% of debtor emails unresolved** (247/379 over 30d). Of those misses, 74% are external customers we failed to match and 26% are internal colleagues forwarding customer mail. Root causes found: (1) `conversation_id` dropped at ingest → thread inheritance dead; (2) sender match is exact-email only, missing business-domain matches; (3) no quoted-thread parsing for forwarded mail. This spike series measures the **realized recall recovery** of the proposed fixes ("levers") to size a "Stage 2 Resolution Recall" milestone — candidate to run **before V9.0** (V9.0's feedback-synthesis thesis is undermined if 2/3 of rows are unresolved).

**Lever 1 (conversation_id ingest fix + backfill) already shipped — commit `976d42d6`.** Spikes 005/006 measure Levers 2 (quoted-thread recovery, internal-as-trigger) and 3 (domain-level sender matching).

## Key Finding

**Combined recall floor = 80/247 misses (32.4%)** using only our own history as ground truth — lifts Stage 2 resolved rate from ~35% to ~56% (roughly 2×), and this is the conservative floor. True ceiling gated on a live NXT domain probe over 127 never-seen domains.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 005 | domain-sender-match-recall | standard | Lever 3: external miss → sender-DOMAIN match against confident domain→customer map | ✓ VALIDATED — floor 35/182 (19.2%) of external misses; 127/182 never-seen domains undecidable without live NXT | stage-2, recall, measurement |
| 006 | thread-recovery-recall | standard | Lever 2: thread_inheritance (post-fix) + quoted-body sender recovery for forwarded internal mail | ✓ VALIDATED — thread inheritance recovers 44/247 (17.8%); combined floor across all mechanisms 80/247 (32.4%) | stage-2, thread-inheritance, measurement |
| 007 | nxt-domain-probe | standard | Decision fork: query NXT for the never-seen domains → real Lever-3 estimate; decides Lever 3 vs Lever 4 scope | ✓ VALIDATED — 88% of business miss-domains are real NXT customers; 60% of external misses domain-resolvable (3x proxy floor). Build Lever 3 deep + tiebreaker for multi-customer orgs | stage-2, nxt, probe, decision-fork |
| 008 | disambiguation-signals | standard | For multi-customer domains: which NXT markers (number back-search: invoice/job/PO/order/quote; postcode/VAT/name/site) pick the right account | ✓ VALIDATED — number back-search = highest precision (→1 customer, recovers even no-domain-match); postcode narrows 85%/~100%-pop but not a clean key (sender-signature confound); pipeline = number → postcode/VAT → LLM tiebreaker | stage-2, disambiguation, nxt |
| 009 | backtest-resolution-stack | standard | Trace 5 real unresolved emails end-to-end through the proposed stack vs live NXT; test which assumptions hold | ✓ VALIDATED — assumptions BREAK: domain match gives confident false positives (spendlab→EQUANS); number back-search misses fresh inbound POs; name ambiguous for chains (Jumbo 30+); NEW 'namens/on-behalf-of' pattern mandatory; some misses are Stage-1 noise. Net: output RANKED SUGGESTIONS, not silent auto-resolve | stage-2, backtest, assumptions |
| 010 | comprehensive-backtest | standard | 11-agent live backtest of 38+ assumptions on real threads + NXT; produce a validated DESIGN-GUIDE before milestone | ✓ VALIDATED — self-auth IDs (aanmaning/klantnummer/werkbon) = ~17% safe auto @100% precision (10/10 fresh emails); ~56% suggest, ~27% hard, ~10% noise; concrete blocklists. REVISED 2026-05-30 against consolidated `nxt` DB (not zapier): see DESIGN-GUIDE.md §0 | stage-2, backtest, multi-agent, design-guide |
| 010b | nxt-revision | standard | 3-agent re-validation against the consolidated `nxt` DB (env_id BX/UK/IE; numbers triple); identify gaps + optimizations for a sound plan | ✓ VALIDATED — invoice = nxt.dbo.invoice.exact_invoice_id (99% pop, env+brand-tiebreak); env='BX' hard filter mandatory; brand is TIEBREAKER not pre-filter (cross-brand forwarding); ARCH: sync denormalized lookup table to Supabase (nxt = un-indexed views); canonical key = customer.id composite; new levers: contact_person.email (2x), previous_customer_id (73%), site.postcode, parent_id roll-up; 7th brand IN→berki scopes (BB,IN). See DESIGN-GUIDE §0 | stage-2, nxt, gaps, optimizations |

## Resolved (Spike 007, 2026-05-29)

- **NXT domain probe DONE** (live, via Zapier MCP SQL → `nxt_benelux_prod`): 88% of business miss-domains are real NXT customers; **60% of external misses domain-resolvable** (3x the proxy floor). **Decision: build Lever 3 deep.**
- **New sub-lever surfaced:** multi-customer domains (property managers / FM orgs — vbtgroep 81, cbre 59, veolia 30 accounts/domain) need **site-level disambiguation** (`dbo.site`, `customer.parent_id`) + the existing LLM tiebreaker, not auto-resolve.
- **Spike 008 DONE:** disambiguation = **number back-search** (invoice/job/PO/order/quote/**customer-debtor no.**/**KvK** → exactly one customer; widen `extract-invoices.ts`; recovers even no-domain-match cases incl. Ariba/Basware) → **VAT/postcode/phone narrowing** (postcode 85% email/~100% NXT but sender-signature confound; phone 35% email/78% NXT) → **LLM tiebreaker**. Reframes Lever 4: numbers + names cover much residue deterministically; pure LLM extraction is last resort.
- **Full signal menu scanned** (other-patterns search): added customer/debtor-number (13% email; `customer.id`/`previous_customer_id` 73%), KvK (13%; `company_registration_number` 36%), phone (35%/78%), peppol_id (intermediary residue, 4.5%), contact-name (soft). **Ruled out:** IBAN (no customer bank field in NXT), `g_number`/`external_code` (dead). **New ingest gap:** `emails.recipients` is empty (0/182) → fix like `conversation_id`, then add CC/recipient-domain match lever.

## Reality-checked (Spike 009 backtest, 2026-05-29)

5 real emails traced end-to-end vs live NXT **broke key assumptions**:
- **Domain match → confident FALSE POSITIVES** (spendlab.com → EQUANS, not the real customer Jumbo). Intermediary/shared-service domains attach to random customer records. Domain is a candidate-generator, not a resolver.
- **Number back-search misses fresh inbound POs** (CBRE PO not in our orders) — only hits OUR existing invoice/job/order/quote.
- **Name match ambiguous for chains** (Jumbo 30+, Boels 6) → tiebreaker still needed.
- **NEW mandatory pattern: 'namens / op verzoek van / uw klant X'** — real customer is the NAMED principal, not the sender (SpendLab/Ariba/Basware/debt-recovery).
- **Some misses are Stage-1 noise** (totaaltechniekgroep noreply werkbon ×21 — the top miss domain).
- **Design pivot:** Stage 2 recall must output **ranked SUGGESTIONS to Bulk Review**, auto-resolve gated to safe cases only (our-number hit, or domain+postcode agreement w/o intermediary flag). Success metric = operator-accepted-suggestion rate + time-to-resolve, NOT % silently auto-resolved.

## Open Questions (for the milestone, not the spike)

- **Lever 4 (zero-hit LLM extraction)** now scoped to the *residue*: e-invoicing intermediaries (Ariba/Basware — customer in invoice body) + consumer-ISP individuals. Breaks `D-03`; needs a design decision.
- **Multi-brand:** misses also touch IE (`apexfire.ie` lives in `nxt_ireland_prod`). Lever 3's domain lookup must be brand/DB-scoped.

## Out of scope (Idea 2)

- Building the production resolver layers (that's the milestone's phases).
- Any live NXT query (whitelisted-IP only; not reachable from the spike).
