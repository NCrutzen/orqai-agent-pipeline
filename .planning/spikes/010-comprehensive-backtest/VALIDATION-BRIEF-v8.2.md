# v8.2 Stage 2 Resolution Recall — High-Effort Validation Brief

> For a FRESH Claude session, run at **High Effort**. Purpose: adversarially re-validate the entire v8.2 design BEFORE any build, empirically test the load-bearing assumptions against live data (incl. a 20–50 email subset backtest), and surface improvements/simplifications. Output = a findings report + concrete deltas to the design docs. **Do NOT write production code. Do NOT start a GSD phase.** This is validation, not implementation.

---

## 0. Your mandate (read first)

The v8.2 milestone is **defined but not built**. The operator's explicit goal: *"I want everything to work before we actually build, otherwise we keep going back and forth during the build."* So your job is to **try to break this plan now**, on paper and against live data, while it is still cheap to change.

Be a skeptic, not a cheerleader. For every load-bearing claim, ask: *is this still true? was it ever measured, or assumed? what sample size? does it hold on a fresh sample? what's the failure mode if it's wrong?* Prefer live measurement over re-reasoning. Where you cannot measure, say so explicitly and flag the residual risk.

The cardinal constraint of the whole milestone: **auto-resolve precision ≥99% — a confident WRONG customer injected into collections is the failure to avoid.** Every auto-resolve assumption must be stress-tested against that bar.

---

## 1. Orient — read these first (in order)

1. `.planning/spikes/010-comprehensive-backtest/DESIGN-GUIDE.md` — **§0 is authoritative** (the NXT-consolidated-DB revision + the SQL-native architecture). Then §1–§13.
2. `.planning/spikes/010-comprehensive-backtest/GENERIC-RESOLUTION-DESIGN.md` — the cross-swarm substrate (Resolver + Engine + Source Adapters).
3. `.planning/spikes/010-comprehensive-backtest/NXT-ADDENDUM.md` — the consolidated `nxt` DB model + scoping rule.
4. `.planning/spikes/010-comprehensive-backtest/ASSUMPTIONS.md` and `FINDINGS.md` — the prior backtest's assumption register + scorecard. **This is your starting checklist — your job is to re-test these, not trust them.**
5. `.planning/MILESTONES.md` → the `## v8.2 Stage 2 Resolution Recall` section — RESL-01..15, P0–P5, sizing, success criteria.
6. Project memory: `~/.claude/projects/-Users-nickcrutzen-Developer-agent-workforce/memory/project_stage2_resolution_recall.md` — the full decision trail incl. the SQL-native pivot.
7. `CLAUDE.md` → the Stage 1/2/3 architecture pointers + the Supabase/Zapier/Orq patterns.
8. The live resolver code: `web/lib/inngest/functions/stage-2-customer-resolver.ts`, `web/lib/automations/debtor-email/resolve-debtor.ts`, `web/lib/automations/debtor-email/nxt-zap-client.ts`.

## 2. Architecture as currently decided (do NOT relitigate these — they are operator decisions)

These were settled 2026-05-30/06-01 across 3 commits. **Validate within these constraints; do not re-propose what they replaced.**

- **No copy of NXT data in Supabase** (governance). The resolver lives in SQL.
- **Resolver = `zapier.dbo`** SQL objects (tables/views/procs) that read cross-DB from `nxt.dbo.*`. The operator has direct DDL in `zapier.dbo`.
- **Materialized, brand-scoped, indexed tables in `zapier.dbo` are the DEFAULT** (future-proof), populated from `nxt` by a `MERGE` proc. Live-`nxt` cross-DB views are the long-tail fallback.
- **Refresh = a scheduled Zap** (Zapier Schedule trigger → SQL action calls the MERGE proc), every 2–4h. NOT a SQL Agent job (needs a server role we don't have), NOT Inngest. Reuses the whitelisted Zapier connection.
- **Engine stays in TypeScript** (`web/lib/agentic-pipeline/resolve/`), reading the SQL resolver's returned rows. Per-swarm `resolution_config`. Debtor first consumer; SugarCRM (V10.0) the generality proof.
- **Berki mailbox scopes `brand_id IN ('BB','IN')`** — `IN` = Inprevo (post-acquisition, 1,756 customers all loaded 2026-05-01..28; operator confirmed dunning flows via debiteuren@berki.nl).

If your validation produces *evidence* that one of these is wrong, surface it loudly as a finding with the evidence — but the default is to work inside them.

## 3. Tools you have for live validation

- **Zapier SQL MCP** (`sql_server_find_row_via_custom_query`, `sql_server_find_multiple_rows_via_custom_query`) — queries the live SQL Server, incl. cross-DB into `nxt.dbo.*`. This is the SAME path the production resolver uses. **Verified working 2026-05-30** (74,432 BX customers; multi-statement parametrized T-SQL runs). Use it to test every NXT-side assumption against live data.
  - NXT MCP gotchas (from NXT-ADDENDUM): set output_hint to "return every row verbatim"; CAST ids to varchar, LEFT(name,N); `previous_customer_id` is nvarchar (CAST before int compare); queries must run <30s; **it is billed — batch your queries**; aggregate as a single CONCAT `AS summary` where possible.
  - Scope rule on EVERY nxt query: `environment_id='BX'`. Brand is a tiebreaker, not a hard pre-filter.
- **Supabase MCP** (`execute_sql`) — the email corpus lives here: `email_pipeline.emails` (subject, body_full_text/body_unique_text, sender_email, conversation_id, source_mailbox), `debtor.email_labels` (method, customer_account_id, conversation_id), `pipeline_events`. Use it to pull the test sample and the current unresolved set.
- **The HARD constraint on the write path is UNTESTED:** every Zapier SQL probe so far was a `SELECT`. The MERGE-based refresh assumes the action can WRITE to `zapier.dbo`. **Test this early** with a throwaway table (`CREATE`/`INSERT`/`MERGE`/`DROP` a temp `zapier.dbo.__resolver_probe`). If writes don't work through the action, the whole refresh mechanism needs a rethink — find this out first.

## 4. The load-bearing assumptions to re-test (the priority list)

For each: state the claimed value, design a live query/test, report measured vs claimed, classify **HOLDS / WEAKENED / BROKEN**, and give the build implication.

**Tier 1 — auto-resolve precision (≥99% bar; test hardest):**
1. **Self-auth ID precision** — claim ~100% (47/47 ids; 10/10 fresh emails). Re-extract from a fresh sample; for each extracted `Klantnummer`/aanmaning-subject-id/werkbon-site, verify it resolves to exactly 1 BX customer and that it's the *right* one. Hunt for the counter-example.
2. **Invoice back-search uniqueness** — claim `nxt.dbo.invoice.exact_invoice_id` is NL 99.86% unique by env alone, BE collides 3-way → 99.77% after brand tiebreak. Re-measure uniqueness distribution live. Verify the multi-row collapse rule (`DISTINCT customer_id_org`, NOT `is_main=1`). Confirm the ~25% number-token false-positive rate (dates 2018xxxx) and that an existence-check kills them.
3. **Brand scoping is load-bearing** — claim 4,726 BX id_orgs also exist in UK/IE; exact_invoice_ids collide cross-region. Verify env='BX' actually changes results vs unscoped. Confirm the 1-mailbox→brand map.

**Tier 2 — recall levers (size the actual lift):**
4. **GAP-1 contact_person.email union** — claim 132,859 contact addresses vs 65,103 customer addresses (~2×), and "today's sender-match likely only checks one." VERIFY the live counts AND inspect `resolve-debtor.ts` to confirm whether contact emails are actually unused today. This is billed as the biggest unused lever — confirm or deflate it.
5. **Domain-match poisoning** — claim freemail (gmail=8730 customers), own-domain (smeba.nl on 925 customers), platform domains (basware/codabox/etc.) poison domain match. Re-measure the counts (the memo notes smeba.nl grew 590→925 — so these drift; check current). Validate the platform-score rule (`distinct_customers≥25 AND ratio>0.45 OR distinct_customers≥80`) against live data — does it cleanly separate platforms from genuine multi-entity orgs (CBRE/Veolia)?
6. **previous_customer_id fallback** — claim 73% of BX customers carry one; 62 collide with a live id_org. Verify; confirm the flag-for-review-on-collision rule is sized right.
7. **postcode / site.postcode** — claim 150k sites, ~2× postcode recall, but confounded by sender-signature postcodes. Sanity-check.

**Tier 3 — bugs & noise (the "free" recall):**
8. **Lever-1 conversation_id bug** — claim the backfill hit `email_pipeline.emails` but NOT `debtor.email_labels.conversation_id`, so thread_inheritance fires 0×. VERIFY against live data: are labels actually unstamped? Does the resolver self-join on labels? Quantify realisable thread-inheritance recall.
9. **Noise reclass (RESL-15)** — claim werkbon-noreply ×21/mo + gov AML notices are the #1 miss domains and belong in Stage 1. Verify they're still top misses; confirm they're truly non-actionable (cross-check against the Phase 87 loopback incident finding: internal-forwards are customer-bound+actionable — do NOT blanket-archive own-org senders).

**Tier 4 — the sizing claim itself:**
10. **17% auto / 56% suggest / 27% hard / 10% noise** — this is the headline. Re-derive it from a fresh stratified sample (§5), don't inherit it.

## 5. The empirical backtest (20–50 emails) — the centerpiece

Design and run a real backtest, the way spike 010 did but fresh:

1. **Pull a stratified sample** of 20–50 debtor emails from `email_pipeline.emails` ∪ `debtor.email_labels`, weighted toward the **currently-unresolved** set (`method` null/unresolved). Stratify across: self-auth-id present, invoice-number present, corporate-domain, freemail, platform/intermediary, internal-forward, noise-candidate. Record the sample selection so it's reproducible. Prefer recent emails (last 30–60d).
2. **For each email, run the proposed resolution stack BY HAND** (DESIGN-GUIDE §3 precedence) against live `nxt` via the Zapier SQL MCP: strip own-identifiers → self-auth id → invoice/number back-search → domain→candidate set → postcode/contact narrowing → on-behalf-of → (you act as the LLM tiebreaker). Record at each step what fired and what it returned.
3. **Establish ground truth** per email (who is the real customer?) using whatever signal is strongest — and be honest where you can't (mark "unknowable from content").
4. **Score:** for the AUTO bucket, precision (any wrong? that's the milestone-killer); for the SUGGEST bucket, is the true customer in the top-1 / top-3? For the HARD bucket, was anything genuinely unrecoverable. Produce the measured auto/suggest/hard/noise split and compare to the claimed 17/56/27/10.
5. **Catch the false positives the prior spikes warned about:** the EQUANS/SpendLab "namens Jumbo" intermediary case, BE invoice cross-brand collision, own-footer self-match. Did your hand-run stack avoid them?

This backtest is where the plan earns trust. If precision on the AUTO bucket is <100% on the sample, that is the single most important finding — surface it above everything else.

## 6. Optimization / simplification pass

After validation, step back and ask:
- Can the precedence stack be **shorter** without losing recall? (Any rule that never fires on the sample, or whose recall is dominated by an earlier rule?)
- Is the **materialized-table set minimal**? Which `identifier_kind`s actually earn their place vs. could be live-`nxt`-fallback only?
- Is the **Engine/config split** right — what truly varies per swarm vs. what's universal? (Pressure-test the generic claim against what a SugarCRM adapter would actually need.)
- Latency: is one `resolve_candidates` call per email enough, or does the stack need N calls? Measure a real round-trip.
- Anything in P0–P5 that's mis-sequenced (a P3 dependency hiding in P1, etc.)?

## 7. Deliverables (write these; do not build)

1. **`VALIDATION-FINDINGS-v8.2.md`** in this folder — per-assumption HOLDS/WEAKENED/BROKEN table with measured numbers + the backtest scorecard (sample, per-email trace, auto-precision, suggest top-1/top-3, measured sizing split) + the write-path probe result.
2. **Concrete proposed deltas** to `DESIGN-GUIDE.md` / `GENERIC-RESOLUTION-DESIGN.md` / `MILESTONES.md` (RESL-xx) — as a reviewable diff/list, applied only after the operator approves. Define-only; no code.
3. **A go/no-go recommendation** per phase P0–P5: which are de-risked enough to build, which need more validation, which assumptions remain unproven and must be confirmed during build.
4. **Updated project memory** entry capturing what changed.

## 8. Guardrails

- **Test-first / acceptance default** (CLAUDE.md): NXT reads are analysis-only here; never write to a production system. The only writes you may make are to a throwaway `zapier.dbo.__resolver_probe` table for the write-path test (and DROP it after).
- **Evidence boundary:** all of this is validated on **NXT/debtor only**. Do not claim cross-swarm/SugarCRM generality — that's a designed seam, proven only when the V10.0 adapter lands. (See memory `feedback_classifier_evidence_scope`.)
- **NXT only via the Zapier path** for anything that would become production (`feedback_nxt_data_access`); the MCP is for analysis.
- **Don't start a GSD phase / don't run on `main`** without the workspace gate (CLAUDE.md). This is pre-phase validation; if it graduates to building, spin up `/gsd-new-workspace` first.
- The 3 SQL-native commits are on `workspace/milestone-v8.1`, unpushed. v8.1 is still open (Phase 87 + audit pending) — v8.2 stays define-only until v8.1 closes.

---

**Suggested opening move for the fresh session:** read §1's docs, then immediately run the write-path probe (§3) and the Tier-1 auto-precision tests (§4) against live data — because if the write path fails or auto-precision isn't ~100%, the rest of the plan reshapes around those two findings.
