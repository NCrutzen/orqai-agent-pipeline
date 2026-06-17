# Phase 121 — Gap Manifest (empirical baseline)

**Generated:** 2026-06-17
**Plan:** 121-01 (findings/investigation — no production writes, no engine/config/steps edits)
**Question:** Of the 10 eval rows Phase 121 targets, which already resolve given the existing attachment fold (116-05 / D-11) + Phase 120 corroboration, and where are the residual gaps?
**Method:** read-only DB queries (Supabase Management API, SELECT only) + repo source-of-truth (migrations, engine, extractor) + the frozen operator eval (`.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md`, 64% baseline) + the 120-04 correctness-gate recorded run (`RERUN-FINDINGS.md`).

> ⚠️ No outward NXT/Zapier calls were made (Task-2 gate honored). The debtor fixture
> live re-run is blocked until Phase 123 (see Task 2). All resolver outcomes below are
> from recorded data, not a fresh outward lookup.

---

## Task 1 — attachment_config + per-row attachment/extraction state

### 1a. Live `attachment_config` (fact, read-only)

Source: live `public.swarms` query (Management API, read-only) + migration source of truth
(`20260605b_swarms_attachment_switches.sql`, `20260615c_activate_debtor_attachment_lever.sql` — applied to prod 2026-06-15).

| swarm | capture | extract | stage2_dispatch_event | notes |
|-------|---------|---------|------------------------|-------|
| `sales-email`  | **true** | **true** | `sales-email/stage-2.customer-resolve.requested` | full onboard since 116-01 |
| `debtor-email` | **true** | **true** | `debtor-email/stage-2.customer-resolve.requested` | extract flipped false→true by `20260615c` (the recall lever); `unknown` routed through the stage-1.5 extractor |

**Conclusion (ATID-03 / ATID-04):** the registry mechanism is shipped AND opted-in for BOTH
swarms. The fixture is **debtor** mail, and debtor `capture=true, extract=true` is live.
So "enable attachment_config" is NOT build work — it is already done.

### 1b. Extractor format coverage (fact, repo + live)

Source: `web/lib/automations/attachments/extract.ts` + live extraction-status-by-content_type query.

| Format | Extractor support | Live evidence (extracted / total) |
|--------|-------------------|-----------------------------------|
| PDF (text-layer) | ✅ unpdf text layer | 371 / 458 extracted |
| PDF (scanned) | ✅ vision fallback (rasterise → Orq Router) | (included in PDF total) |
| PNG / JPEG / JPG | ✅ vision | 55 / 77 extracted |
| **Excel `.xlsx`** (`…spreadsheetml.sheet`) | ❌ **`unsupported`** (extract.ts:160-163) | **0 / 20 extracted, 16 unsupported** |
| `text/csv` | ❌ unsupported | 0 / 2 |
| `.docx` (`…wordprocessingml.document`) | ❌ unsupported | 0 / 2 |
| `application/octet-stream` | ⚠️ depends on real type | 23 / 32 extracted |

**Decisive fact for #24:** the extractor returns `unsupported` for Excel — `extract.ts`
only handles `application/pdf` + `image/jpeg|png`; everything else hits the `else →
unsupported` branch (line 160-163). The live corpus confirms **0/20 .xlsx attachments ever
produced text.** So #24's identifier (358 invoice rows in an `.xlsx`) is **never folded into
the body today** — it is a genuine EXTRACTION-GAP, on top of the one-mail→many-customers
design problem.

### 1c. Per-row attachment / extraction / gold-id state (the 10 fixture rows)

The eval fixture (`resolver-eval.xlsx`, `Validatie`) is keyed by operator row number, not by
DB `message_id`; the per-row gold-signal location is taken from the operator-validated
`FINDINGS.md` (Bucket A/D enumeration, lines 57-71). The extractor's format coverage (1b) +
the fold mechanism (`stage-2-customer-resolver.ts:84-138`) determine whether that gold id can
reach the resolver body today.

| Row | Gold-id location (operator) | Format | Captured? | extract supported? | Gold id reaches folded body today? |
|-----|-----------------------------|--------|-----------|--------------------|-------------------------------------|
| #16 | klantnr in bijlage (PDF) | PDF | yes (capture on) | ✅ yes | **Yes** — PDF text/filename folds in |
| #19 | factuur→klantnr across mailed-in PDFs | PDF | yes | ✅ yes | **Yes** — PDF folds in (multi-PDF) |
| #24 | **Excel, 358 invoice rows, all different customers** | **.xlsx** | yes (metadata) | ❌ **no** | **No** — xlsx → `unsupported`, zero text folded |
| #28 | klantnr in bijlage (PDF) | PDF | yes | ✅ yes | **Yes** — PDF folds in |
| #29 | klantnr in bijlage (PDF) | PDF | yes | ✅ yes | **Yes** — PDF folds in |
| #86 | klantnr in bijlage (PDF) + **factuur in subject** | PDF + subject | yes | ✅ yes | **Yes** — subject always read by engine + PDF folds in |
| #83 | factuur in **subject** + customer email in thread footer | subject | n/a (no attachment) | n/a | **Yes** — subject read by engine (`identifier-match.ts:84`) |
| #85 | factuur in **subject** (also Bucket C / brand) | subject | n/a | n/a | **Partly** — subject read; brand half is out of 121 (→122) |
| #15 | **nothing in body, no attachment surfaced** | (none captured) | **NO** — capture gap | n/a | **No** — nothing to fold (CAPTURE-GAP, →116) |

Note: rows #16/#19/#28/#29/#86 carry PDF attachments whose text/filename the live fold
(116-05) already prepends to `body_text` inside the UNTRUSTED fence; the engine then runs
`extractInvoiceCandidates(subject, body_text)` over the combined body. So the *extraction
mechanism* for these rows is present — the open question (Task 2) is whether resolution then
lands the correct customer.

---

## Task 2 — current resolution outcome per fixture row

### 2a. Why the live debtor fixture re-run is not executed here (Task-2 gate)

The 120-04 correctness-gate harness (`web/scripts/eval/resolver-correctness-gate.ts`) drives
each fixture row through `resolveEntity(args, debtorP0Config)`. Two facts make a fresh run
both unavailable and unapproved-outward here:

1. **`debtorP0Config.auto_safe_kinds: []`** (resolve-debtor.ts:77). The high-precision number
   back-search AUTO pre-pass (`identifier-match.ts:78`) only runs when
   `auto_safe_kinds.length > 0`, so debtor **falls to the legacy** `nxt.identifier_lookup`
   (Layer 3) + `nxt.contact_lookup` (sender) Zaps — confirmed in `RERUN-FINDINGS.md`
   (`nxt_lookup_requests.tool_id = nxt.contact_lookup / nxt.identifier_lookup`, NOT
   `nxt.resolve_candidates`). A debtor replay therefore (a) makes **outward live NXT/Zapier
   calls** (Zap `uv5ju6h`), and (b) does **not** exercise the generic `resolve_candidates`
   substrate or the number-tier corroboration this phase cares about.
2. **No `web/.env.local`** in this workspace (no `DEBTOR_FETCH_WEBHOOK_SECRET`); the
   async-callback Zap could not post back even if invoked.

Per the plan's Task-2 gate ("do not hit live NXT/Zapier silently; prefer recorded data + flag
the gap"), **no outward call was made.** Outcomes below are taken from the recorded
`RERUN-FINDINGS.md` (the 120-04 run) + the operator eval `FINDINGS.md`.

**Cross-phase dependency (recorded 2026-06-17, commit 8aba2d9f):** a meaningful debtor
fixture re-run is blocked until **Phase 123** (debtor → `resolve_candidates`, retire
`contact_lookup`/`identifier_lookup`; todo `2026-06-17-unify-stage2-on-resolve-candidates.md`).
Sales already resolves via `resolve_candidates`, but there is no sales eval corpus.

### 2b. Recorded resolution outcome per row

Legend: outcome from operator eval (baseline) + the mechanism analysis (Task 1) + the recorded
120-04 run where a row was replayed. "Live-lookup pending" = correct outcome cannot be asserted
without the Phase-123 live `resolve_candidates` path.

| Row | Baseline verdict / conf | Gold id reaches body? | Resolves correctly today? | Evidence / note |
|-----|--------------------------|------------------------|----------------------------|-----------------|
| #16 | Nee (sender-match wrong) | Yes (PDF folded) | **Likely yes via fold** — klantnr now in body → self-auth tier; **live-lookup pending** to confirm customer number | fold present; gold = klantnr (92% tier) |
| #19 | Nee (A∩B) | Yes (multi-PDF folded) | **Pending** — factuur→klantnr chain; multi-PDF may yield ≥2 candidates → corroboration/SUGGESTIE; live-lookup pending | A∩B; needs resolve_candidates rollup |
| #24 | Nee (A∩B) | **No (xlsx unsupported)** | **No** — zero text folded; cannot resolve from attachment at all | EXTRACTION-GAP + one-mail→many design |
| #28 | Nee | Yes (PDF folded) | **Likely yes via fold**; live-lookup pending | klantnr in PDF |
| #29 | Nee | Yes (PDF folded) | **Likely yes via fold**; live-lookup pending | klantnr in PDF |
| #86 | Nee (thread/sender chosen) | Yes (subject factuur + PDF) | **Likely yes** — subject factuur read by engine today + PDF folded; precedence/corroboration should promote factuur; live-lookup pending | C∩D; brand half →122 |
| #83 | Twijfel/Nee (sender/thread chosen) | Yes (subject factuur) | **Pending** — factuur is in subject and IS extracted (`identifier-match.ts:84`); precedence "factuur > sender" is a self-auth/120 ranking property, not a 121 change; live-lookup pending | bucket D precedence |
| #85 | **Nee — confident-wrong AUTO** | Partly (subject factuur) | **Mixed** — factuur extractable; the WRONG-brand half is out of 121 (→122). 120 demotes the confident-wrong AUTO (recorded direction) | C∩D; named confident-wrong row |
| #15 | Twijfel | **No (nothing captured)** | **No** — CAPTURE-GAP, not extraction; nothing to resolve from | →116 capture lever |

**What WAS verified live (recorded, RERUN-FINDINGS.md):** the corroboration scorer is
unit-proven; row #2 (confident-wrong AUTO) replayed live → `unresolved` → demoted below the
AUTO lane (intended direction); the sales path resolves via `resolve_candidates`
(`SB014098 → quote_no → BX228895 Bever`); no-engine-diff guard PASSES (FINAL STAGE2-01).

**Rows already correct via fold + 120 (regression-guard candidates):** #16, #28, #29, #86 —
the PDF-borne klantnr/factuur is folded and feeds the self-auth (gold) tier, which the eval
rates ~92-97%. These are *expected to pass once debtor is on `resolve_candidates` (Phase 123)*
and become **regression-guard rows**, not build work. (Their correctness is "live-lookup
pending" only because debtor's legacy transport can't be cleanly scored here — the mechanism
is in place.)

---

## Task 3 — gap classification (exactly one class per row)

Classes: `ALREADY-RESOLVES` (fold + 120 already fix it → regression-guard, not build) ·
`EXTRACTION-GAP` (format/coverage, e.g. Excel) · `MANY-CUSTOMER` (one-mail→many, #24) ·
`PRECEDENCE` (factuur < sender ordering) · `CAPTURE-GAP` (out of scope → Phase 116) ·
`BRAND-SCOPE` (out of scope → Phase 122).

| Row | Class | Rationale |
|-----|-------|-----------|
| #16 | **ALREADY-RESOLVES** | klantnr in PDF; PDF fold (116-05) puts it in body → self-auth/gold tier. Regression-guard. |
| #28 | **ALREADY-RESOLVES** | klantnr in PDF; same fold path. Regression-guard. |
| #29 | **ALREADY-RESOLVES** | klantnr in PDF; same fold path. Regression-guard. |
| #86 | **ALREADY-RESOLVES** | subject factuur (engine reads subject) + PDF klantnr folded; gold tier. Brand sub-issue belongs to #85/122, not 121. Regression-guard. |
| #19 | **ALREADY-RESOLVES** | factuur→klantnr across mailed-in PDFs; PDFs fold + 120 corroboration handles the ≥2-candidate case (resolve-or-demote). Regression-guard (verify under Phase 123). |
| #83 | **PRECEDENCE** | factuur present in **subject**, already extracted (`identifier-match.ts:84`); the residual is the "factuur > sender" ranking. **NOT a 121 engine change** — it is a self-auth-tier / 120-corroboration ranking property (ATID-02 / STAGE2-01 keeps engine byte-identical). Tracked as precedence-verify, not build. |
| #24 | **MANY-CUSTOMER** (∧ EXTRACTION-GAP) | one mail → 358 differing invoice customers in an **.xlsx**. Two coupled defects: (a) xlsx is `unsupported` so zero text is folded (extraction coverage), and (b) even with text, 358 differing ids must NOT auto-resolve to one customer (the genuine new design). Single primary class = **MANY-CUSTOMER**; the xlsx extraction is its prerequisite sub-task. |
| #85 | **BRAND-SCOPE** (→ Phase 122) | customer under a different brand entity than the mailbox; subject-factuur half rides Phase 121 extraction (already present) but the resolving defect is cross-brand scope → 122. The confident-wrong AUTO is demoted by 120. |
| #15 | **CAPTURE-GAP** (→ Phase 116) | nothing in body, no attachment surfaced — an attachment *capture* gap, not extraction. Out of 121. |

**Coverage check:** all 9 enumerated rows classified into exactly one primary class (the 10th
"row", #86, appears in both Bucket A and Bucket D of the eval but is a single fixture row,
classified once as ALREADY-RESOLVES). No row is unclassified; no row carries two primary
classes (the #24 EXTRACTION-GAP is recorded as a prerequisite sub-task of its MANY-CUSTOMER
class, not a competing primary class).

### Class tally

| Class | Rows | Disposition |
|-------|------|-------------|
| ALREADY-RESOLVES | #16, #19, #28, #29, #86 (5) | regression-guard rows in Plan 121-03; NOT build |
| MANY-CUSTOMER (+xlsx extraction) | #24 (1) | **build** — Plan 121-02 |
| PRECEDENCE | #83 (1) | verify-only (self-auth/120 ranking, engine byte-identical); NOT new 121 build |
| BRAND-SCOPE | #85 (1) | **out of 121** → Phase 122 |
| CAPTURE-GAP | #15 (1) | **out of 121** → Phase 116 |

---

## Plans 121-02+ scope (derived ONLY from EXTRACTION-GAP + MANY-CUSTOMER)

The build residual is a **single row class** — #24 — plus its xlsx-extraction prerequisite.
Everything else is regression-guard, out-of-phase, or a ranking-verify with no engine change.

### Plan 121-02 — build (adapter-side, engine byte-identical per ATID-02 / STAGE2-01)

1. **Excel (.xlsx) text extraction** (EXTRACTION-GAP, #24 prerequisite): add an `.xlsx`/`.csv`
   branch to `extract.ts` (e.g. SheetJS/`xlsx` already a dep → emit row text), keeping it a
   PURE swarm-agnostic transform inside the existing `extractAttachment` shape; status
   `extracted` on success. **No engine/config/steps edit** — extraction is adapter-side; the
   fold (`stage-2-customer-resolver.ts`) is already not under the no-engine-diff guard.
   *Proposed approach:* one new content-type branch → SheetJS `sheet_to_csv` per sheet,
   capped by the existing `maxExtractedChars`.

2. **One-mail→many-customers guard** (MANY-CUSTOMER, #24): folding 358 differing invoice ids
   into one body must NOT auto-resolve to one customer. *Proposed approach:* when the collected
   corroboration signals span **≥2 distinct roots with no agreeing majority**, the existing
   `corroborate.ts` disagreement path already demotes below AUTO (capBelowAuto) — verify it
   fires for the many-id case and surfaces as multi-candidate/SUGGESTIE rather than a single
   AUTO. If a high count of distinct roots needs an explicit "too many to disambiguate →
   human" outcome, add it **adapter-side** (resolver worker), not in the engine. This is the
   genuine new design work the CONTEXT flagged (OQ-3).

### Plan 121-03 — eval-grounded acceptance (regression-guard, gated on Phase 123)

- ALREADY-RESOLVES rows (#16, #19, #28, #29, #86) become **regression-guard rows**: assert
  they resolve correctly (gold tier) once debtor is on `resolve_candidates` (Phase 123), with
  no gold-signal regression (Pitfall 5).
- #83 PRECEDENCE: assert factuur-in-subject outranks sender-match (self-auth/120 ranking) — a
  verify, not a build.
- Acceptance runs through the 120-04 correctness-gate harness; **blocked until Phase 123**
  (debtor → `resolve_candidates`). Recorded as the dependency above.

### Out-of-phase routing

- **#15 → Phase 116** (attachment *capture* lever; nothing surfaced to extract).
- **#85 → Phase 122** (cross-brand-scope resolution; the resolving defect is scope, not
  attachment extraction).

---

## Roadmap assumptions confirmed STALE

1. **"Phase 121 must build the attachment-content fold."** STALE — the fold
   (`stage-2-customer-resolver.ts:84-138`, 116-05/D-11) already folds attachment text +
   filename into `body_text`, engine byte-identical. Confirmed live: both swarms
   `capture=true, extract=true`.
2. **"Phase 121 must enable attachment_config / sales opt-in."** STALE — sales AND debtor are
   already opted in (ATID-03/ATID-04 effectively met; live-confirmed).
3. **"Bucket D factuur-in-subject extraction is new 121 work."** STALE — the engine already
   extracts factuur from the subject (`identifier-match.ts:84`); the residual (#83) is a
   precedence/ranking property of the self-auth tier + 120 corroboration, not a 121 engine
   change (and would violate ATID-02 if it were one).
4. **"All 7 bucket-A rows need extraction build."** STALE — 5 of them (#16/#19/#28/#29/#86)
   already have the extraction mechanism (PDF fold); only **#24 (.xlsx)** is a true
   extraction-gap, and its primary defect is the one-mail→many-customers design, not raw
   extraction.

**Net buildable-now residual for Phase 121 = ONE row (#24):** xlsx extraction coverage +
one-mail→many-customers guard. Everything else is regression-guard (gated on Phase 123),
verify-only, or routed to Phase 116/122.
