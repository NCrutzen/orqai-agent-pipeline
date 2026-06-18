# Requirements

> Requirement IDs referenced by phase plans. Phase 120 (V9.5) corroboration engine.

## Phase 120 — D-06 multi-signal corroboration engine (generic, cross-swarm)

| ID | Requirement | Source |
|----|-------------|--------|
| **CORR-01** | When `corroboration` is configured for a swarm, the engine COLLECTS candidate signals across ALL precedence steps instead of short-circuiting on the first hit; collection is deterministic (no LLM call). When `corroboration` is absent the engine is byte-identical to today's first-hit short-circuit. | CONTEXT D-01/D-03, ROADMAP draft 1/2 |
| **CORR-02** | When ≥`min_signals` **independent** (distinct `identifier_kind`) signals agree on the same `customer_account_id`, confidence is SET to the `boost` tier (`high`) deterministically. When ≥2 independent signals DISAGREE (resolve to different customers), the precedence-winner is returned with confidence capped below AUTO. | CONTEXT D-04/D-05/D-06, ROADMAP draft 2 |
| **CORR-03** | A lone sender/domain signal is capped below AUTO unless corroborated by a second independent signal; a lone strong signal (invoice_no/customer_no) keeps its native `high`. Which kinds are auto-safe-alone is config-driven (extends `auto_safe_kinds`). | CONTEXT D-07 |
| **CORR-04** | Corroboration is swarm-agnostic — zero `if swarm==='…'` branches — opt-in per swarm via `resolution_config.corroboration`. The shared scoring helper is pure over a `CorroborationSignal[]`. Non-opted-in swarms are byte-identical to today (no-engine-diff green). Both the engine loop and the sales adapter's own loop call the same helper. | CONTEXT D-01/D-08, ROADMAP draft 3/4, SWARM-02 |
| **CORR-05** | Both debtor and sales `resolution_config` opt in within Phase 120 (sales requires the REST→SQL transport switch). The no-engine-diff donor is re-baselined to the post-120 commit and re-run → FINAL STAGE2-01 (supersedes the PROVISIONAL V9.0 result). The frozen 100-email fixture is re-scored: the 12 sender-ambiguity rows and the 4 confident-wrong AUTO rows move the right direction. | CONTEXT D-08/D-09/D-10, ROADMAP draft 5 |

## Phase 121 — Attachment-borne identifier extraction (corroboration signal source)

> Status note (2026-06-17, from 121-GAP-MANIFEST.md): the attachment-text→body fold (Phase 116-05 / D-11) and per-swarm `attachment_config` opt-in already ship, so ATID-02/03/04 are substantially met. The residual build is the #24 row (`.xlsx` EXTRACTION-GAP + one-mail→many-customer guard), planned as 121-02. Acceptance (121-03) is gated on Phase 123 (debtor → `resolve_candidates`). Requirements left OPEN until 121-02 lands.

| ID | Requirement | Source |
|----|-------------|--------|
| **ATID-01** | Attachment-content extraction yields identifiers via the *same* extraction regexes/kinds the body uses — no attachment-specific identifier logic. Residual: formats the extractor cannot read (e.g. `.xlsx`, `extract.ts:161` → `unsupported`) never reach the body, so their identifiers are not extracted (drives 121-02 / #24). | CONTEXT ATID-01, 121-GAP-MANIFEST |
| **ATID-02** | Identifiers enter Stage 2 **adapter-side**; `engine.ts`/`config.ts`/`steps/*` byte-unchanged (no-Engine-diff / STAGE2-01 guard green). Constraint — held by 121-01 (docs-only, zero engine edits). | CONTEXT ATID-02 |
| **ATID-03** | Registry-gated via `attachment_config`; a swarm opts in with a registry row, zero code (SWARM-02). Met: both `sales-email` and `debtor-email` carry `attachment_config = {capture, extract}` (verified live, read-only). | CONTEXT ATID-03, 121-GAP-MANIFEST |
| **ATID-04** | Sales onboards first (offerte/PO letterhead IDs); debtor/info opt in later via registry row. Substantially met via existing opt-in; eval-grounded confirmation rides 121-03 (blocked on Phase 123). | CONTEXT ATID-04, 121-GAP-MANIFEST |

## Phase 123 — Unify Stage-2 on `resolve_candidates` + retire legacy lookup tools (V9.5)

| ID | Requirement | Source | Plan |
|----|-------------|--------|------|
| **RESL-UNIFY-01** | Debtor `sender_match` resolves the customer via `nxt.resolve_candidates` (`email_domain`/`email_address` back-search), NOT `nxt.contact_lookup`. Ambiguous → SUGGEST (fail-closed), never a confident wrong customer. | CONTEXT Transport+Behavior, ROADMAP draft 1 | 123-01 |
| **RESL-UNIFY-02** | Debtor invoice resolution goes through `nxt.resolve_candidates` (`invoice_no`); the legacy `nxt.identifier_lookup` fallback is removed. Reconciled with `auto_safe_kinds` (live debtor is `[]`) via an explicit, operator-confirmed choice. | CONTEXT Transport+Behavior, ROADMAP draft 2 | 123-01 |
| **RESL-UNIFY-03** | Sales `sender_match` + `factuur_match` resolve via `nxt.resolve_candidates` (`email_domain`/`email_address` + `invoice_no`); the corroboration signal shape (independence axis) + fail-closed posture are preserved. | CONTEXT Transport, ROADMAP draft 3 | 123-02 |
| **RESL-UNIFY-04** | `nxt.contact_lookup` + `nxt.identifier_lookup` removed from `nxt-zap-client.ts` (wrappers/types/schemas/union literals/branches), all step modules, the sales adapter, the spike script, and the ~12 test files. Removal is ATOMIC: the build (tsc 0) + full vitest suite are green at the commit boundary. | CONTEXT Removal, ROADMAP draft 4 | 123-03 |
| **RESL-UNIFY-05** | The 2 `public.zapier_tools` rows are deleted live + the 2 `debtor.nxt_lookup_requests` CHECK constraints widened back (prod migration, BLOCKING live-apply checkpoint). UPDATE/DELETE-only on existing RLS tables → no new policy; `check:supabase` 0 ERROR. | CONTEXT Removal/DB, ROADMAP draft 5 | 123-04 |
| **RESL-UNIFY-06** | **Acceptance eval**: the frozen 100-email correctness fixture re-runs over the unified `resolve_candidates` path with no regression below the 64% baseline AND corroboration firing (the 4 confident-wrong AUTO rows demote, gold rows do not regress). This is the carried-over Phase-120 debtor gate; operator-reviewed (BLOCKING). | CONTEXT Behavior, ROADMAP draft 6, RERUN-FINDINGS.md / 120-HUMAN-UAT.md | 123-04 |
| **RESL-UNIFY-07** | The shared step modules + sales adapter stay swarm-agnostic — zero `if(swarm==='…')` runtime branch (sender-via-resolve_candidates is a generic step change). | CONTEXT key constraint SWARM-02 | 123-01, 123-02 |
