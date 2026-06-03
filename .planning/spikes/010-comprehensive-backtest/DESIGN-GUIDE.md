# Stage 2 Resolution Recall — Comprehensive Design Guide

> Status: VALIDATED 2026-05-30. Built from 11 backtest agents (spike 010) running live tests against real email threads + live NXT (`nxt_benelux_prod`) and the Exact/peppol invoice mirror. 38+ assumptions tested; end-to-end pipeline validated on fresh unseen emails (auto-resolve precision 10/10, 0 false positives). This guide is the contract for the milestone — build to it to avoid rework.
>
> **RE-VALIDATED + AMENDED 2026-06-01** (fresh adversarial pass against live `nxt`/Supabase + a 27-email backtest, red-teamed). All load-bearing numbers reproduced; the write path is confirmed. Corrections are folded into **§0.10 (authoritative — supersedes the affected passages below)**. Full evidence: `VALIDATION-FINDINGS-v8.2.md`.

## 0. NXT REVISION (2026-05-30) — authoritative; supersedes data-source specifics below

Re-validated against the **consolidated `nxt` database** (operator directive: `nxt` is complete; `zapier`/peppol is a process-driven subset; per-region DBs not used). This sharpened the plan and surfaced an architecture decision. Details: `NXT-ADDENDUM.md` + the three N-agent reports folded here.

### 0.1 Data model
`nxt.dbo.{customer,invoice,site,contact_person,orders,job,quote}` are **VIEWS** over a federated 3-region consolidation. Every entity has `environment_id` (region: **BX** Benelux / UK / IE), a varchar composite **`id`** (globally unique, format `BX594313` = env+id_org, no separator), and a bigint **`id_org`** (per-region original — **repeats across regions**). `customer.brand_id` (nvarchar). Our debtor swarm is entirely **BX**.

### 0.2 ARCHITECTURE DECISION — resolve in SQL (`zapier.dbo` over `nxt`); NO copy of NXT data in Supabase
> REVISED 2026-05-30 (operator decision — governance: NXT customer data may NOT be copied into Supabase). Supersedes the original "sync a denormalized table to Supabase" plan; git history holds the prior wording.

`nxt` entities are un-indexable views + ~1.5–2s round-trip per call, and each email needs several signal lookups. **Put the resolver in SQL, backed by materialized indexed tables in `zapier.dbo` (the DEFAULT — built future-proof, operator decision 2026-05-30):** brand-scoped denormalized tables in the **`zapier` database** (our writable home on the same SQL Server instance), populated from `nxt.dbo.*` by a `MERGE`/`UPSERT` proc in `zapier.dbo` and **refreshed on a schedule by a Zapier Zap (Schedule trigger → SQL action calls the proc)** (`modified_on` watermark, every 2–4h; BX adds only ~7 customers / ~80 invoices per day). The Zap-triggered refresh is chosen over a SQL Agent job because it needs ONLY our `zapier.dbo` DDL rights (no server-level `SQLAgentUser` role) and reuses the already-whitelisted Zapier SQL connection — consistent with the CLAUDE.md Zapier-first decision tree. A resolver view/proc `zapier.dbo.resolve_candidates` runs over those indexed tables and returns the whole candidate set (+ `is_unique_in_scope`, env/brand scope) in ONE fast indexed call. Invoked per email via the EXISTING `nxt-zap-client` async-callback path (one new `zapier_tools` row) — the 3 live tools already prove this path works. **Live cross-DB views into `nxt` remain as a long-tail fallback** (freshest rows between refreshes; non-materialized kinds). This is a materialized-view pattern entirely within the SQL estate: single-system, governance-clean. The ONLY Supabase rows are `nxt_lookup_requests` bookkeeping + the resolution RESULT on `email_labels` — never NXT masterdata. **Feasibility confirmed 2026-05-30:** DDL rights in `zapier` (operator); same instance / cross-DB to `nxt` (operator + live-probed — 74,432 BX customers read through the Zapier "Find Row via Custom Query" SQL action); a parametrized multi-statement T-SQL batch runs through that same action (so a stored proc — or a view + inline SELECT — both work). **Still to confirm at P0 (write path):** all probes so far were `SELECT`; verify the Zapier SQL action can run a `MERGE`/write into `zapier.dbo` (not just read) via a throwaway table. Replaces both the "sync to Supabase" and the "new nxt.domain_lookup Zap per call" ideas; observability for the refresh lives in Zapier task history (the accepted Zapier-first trade-off).

### 0.3 Canonical stored key
Persist **`customer.id` (composite, e.g. `BX594313`)** on `debtor.email_labels.customer_account_id`; carry `brand_id`. NEVER persist bare `id_org` (repeats across regions). Parse `id_org` (the human klantnummer) as the substring after the 2-char env prefix.

### 0.4 Scoping rule — CORRECTED
- **`environment_id='BX'` is a MANDATORY hard filter on every lookup** (proven load-bearing: 4,726 BX customer id_orgs also exist in UK/IE; exact_invoice_ids also collide cross-region).
- **`brand_id` is a TIE-BREAKER, NOT a hard pre-filter.** Cross-brand forwarding is bidirectional and common (smeba-fire.be emails cite NL/SB invoices; smeba.nl cites BE invoices). A hard `brand=mailbox_brand` filter would wrongly reject valid resolutions. Use brand only to disambiguate the BE 3-way invoice collision and to inform routing; let the resolved customer's brand stand even if ≠ mailbox brand.
- **Berki mailbox must scope `brand_id IN ('BB','IN')`** — there is a 7th BX brand **`IN`** (Inprevo, a post-acquisition load: all 1,756 BX/IN customers created 2026-05-01..28, 0 before; shares Berki's VAT/KvK/email/zip) with NO dedicated mailbox. **Operator confirmed 2026-05-30: IN dunning flows via `debiteuren@berki.nl` → scope BB+IN.** Without this, 1,756 customers are unresolvable. The 1-mailbox↔1-brand assumption in §6 is therefore wrong for Berki.

### 0.5 Number back-search — CORRECTED source + canonical SQL
Customer-facing invoice number = **`nxt.dbo.invoice.exact_invoice_id`** (~99.1% populated; the 0.9% blank are pre-issuance drafts that can't be cited; credit notes ARE numbered). NOT `invoice_number` (internal 19M). Resolution rates (live-measured): NL numbers **99.86% unique by env alone**; BE numbers collide 3-way across SF/SN/SS → **99.77% unique after brand tiebreaker**; residual 0.16% → flag-for-review. Multi-row `exact_invoice_id` = line-level dup → collapse `DISTINCT customer_id_org` (do NOT hard-filter `is_main=1`; BE invoices live as is_main=0). Klantnummer = `id_org` (unique within BX). job/orders/quote resolve via `*_id_org` chains, 100% unique in BX. Canonical SQL (env-scoped, brand as tiebreaker) is in the N1 report; join on `id_org AND environment_id`. **Extraction caveat:** ~25% of number-shaped tokens are false positives (dates 2018xxxx/2019xxxx, refs) → anchor on "factuur/factuurnummer" context AND require an existence-check in the lookup table before trusting.

### 0.6 New recall levers found in nxt (fold into the stack)
- **GAP-1 (HIGH): union `contact_person.email` (132,859 addresses) with `customer.email` (65,103) in sender/domain match — ~2× the addresses.** Biggest unused recall lever; today's sender-match likely only checks one.
- **GAP-4 (MEDIUM): `previous_customer_id` (73% of BX customers carry a migration id)** — customers cite OLD numbers. Add as fallback after id_org (62 collide with a live id_org → flag-for-review when both resolve differently).
- **GAP-5 (MEDIUM): `site.postcode` (150k sites)** is a separate postcode source — query customer.postcode AND site.postcode (∩ candidate set); ~2× postcode recall for FM/property.
- **OPT-5: `parent_id` hierarchy (12% of customers)** — roll up multi-customer FM/property domains (cbre 59, vbtgroep 81) to the shared parent as a high-confidence answer instead of declining.

### 0.7 Blocklist deltas vs §5 (confirmed nxt-BX == nxt_benelux_prod; §5 transfers byte-for-byte EXCEPT)
- ADD own-domain **`sicli-sud.be` (246 customers)** to List 4 (§5 only had the variant `sicli-zuid.be=5`). Revised phantom total ≈1,294.
- ADD platforms **`couet.be` (220), `trevi.be` (128), `op.be` (108)** (Belgian syndics) to List 3.
- CORRECT own-entity (List 1) SN/SS: postcode **1070 Brussels** (not 1180/1160/5000); phones **02-8943620 / 02-8943625**.
- Brand-safety quantified: 8/14 real corporate miss-domains map to >1 BX brand (cbre→all 7, spie→6, unica→4) → domain match generates a cross-brand candidate set (env-scoped), disambiguated downstream — never hard brand-filtered.

### 0.8 Revised phase plan (replaces §13 ordering)
- **P0 — SQL resolver infra + bugfixes:** build the **materialized indexed tables in `zapier.dbo`** (customers incl. id/id_org/brand_id/parent_id/previous_customer_id/email, contacts, sites, invoice exact_invoice_id) populated from `nxt.dbo.*` env='BX'-scoped via a `MERGE` proc, + a **scheduled Zap (Schedule → SQL action calls the proc)** for the 2–4h watermark refresh (NOT a SQL Agent job — needs only `zapier.dbo` DDL) + the `zapier.dbo.resolve_candidates` resolver (view/proc) over them + register one `zapier_tools` row; live-`nxt` cross-DB fallback for the long tail; **confirm the Zapier SQL action can write (`MERGE`) to `zapier.dbo`, not just SELECT**; fix Lever 1 (labels conversation_id backfill + write-path); seed corrected blocklists; regex fixes; Berki→(BB,IN) scope. **No Supabase copy of NXT data.**
- **P1 — Deterministic AUTO resolver** over the SQL resolver (`zapier.dbo` → `nxt`): self-auth IDs (aanmaning/klantnummer/werkbon) + number back-search (exact_invoice_id env-scoped + brand-tiebreak, PO/order/quote, previous_customer_id fallback). ~17%+, ~100% precision, env='BX' hard, existence-checked.
- **P2 — Candidate generator:** domain (customer.email ∪ contact_person.email, blocklists+platform-score, env-scoped) + postcode (customer ∪ site) + VAT/KvK (own-stripped) → candidate set; parent_id roll-up.
- **P3 — On-behalf-of + LLM tiebreaker → ranked SUGGESTIONS** in Bulk Review (HITL); capture choice.
- **P4 — Thread inheritance** (whole-thread) + conversation_context.
- **P5 — Noise reclassification** (werkbon-noreply, gov AML/registration notices → Stage 1).
- Cross-cutting: per-rule precision telemetry + dry-run; flag-for-review on residual ambiguity (0.16% invoice, previous_customer_id collisions, IN/BB VAT-indistinguishable).

### 0.9 Operator open questions (updated 2026-05-30)
1. ~~Does `IN`-brand (Berki sister) dunning flow through `debiteuren@berki.nl`?~~ — **RESOLVED 2026-05-30 (operator): YES → scope BB+IN.** `IN` = Inprevo, post-acquisition (1,756 customers all loaded 2026-05-01..28).
2. ~~Production-safe path to read `nxt` for the sync job~~ — **RESOLVED 2026-05-30:** no sync. The resolver lives in `zapier.dbo` and reads `nxt` cross-DB via the production Zapier SQL action (same whitelisted path as the 3 live tools). DDL in `zapier` + cross-DB to `nxt` confirmed (live-probed).
3. ~~Confirm acceptable sync latency (2–4h)~~ — **RESOLVED:** the `zapier.dbo` materialized tables ARE the default, refreshed by a scheduled Zap (Schedule → SQL `MERGE` proc; not a SQL Agent job) every 2–4h (BX adds ~7 customers / ~80 invoices per day). Per-email resolver latency is one indexed call over the Zapier hop (async Inngest; existing client waits ≤20s). Live-`nxt` fallback covers rows newer than the last refresh. ~~**P0 open:** verify the Zapier SQL action supports writes (`MERGE`), not just SELECT.~~ — **RESOLVED 2026-06-01: the action CAN `MERGE` into `zapier.dbo`** (live-probed: CREATE+INSERT+MERGE+read-back). See §0.10.

### 0.10 VALIDATION AMENDMENTS (2026-06-01) — authoritative; supersede the affected passages below

Fresh live re-validation + adversarial red-team. Every spike-010 number reproduced (id_org 100% unique in BX; gmail 8,730; smeba.nl 925; contact rows 132,864; cross-region collisions 4,726; prev-cust 62; sites 150,456). The following CORRECT or SHARPEN the design — build to these.

- **A1. Write path CONFIRMED; seed is direct-SQL, not Zapier.** The Zapier SQL action can `CREATE`/`INSERT`/`MERGE` into `zapier.dbo` (live-probed). **Split the operations:** (1) **initial seed = one-time direct-SQL** `INSERT…SELECT FROM nxt.dbo.* WHERE environment_id='BX'` in the operator's own session (full `zapier.dbo` DDL rights; operator has `nxt.dbo` read — confirmed 2026-06-01) — no Zapier, no action timeout, governance-clean; (2) **recurring refresh = scheduled Zap** → `EXEC zapier.dbo.refresh_resolver` (tiny delta MERGE server-side); (3) **per-email resolve = Zapier action** `SELECT … resolve_candidates`. Only (2)+(3) use Zapier. Supersedes the implied "seed through Zapier."

- **A2. Invoice number back-search — corrected source + brand-safe gate (supersedes §0.5, §3 row 4, §7 R4).** Source is `nxt.dbo.invoice.exact_invoice_id` (the §3/§7 references to `zapier.dbo.vw_peppol_invoice` are **stale — delete them**). Live uniqueness (BX, 2yr): **env-only 91.74%; brand-scoped 99.84%; residual 0.16% (239 numbers) → flag-for-review.** ~14,743 numbers are reused across brands, so brand-scoping is load-bearing. **AUTO rule:** auto iff `(exact_invoice_id, mailbox-brand) → exactly 1 customer` **AND** the number's prefix-family (NL `1[7-9]/2[0-5]`, BE `3[23]`) matches the mailbox brand-family. A cross-brand-forwarded number (prefix-family ≠ mailbox-family — e.g. BE `33050878` arriving at the SB mailbox) scopes to a non-matching brand → **0 rows = safe MISS, never a wrong-resolve** → recover as **SUGGEST** by scoping the number's own prefix-family → candidate set → LLM tiebreaker. Collapse multi-row via `DISTINCT customer_id_org` (confirmed: 99% of numbers have all rows `is_main=0`; an `is_main=1` filter would drop ~99% — **never filter is_main=1**). For dunning the **paying** customer matters — prefer `paying_customer_id_org` (uniqueness ~identical at 91.86%).

- **A3. AUTO precision is proven at the LOOKUP layer only — guard the EXTRACTION layer (new, blocking for P1).** The 17/17 backtest hand-extracted identifiers. The regexes themselves inject wrong customers: (i) `(\d{6,7})\s*[-–]` with no anchor extracts MULTIPLE ids — **measured 16/253 unresolved emails (25% of subject-ID ones) carry ≥2 distinct 6-7-digit subject tokens**; (ii) an 8-digit invoice before a dash is truncated to a wrong 7-digit id_org; (iii) `/Klantnummer:\s*(\d{4,7})/i` still matches `Ons Klantnummer:` (their id for us); (iv) customer.id/site.id namespaces overlap with no tiebreaker once the dash-name requirement is dropped. **Mandatory guards:** word-boundary `(?<!\d)\d{6,7}(?!\d)`; **run R4 (invoice) before R1** so an 8-digit number is consumed as an invoice; implement the `Ons klantnummer` exclusion as real code + a unit test; **AUTO only when extraction yields exactly ONE resolving candidate in scope — multiple resolving candidates → SUGGEST**; a bare number resolving in >1 namespace (customer/site/order/job) with no real disambiguator → SUGGEST.

- **A4. The ≥99% bar is cleared by a dry-run, not n=16.** 0/16 gives a Wilson-95 lower bound of only ~80%. Gate the auto-flip on a **build-time full-population dry-run** (actual regex+lookup over all 253 unresolved, hand-adjudicated) with a Wilson-CI lower bound ≥99% — the same gate as graduated automation. The "17% auto" is a floor (self-auth IDs sit on ~47% of unresolved, none extracted today); the realistic safe-auto % is a hypothesis until the dry-run measures it.

- **A5. Thread inheritance — fix the precedence (supersedes §3 row 7 vs the live code).** The deployed resolver runs thread_inheritance as **Layer 1, confidence `high`, before the identifier layers** (`resolve-debtor.ts:120`) — contradicting §3's "step 7, SUGGEST-high." Whole-thread/bidirectional (RESL-14) widens the blast radius, and a wrong inherited sibling would OVERRIDE the self-auth ID. **Build rule:** self-auth ID (R1–R3) and invoice (R4) **outrank** inheritance; demote inheritance to **SUGGEST-high** with the cross-domain guard (inherit across domains only when the differing sender is own-brand-internal). Measure inherited-sibling correctness on a labelled thread set before enabling. Sequence after P1.

- **A6. Lever-1 / conversation_id — backfill only.** The forward write-path already stamps it (`stage-2-customer-resolver.ts:182`); only 3/383 historical labels carry it but **377 are backfillable** (emails are 99.6% stamped). RESL-05 = one `UPDATE … FROM emails` join + whole-thread inheritance. (~0.6% of emails carry no `conversation_id` at ingest and will stay non-inheritable — small recall floor, not a precision risk.)

- **A7. Domain / contact-email / platform-score (supersedes §0.6 GAP-1, refines §5).** Union `customer.email` ∪ `contact_person.email` = **102,305 distinct (1.86×)**; but the live `nxt.contact_lookup` tool is contact_person-based, so the marginal *unused* lever is `customer.email` (~15,755 distinct addrs, **+18%**, not 2×) — confirm the live tool's SQL before sizing. Platform-score cleanly separates platforms (codabox 261, easysyndic 334, adksyndic 106, syncura 97 — all ≥80) from genuine multi-entity orgs (equans 69/0.10, cbre 51/0.24, veolia 28/0.15) but is **fragile at the boundary** (equans 69 vs the 80 line) → use it as a **discovery aid only; keep the curated List 3 authoritative**. Prefer `status='active'` (only 58.8% of BX customers) as a free narrower. Mark postcode/VAT/KvK **narrowing-only** (never independently emit a candidate); **drop `phone` from resolvable kinds** (own-entity-strip only).

- **A8. Extraction source = per-source COALESCE.** Use `COALESCE(body_full_text, body_text)` branched on ingest source — NOT a blanket `body_full_text` (outlook is 9.9% full / 99.8% text; sugarcrm 0% full). The live resolver reads `body_text` (`stage-2-customer-resolver.ts:65`), missing quoted-thread identifiers on `zapier-debtor-ingest` (99.9% full) — fix at build.

- **A9. Two live config-drift P0 items (confirmed).** (i) ALL 6 `debtor.labeling_settings` rows still carry `nxt_database='nxt_benelux_prod'` (the per-region DB the NXT-ADDENDUM forbids) → migrate to the consolidated path. (ii) `facturations@sicli-sud.be` ingests but settings key on `debiteuren@sicli-sud.be` → no settings match → resolver short-circuits; latent until SS/SN are wired to `zapier-debtor-ingest`. (iii) Berki settings row is `brand_id='BB'` only — RESL-06's BB+IN scope is unbuilt.

- **A10. R5/R6 (PO/quote) AUTO is unmeasured + unmaterialised.** Neither fired as AUTO on the backtest, and `orders`/`quote` aren't in the materialised set (an AUTO-speed PO resolve would need a live `nxt` round-trip, breaking the one-call latency claim). **Demote R5/R6 to SUGGEST, or materialise `order_ref`/`quote_ref` and precision-test them.** Materialise only `customer` / `contact_person.email` / `site` / `invoice.exact_invoice_id`; keep `previous_customer_id` + VAT/KvK as live-`nxt` fallback.

- **A11. Berki BB+IN is real (RESL-06 load-bearing).** Backtest invoice `17008641` resolved to DWT Groep brand **`IN`** (Inprevo) via the Berki mailbox. And brand-as-tiebreaker (not hard filter) is validated: 5 self-auth-ID emails arrived at the SB mailbox but resolve to SF customers — a hard brand filter would wrongly reject them.

---

## 1. Executive summary

Stage 2 leaves ~65% of debtor emails unresolved. The naive plan (domain match + number back-search → auto-resolve) is **unsafe as conceived** — it produces confident false positives. The validated design is a **precedence-ordered, brand-scoped, multi-signal resolver** that:
- **Auto-resolves ~17%** of true targets via *self-authenticating IDs we stamped ourselves* (aanmaning subject, Klantnummer, werkbon site) + unique brand-scoped number back-search — **100% precision in validation**.
- **Suggests ranked candidates for ~56%** (domain + postcode/site + on-behalf-of name → LLM tiebreaker) — operator-in-the-loop, never silent.
- Leaves **~27% genuinely hard** (freemail, marker-less internal forwards) to LLM/human.
- Treats **~10% as Stage-1 noise** (automated noreply) that should never reach Stage 2.

Success metric is **operator-accepted-suggestion rate + time-to-resolve**, NOT "% silently auto-resolved."

## 2. Headline reframes (what changed vs the naive design)

1. **The best signal is OUR OWN data quoted back, not the customer's content.** Our outbound dunning stamps `Klantnummer: <customer.id>` and the subject `<id> - <name>`; werkbon mails stamp `werkzaamheden <job> op locatie <site>`. These come back quoted in replies and resolve at ~100% precision (47/47 ids). Extract self-authenticating IDs first.
2. **Domain match is poisoned** and must never auto-resolve alone: freemail dominates (gmail = 8730 customers), our own `smeba.nl` is on 925 customer rows, and AP/syndic platforms (basware/codabox/easysyndic…) map one domain to hundreds of unrelated customers. Domain is a *candidate generator*, gated by blocklists + platform-score.
3. **Everything is brand-scoped.** A domain (`hanab.nl`) and an invoice number (BE `33xxxxxx`) both span multiple brands → different customers. Brand is known from `source_mailbox` (see §6). Resolving without brand scope = silent wrong-customer.
4. **Invoice back-search lives in Exact, not NXT.** Customer-cited invoice numbers are `vw_peppol_invoice.exact_invoice_id` → `customer_id`, brand-banded (NL 17-25M, BE 32-33M). NXT `invoice.invoice_number` (188xxxxx) is a different, useless-for-this scheme.
5. **Own-identifier contamination must be stripped first.** Our footer (VAT/KvK/phone/postcode) is quoted into nearly every reply; un-stripped it makes the resolver match itself (KvK is 74% our own number).
6. **Output ranked suggestions, not silent auto-resolve**, except the narrow validated safe set. The dangerous failure mode is a confident wrong customer (e.g. BE invoice collision, intermediary domain), which would inject bad data into collections.

## 3. The resolution stack (precedence order — stop at first confident resolve)

Apply per email, in order. Always pass `brand_id` (from `source_mailbox`, §6). Pre-step: **strip own-entity identifiers** (§5 List 1) from body before any content match.

| # | Rule | Signal | Lookup | Outcome |
|---|------|--------|--------|---------|
| 0 | **Noise gate** | single-sender high-volume noreply (werkbon-noreply@…), AML/phishing/registration notices | sender + subject patterns | → Stage-1 noise, drop |
| 1 | **Self-auth ID: aanmaning subject** | `(\d{6,7})\s*[-–]` (NO `^` anchor; post-dash name = tiebreaker, not required) | try `customer.id` AND `site.id`→customer (id-space collides); brand-scoped | **AUTO** |
| 2 | **Self-auth ID: Klantnummer body** | `Klantnummer:\s*(\d{4,7})` (EXCLUDE "Ons klantnummer" = their id for us) | `customer.id`, brand-scoped | **AUTO** |
| 3 | **Self-auth ID: werkbon** | `werkzaamheden\s+(\d{6,7})\s+op locatie\s*:?\s*(\d{4,7})` (colon optional) | `site.id`→`site.customer_id` | **AUTO** |
| 4 | **Invoice back-search** | `exact_invoice_id` regex: NL `\b(1[7-9]\|2[0-5])\d{6}\b`, BE `\b3[23]\d{6}\b` (anchor on "factuur/facture/invoice") | `zapier.dbo.vw_peppol_invoice WHERE exact_invoice_id=@n AND brand_id=@brand` (SELECT DISTINCT) → `customer_id` | **AUTO if unique post-brand-scope**; BE w/o brand → SUGGEST |
| 5 | **PO / order back-search** | customer PO ref (`%NLP%`, `450%`, alphanumerics) | `orders` `sales_reference`/`reference_1..3`/`quote_reference` LIKE | **AUTO if 1**; miss = "not booked yet" → route to order-intake |
| 6 | **Quote back-search** | `SB######`/`BB######`, `enquiry_number` | `quote.reference`→customer | **AUTO if 1** |
| 7 | **Thread inheritance** | prior resolved label on same `conversation_id` (FIX REQUIRED §9) | `debtor.email_labels` self-join (whole-thread, not prior-only) | **SUGGEST-high**; guard cross-domain (only own-brand-internal differing sender) |
| 8 | **Domain → candidate set** | sender domain, after blocklists (freemail/own/platform), brand-scoped | `customer`/`contact_person` email domain | 1 corporate hit → SUGGEST-high; many → narrow (9/10/11) |
| 9 | **Postcode narrow** | extract ALL postcodes; strip own-brand + sender-HQ; intersect candidate set + `site.postcode` | `customer.postcode`/`site.postcode ∩ candidates` | narrows set |
| 10 | **VAT / KvK confirm** | after stripping own + intermediary | `vat_number`/`company_registration_number` | confirm/narrow (returns parent set) |
| 11 | **On-behalf-of principal** | platforms/intermediaries: "namens/op verzoek van/uw klant/voor X" (body + SUBJECT; ignore quoted Van:/Verzonden: header blocks & sign-offs) | principal name → `customer.name` (ambiguous; chains explode) | candidate set |
| 12 | **LLM tiebreaker** | full email + candidate details (name/city/postcode/VAT) | over the narrowed candidates | SUGGEST top-N |
| 13 | else | — | — | **HARD** (human) |

## 4. Signal precision/coverage scorecard (live-measured)

| Signal | Email coverage | Precision | Verdict |
|---|---|---|---|
| Aanmaning subject ID | 15-18% misses | ~100% (15/15) | AUTO |
| Klantnummer body | ~10-11% | ~100% (20/20) | AUTO |
| Werkbon site ID | ~5% (12) | 100% (12/12) | AUTO |
| Invoice (peppol, brand-scoped) | ~moderate | NL unique=safe; BE collides 3× → brand mandatory | AUTO (NL) / guard (BE) |
| PO/order back-search | present in many | high when booked; ~40-50% fresh-miss | AUTO if 1 |
| Quote ref | rare | high | AUTO if 1 |
| Domain (corporate, non-platform) | 96% biz senders | org-level; multi-customer for FM | SUGGEST + narrow |
| Postcode | 85% / ~100% NXT | narrows (sometimes 1:1); sender-signature confound | narrow only |
| VAT | 6.8% | parent-set; own/intermediary contamination | confirm only |
| Phone | 35% / 78% NXT | poisoned by own number + collisions | weak narrow |
| KvK | 13% | 74% is OUR own number | weak; needs blocklist |
| Name (principal/company) | high | chains explode (Jumbo 29, SPIE 67, Dirk 73) | candidate-set only |
| Sender display-name | — | mostly absent or collides | tiebreaker only |
| Thread inheritance | 248 have conv_id | ~22 realisable (44 bidirectional); BUGGED | fix first |
| IBAN | — | no customer bank field in NXT | DEAD |

## 5. Blocklists & registries (concrete, live-verified — seed before build)

**List 1 — Own-entity identifiers (strip from body before matching):**
- Domains: `smeba.nl, smeba-fire.be, fire-control.nl, firecontrol.nl, berki.nl, sicli.be, sicli-noord.be, sicli-zuid.be, moyneroberts.com, walkerfire.com`
- Postcodes: `6604LJ, 6604BW` (Wijchen), `2491DJ` (Den Haag FC), `2497GE` (Den Haag depot), `2220` (Heist), `1180/1160` (BE Sicli), `5000` (Namur)
- VAT: `NL807176850B01, NL812415322B01, NL005619841B01, BE0891778210, BE0450124144, BE1017308878, BE1017306504`
- KvK: `10019090, 10039768, 27098793, 0891778210, 0450124144`
- Phones: `0243775458, 0243741425, 0246411066, 0703177822, +3215253316, +3228943620` (normalize: strip non-digits, compare last 8-9)

**List 2 — Freemail/ISP (never domain-match):** `gmail.com, hotmail.com/.be/.nl/.fr, outlook.com/.be/.nl, live.nl/.be/.com, icloud.com, yahoo.com/.fr/.nl, me.com, msn.com, skynet.be, telenet.be, proximus.be, belgacom.net, scarlet.be, ziggo.nl, kpnmail.nl, planet.nl, hetnet.nl, home.nl, xs4all.nl, casema.nl, chello.nl, online.be, aol.com, gmx.*, mail.com, protonmail.com, pandora.be`

**List 3 — Platform/intermediary (route to on-behalf-of, never domain-match):**
- Confirmed by platform-score (distinct_customers/contact_rows): `codabox.com` (261, 0.97), `easysyndic.be` (334), `adksyndic.com` (106), `syncura.be` (97), `thekeys.be` (93), `syndicsolutions.be` (86), `vvefacturen.nl` (29)
- Curated (low NXT count but known intermediaries — caused false positives): `ariba.com, eusmtp.ariba.com, *.ariba.com, basware.com, *.basware.com, spendlab.com, candex.com, coupahost.com, *.coupahost.com, factuurportal.eu, tblox.com, onguard.com`
- Score rule: flag platform when `distinct_customers >= 25 AND distinct_customers/contact_rows > 0.45`, OR `distinct_customers >= 80`. Genuine orgs stay below (equans 0.10, cbre 0.24, veolia 0.15).
- **CBRE/Veolia/Equans/Heijmans etc.** are NOT platforms but ARE multi-entity (27-69 customers) → "large-org: require number/site disambiguation," never domain-alone.

**List 4 — Own-brand-domain-as-customer-email (never return a customer because its stored email is own-brand):** `smeba.nl` = 925 distinct customers (!), `smeba-fire.be` 44, `sicli-noord.be` 23, `sicli.be` 21, `berki.nl` 14, `fire-control.nl` 11, `moyneroberts.com` 5, `sicli-zuid.be` 5 (≈1048 phantom targets).

Registries should be **refreshed from NXT periodically** (smeba.nl count grew 590→925) — not hardcoded once.

## 6. Brand-scoping (the linchpin — and it IS available)

Brand is known from the receiving mailbox via `debtor.labeling_settings`:

| source_mailbox | brand_id | peppol code |
|---|---|---|
| debiteuren@smeba.nl | SB | SB |
| administratie@fire-control.nl | FI | FI |
| debiteuren@berki.nl | BB | BB |
| debiteuren@smeba-fire.be | SF | SF |
| debiteuren@sicli-noord.be | SN | SN |
| debiteuren@sicli-sud.be | SS | SS |

Every lookup (invoice, domain, number) MUST filter by this brand. The `vw_peppol_invoice.brand_id` is the 2-letter text code (not numeric) — map accordingly. This resolves the BE-invoice-collision danger (33xxxxxx → 3 customers across SF/SS/SN) because the inbound mailbox pins the brand.

## 7. Safe AUTO-RESOLVE definition (validated, ~0 FP)

Auto-resolve (no review) ONLY when, after brand-scoping + own-identifier strip:
- **R1** Self-auth subject ID `<id> - <…>` resolves to a `customer.id` OR `site.id`→customer (dash-name corroborates which). [validated 15/15]
- **R2** `Klantnummer: <id>` body → `customer.id`. [20/20]
- **R3** Werkbon `op locatie <site>` → `site.customer_id`. [12/12]
- **R4** Invoice `exact_invoice_id` + brand → single `customer_id`. **NL only auto; BE requires confirmed brand (have it from mailbox) → then auto.**
- **R5** PO/quote ref → single `orders`/`quote` customer.
- **R6** Unique non-platform corporate domain + agreeing postcode (both agree), brand-scoped.

Everything else → ranked SUGGESTIONS. Validation: 10/10 auto-resolves correct on fresh emails, 0 false positives.

## 8. Suggestion / HITL model (the ~56%)

For the suggestion bucket, emit a **ranked shortlist** to Bulk Review with per-candidate evidence (name, city, postcode, matched signal). The LLM tiebreaker reads the full email (handles "namens X", supplier-vs-building postcode, FM site disambiguation) and orders candidates. Operator confirms with one click. Capture the choice (feeds future promotion + the V9.0 learning loop). Never silently apply.

## 9. Bugs & data gaps to fix FIRST (or the milestone underdelivers)

1. **Lever 1 incomplete (BUG):** the conversation_id backfill populated `email_pipeline.emails` but NOT `debtor.email_labels.conversation_id` — the resolver self-joins on the labels table, so thread_inheritance fires 0× by construction. Fix: backfill `email_labels.conversation_id` from emails (join on email_id); verify the label write-path stamps it going forward; make inheritance whole-thread (bidirectional) to double yield (22→44). Guard cross-domain inheritance (only own-brand-internal differing sender).
2. **Regex bugs in the proposed patterns:** drop the `^\s*` anchor on aanmaning subject (RE:/FW: prefixes) — undercounts 17×; make `op locatie:?` colon optional — was matching 0. Don't require a name-like token after the dash (boilerplate like "VERZOEK TOT BETALING" is valid).
3. **ID-space collisions:** `customer.id`, `site.id`, `order_id`, `job.internal_id` overlap. Resolve a number only against the table its labeled context implies; for bare subject IDs, try customer.id AND site.id and disambiguate by dash-name.
4. **`recipients` ingest:** column ~81% populated but holds the receiving mailbox, not the external customer; the real external party is in quoted thread headers / `conversation_context`. (Brand is better sourced from `source_mailbox` anyway.)
5. **`conversation_context` backfill:** populated for only 2.8% of emails but is the cleanest per-message sender split for internal-forward recovery — backfilling corpus-wide is high-value.
6. **body_full_text coverage is source-dependent:** ~100% on `zapier-debtor-ingest` (the debtor swarm — OK), 9.5% on `outlook`, 0% on `sugarcrm`. Extraction must branch on source; sales-email swarm needs a different source.

## 10. Realistic sizing (per ~209 true targets, after removing ~10% noise)

- **Auto-resolve: ~17%** (validated 100% precision) — ship first.
- **Assisted/suggestion: ~56%** — domain+number+postcode+on-behalf-of → LLM tiebreaker → operator.
- **Hard (LLM/human): ~27%** — freemail, marker-less internal forwards, non-debtor notices.
- Addressable ceiling (auto + assisted) ≈ **73%**; safe-to-fully-automate today ≈ 17%.
- 65% miss rate is stable over the (5-week) label history; worst brands: smeba-fire.be 70.6%, smeba.nl 68.5%; best berki 56.7%.

## 11. Dangerous failure modes & their guards (must-haves)

| Failure | Example | Guard |
|---|---|---|
| Confident wrong customer via BE invoice collision | `33050901` → 3 customers SF/SS/SN | brand-scope (mailbox); never auto BE w/o brand |
| Intermediary domain false positive | `spendlab.com`→EQUANS; basware→30 | platform blocklist + on-behalf-of |
| Own-footer self-match | KvK 10019090, smeba.nl→925 | strip own-identifiers; own-domain not a customer key |
| Sender-signature postcode | CBRE PO has our own 6604LJ first | strip own + sender-HQ postcodes; intersect candidates |
| Subject ID is a site not customer | "631824 - InterCheM" | try customer.id AND site.id |
| Non-debtor "miss" inflating recall | AML/CDD notice, phishing warning, registration nag | noise-gate; route to HARD-as-noise |
| Cross-domain thread inheritance | unrelated senders in one Outlook thread | inherit across domains only if differing sender is own-brand-internal |

## 12. Success metrics (for the milestone)

- Auto-resolve **precision ≥ 99%** (false-positive is the cardinal sin) — measured on a held-out labelled set.
- Operator-accepted-suggestion rate (top-1 and top-3) for the assisted bucket.
- Median time-to-resolve per row (before/after).
- Coverage: % of true targets moved out of "unresolved" (target: 65% → ~35% within N weeks).
- Zero own-customer / intermediary mis-resolutions in production sampling.

## 13. Proposed milestone phase breakdown

- **P0 — Prereqs/bugfixes:** Lever 1 labels backfill + write-path; regex fixes; brand-scoping plumbing (source_mailbox→brand); seed blocklists/registries (Lists 1-4); operator confirm invoice/Exact access path.
- **P1 — Deterministic AUTO resolver:** self-auth IDs (aanmaning/klantnummer/werkbon) + brand-scoped number back-search (peppol invoice / PO / quote). ~17%, ~100% precision, ships as auto-resolve.
- **P2 — Candidate generator + narrowing:** domain (blocklist+platform-score) + postcode/site + VAT, brand-scoped → candidate sets.
- **P3 — On-behalf-of + LLM tiebreaker → ranked suggestions in Bulk Review** (HITL), capture operator choice.
- **P4 — Thread inheritance (whole-thread) + conversation_context** internal-forward recovery.
- **P5 — Noise reclassification:** move automated noreply (werkbon-noreply etc.) to Stage 1 `swarm_noise_categories`.
- **Cross-cutting:** dry-run + precision telemetry per rule; registry refresh job.

## 14. Open questions for the operator (the only non-code unknowns)

1. **Invoice/Exact access in production:** the pipeline currently reads NXT via the async Zapier Zap path; the peppol/Exact invoice view was reached via the claude.ai Zapier SQL MCP. Confirm the production-safe path to `vw_peppol_invoice` (a new Zap query, or is Exact reachable another way?).
2. **Are the BE brand prefixes (SN/SF/SS) ever served by one shared mailbox?** If so, brand-scoping via mailbox is insufficient for those and BE invoice auto must downgrade to suggest.
3. **Should non-debtor notices (AML/CDD, supplier-portal registration) be a Stage-1 category** or a Stage-2 "no action" outcome?
