# Phase 121: Attachment-borne identifier extraction — Planning Context

**Gathered:** 2026-06-17
**Status:** Pre-plan discovery (workspace set up; NOT yet planned/executed)
**Workspace:** `workspace/phase-121-attachment-borne-ids` (based on the Phase 120 branch tip `b831e3f6` so the corroboration engine + V9.5 substrate are present; rebase onto `main` after 120 merges).
**Source:** ROADMAP V9.5 entry + resolver-customer eval (`.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md`).

> ⚠️ **Read this before planning.** A live-code discovery materially re-scopes this
> phase versus the ROADMAP framing. Reconcile it during `/gsd:plan-phase 121`.

---

## ⚠️ Key discovery — the roadmap premise is stale

The ROADMAP describes Phase 121 as building attachment-content identifier
extraction, "broader than commit #90 (which folds only attachment *filename*)".
**The code is already ahead of that:**

- `web/lib/inngest/functions/stage-2-customer-resolver.ts:84-138` (Phase 116-05 /
  D-11) **already folds attachment text — filename AND `extracted_text` — into
  `body_text` adapter-side**, untrusted-fenced, engine byte-identical
  (STAGE2-01-safe). Swarm-agnostic (reads `email_pipeline.email_attachments`).
- The engine **already extracts factuur from the subject**:
  `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts:84` →
  `extractInvoiceCandidates(args.subject, args.body_text)`; `engine.ts:81` takes
  `subject` as a first-class field. So bucket-D *extraction* is already present.
- Factuur/klantnr are the **self-auth tier** (`steps/self-auth-match.ts`) and the
  eval shows them ~95-97% correct — the precedence "gold ID > sender" is largely a
  120-corroboration / self-auth-ranking property, not a new 121 engine change.

**Implication:** Phase 121 is most likely **NOT "build the attachment fold"** (it
exists). It re-scopes to: *verify what already resolves, then close the narrow
remaining gaps* — chiefly **sales opt-in + capture/extraction coverage**, the
**Excel / one-mail→many-customers edge case**, and **eval-grounded acceptance**.
The planner MUST confirm this against the frozen fixture rather than re-implement.

---

## Phase boundary

Make the hardest identifier — the one that lives only in an attachment (PDF/Excel
letterhead) or the subject — usable by Stage 2 resolution as a first-class,
corroboration-eligible signal, **adapter-side, engine byte-identical**
(ATID-02 / STAGE2-01-safe), **registry-gated per swarm** (`attachment_config`,
SWARM-02), **sales onboarding first**. Pairs with Phase 120: extracted IDs are
extra independent signals that make corroboration fire.

## Locked decisions (from ROADMAP V9.5 + eval)

- **ATID-01** — extraction yields identifiers via the *same* extraction
  regexes/kinds the body uses (no attachment-specific identifier logic).
- **ATID-02** — identifiers enter Stage 2 **adapter-side**;
  `engine.ts`/`config.ts`/`steps/*` byte-unchanged (no-Engine-diff guard green).
- **ATID-03** — registry-gated via `attachment_config`; a swarm opts in with a
  registry row, zero code (SWARM-02).
- **ATID-04** — sales onboards first (offerte/PO letterhead IDs); debtor/info opt
  in later via registry row.
- **Bucket D rides along** — factuur in the subject is extracted (already is) and
  factuur-match must outrank sender-match in precedence.

## Eval-grounded acceptance targets (frozen 100-row fixture)

`.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md`

- **Bucket A — answer in attachment (7 rows):** `#16` klantnr in bijlage · `#19`
  factuur→klantnr across mailed-in PDFs · `#24` **Excel, 358 invoice rows, all
  different customers (one mail → many customers — edge case)** · `#28` · `#29` ·
  `#86` klantnr in bijlage + factuur in subject · `#15` **nothing in body, no
  attachment surfaced (capture gap — see out-of-scope)**.
- **Bucket D — factuur in subject not used (3 rows):** `#83` factuur in subject +
  customer email in thread footer · `#85` (also bucket C / brand) · `#86`.

Acceptance = these rows resolve correctly (or are correctly demoted to
human/multi-candidate) WITHOUT regressing gold-signal rows (Pitfall 5).

## Open questions for planning (resolve in discuss/plan-phase)

1. **Coverage, not mechanism:** of the 7 bucket-A rows, how many already resolve
   once `attachment_config` is enabled for sales and the extractor has run? Run
   the resolver over the fixture FIRST; only build for the residual gaps.
2. **Sales capture/extraction opt-in:** is `attachment_config` set for
   `sales-email`, and does `stage-1_5-attachment-extractor` actually populate
   `extraction_status='extracted'` + `extracted_text` for sales offerte/PO PDFs?
3. **Excel (#24):** does the extractor handle `.xlsx` (roadmap says "PDF text
   first")? And the **one-mail→many-customers guard** — folding 358 differing
   invoice IDs into one body must NOT auto-resolve to one customer; design the
   multi-candidate / human-surface behaviour (this is the genuine new design work).
4. **Bucket D precedence:** is "factuur > sender" already delivered by the
   self-auth tier / 120 corroboration ranking, or does it need a change? If the
   latter is engine-side it **conflicts with ATID-02 + the STAGE2-01 guard + 120's
   in-flight engine work** — resolve ownership (likely: it's already 120/self-auth,
   121 only ensures subject feeds it).
5. **STAGE2-01 guard:** confirm 121's changes stay out of `engine/config/steps/
   dynamic.ts` so the no-Engine-diff guard remains green (the resolver body-fold
   file is explicitly NOT covered by the guard — see resolver comment lines 130-131).

## Canonical references (planner MUST read)

- `web/lib/inngest/functions/stage-2-customer-resolver.ts:60-150` — the existing
  attachment-text + body fold (adapter-side, D-11).
- `web/lib/agentic-pipeline/resolve/body-source.ts` (+ `__tests__/
  body-source-selection.test.ts`) — `selectResolverBody` precedent.
- `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts`,
  `self-auth-match.ts` — subject+body identifier extraction + self-auth tier.
- `web/lib/agentic-pipeline/resolve/corroborate.ts` — Phase 120 corroboration the
  extracted IDs feed.
- `web/lib/inngest/functions/stage-1_5-attachment-extractor.ts`,
  `web/lib/automations/attachments/capture.ts` — Phase 116 capture/extraction.
- `web/lib/swarms/types.ts` — `attachment_config` shape (registry gate).
- `.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md` — buckets + fixture.

## Out of scope

- **`#15`** — nothing in body, no attachment surfaced = an attachment *capture*
  gap, not extraction; out of 121 (capture lever lives in Phase 116 territory).
- **Bucket C (cross-brand scope)** — Phase 122 (`#85` is both D and C; its brand
  half is 122).
- The Phase 120 corroboration engine itself (consumed, not built here).

---

## ⚠️ Cross-phase dependency discovered (2026-06-17)

`.planning/evals/2026-06-16-resolver-customer-eval/RERUN-FINDINGS.md` + the live
registry show:

- **Mechanism already shipped & opted-in:** BOTH `sales-email` and `debtor-email`
  have `attachment_config={capture:true, extract:true}` live. The 116-05 fold +
  subject-factuur extraction already exist. So ATID-03/ATID-04 are effectively met.
- **Acceptance is gated on Phase 123:** the eval fixture is **debtor** mail, but
  the live debtor swarm does NOT resolve via the generic `resolve_candidates` /
  corroboration path (`debtorP0Config.auto_safe_kinds: []` → legacy
  `nxt.identifier_lookup`/`contact_lookup`). So the bucket-A/D **fixture re-run is
  blocked until Phase 123** (debtor → `resolve_candidates`, retire legacy tools)
  lands. Sales already resolves via `resolve_candidates`, but there is no sales
  eval corpus.
- **Live-call caveat:** the correctness-gate harness makes live NXT/Zapier calls
  (`DEBTOR_FETCH_WEBHOOK_SECRET`) — outward-facing; gate behind explicit approval.

**Net:** 121's *buildable-now, fixture-independent* slice is the **#24
one-mail→many-customers guard** (+ Excel extraction coverage if the extractor
lacks `.xlsx`) — adapter-side, engine byte-identical, unit-testable without the
live fixture. The **eval-grounded acceptance over the debtor fixture waits for
Phase 123**. Plan 121-01 (baseline) should therefore run AFTER 123, or be scoped
to sales-path verification only.

## Sequencing note (Option A)

Planned now on the 120 branch tip for fidelity. **Execution waits for 120 → main
merge**, then rebase this workspace onto `main` and re-validate. 121 is
adapter-side (engine byte-identical), so it does NOT collide with 120's engine
edits at the file level — but its acceptance (bucket A via corroboration) is only
meaningful once 120's corroboration is in `main`.

*Phase: 121-attachment-borne-identifier-extraction · context gathered 2026-06-17*
