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
