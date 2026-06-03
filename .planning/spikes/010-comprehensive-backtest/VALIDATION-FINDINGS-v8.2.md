# v8.2 Stage 2 Resolution Recall — Adversarial Validation Findings

> **Run:** 2026-06-01, fresh session, High Effort, live data. Mandate: try to break the v8.2 design **before** build.
> **Method:** live write-path probe + live NXT (`nxt.dbo`, `environment_id='BX'`) precision/recall measurement via the production Zapier SQL action (the same path the resolver will use) + Supabase corpus analysis + a 28-email stratified hand-run backtest. No production code written; no GSD phase started. The only write was a throwaway `zapier.dbo.__resolver_probe` (created, merged, read-back, dropped).
> **Cardinal bar:** auto-resolve precision ≥99%. A confident WRONG customer injected into collections is the failure to avoid.

---

## 0. Verdict in one paragraph

The design is **empirically sound and safe to build, with corrections.** Every load-bearing number from spike 010 reproduced on fresh data, often to the digit (gmail 8,730; smeba.nl 925; contact rows 132,864; cross-region collisions 4,726; prev-cust collisions 62; sites 150,456). The write path **works** (MERGE into `zapier.dbo` confirmed). Auto-resolve precision held at **17/17 (0 false positives)** on a sample enriched for the dangerous cases — **but that validates the LOOKUP layer (existence + env=BX + brand-scope), not the EXTRACTION layer.** An adversarial red-team pass (folded in §8) showed the *extraction* regexes are where a wrong customer is actually injected, and n=16 is far too small to assert the ≥99% bar — so the **real ship gate is the build-time full-population dry-run with a Wilson-CI ≥99% lower bound**, not this point estimate. The corrections: (1) invoice auto is **only** ≥99% *after* brand-scoping; mailbox-brand is unreliable for cross-brand forwards but **fails closed (safe miss), not wrong-resolve** — a prefix-family-aware gate recovers more recall than blanket SUGGEST; (2) **RESL-05 collapses to a one-statement backfill** (forward write-path already stamps `conversation_id`); (3) **RESL-15 must be narrow + carry an actionable-token carve-out**; (4) **two live config-drift items** (all settings on the forbidden `nxt_benelux_prod`; sicli-sud mailbox-key mismatch) must land in P0; (5) **P4 thread-inheritance precision was never measured and it runs as Layer-1 AUTO-high, outranking the self-auth IDs** → needs validation before GO. The upside survives: self-auth IDs (which today's resolver extracts *zero* of) are present on ~47% of the unresolved set, so the 17% auto figure is a floor — but the realistic safe-auto % is a *hypothesis* until the dry-run measures it.

### Go / No-Go summary

| Phase | Verdict | One-line rationale |
|---|---|---|
| **P0** substrate + bugfixes | 🟡 **GO — WITH GATES** | Write-path MERGE confirmed. Seed runs **direct-SQL** (operator SSMS, not Zapier) → no latency gate; only confirm the operator login has `nxt.dbo.*` read. Remaining gates: (a) migrate settings off `nxt_benelux_prod`; (b) reconcile sicli-sud mailbox key + wire SS/SN; (c) wire Berki BB+IN. |
| **P1** deterministic AUTO | 🟡 **GO — WITH EXTRACTION GATE** | Lookup-layer precision 17/17, but the **extraction layer is unguarded**: require single-resolving-candidate-or-SUGGEST, word-boundary id regex (run R4 before R1), real `Ons klantnummer` exclusion, single-namespace gate. Ship behind the dry-run Wilson-CI ≥99%. |
| **P2** candidate generator | 🟢 **GO** | Domain/platform-score/postcode/contact-union validated; platform-score is a *discovery* aid, keep curated List 3 authoritative; mark postcode/VAT/KvK narrowing-only; drop `phone` from resolvable kinds. |
| **P3** suggestions + tiebreaker | 🟢 **GO** | Backtest SUGGEST bucket all recoverable in candidate set / via on-behalf-of. P1's BE-invoice fallback depends on P3 existing. |
| **P4** thread inheritance | 🟠 **NEEDS-MORE-VALIDATION** | Precision **never measured** (45 is a recall count); runs as Layer-1 AUTO-`high` in code (`resolve-debtor.ts:120`), contradicting DESIGN-GUIDE §3 step-7 (SUGGEST-high) and **outranking the self-auth IDs**. Pin precedence + measure inherited-sibling correctness + cross-domain guard first. |
| **P5** noise reclass | 🟡 **GO — RESCOPE NARROW + CARVE-OUT** | werkbon-NOREPLY yes; gov-AML/domain sweeps **no**; add a hard **actionable-token carve-out** (never noise-reclass if invoice/klantnummer/aanmaning/werkbon present). |

> **Cross-phase ordering constraint (new):** P1 self-auth, P1 invoice, and P4 inheritance share **one** precedence chain in `resolve-debtor.ts`. Lock that precedence as a P0/P1 deliverable (self-auth ID must outrank inheritance; inheritance demoted to SUGGEST-high per the design). P4 sequences **after** P1 ships and is observed — never concurrently. P1's BE-invoice SUGGEST fallback depends on P3's tiebreaker.

---

## 1. Write-path probe (§3 — the load-bearing unknown) — ✅ HOLDS

The entire scheduled-Zap refresh assumed the Zapier SQL action can **write** to `zapier.dbo`, not just `SELECT`. Every prior probe was a SELECT. Tested directly:

```sql
DROP TABLE IF EXISTS zapier.dbo.__resolver_probe;
CREATE TABLE zapier.dbo.__resolver_probe (id INT PRIMARY KEY, val VARCHAR(20));
INSERT ... (1,'a'),(2,'b');
MERGE ... WHEN MATCHED THEN UPDATE ... WHEN NOT MATCHED THEN INSERT ...;  -- upsert 1→'merged', insert 3
```

Read-back returned **`rc=3, id1='merged', id3='c'`** — CREATE + INSERT + MERGE (both branches) all landed. Table dropped after.

**Implication:** RESL-01/02 (materialized tables + `MERGE` refresh proc + scheduled-Zap) are mechanically feasible. The "materialized-tables-as-default" architecture is unblocked. Observability remains Zapier task-history only (accepted trade-off).

**Clean operation split (operator clarification 2026-06-01 — supersedes the earlier "seed-through-Zapier" worry):** the three operations have different homes, and only two need Zapier:
1. **Initial seed (one-time):** run **directly in SQL** (operator's own SSMS/ADS session, using the existing `zapier.dbo` DDL rights) — `INSERT … SELECT FROM nxt.dbo.* WHERE environment_id='BX'`. No Zapier, **no 30s action timeout**, governance-clean (stays inside the SQL estate, `nxt → zapier.dbo` cross-DB on one instance; nothing reaches Supabase/Vercel). This dissolves the full-seed-latency concern entirely — the heavy load never touches the Zapier action.
2. **Recurring refresh (every 2–4h):** scheduled Zap → `EXEC zapier.dbo.refresh_resolver`, which MERGEs only the tiny `modified_on` delta (~7 customers / ~80 invoices a day) server-side → returns well inside the action limit. The write-path probe above validated exactly this (a `MERGE` write through the action works).
3. **Per-email resolve (runtime):** Vercel/Inngest → `nxt-zap-client` → Zapier SQL action → one indexed `SELECT` over `zapier.dbo.resolve_candidates`. The hot path; must go through Zapier (only the whitelisted IP can reach the SQL Server).

**Residual P0 check (small) — ✅ CONFIRMED 2026-06-01:** the operator's direct SQL login **has `nxt.dbo` read rights** (operator confirmed). The direct-SQL seed path is fully cleared; the former "does a 74k MERGE fit in a Zapier action" gate is removed entirely.

---

## 2. Per-assumption scorecard (measured vs claimed)

Legend: **HOLDS** / **WEAKENED** (true but the wording over-claims) / **BROKEN**.

### Tier 1 — auto-resolve precision (the ≥99% bar)

| # | Assumption | Claimed | Measured (live BX) | Verdict |
|---|---|---|---|---|
| 1 | Klantnummer (`id_org`) → exactly 1 BX customer | "unique within BX" | 74,432 customers / **74,432 distinct id_org / 0 dup groups** = 100% unique | **HOLDS (hard)** |
| 1b | env=BX is mandatory for id_org | load-bearing | **4,726** BX id_orgs also exist in UK/IE (exact match to claim) | **HOLDS** |
| 2 | Invoice `exact_invoice_id` unique | "NL 99.86% by env alone; 99.77% after brand" | **env-only (BX, brands pooled): 91.74%**; **brand-scoped: 99.84%** (239 collide = 0.16%) | **WEAKENED** (see §3.1) |
| 2b | Multi-row invoice collapse = `DISTINCT customer_id_org`, not `is_main=1` | — | **99.0%** of invoice numbers have *all* rows `is_main=0`; an `is_main=1` filter would drop ~99% | **HOLDS (strongly)** |
| 3 | Brand-scoping changes results | load-bearing | ~**14,743** invoice numbers reused across brands (150,599 brand-pairs vs 135,856 numbers) | **HOLDS** |

### Tier 2 — recall levers

| # | Assumption | Claimed | Measured | Verdict |
|---|---|---|---|---|
| 4 | contact_person.email ≈ 2× customer.email | 132,859 vs 65,103 | rows **132,864** vs **65,104**; distinct union **102,305** = **1.86×** customer-only distinct (54,894) | **HOLDS** — but framing wrong (see §3.3) |
| 5 | Domain poison counts | gmail 8730; smeba.nl 925 | gmail **8,730** (customer.email) / 8,845 (contact); smeba.nl **925** (customer) / 590 (contact) | **HOLDS (exact)** |
| 5b | platform-score separates platforms from CBRE/Veolia | codabox .97, equans .10, cbre .24, veolia .15 | codabox 261/.974, easysyndic 334/.488, adksyndic 106/.373, syncura 97/.396 → platforms; equans 69/.095, cbre 51/.242, spie 37/.133, veolia 28/.150 → genuine | **HOLDS** — fragile boundary (see §3.4) |
| 6 | previous_customer_id on 73%; 62 collide | 73% / 62 | **72.6%** (54,012); collisions **62** (exact) | **HOLDS (exact)** |
| 7 | site.postcode ≈ 150k sites | 150k | **150,456** sites; **99.99%** carry a postcode | **HOLDS** |

### Tier 3 — bugs & noise

| # | Assumption | Claimed | Measured | Verdict |
|---|---|---|---|---|
| 8 | Lever-1: thread_inheritance fires 0× (labels unstamped) | bugged | **0** labels with `method='thread_inheritance'`; only **3/383** labels carry `conversation_id`; emails are 99.6% stamped; **377 labels backfillable** | **HOLDS** — but cheaper than written (see §3.2) |
| 8b | realisable thread recall ("22, 44 bidirectional") | ~22–44 | post-backfill: **52** multi-label threads, **32** inheritable, **45** unresolved rows inherit a resolved sibling (~18% of misses) | **HOLDS** (~44) |
| 9 | werkbon-noreply + gov notices are top misses & noise | #1 miss = noise | totaaltechniekgroep 21 (NOREPLY, fair noise); **but** minfin 10 / fedasil 6 / economie.fgov = **real customers** that auto-resolve | **WEAKENED** (see §3.5) |
| 9b | body coverage source-dependent | zapier ~100/outlook 9.5/sugar 0 | zapier-debtor **99.9%** / outlook **9.9%** / sugarcrm **0.0%** | **HOLDS** |

### Tier 4 — the headline sizing

| # | Assumption | Claimed | Measured | Verdict |
|---|---|---|---|---|
| 10 | 17% auto / 56% suggest / 27% hard / 10% noise | 17/56/27/10 | current pipeline resolves 34% (invoice 17.2% + sender 12.8% + llm 3.9%); **47% of the 253 unresolved carry a clean auto signal** the current resolver can't see | **WEAKENED — auto is UNDER-sized** (see §3.6) |

---

## 3. The findings that reshape the plan

### 3.1 Invoice auto is safe ONLY with brand-scoping — and mailbox-brand can be the WRONG brand (sharpen R4)

Live: env-only invoice uniqueness is **91.74%**, not the design's "99.86% by env alone." Brand-scoping recovers it to **99.84%**. So the design's *conclusion* (brand-scope BE) is right, but two corrections matter for the ≥99% bar:

- **Drop the "NL unique by env alone → auto without brand" shortcut.** Blended BX is 91.7% by env; the safe, simple rule is **always env+brand scope, auto only when the pair yields exactly 1 customer.** This measures 99.84% and removes a special case.
- **Mailbox-brand is not a reliable brand signal for forwarded mail.** Backtest case `404088`: BE invoice `33050878` arrived at the **smeba.nl (SB)** mailbox via an internal forward, but resolves 3-way to **SF (Jumbo — correct), SS (Librairie Point Virgule), SN (Demare Atelier)**. The true brand is SF, *not* the mailbox's SB. If R4 trusts mailbox-brand=SB it finds 0 rows (miss); if it ignores brand it finds 3 (collision). **Neither auto-resolves correctly.** Correct behaviour: **SUGGEST** the 3 BE candidates → LLM tiebreaker (which picks Jumbo from "Jumbo Supermarkten B.V." in the body). The 0.16% within-brand residual (239 numbers) must **flag-for-review**, never auto.

> Net: BE-invoice AUTO is only safe when `(number, mailbox-brand)` resolves to exactly 1 *and* the mailbox-brand is trustworthy. For internally-forwarded cross-brand invoices it is not — so the honest rule is **BE invoice → SUGGEST by default; AUTO only on a single env-unique hit.** This keeps precision at ~100% at the cost of moving the rare BE-collision to the operator (where it belongs).

### 3.2 RESL-05 is a one-statement backfill, not a write-path build

The bug is real (0 thread_inheritance, only 3/383 labels stamped). But the **forward write-path already stamps `conversation_id`** — `stage-2-customer-resolver.ts:182` writes `conversation_id: emailRow.conversation_id ?? null`, and the email SELECT (`:65`) fetches it. The 0.78% stamped figure is **stale history**: those 383 labels predate the emails-side backfill. **377/383 labels are backfillable** by a single `UPDATE … FROM email_pipeline.emails` join (0 orphans, 99.2% of their emails carry `conversation_id`).

> RESL-05 reduces to: **one backfill UPDATE** + make inheritance whole-thread/bidirectional (RESL-14). The "verify the label write-path stamps it going forward" half is **already done** — drop it from the requirement.

### 3.3 GAP-1 is real but the framing is backwards — size the *marginal* lever, not the headline 2×

Union (customer.email ∪ contact_person.email) = **102,305 distinct addresses = 1.86×** the customer-only set. But the live sender-match tool is **`nxt.contact_lookup`** (it matches against `contact_person.email` and returns `contact_id`+`top_level_customer_id`). So contact emails are *probably already wired*; the **unused** side is `customer.email`, which adds only **~15,755 distinct addresses (+18%)** on top of contact — not 2×.

> Action: build the resolver to union **both** (correct regardless), but **don't bill GAP-1 as a 2× lever** — the marginal gain over today is ~18%, and even that is unverified because the `contact_lookup` Zap SQL is not in the repo. **Operator must confirm what `nxt.contact_lookup` actually queries** (customer-only, contact-only, or both) before sizing this. This is the single biggest gap between "claimed lever" and "measurable lever."

### 3.4 platform-score works but is fragile at the boundary — keep curated List 3 authoritative

The rule (`distinct_customers≥25 ∧ ratio>0.45, OR ≥80`) cleanly separates today: platforms codabox/easysyndic/adksyndic/syncura all ≥80; genuine equans(69)/cbre(51)/spie(37)/veolia(28) all below. But:
- **adksyndic (ratio 0.373) and syncura (0.396) are caught *only* by the `≥80` OR-clause** — the ratio test alone would miss them.
- **equans (69) sits just under the 80 line** and is climbing; if it crosses 80 the OR-clause would mis-flag a genuine FM org as a platform.
- basware.com has **0** BX contact rows → score can't see it; it's caught only by curation.

> Treat platform-score as a **discovery aid that surfaces candidates for human review**, not an auto-classifier. The curated **List 3** (refreshed) stays the authoritative gate. This matches the design's own "curated + score" dual approach — just don't let the score auto-promote near the boundary.

### 3.5 RESL-15 must be NARROW — gov domains are customers, not noise (Phase 87 generalises)

Top-miss domains (live): **smeba.nl 31, berki.nl 21, totaaltechniekgroep 21, minfin.fed.be 10, fire-control.nl 8, fedasil.be 6, smeba-fire.be 6, cbre.com 6, hanab.nl 5**.

- **~68 of the misses (27%) are our OWN domains** (smeba.nl/berki.nl/fire-control/smeba-fire/moyneroberts) — internal forwards, **customer-bound + actionable** (Phase 87). These are **recall** (RESL-14 thread + RESL-07 self-auth ID), **never noise**. Backtest `25e575` (smeba.nl internal fwd) auto-resolves via self-auth id 532706.
- **gov domains are NOT noise.** Backtest proved minfin.fed.be→`530549` (FOD Financiën), fedasil.be→`530540`/`530841` (Fedasil Gent/Glons), economie.fgov.be→`499371` (FOD Economie) all **auto-resolve to real customers** via the self-auth subject ID. A blanket "gov AML notice = noise" rule would archive live dunning replies.
- **The only safe RESL-15 noise = high-precision NOREPLY work-order reminders** (totaaltechniekgroep "Dit is een NOREPLY e-mail" + werkorder/terugkoppeling). Even these are operationally actionable (they carry a PO) — they're "noise *for the debtor swarm*," so reclass removes them from the debtor denominator but should not globally hard-archive without an ops lane.

> Rescope RESL-15: a **narrow sender+subject NOREPLY rule**, promoted only through the graduated-automation Wilson-CI gate. **Remove "government AML/registration notices" as a blanket noise class.** Aligns with `project_loopback_rule_disabled` (don't re-enable broad own-org archiving) and the Stage-1 hard-separation rule.

### 3.6 The auto bucket is UNDER-sized — self-auth IDs are free recall the current pipeline ignores

The current resolver has **no self-auth-ID extraction** — it only does thread_inheritance, exact-sender-email, and invoice-regex (`extract-invoices.ts`). Yet among the **253 currently-unresolved** emails:

- subject aanmaning-ID `NNNNNN -`: **65 (26%)**
- `Klantnummer:` in body: **28 (11%)**
- werkbon `op locatie`: **17 (7%)**
- invoice number in subject: **67 (26%)**
- **any clean auto signal: 119 (47% of unresolved)**

The ~110 self-auth-ID emails (aanmaning + klantnummer + werkbon) are **pure new recall** — the current pipeline captures *none* of them — and the backtest resolved **11/11** of them correctly. So the design's "17% auto" is the floor, not the estimate: realistic safe-auto is **~25–40% of the population**.

> Don't lower the bar — raise the expectation. Add a **build-time full-population dry-run** (already a cross-cutting requirement) that runs the existence+uniqueness+brand gates over all 253 unresolved and reports the true safe-auto count before flipping anything live. The headline metric "65%→35% unresolved" is achievable largely from **P1 self-auth IDs alone**, before P2/P3.

---

## 4. Backtest scorecard (the centrepiece)

**Sample:** 28 emails, drawn reproducibly from `debtor.email_labels ⋈ email_pipeline.emails` where `customer_account_id IS NULL` and `created_at ≥ now()-90d`, ordered by `md5(label.id)`, selected across all 7 strata. Keys (first-6 of md5): `00df61,02bb97,03aaad,057f46,073b10,0beef0,0e01d7,0e5344,109f5d,13d249,16512a,2214c9,229508,2402c8,25e575,262b0e,275665,27cd7a,298cdc,2dec90,2402c8,31df1a,331ea1,3587b7,375e51,3b4cb7,404088,423899,44de59`. The sample was deliberately **enriched for auto-eligible and dangerous cases** to stress precision — so its 57% auto *share* is a sampling artifact; the **population auto share is sized separately in §3.6**.

### 4.1 AUTO bucket — deterministic resolves (the milestone-killer test)

| key | signal | extracted | NXT result | email context | ✓ |
|---|---|---|---|---|---|
| 00df61 | subj id | 530841 | Fedasil Glons (SF) | fedasil.be | ✓ |
| 03aaad | subj id + Klantnummer | 528307 | Akelei Schriek CV (SF) | "Akelei Schriek CV, 2223 Schriek" | ✓ |
| 13d249 | subj id | 530549 | FOD Financiën (SF) | minfin.fed.be SPF Finances | ✓ |
| 2214c9 | subj id | 530540 | Fedasil Gent (SF) | "terugkeerloket Gent" (misdirected-dunning, entity still correct) | ✓ |
| 275665 | subj id | 499371 | FOD Economie (SF) | economie.fgov.be | ✓ |
| 27cd7a | subj id | 587856 | Rudy Pelckmans (SF) | **icloud.com freemail** | ✓ |
| 331ea1 | subj id | 484172 | VME Residentie Marquis I (SF) | forsimmo syndic "VME Marquis I" | ✓ |
| 423899 | subj id | 589866 | PartsPoint België NV (SF) | partspoint.be Deinze | ✓ |
| 25e575 | subj id (own-domain fwd) | 532706 | Lucas Onderwijs (FI) | "Lucas Onderwijs; Estloo" | ✓ |
| 02bb97 | werkbon site | 467865 | Min. v. Defensie FABK (SB) | mindef.nl | ✓ |
| 375e51 | werkbon site | 511927 | RCN Zeewolde (SB) | "RCN Zeewolde" | ✓ |
| 229508 | invoice | 17341385 | Heijmans Woningbouw BV (SB) | heijmans.nl | ✓ |
| 262b0e | invoice | 17008641 | DWT Groep BV (**IN**) | dwtg.nl, Berki mailbox | ✓ |
| 298cdc | invoice | 17335205 | Jumbo Supermarkten [franchise] (SB) | jumbo.com (29-domain → number pins 1) | ✓ |
| 2dec90 | invoice | 17342122 | De Hamer Beton BV (SB) | bte.nl "De Hamer (Nijmegen)" | ✓ |
| 44de59 | invoice | 17340664 | Aabo Trading Almelo BV (SB) | aabo.nl | ✓ |

**AUTO precision: 17/17, zero false positives — at the LOOKUP layer.** (16 distinct emails; `03aaad` carried two corroborating signals. Note: the sample key-list in §4 mistakenly repeats `2402c8`, so it is **27 distinct emails**, not 28.) One older invoice `21122098` returned 0 rows → a **clean miss, not a false positive** (existence-check working).

> **Scope this claim honestly (red-team §8.1):** I extracted every identifier *by hand*, so this validates the lookup/uniqueness/brand layer — **not the extraction regexes**, which is where a wrong customer actually gets injected. And n=16 with 0 errors gives a Wilson 95% lower bound of only ~80% — this is "no counterexample found in a small enriched sample," **not** evidence of the ≥99% bar. Measured extraction exposure: **16/253 unresolved emails (25% of the 65 with a subject ID) carry ≥2 distinct 6-7-digit subject tokens** — each a multi-candidate AUTO hazard if two tokens resolve to different customers. The ≥99% bar is cleared only by the build-time full-population dry-run (§7.3) with a Wilson-CI lower bound ≥99% on the *actual* regex+lookup over all 253 — the same gate the design mandates for graduated automation.

### 4.2 The FP traps the prior spikes warned about — all avoided

- **jumbo.com** (29-customer domain) → invoice `17335205` pins the single franchise entity. Number-back-search beats domain. ✓
- **icloud.com freemail** → self-auth subject id `587856` resolves cleanly; domain match (correctly) never fires. ✓
- **sap.com / Ariba** (`2402c8`) names principal "IKEA" → platform blocklist + on-behalf-of, never domain-auto. ✓
- **TBlox / Alrijne** (`3b4cb7`) carries "Ons klantnummer: 10608" (their id for us) → must be **excluded**; real customer = Alrijne via on-behalf-of. ✓
- **BE invoice 33050878** (`404088`) → 3-way collision, correctly held to SUGGEST. ✓
- **own footer / own-domain forwards** → resolved by self-auth id, not by matching our own smeba.nl. ✓

### 4.3 Two structural confirmations from the AUTO bucket

- **Brand-as-tiebreaker (not hard filter) is correct (§0.4):** 5 self-auth-ID emails arrived at the **smeba.nl (SB)** mailbox but resolve to **SF** customers. A hard `brand = mailbox_brand` filter would have **wrongly rejected all 5.** `environment_id='BX'` + unique `id_org` resolves them regardless of brand.
- **Berki BB+IN scope (RESL-06) is real and load-bearing:** invoice `17008641` via the Berki mailbox resolves to **DWT Groep, brand `IN` (Inprevo)**. Without the IN scope this customer is unreachable.

### 4.4 SUGGEST bucket (9) — true customer recoverable in every case

`404088` BE-invoice→3 BE candidates (Jumbo in top-3); `073b10`/`0beef0` CBRE PO (95NLP…) + cbre.com→candidate set; `16512a` hanab.nl KvK-request→domain candidates; `2402c8` SAP→IKEA on-behalf-of; `3b4cb7` TBlox→Alrijne on-behalf-of; `31df1a` argroep.nl→domain; `3587b7` veolia.com→28-candidate set; `0e01d7` bam.com→multi-entity (SUGGEST-low). All have the true customer reachable via candidate-set + tiebreaker → consistent with the ~56% assisted bucket.

### 4.5 HARD / NOISE bucket (3)

`057f46` MS365 quarantine notice → noise (automated security); `109f5d` totaaltechniekgroep NOREPLY work-order → noise-for-debtor (RESL-15, narrow); `0e5344` Ultimoo Incasso → HARD (supplier/incasso, customer unknowable from content).

---

## 5. Optimization / simplification pass

1. **Shorten the BE-invoice path:** collapse R4's "NL-auto-by-env / BE-auto-after-brand" two-case logic into one rule — *always env+brand scope; AUTO iff exactly 1; else SUGGEST; flag the 0.16% within-brand residual.* Removes a special case **and** closes the cross-brand-forward hole (§3.1).
2. **RESL-05 shrinks to a backfill** (§3.2) — delete the write-path sub-task.
3. **Minimal materialized set:** the four kinds that *earn* materialization are `customer` (id/id_org/brand/prev_cust/email/postcode/status/parent), `contact_person.email`, `site` (id_org/customer/postcode), and `invoice.exact_invoice_id` (+ brand via customer join). These back R1–R4 + domain + postcode. **`previous_customer_id` (62 collisions, fallback-only)** and **VAT/KvK (6.8%/weak)** do **not** need materialization — leave them as live-`nxt` fallback. Smaller refresh surface.
4. **Status filter is free precision:** only **58.8%** of BX customers are `active`. Prefer `active` when a domain/postcode match returns several candidates — cheap disambiguation already in the data.
5. **Resolver must read `body_full_text`, not `body_text`:** the live resolver SELECT (`:65`) reads `body_text` (latest message). Self-auth IDs and invoice numbers frequently live in the **quoted original** (`body_full_text`, 99.9% on the debtor swarm). Switching the extraction source is a one-line change that likely lifts recall materially on replies/forwards — verify at build.
6. **Generic-claim pressure test (SugarCRM, V10.0):** the seam is clean for the *engine*, but **`body_full_text` is 0% on sugarcrm** — the sales adapter must extract from `body_text`, and SugarCRM has no `exact_invoice_id`/`werkbon`/`aanmaning` self-auth stamps. So the **precedence config differs substantially per swarm** (debtor leans on self-auth stamps; sales will lean on domain/name). The engine/config split is right, but don't claim generality until the V10.0 adapter proves the self-auth-ID layer degrades gracefully to empty for a backend that has no such stamps.
7. **Latency:** one `resolve_candidates` call per email is enough for the AUTO + candidate-set generation (single indexed lookup over the materialized tables). The LLM tiebreaker (P3) is the only second round-trip, and only for the SUGGEST bucket. No N+1.

---

## 6. Proposed doc deltas (define-only; apply after operator approval)

**`DESIGN-GUIDE.md`**
- §0.5 / §3 R4 / §7 R4 / §11: replace "NL unique by env alone → auto" with **"always env+brand scope; AUTO iff (number,brand)→exactly 1; BE and any collision → SUGGEST."** Add the live numbers (env 91.74% / brand 99.84% / residual 0.16% / 239 colliders). Add the **mailbox-brand-is-unreliable-for-forwards** caveat with the `33050878` example.
- §3 R4 / §7 R4 still reference `zapier.dbo.vw_peppol_invoice` — **stale.** Replace with `nxt.dbo.invoice.exact_invoice_id` (NXT-ADDENDUM already corrected this; the table rows didn't get updated).
- §0.6 GAP-1: reword from "biggest unused lever (2×)" to **"union both customer.email + contact_person.email (102,305 distinct, 1.86×); marginal gain over today's `contact_lookup` is ~18% via customer.email — confirm the live tool's SQL first."**
- §9.1 (Lever-1): note the **forward write-path already stamps `conversation_id`**; RESL-05 = backfill only.
- §5 List 4 / §2: smeba.nl is **925 on customer.email** and **590 on contact_person.email** — note both surfaces.
- Add a **status-filter** note (58.8% active) to §3 steps 8–10.
- §3: change extraction source to **`COALESCE(body_full_text, body_text)` per ingest source** (NOT a blanket switch to `body_full_text` — outlook is 9.9% full / 99.8% text; see §8.6).
- §0.2: state explicitly that the **initial seed is direct-SQL (operator session), not through Zapier**; only the recurring `EXEC refresh_resolver` (delta MERGE) and the per-email reads use the Zapier action. Removes the implied seed-through-Zapier path (see §1).

**`GENERIC-RESOLUTION-DESIGN.md`**
- Layer A: mark `previous_customer_id` and `vat`/`kvk` as **live-`nxt` fallback kinds (not materialized)**; materialize only customer/contact-email/site/invoice.
- Evidence boundary: add that the **self-auth-ID precedence layer is debtor-specific** (no SugarCRM analog) and the sales adapter must extract from `body_text` (sugarcrm `body_full_text`=0%).

**`MILESTONES.md` (RESL-xx)**
- **RESL-05** → "Backfill `email_labels.conversation_id` from `emails` (377 rows); whole-thread inheritance. (Write-path already stamps it.)"
- **RESL-08** → add the brand-safe gate + flag-for-review on within-brand collision; BE → SUGGEST default.
- **RESL-09** → "union customer.email + contact_person.email; confirm current `nxt.contact_lookup` coverage first."
- **RESL-15** → "Narrow NOREPLY work-order noise rule only; **remove gov-AML/registration blanket noise** (those are auto-resolvable customers)."
- **Sizing line** → annotate "17% auto is conservative; ~47% of unresolved carry a clean auto signal; confirm via build-time full-population dry-run."
- **Success criteria** → keep ≥99% precision; note it was **17/17 (100%)** on the validation sample.

---

## 7. Residual unknowns the build must still confirm

1. **`nxt.contact_lookup` actual SQL** — customer-only, contact-only, or both? Sizes GAP-1. (Not in repo; operator/Zap inspection.)
2. **Initial materialized-table seed within the Zapier action's time/row limits** — deltas are tiny, the full seed is the risk (§1).
3. **Full-population safe-auto count** — run the gates over all 253 unresolved (build-time dry-run) to turn "~47% signal-present" into "X% actually auto-resolves."
4. **Are SN/SS ever served by one shared mailbox?** Only 4 of 6 mailboxes produced volume in 60d (no sicli-noord/sicli-sud traffic). If a mailbox ever serves 2 BE brands, BE-invoice auto must stay SUGGEST there.
5. **`body_full_text` vs `body_text` in the resolver** — confirm the switch lifts recall without importing quoted-thread false positives (existence-check should absorb them).

---

## 8. Red-team reconciliation (adversarial second pass)

A 4-agent panel attacked this report's own conclusions. Their strongest objections were valid and several were confirmed by fresh live measurement. Adjudication below — **ACCEPTED** changes are folded into §0/§4.1/§6 and the go/no-go; **REFINED** means the objection improved my own delta; **NOTED** means a real residual to carry into build.

### 8.1 ACCEPTED — extraction layer is unvalidated (the report's biggest gap)

My 17/17 validated the **lookup** layer because I hand-extracted identifiers. The actual regexes (DESIGN-GUIDE §3) fail on inputs the curated sample never contained:
- **Multi-ID subjects.** `(\d{6,7})\s*[-–]` (no anchor) extracts *all* matches. **Measured live: 16/253 unresolved emails (25% of the 65 subject-ID emails) carry ≥2 distinct 6-7-digit subject tokens.** If two tokens both resolve to (different) live id_orgs, the resolver auto-resolves a wrong customer — the existence check does **not** help when both exist.
- **8-digit invoice truncation.** `(\d{6,7})` on `17342122 - De Hamer` captures `7342122` — a valid-but-wrong id_org. R1 and R4 fight over the same token.
- **`Ons klantnummer` is excluded only in prose.** `/Klantnummer:\s*(\d{4,7})/i` still matches `Ons Klantnummer: 10608` (their id for us). The 4-digit floor maximises collision surface against 74,432 live id_orgs.
- **Namespace collision without tiebreaker.** §9.2 drops the post-dash name requirement; §9.3 relies on that same dash-name as the customer.id/site.id tiebreaker. A bare ID resolving in both spaces with boilerplate dash-text has no disambiguator (live proof the spaces overlap: werkbon `511927` is both a site id_org and customer 511927).

**Build requirements added to P1:** word-boundary id regex `(?<!\d)\d{6,7}(?!\d)` and **run R4 (invoice) before R1** so an 8-digit number is consumed as an invoice; implement `Ons klantnummer` exclusion as real negative-lookbehind code + unit test; **AUTO only when extraction yields exactly one resolving candidate in scope — multiple resolving candidates → SUGGEST**; single-namespace gate (a number that resolves in >1 of customer/site/order/job with no real disambiguator → SUGGEST). Measure the cross-namespace collision rate in the dry-run.

### 8.2 ACCEPTED — n=16 doesn't clear a 99% bar; gate on the dry-run

Rule-of-three: 0 failures in 16 ⇒ ~80% Wilson lower bound. The ≥99% cardinal bar is cleared only by the **build-time full-population dry-run** (run the real regex+lookup over all 253 unresolved, hand-adjudicate, require Wilson-CI LB ≥99%) — the same gate the design's graduated-automation already mandates. Folded into §0, §4.1, §7.3. The "~25–40% safe-auto" is downgraded to a **hypothesis** contingent on that dry-run; plan on the validated **17%** until then.

### 8.3 ACCEPTED — P4 thread inheritance: precision unmeasured + precedence inversion

The live resolver runs thread_inheritance as **Layer 1, confidence `high`, short-circuiting before the identifier layers** (`resolve-debtor.ts:120-157`). DESIGN-GUIDE §3 step 7 says inheritance should be **SUGGEST-high with a cross-domain guard** — a design/runtime contradiction I missed. I measured inheritance **recall** (45 inheritable rows) but never **precision** (is the inherited sibling the right customer?). RESL-14 (whole-thread, bidirectional) widens the blast radius, and a wrong inherited answer would **override the self-auth ID the whole milestone is built on**. → **P4 regraded to NEEDS-MORE-VALIDATION**; pin precedence (self-auth ID outranks inheritance; demote inheritance to SUGGEST-high), measure inherited-sibling correctness on a labelled thread set (esp. cross-domain/internal-forward), implement the cross-domain guard, sequence P4 after P1.

### 8.4 ACCEPTED — two live config-drift items (confirmed by fresh queries)

- **All 6 `debtor.labeling_settings` rows carry `nxt_database='nxt_benelux_prod'`** — the per-region DB the NXT-ADDENDUM forbids for v8.2. The consolidated-`nxt` pivot is unwired in the table the runtime reads (`stage-2-customer-resolver.ts:79`). **P0 must migrate this.**
- **`facturations@sicli-sud.be`** ingests (24 emails/120d) but settings key on `debiteuren@sicli-sud.be` → `has_settings=false` → null `nxt_database` → resolver short-circuits to inheritance-only. **Latent** (Sicli has no `zapier-debtor-ingest` feed yet; the 4 active debtor mailboxes all match correctly), but it bites the moment SS/SN onboard. **P0 must reconcile the mailbox key + pipe SS/SN.**
- The Berki settings row is `brand_id='BB'` only — **RESL-06's BB+IN scope is genuinely unbuilt** (expected; flagged for P0).

### 8.5 REFINED — BE-invoice rule is better than my "BE→SUGGEST by default"

A red-team agent independently re-measured (BE-specific env-alone ≈49%, brand-scoped ≈99.77%, ~85 residual colliders) and correctly argued my blanket "BE→SUGGEST" throws away safe recall. Key insight I under-weighted: a BE invoice arriving at an NL mailbox scopes to a non-BE brand → **0 rows = safe MISS, not a wrong-resolve.** So the higher-recall, still-≥99% rule is:
- **AUTO** when `(exact_invoice_id, mailbox-brand) → exactly 1` **and** the number's prefix-family (NL `1[7-9]/2[0-5]`, BE `3[23]`) matches the mailbox brand-family;
- **SUGGEST** when prefix-family ≠ mailbox-family (the cross-brand forward — scope by the number's own prefix-family to recover the candidate set);
- **flag-for-review** the within-brand residual (0.16–0.23%).

(My pooled 2-yr figures — env 91.74% / brand 99.84% — and the agent's all-time BE-specific figures differ by window/filter but agree on the rule and on brand-scoped ≈99.8%.) Supersedes §3.1's "SUGGEST by default."

### 8.6 REFINED — body source is a per-source COALESCE, not a blanket switch

My §5.5/§6.3 "switch to `body_full_text`" is **backwards for the outlook path** (outlook: `body_full_text` 9.9% / `body_text` 99.8%; the debtor mailboxes run an outlook feed too). A blanket switch would crater extraction on the outlook half. Correct rule: **`COALESCE`/branch per ingest source** — prefer `body_full_text` where populated (zapier-debtor 99.9%), fall back to `body_text` (also consider `body_unique_text`). The outlook `body_full_text` gap is a P0 ingest-coverage item, not a one-line resolver change.

### 8.7 REFINED — RESL-15 needs an actionable-token carve-out

A narrow sender+subject NOREPLY rule still over-archives: among noreply-shaped mail the red-team measured ~29% with an actionable subject, ~16% citing an invoice, and some citing a self-auth ID. This is the exact failure that got `own_outbound_invoice_loopback` disabled. **Add a hard exclusion: never noise-reclass an email carrying any actionable token (invoice anchored on factuur/facture/invoice, Klantnummer, aanmaning subject ID, werkbon)** — NOREPLY+work-order-subject with *no* such token only, with the Wilson-CI gate on top.

### 8.8 ACCEPTED — R5/R6 (PO/quote) AUTO is unmeasured and unmaterialised

The two PO cases resolved via domain→SUGGEST, never via PO back-search, so R5/R6 AUTO precision was asserted, not measured; and `orders`/`quote` are outside the materialised set → an AUTO-speed PO resolve would need a live `nxt` round-trip, breaking the one-call latency claim. **Either demote R5/R6 to SUGGEST, or materialise order_ref/quote_ref and precision-test them.** Also: drop `phone` from the resolvable `identifier_kind` vocab (own-entity-strip only); mark postcode/VAT/KvK narrowing-only (never independently emit a candidate).

### 8.9 NOTED — residuals to carry into build

- **P0 full-seed concern RESOLVED by the operation split (§1).** The earlier worry — and the red-team's "ungoverned bulk-copy" framing — both assumed the initial seed goes through Zapier. It does not: the seed is a one-time **direct-SQL** `INSERT…SELECT` in the operator's session (full `zapier.dbo` DDL rights, inside the SQL estate → governance-clean, no action timeout). Only the tiny recurring refresh + the per-email reads use Zapier, both validated. The scaled-seed-probe is therefore **not needed**; the only residual is a one-line check that the operator's direct login can `SELECT` cross-DB from `nxt.dbo.*`.
- **RESL-05 forward-stamp isn't 100%.** ~0.6% of emails carry a `source_id` but no `conversation_id` and will keep writing non-inheritable labels; keep a forward-rate check (across *all* write paths, not just the Inngest worker) rather than declaring the bug fully closed. Backfillable count is 377–380 (minor).
- **GAP-1 marginal reach is already bounded** at +18% (15,755 customer-only addresses not in contact_person); the only true unknown is whether the live `nxt.contact_lookup` Zap already unions `customer.email`. The repo client strongly implies contact-only — settle with one differential probe at build.
- **Generality is over-billed for P0.** The ≥99% win rests on self-auth stamps that **SugarCRM has none of** (and `body_full_text`=0% there). Reframe the milestone as "build the debtor resolver behind a config-shaped seam," not "build the generic engine"; the only generality claim P0 may make is an acceptance test that the self-auth tier **degrades to a no-op** (not a crash, not a false candidate) for a backend declaring zero auto-safe self-auth kinds.

### 8.10 Net effect on the verdict

The red-team did **not** overturn the core finding (the design is sound and the measured NXT facts hold). It **correctly downgraded the confidence**: P1 ships behind an extraction gate + the dry-run, P4 needs precision measurement, P0 grows two config-drift items. (The "seed gate" the red-team raised is dissolved by the operation split in §1 — the seed is direct-SQL, not through Zapier.) None of these are blockers to *building* — they are guardrails that keep the cardinal ≥99% bar honest. Net: **build, but gate the auto-flip on the dry-run; do not let n=16 or a recall count stand in for a precision proof.**

---

*Validation complete. Live evidence boundary: NXT/debtor (BX) only — no cross-swarm/SugarCRM generality claimed. NXT read via the production Zapier SQL path (analysis-only). Findings adversarially red-teamed (§8) and reconciled against fresh live queries. 3 SQL-native commits remain on `workspace/milestone-v8.1`, unpushed; v8.2 stays define-only until v8.1 closes.*
