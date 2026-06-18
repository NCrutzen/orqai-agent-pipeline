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

## Phase 122 — Cross-brand-scope customer resolution (V9.5)

| ID | Requirement | Source | Plan |
|----|-------------|--------|------|
| **XSCOPE-01** | On an in-scope miss the engine runs a cross-scope back-search over the already-fetched `resolve_candidates` `res.matches` (no new SQL/lookup); a single distinct cross-brand root (D-08) on a strong/corroborated kind auto-resolves with a misroute annotation (D-09); a non-unique set, a lone weak kind (D-04), or disagreeing signals (D-05) degrade to `suggestie`. | CONTEXT D-01/D-03/D-04/D-05/D-08/D-09/D-11, ROADMAP 1, RESEARCH Rec 1/5/6 | 122-01, 122-03 |
| **XSCOPE-02** | Cross-scope is opt-in per swarm via `swarms.resolution_config.cross_scope` (mirror Phase 120 `corroboration`); gated on `config.cross_scope?.enabled` only — zero `if (swarm === '…')` branch (SWARM-02). `cross_scope` absent/`enabled:false` → output byte-identical to today. | CONTEXT D-10/D-11, ROADMAP 2, RESEARCH Rec 2 / Pattern 1 | 122-02, 122-03, 122-04 |
| **XSCOPE-03** | The 9 frozen-fixture bucket-C rows (#37,#85,#95,#96,#97,#98,#67,#69,#70) resolve to the operator-confirmed customer OR demote below AUTO (`confidence !== "high"`) in the post-landing eval re-run; reachable rows all pass, un-indexed rows reported separately (A1). | CONTEXT acceptance fixture, ROADMAP 3, RESEARCH Rec 7 | 122-01, 122-04 |
